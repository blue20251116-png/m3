import crypto from 'node:crypto';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { getSetting } from './configStore.js';

const ROOT = process.env.M3_SETTINGS_DIR || '/app/db';
const CHANNELS_FILE = process.env.YOUTUBE_CHANNELS_FILE || path.join(ROOT, 'youtube-channels.json');
const QUEUE_FILE = process.env.YOUTUBE_QUEUE_FILE || path.join(ROOT, 'youtube-queue.json');
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
const oauthStates = new Map();
let workerBusy = false;
let workerTimer = null;

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}
function cleanText(value, max = 5000) { return String(value || '').trim().slice(0, max); }
function normalizePrivacy(v) { return ['private', 'unlisted', 'public'].includes(v) ? v : 'private'; }
function nowIso() { return new Date().toISOString(); }
function requestBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}
async function oauthConfig(req) {
  const clientId = await getSetting('GOOGLE_CLIENT_ID');
  const clientSecret = await getSetting('GOOGLE_CLIENT_SECRET');
  const configured = await getSetting('YOUTUBE_OAUTH_REDIRECT_URI');
  const redirectUri = configured || `${requestBaseUrl(req)}/api/youtube/oauth/callback`;
  if (!clientId || !clientSecret) throw new Error('Google OAuth Client ID/Secret을 관리자 설정에 먼저 입력하세요');
  return { clientId, clientSecret, redirectUri };
}
async function postForm(url, values) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `OAuth HTTP ${response.status}`);
  return data;
}
async function accessTokenFor(channel) {
  const { clientId, clientSecret } = await oauthConfig({
    protocol: 'https',
    headers: { host: 'localhost' }
  });
  const token = await postForm('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: channel.refreshToken,
    grant_type: 'refresh_token'
  });
  return token.access_token;
}
async function youtubeJson(url, accessToken) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `YouTube HTTP ${response.status}`);
  return data;
}
async function loadChannels() { return readJson(CHANNELS_FILE, { channels: [] }); }
async function saveChannels(data) { await writeJson(CHANNELS_FILE, data); }
async function loadQueue() { return readJson(QUEUE_FILE, { jobs: [] }); }
async function saveQueue(data) { await writeJson(QUEUE_FILE, data); }

export async function youtubeStatus(req) {
  let configured = false, redirectUri = '';
  try {
    const c = await oauthConfig(req);
    configured = Boolean(c.clientId && c.clientSecret);
    redirectUri = c.redirectUri;
  } catch {
    redirectUri = (await getSetting('YOUTUBE_OAUTH_REDIRECT_URI')) || `${requestBaseUrl(req)}/api/youtube/oauth/callback`;
  }
  const data = await loadChannels();
  return {
    configured,
    redirectUri,
    channels: data.channels.map(c => ({ channelId: c.channelId, title: c.title, thumbnail: c.thumbnail || '', connectedAt: c.connectedAt }))
  };
}

export async function beginYoutubeOAuth(req, { label = '' } = {}) {
  const { clientId, redirectUri } = await oauthConfig(req);
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, { createdAt: Date.now(), label: cleanText(label, 80) });
  for (const [key, value] of oauthStates) if (Date.now() - value.createdAt > 15 * 60_000) oauthStates.delete(key);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent select_account');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function finishYoutubeOAuth(req, { code, state }) {
  const pending = oauthStates.get(String(state || ''));
  if (!pending) throw new Error('OAuth state가 만료되었거나 올바르지 않습니다');
  oauthStates.delete(String(state));
  const { clientId, clientSecret, redirectUri } = await oauthConfig(req);
  const token = await postForm('https://oauth2.googleapis.com/token', {
    code: String(code || ''),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  if (!token.refresh_token) throw new Error('refresh_token을 받지 못했습니다. Google 권한을 제거한 뒤 다시 연결하세요');
  const mine = await youtubeJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', token.access_token);
  const item = mine.items?.[0];
  if (!item?.id) throw new Error('연결된 YouTube 채널을 찾지 못했습니다');
  const data = await loadChannels();
  const channel = {
    channelId: item.id,
    title: item.snippet?.title || pending.label || item.id,
    thumbnail: item.snippet?.thumbnails?.default?.url || '',
    refreshToken: token.refresh_token,
    connectedAt: nowIso()
  };
  data.channels = data.channels.filter(c => c.channelId !== channel.channelId);
  data.channels.push(channel);
  await saveChannels(data);
  return { channelId: channel.channelId, title: channel.title };
}

export async function disconnectYoutubeChannel(channelId) {
  const data = await loadChannels();
  const before = data.channels.length;
  data.channels = data.channels.filter(c => c.channelId !== String(channelId || ''));
  await saveChannels(data);
  return { ok: true, removed: before !== data.channels.length };
}

function sanitizeJob(input, renderDir) {
  const filename = path.basename(String(input.filename || ''));
  if (!/^[a-zA-Z0-9-]+\.mp4$/i.test(filename)) throw new Error('유효한 렌더 MP4 filename이 필요합니다');
  const channelId = cleanText(input.channelId, 128);
  if (!channelId) throw new Error('channelId가 필요합니다');
  const publishAt = input.publishAt ? new Date(input.publishAt) : null;
  if (publishAt && Number.isNaN(publishAt.getTime())) throw new Error('publishAt 형식이 올바르지 않습니다');
  let privacyStatus = normalizePrivacy(input.privacyStatus);
  if (publishAt && publishAt.getTime() > Date.now()) privacyStatus = 'private';
  return {
    id: crypto.randomUUID(),
    filename,
    filePath: path.join(renderDir, filename),
    channelId,
    title: cleanText(input.title, 100),
    description: cleanText(input.description, 5000),
    tags: Array.isArray(input.tags) ? input.tags.map(v => cleanText(v, 100)).filter(Boolean).slice(0, 30) : [],
    categoryId: cleanText(input.categoryId || '24', 8),
    privacyStatus,
    publishAt: publishAt?.toISOString() || null,
    madeForKids: Boolean(input.madeForKids),
    notifySubscribers: input.notifySubscribers !== false,
    status: 'pending',
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastError: '',
    youtubeVideoId: ''
  };
}

export async function enqueueYoutubeUpload(input, renderDir) {
  const job = sanitizeJob(input, renderDir);
  if (!job.title) throw new Error('YouTube 제목이 필요합니다');
  const channels = await loadChannels();
  if (!channels.channels.some(c => c.channelId === job.channelId)) throw new Error('연결되지 않은 YouTube 채널입니다');
  const queue = await loadQueue();
  const duplicate = queue.jobs.find(j => j.channelId === job.channelId && j.filename === job.filename && ['pending', 'uploading', 'uploaded'].includes(j.status));
  if (duplicate) return { ok: true, duplicate: true, job: publicJob(duplicate) };
  queue.jobs.push(job);
  await saveQueue(queue);
  return { ok: true, duplicate: false, job: publicJob(job) };
}

export async function enqueueYoutubeBulk(items, renderDir) {
  if (!Array.isArray(items) || items.length < 1) throw new Error('items가 필요합니다');
  if (items.length > 100) throw new Error('한 번에 최대 100개까지 등록할 수 있습니다');
  const results = [];
  for (const item of items) results.push(await enqueueYoutubeUpload(item, renderDir));
  return { ok: true, count: results.length, results };
}

function publicJob(j) {
  const { filePath, ...safe } = j;
  return safe;
}
export async function listYoutubeQueue({ limit = 100 } = {}) {
  const queue = await loadQueue();
  return queue.jobs.slice(-Math.max(1, Math.min(500, Number(limit) || 100))).reverse().map(publicJob);
}

async function uploadJob(job) {
  const channels = await loadChannels();
  const channel = channels.channels.find(c => c.channelId === job.channelId);
  if (!channel) throw new Error('YouTube 채널 연결 정보가 없습니다');
  const fileInfo = await stat(job.filePath);
  if (!fileInfo.isFile() || fileInfo.size < 1) throw new Error('렌더 파일을 찾을 수 없습니다');
  const token = await accessTokenFor(channel);
  const metadata = {
    snippet: {
      title: job.title,
      description: job.description,
      tags: job.tags,
      categoryId: job.categoryId,
      defaultLanguage: undefined
    },
    status: {
      privacyStatus: job.privacyStatus,
      selfDeclaredMadeForKids: job.madeForKids
    }
  };
  if (job.publishAt) metadata.status.publishAt = job.publishAt;
  const initUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  initUrl.searchParams.set('uploadType', 'resumable');
  initUrl.searchParams.set('part', 'snippet,status');
  initUrl.searchParams.set('notifySubscribers', job.notifySubscribers ? 'true' : 'false');
  const init = await fetch(initUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(fileInfo.size),
      'x-upload-content-type': 'video/mp4'
    },
    body: JSON.stringify(metadata)
  });
  if (!init.ok) {
    const data = await init.json().catch(() => ({}));
    throw new Error(data?.error?.message || `YouTube upload init HTTP ${init.status}`);
  }
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube resumable upload URL을 받지 못했습니다');
  const uploaded = await fetch(location, {
    method: 'PUT',
    headers: { 'content-length': String(fileInfo.size), 'content-type': 'video/mp4' },
    body: createReadStream(job.filePath),
    duplex: 'half'
  });
  const data = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok) throw new Error(data?.error?.message || `YouTube upload HTTP ${uploaded.status}`);
  if (!data.id) throw new Error('YouTube videoId가 반환되지 않았습니다');
  return data.id;
}

export async function runYoutubeWorkerOnce() {
  if (workerBusy) return { ok: true, skipped: 'busy' };
  workerBusy = true;
  try {
    const queue = await loadQueue();
    const now = Date.now();
    const job = queue.jobs.find(j => j.status === 'pending' && (!j.nextAttemptAt || new Date(j.nextAttemptAt).getTime() <= now));
    if (!job) return { ok: true, idle: true };
    job.status = 'uploading';
    job.attempts = Number(job.attempts || 0) + 1;
    job.updatedAt = nowIso();
    await saveQueue(queue);
    try {
      job.youtubeVideoId = await uploadJob(job);
      job.status = 'uploaded';
      job.lastError = '';
      job.updatedAt = nowIso();
      delete job.nextAttemptAt;
    } catch (error) {
      job.lastError = cleanText(error?.message || error, 1000);
      job.updatedAt = nowIso();
      if (job.attempts >= 3) job.status = 'failed';
      else {
        job.status = 'pending';
        job.nextAttemptAt = new Date(Date.now() + Math.min(30, 2 ** job.attempts * 2) * 60_000).toISOString();
      }
    }
    await saveQueue(queue);
    return { ok: job.status === 'uploaded', job: publicJob(job) };
  } finally {
    workerBusy = false;
  }
}

export function startYoutubeWorker({ intervalMs = 20_000 } = {}) {
  if (workerTimer) return;
  workerTimer = setInterval(() => runYoutubeWorkerOnce().catch(e => console.error('[YOUTUBE WORKER]', e)), Math.max(10_000, intervalMs));
  workerTimer.unref?.();
  setTimeout(() => runYoutubeWorkerOnce().catch(e => console.error('[YOUTUBE WORKER]', e)), 2_000).unref?.();
}
