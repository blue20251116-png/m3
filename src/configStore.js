import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.WORK_DIR || '/tmp/m3-shorts';
const FILE = process.env.M3_SETTINGS_FILE || path.join(ROOT, 'settings.json');
let cache = null;

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

export async function getSetting(name) {
  const data = await load();
  return data[name] || process.env[name] || '';
}

export async function getSettingsStatus() {
  const pexels = await getSetting('PEXELS_API_KEY');
  const pixabay = await getSetting('PIXABAY_API_KEY');
  return {
    PEXELS_API_KEY: { configured: Boolean(pexels), masked: mask(pexels) },
    PIXABAY_API_KEY: { configured: Boolean(pixabay), masked: mask(pixabay) }
  };
}

export async function saveSettings(values = {}) {
  const data = await load();
  for (const key of ['PEXELS_API_KEY', 'PIXABAY_API_KEY']) {
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
