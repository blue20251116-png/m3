'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'generated');

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function avgCornerBackground(data, width, height, channels) {
  const points = [
    [1, 1],
    [Math.max(1, width - 2), 1],
    [1, Math.max(1, height - 2)],
    [Math.max(1, width - 2), Math.max(1, height - 2)],
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of points) {
    const i = (y * width + x) * channels;
    r += data[i] || 0;
    g += data[i + 1] || 0;
    b += data[i + 2] || 0;
  }
  return { r: r / points.length, g: g / points.length, b: b / points.length };
}

function colorDistance(r, g, b, bg) {
  const dr = r - bg.r;
  const dg = g - bg.g;
  const db = b - bg.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function createBrightBackgroundCutout(bytes) {
  ensureOutputDir();
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  const filename = `cutout-${hash}.png`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(outputPath)) return `/generated/${filename}`;

  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (!width || !height || channels < 4) return null;

  const bg = avgCornerBackground(data, width, height, channels);
  const brightness = (bg.r + bg.g + bg.b) / 3;
  if (brightness < 205) return null;

  let transparentPixels = 0;
  const totalPixels = width * height;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const distance = colorDistance(r, g, b, bg);
    let alpha = 255;
    if (distance <= 24) alpha = 0;
    else if (distance < 72) alpha = Math.round(((distance - 24) / 48) * 255);
    data[i + 3] = Math.min(data[i + 3], alpha);
    if (data[i + 3] < 16) transparentPixels++;
  }

  const transparentRatio = transparentPixels / Math.max(1, totalPixels);
  if (transparentRatio < 0.08 || transparentRatio > 0.92) return null;

  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  return `/generated/${filename}`;
}

module.exports = { createBrightBackgroundCutout };
