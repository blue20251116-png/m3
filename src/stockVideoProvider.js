const PEXELS_URL = 'https://api.pexels.com/videos/search';
const PIXABAY_URL = 'https://pixabay.com/api/videos/';

function normalizePexelsVideo(video) {
  const files = [...(video.video_files || [])]
    .filter((f) => f.link && f.width && f.height)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const preferred = files.find((f) => f.height > f.width) || files[0];
  return preferred ? {
    provider: 'pexels',
    id: String(video.id),
    sourceUrl: video.url,
    creator: video.user?.name || '',
    duration: video.duration || null,
    width: preferred.width,
    height: preferred.height,
    orientation: preferred.height > preferred.width ? 'portrait' : 'landscape',
    downloadUrl: preferred.link,
    preview: video.image || null,
    license: 'Pexels License'
  } : null;
}

function normalizePixabayVideo(video) {
  const variants = Object.values(video.videos || {}).filter(Boolean);
  const preferred = variants.find((v) => v.height > v.width) || variants[0];
  return preferred?.url ? {
    provider: 'pixabay',
    id: String(video.id),
    sourceUrl: video.pageURL,
    creator: video.user || '',
    duration: video.duration || null,
    width: preferred.width,
    height: preferred.height,
    orientation: preferred.height > preferred.width ? 'portrait' : 'landscape',
    downloadUrl: preferred.url,
    preview: video.picture_id ? `https://i.vimeocdn.com/video/${video.picture_id}_640x360.jpg` : null,
    license: 'Pixabay Content License'
  } : null;
}

export async function searchPexels(query, perPage = 8) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const url = new URL(PEXELS_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'portrait');
  const response = await fetch(url, { headers: { Authorization: key } });
  if (!response.ok) throw new Error(`Pexels search failed: ${response.status}`);
  const data = await response.json();
  return (data.videos || []).map(normalizePexelsVideo).filter(Boolean);
}

export async function searchPixabay(query, perPage = 8) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const url = new URL(PIXABAY_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('safesearch', 'true');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pixabay search failed: ${response.status}`);
  const data = await response.json();
  return (data.hits || []).map(normalizePixabayVideo).filter(Boolean);
}

export async function searchStockVideos(query, perProvider = 8) {
  const tasks = [searchPexels(query, perProvider), searchPixabay(query, perProvider)];
  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => {
      const portrait = Number(b.orientation === 'portrait') - Number(a.orientation === 'portrait');
      if (portrait) return portrait;
      return (b.width * b.height) - (a.width * a.height);
    });
}
