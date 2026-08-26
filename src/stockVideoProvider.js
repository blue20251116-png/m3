import { getSetting } from './configStore.js';

const PEXELS_URL = 'https://api.pexels.com/videos/search';
const PIXABAY_URL = 'https://pixabay.com/api/videos/';

function normalizePexelsVideo(video, searchTerm='') {
  const files = [...(video.video_files || [])]
    .filter((f) => f.link && f.width && f.height)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  // Do not force portrait: cinematic aerial footage is often landscape and crops well to 9:16.
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
  const q=String(query).trim();
  const lower=q.toLowerCase();
  const already=/cinematic|aerial|drone|tracking|panorama|skyline/.test(lower);
  if (already) return [q, `${q} cinematic`, `${q} moving camera`];
  return [
    `${q} cinematic aerial`,
    `${q} drone skyline`,
    `${q} cinematic moving camera`
  ];
}

function badText(v) {
  const text=`${v.searchTerm||''} ${v.tags||''} ${v.sourceUrl||''}`.toLowerCase();
  return /cctv|security|surveillance|traffic cam|traffic camera|webcam|dashcam|dash cam|fixed camera/.test(text);
}

function score(v) {
  let s=0;
  const text=`${v.searchTerm||''} ${v.tags||''}`.toLowerCase();
  if (/cinematic/.test(text)) s+=30;
  if (/aerial|drone/.test(text)) s+=28;
  if (/skyline|panorama|cityscape/.test(text)) s+=18;
  if (/moving camera|tracking|orbit|flyover|fly over/.test(text)) s+=18;
  if (v.width*v.height >= 1920*1080) s+=18;
  if (v.orientation === 'portrait') s+=4; // small bonus only; composition matters more than orientation.
  const d=Number(v.duration)||0;
  if (d>=5 && d<=30) s+=12;
  else if (d>45) s-=8;
  if (badText(v)) s-=200;
  return s;
}

export async function searchPexels(query, perPage = 8) {
  const key = await getSetting('PEXELS_API_KEY');
  if (!key) return [];
  const url = new URL(PEXELS_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  // Intentionally no portrait-only filter. It was causing weak/static results.
  const response = await fetch(url, { headers: { Authorization: key } });
  if (!response.ok) throw new Error(`Pexels search failed: ${response.status}`);
  const data = await response.json();
  return (data.videos || []).map(v=>normalizePexelsVideo(v,query)).filter(Boolean);
}

export async function searchPixabay(query, perPage = 8) {
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

export async function searchStockVideos(query, perProvider = 8) {
  const variants=queryVariants(query);
  const tasks=[];
  for(const q of variants){tasks.push(searchPexels(q,perProvider),searchPixabay(q,perProvider));}
  const settled=await Promise.allSettled(tasks);
  const all=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(v=>!badText(v));
  const seen=new Set();
  const unique=all.filter(v=>{const k=`${v.provider}:${v.id}`;if(seen.has(k))return false;seen.add(k);return true;});
  return unique.sort((a,b)=>score(b)-score(a)).slice(0,24);
}
