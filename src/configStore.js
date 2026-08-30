import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SETTINGS_ROOT = process.env.M3_SETTINGS_DIR || '/app/db';
const FILE = process.env.M3_SETTINGS_FILE || path.join(SETTINGS_ROOT, 'settings.json');
const SETTING_KEYS = [
  'PEXELS_API_KEY',
  'PIXABAY_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'YOUTUBE_OAUTH_REDIRECT_URI'
];
let cache = null;

async function load() {
  if (cache) return cache;
  try { cache = JSON.parse(await readFile(FILE, 'utf8')); }
  catch { cache = {}; }
  return cache;
}

export async function getSetting(name) {
  const data = await load();
  return data[name] || process.env[name] || '';
}

export async function getSettingsStatus() {
  const out = {};
  for (const key of SETTING_KEYS) {
    const value = await getSetting(key);
    out[key] = {
      configured: Boolean(value),
      masked: key === 'YOUTUBE_OAUTH_REDIRECT_URI' ? value : mask(value)
    };
  }
  return out;
}

export async function saveSettings(values = {}) {
  const data = await load();
  for (const key of SETTING_KEYS) {
    if (!(key in values)) continue;
    const value = String(values[key] || '').trim();
    if (value) data[key] = value;
    else delete data[key];
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  cache = data;
  return getSettingsStatus();
}

function mask(value = '') {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}
