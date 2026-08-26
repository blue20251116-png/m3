import { getSetting } from './configStore.js';

const PEXELS_URL = 'https://api.pexels.com/videos/search';
const PIXABAY_URL = 'https://pixabay.com/api/videos/';

const SEARCH_MODIFIERS = new Set([
  'cinematic','aerial','drone','moving','camera','tracking','shot','panorama','skyline',
  'cityscape','travel','film','aesthetic','vertical','landscape','view','views','scene','scenery',
  'beautiful','4k','hd','night','day','lights','light','timelapse','time','lapse','flyover','orbit'
]);

function words(text='') {
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\//g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function coreTokens(query='') {
  return [...new Set(words(query).filter(w => w.length >= 3 && !SEARCH_MODIFIERS.has(w)))];
}

function sourceText(v) {
  // IMPORTANT: rank by metadata that belongs to the returned video, not by our own search query.
  return `${v.tags || ''} ${v.sourceUrl || ''} ${v.creator || ''}`.toLowerCase();
}

function relevance(v, query='') {
  const tokens = coreTokens(query);
  if (!tokens.length) return { score: 0, matched: 0, total: 0 };
  const text = sourceText(v);
  let matched = 0;
  for (const token of tokens) if (text.includes(token)) matched += 1;

  let score = (matched / tokens.length) * 100;
  const phrase = tokens.join(' ');
  if (tokens.length >= 2 && text.replace(/[^a-z0-9]+/g,' ').includes(phrase)) score += 25;
  return { score, matched, total: tokens.length };
}

function normalizePexelsVideo(video, searchTerm='') {
  const files = [...(video.video_files || [])]
    .filter((f) => f.link && f.width && f.height)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const preferred = files.find((f) => Math.min(f.width, f.height) >= 720) || files[0];
  return preferred ? {
    provider: 'pexels', id: String(video.id), sourceUrl: video.url,
    creator: video.user?.name || '', duration: video.duration || null,
    width: preferred.width, height: preferred.height,
    orientation: preferred.height > preferred.width ? 'portrait' : 'landscape',
    downloadUrl: preferred.link, preview: video.image || null,
    license: 'Pexels License', searchTerm
  } : null;
}

function normalizePixabayVideo(video, searchTerm='') {
  const variants = Object.values(video.videos || {}).filter(Boolean)
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height));
  const preferred = variants.find((v) => Math.min(v.width, v.height) >= 720) || variants[0];
  return preferred?.url ? {
    provider: 'pixabay', id: String(video.id), sourceUrl: video.pageURL,
    creator: video.user || '', duration: video.duration || null,
    width: preferred.width, height: preferred.height,
    orientation: preferred.height > preferred.width ? 'portrait' : 'landscape',
    downloadUrl: preferred.url,
    preview: video.picture_id ? `https://i.vimeocdn.com/video/${video.picture_id}_640x360.jpg` : null,
    license: 'Pixabay Content License', tags: String(video.tags || ''), searchTerm
  } : null;
}

function queryVariants(query='') {
  const q=String(query).replace(/\s+/g,' ').trim();
  if (!q) return [];

  // Keep the exact subject dominant. Previously every query was expanded into broad
  // "drone skyline / cinematic moving camera" searches, which overwhelmed relevance.
  const variants=[q];
  const lower=q.toLowerCase();
  if (!/cinematic|aerial|drone|tracking|moving camera/.test(lower)) variants.push(`${q} cinematic`);
  return [...new Set(variants)].slice(0,2);
}

function badText(v) {
  const text=sourceText(v);
  return /cctv|security|surveillance|traffic cam|traffic camera|webcam|dashcam|dash cam|fixed camera/.test(text);
}

function qualityScore(v, query='') {
  let s=0;
  const text=sourceText(v);
  const rel=relevance(v,query);

  // Relevance is the primary signal.
  s += rel.score * 1.35;
  if (/cinematic/.test(text)) s+=14;
  if (/aerial|drone/.test(text)) s+=16;
  if (/skyline|panorama|cityscape/.test(text)) s+=10;
  if (/tracking|orbit|flyover|fly over|timelapse|time lapse/.test(text)) s+=10;
  if (v.width*v.height >= 3840*2160) s+=22;
  else if (v.width*v.height >= 1920*1080) s+=14;
  else if (Math.min(v.width||0,v.height||0) < 720) s-=20;
  if (v.orientation === 'portrait') s+=3;

  const d=Number(v.duration)||0;
  if (d>=6 && d<=30) s+=12;
  else if (d>45) s-=8;
  if (badText(v)) s-=300;
  return { score:s, ...rel };
}

function passesRelevance(v, query='') {
  const r=relevance(v,query);
  // When there are identifiable subject/location words, demand actual metadata overlap.
  // This prevents generic city footage from outranking the requested landmark.
  if (r.total >= 3) return r.matched >= 2;
  if (r.total === 2) return r.matched >= 1;
  if (r.total === 1) return r.matched >= 1;
  return true;
}

export async function searchPexels(query, perPage = 12) {
  const key = await getSetting('PEXELS_API_KEY');
  if (!key) return [];
  const url = new URL(PEXELS_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  const response = await fetch(url, { headers: { Authorization: key } });
  if (!response.ok) throw new Error(`Pexels search failed: ${response.status}`);
  const data = await response.json();
  return (data.videos || []).map(v=>normalizePexelsVideo(v,query)).filter(Boolean);
}

export async function searchPixabay(query, perPage = 12) {
  const key = await getSetting('PIXABAY_API_KEY');
  if (!key) return [];
  const url = new URL(PIXABAY_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pixabay search failed: ${response.status}`);
  const data = await response.json();
  return (data.hits || []).map(v=>normalizePixabayVideo(v,query)).filter(Boolean);
}

export async function searchStockVideos(query, perProvider = 12) {
  const variants=queryVariants(query);
  const tasks=[];
  for(const q of variants){
    tasks.push(searchPexels(q,perProvider),searchPixabay(q,perProvider));
  }

  const settled=await Promise.allSettled(tasks);
  const all=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(v=>!badText(v));
  const seen=new Set();
  const unique=all.filter(v=>{
    const k=`${v.provider}:${v.id}`;
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const strict=unique.filter(v=>passesRelevance(v,query));
  const pool=strict.length >= 6 ? strict : unique;
  return pool
    .map(v=>({...v,qualityScore:qualityScore(v,query).score,relevance:relevance(v,query).score}))
    .sort((a,b)=>b.qualityScore-a.qualityScore)
    .slice(0,24);
}
