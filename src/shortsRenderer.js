import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.WORK_DIR || '/tmp/m3-shorts';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'public', 'renders');

const DEFAULT_STYLE = {
  title: {
    fontSize: 62,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundHeight: 288,
    y: 95,
    align: 'center'
  },
  caption: {
    fontSize: 54,
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 3,
    bottom: 270,
    align: 'center'
  }
};

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

export async function renderShort({ clips, title, captions = [], duration = 20, style = {} }) {
  if (!Array.isArray(clips) || clips.length < 1) throw new Error('At least one clip is required');
  const s = normalizeStyle(style);
  await mkdir(ROOT, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const jobDir = path.join(ROOT, id);
  await mkdir(jobDir, { recursive: true });

  const selected = clips.slice(0, 6);
  const segment = Math.max(2.5, duration / selected.length);
  const normalized = [];
  const videoHeight = Math.max(1200, 1920 - s.title.backgroundHeight);

  for (let i = 0; i < selected.length; i += 1) {
    const input = path.join(jobDir, `input-${i}.mp4`);
    const out = path.join(jobDir, `clip-${i}.mp4`);
    await download(selected[i].downloadUrl, input);
    await run('ffmpeg', ['-y', '-i', input, '-t', String(segment), '-an', '-vf',
      `scale=1080:${videoHeight}:force_original_aspect_ratio=increase,crop=1080:${videoHeight},fps=30,format=yuv420p`,
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
    return `drawtext=fontfile='${font}':text='${esc(line)}':fontcolor=${s.caption.color}:fontsize=${s.caption.fontSize}:borderw=${s.caption.strokeWidth}:bordercolor=${s.caption.strokeColor}:x=${alignX(s.caption.align)}:y=h-${s.caption.bottom}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;
  });

  const filters = [
    `pad=1080:1920:0:${s.title.backgroundHeight}:color=${s.title.backgroundColor}`,
    `drawtext=fontfile='${font}':text='${esc(title)}':fontcolor=${s.title.color}:fontsize=${s.title.fontSize}:x=${alignX(s.title.align)}:y=${s.title.y}`,
    ...captionFilters
  ].join(',');

  await run('ffmpeg', ['-y', '-i', joined, '-t', String(duration), '-vf', filters, '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);

  return { id, filename: `${id}.mp4`, url: `/renders/${id}.mp4`, duration, style: s };
}
