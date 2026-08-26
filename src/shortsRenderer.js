import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.WORK_DIR || '/tmp/m3-shorts';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'public', 'renders');
const FFMPEG_THREADS = String(Math.max(1, Math.min(4, Number(process.env.FFMPEG_THREADS || 2))));

const DEFAULT_STYLE = {
  title: { fontSize: 62, color: '#FFFFFF', backgroundColor: '#000000', backgroundHeight: 288, y: 95, align: 'center' },
  caption: { fontSize: 54, color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 3, bottom: 270, align: 'center' }
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) return resolve();
      const exit = signal ? `signal ${signal}` : `code ${code}`;
      reject(new Error(`${cmd} exited ${exit}: ${stderr.slice(-2200)}`));
    });
  });
}

async function download(url, destination) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  await writeFile(destination, Buffer.from(await res.arrayBuffer()));
}

function esc(text = '') {
  return String(text).replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'").replaceAll('%', '\\%');
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function color(value, fallback) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? `0x${v.slice(1)}` : `0x${fallback.slice(1)}`;
}

function alignX(align) {
  if (align === 'left') return '55';
  if (align === 'right') return 'w-text_w-55';
  return '(w-text_w)/2';
}

function normalizeStyle(style = {}) {
  const title = style.title || {};
  const caption = style.caption || {};
  return {
    title: {
      fontSize: clamp(title.fontSize, 28, 110, DEFAULT_STYLE.title.fontSize),
      color: color(title.color, DEFAULT_STYLE.title.color),
      backgroundColor: color(title.backgroundColor, DEFAULT_STYLE.title.backgroundColor),
      backgroundHeight: clamp(title.backgroundHeight, 160, 460, DEFAULT_STYLE.title.backgroundHeight),
      y: clamp(title.y, 20, 360, DEFAULT_STYLE.title.y),
      align: ['left', 'center', 'right'].includes(title.align) ? title.align : 'center'
    },
    caption: {
      fontSize: clamp(caption.fontSize, 24, 100, DEFAULT_STYLE.caption.fontSize),
      color: color(caption.color, DEFAULT_STYLE.caption.color),
      strokeColor: color(caption.strokeColor, DEFAULT_STYLE.caption.strokeColor),
      strokeWidth: clamp(caption.strokeWidth, 0, 10, DEFAULT_STYLE.caption.strokeWidth),
      bottom: clamp(caption.bottom, 80, 700, DEFAULT_STYLE.caption.bottom),
      align: ['left', 'center', 'right'].includes(caption.align) ? caption.align : 'center'
    }
  };
}

function clipDuration(clip) {
  const n = Number(clip?.duration);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export async function renderShort({ clips, title, captions = [], style = {} }) {
  if (!Array.isArray(clips) || clips.length < 1) throw new Error('At least one clip is required');
  const s = normalizeStyle(style);
  await mkdir(ROOT, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const jobDir = path.join(ROOT, id);
  await mkdir(jobDir, { recursive: true });

  const selected = clips.slice(0, 6);
  const durations = selected.map(clipDuration);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  const normalized = [];
  const videoHeight = Math.max(1200, 1920 - s.title.backgroundHeight);

  console.log(`[RENDER ${id}] clips=${selected.length} duration=${totalDuration.toFixed(2)}s threads=${FFMPEG_THREADS}`);

  for (let i = 0; i < selected.length; i += 1) {
    const input = path.join(jobDir, `input-${i}.mp4`);
    const out = path.join(jobDir, `clip-${i}.mp4`);
    await download(selected[i].downloadUrl, input);
    console.log(`[RENDER ${id}] normalize ${i + 1}/${selected.length} duration=${durations[i]}s`);
    await run('ffmpeg', [
      '-y', '-threads', FFMPEG_THREADS, '-filter_threads', FFMPEG_THREADS,
      '-i', input, '-t', String(durations[i]), '-an',
      '-vf', `scale=1080:${videoHeight}:force_original_aspect_ratio=increase,crop=1080:${videoHeight},fps=30,format=yuv420p`,
      '-c:v', 'libx264', '-threads', FFMPEG_THREADS, '-preset', 'ultrafast', '-crf', '24',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out
    ]);
    normalized.push(out);
  }

  const concatFile = path.join(jobDir, 'concat.txt');
  await writeFile(concatFile, normalized.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join('\n'));
  const joined = path.join(jobDir, 'joined.mp4');
  await run('ffmpeg', ['-y', '-threads', FFMPEG_THREADS, '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', joined]);

  const output = path.join(OUTPUT_DIR, `${id}.mp4`);
  const font = process.env.JP_FONT_FILE || '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
  const captionFilters = captions.slice(0, 5).map((line, idx) => {
    const block = totalDuration / Math.max(captions.length, 1);
    const start = idx * block + Math.min(0.6, block * 0.15);
    const end = Math.min(totalDuration, (idx + 1) * block - Math.min(0.3, block * 0.08));
    return `drawtext=fontfile='${font}':text='${esc(line)}':fontcolor=${s.caption.color}:fontsize=${s.caption.fontSize}:borderw=${s.caption.strokeWidth}:bordercolor=${s.caption.strokeColor}:x=${alignX(s.caption.align)}:y=h-${s.caption.bottom}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;
  });

  const filters = [
    `pad=1080:1920:0:${s.title.backgroundHeight}:color=${s.title.backgroundColor}`,
    `drawtext=fontfile='${font}':text='${esc(title)}':fontcolor=${s.title.color}:fontsize=${s.title.fontSize}:x=${alignX(s.title.align)}:y=${s.title.y}`,
    ...captionFilters
  ].join(',');

  console.log(`[RENDER ${id}] final encode`);
  await run('ffmpeg', [
    '-y', '-threads', FFMPEG_THREADS, '-filter_threads', FFMPEG_THREADS,
    '-i', joined, '-vf', filters, '-an',
    '-c:v', 'libx264', '-threads', FFMPEG_THREADS, '-preset', 'ultrafast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output
  ]);

  console.log(`[RENDER ${id}] complete file=${path.basename(output)}`);
  return {
    id,
    filename: `${id}.mp4`,
    url: `/renders/${id}.mp4`,
    duration: Number(totalDuration.toFixed(2)),
    clipDurations: durations,
    threads: Number(FFMPEG_THREADS),
    style: s
  };
}
