import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.WORK_DIR || '/tmp/m3-shorts';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'public', 'renders');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1800)}`)));
  });
}

async function download(url, destination) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(destination, bytes);
}

function esc(text = '') {
  return String(text).replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'").replaceAll('%', '\\%');
}

export async function renderShort({ clips, title, captions = [], duration = 20 }) {
  if (!Array.isArray(clips) || clips.length < 1) throw new Error('At least one clip is required');
  await mkdir(ROOT, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const jobDir = path.join(ROOT, id);
  await mkdir(jobDir, { recursive: true });

  const selected = clips.slice(0, 6);
  const segment = Math.max(2.5, duration / selected.length);
  const normalized = [];

  for (let i = 0; i < selected.length; i += 1) {
    const input = path.join(jobDir, `input-${i}.mp4`);
    const out = path.join(jobDir, `clip-${i}.mp4`);
    await download(selected[i].downloadUrl, input);
    await run('ffmpeg', ['-y', '-i', input, '-t', String(segment), '-an', '-vf',
      'scale=1080:1632:force_original_aspect_ratio=increase,crop=1080:1632,fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', out]);
    normalized.push(out);
  }

  const concatFile = path.join(jobDir, 'concat.txt');
  await writeFile(concatFile, normalized.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join('\n'));
  const joined = path.join(jobDir, 'joined.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', joined]);

  const output = path.join(OUTPUT_DIR, `${id}.mp4`);
  const font = process.env.JP_FONT_FILE || '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
  const captionFilters = captions.slice(0, 5).map((line, idx) => {
    const start = 1.5 + idx * Math.max(2.5, (duration - 2) / Math.max(captions.length, 1));
    const end = Math.min(duration, start + 3.2);
    return `drawtext=fontfile='${font}':text='${esc(line)}':fontcolor=white:fontsize=54:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-270:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;
  });

  const filters = [
    'pad=1080:1920:0:288:black',
    `drawtext=fontfile='${font}':text='${esc(title)}':fontcolor=white:fontsize=62:fontcolor=white:x=(w-text_w)/2:y=95`,
    ...captionFilters
  ].join(',');

  await run('ffmpeg', ['-y', '-i', joined, '-t', String(duration), '-vf', filters, '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);

  return { id, filename: `${id}.mp4`, url: `/renders/${id}.mp4`, duration };
}
