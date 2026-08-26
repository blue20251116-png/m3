import { mkdir, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';

const PUBLIC_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 80 * 1024 * 1024;
const ALLOWED = new Set(['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/aac','audio/flac','application/octet-stream']);

function probe(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file], { stdio:['ignore','pipe','pipe'] });
    let out='', err='';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Number(out.trim()) || 0) : reject(new Error(`ffprobe failed: ${err.slice(-800)}`)));
  });
}

function extFrom(name='', type='') {
  const ext = path.extname(name).toLowerCase();
  if (['.mp3','.m4a','.mp4','.wav','.aac','.flac'].includes(ext)) return ext;
  if (type.includes('wav')) return '.wav';
  if (type.includes('mp4') || type.includes('m4a')) return '.m4a';
  if (type.includes('aac')) return '.aac';
  if (type.includes('flac')) return '.flac';
  return '.mp3';
}

export async function saveMusicBuffer(buffer, { filename='', contentType='' }={}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Audio file is empty');
  if (buffer.length > MAX_BYTES) throw new Error('Audio file exceeds 80MB limit');
  if (contentType && !ALLOWED.has(contentType)) throw new Error(`Unsupported audio type: ${contentType}`);
  await mkdir(PUBLIC_UPLOAD_DIR, { recursive:true });
  const id = crypto.randomUUID();
  const ext = extFrom(filename, contentType);
  const saved = `${id}${ext}`;
  const full = path.join(PUBLIC_UPLOAD_DIR, saved);
  await writeFile(full, buffer);
  const duration = await probe(full);
  const info = await stat(full);
  return { id, filename: saved, originalName: filename || saved, url: `/uploads/${saved}`, duration: Number(duration.toFixed(2)), size: info.size, contentType };
}

export function localMusicPath(url='') {
  const raw = String(url || '');
  if (!raw.startsWith('/uploads/')) throw new Error('Only uploaded local music is allowed for direct render');
  const base = path.basename(raw);
  return path.join(PUBLIC_UPLOAD_DIR, base);
}
