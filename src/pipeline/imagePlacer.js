const axios = require('axios');
const crypto = require('crypto');
const { createBrightBackgroundCutout } = require('./backgroundRemover');

const MIN_IMAGE_BYTES = 8 * 1024;
const EXCLUDE_URL_PATTERN = /(?:icon|logo|sprite|badge|btn[-_]|button|banner|ad[-_]|advert|thumb[-_]?s\b|favicon|placeholder)/i;

function looksLikeUiAsset(url) {
  try {
    const path = new URL(url).pathname;
    return EXCLUDE_URL_PATTERN.test(path);
  } catch (e) {
    return EXCLUDE_URL_PATTERN.test(url);
  }
}

async function selectAndPlaceImages(images, body, structure) {
  const sectionHeaders = Array.isArray(structure) && structure.length
    ? structure
    : ['도입', '검색자가 궁금해할 문제', '상품 특징', '실제 활용 포인트', '장점', '구매 전 확인할 점', '어떤 사람에게 맞는지', '정리', 'CTA'];

  const seenUrl = new Set();
  const seenHash = new Set();
  const usable = [];
  let excludedUiAsset = 0;
  let excludedTooSmall = 0;
  let excludedDuplicateContent = 0;
  let excludedFetchFailed = 0;
  let cutoutSuccess = 0;
  let cutoutSkipped = 0;

  for (const url of images) {
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);

    if (looksLikeUiAsset(url)) {
      excludedUiAsset += 1;
      continue;
    }

    let bytes;
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxContentLength: 20 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0 M3BlogImage/1.0' },
      });
      bytes = Buffer.from(res.data);
    } catch (e) {
      excludedFetchFailed += 1;
      continue;
    }

    const sizeBytes = bytes?.length || 0;
    if (sizeBytes < MIN_IMAGE_BYTES) {
      excludedTooSmall += 1;
      continue;
    }

    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (seenHash.has(hash)) {
      excludedDuplicateContent += 1;
      continue;
    }
    seenHash.add(hash);

    let displayUrl = url;
    let cutout = false;
    try {
      const cutoutUrl = await createBrightBackgroundCutout(bytes);
      if (cutoutUrl) {
        displayUrl = cutoutUrl;
        cutout = true;
        cutoutSuccess += 1;
      } else {
        cutoutSkipped += 1;
      }
    } catch (e) {
      cutoutSkipped += 1;
      console.warn(`[M3][IMAGE CUTOUT] skipped url=${String(url).slice(0,120)} reason=${e.message}`);
    }

    usable.push({
      url: displayUrl,
      sizeBytes,
      sourceUrl: url,
      contentHash: hash,
      cutout,
    });
  }

  const thumbnail = usable[0] || null;
  const bodyImages = usable.slice(1, 7);

  const placements = [];
  const sectionsPresent = sectionHeaders.filter((h) => body.includes(h));
  let imgIdx = 0;
  for (const section of sectionsPresent) {
    if (imgIdx >= bodyImages.length) break;
    placements.push({ afterSection: section, image: bodyImages[imgIdx] });
    imgIdx += 1;
  }

  console.log(`[M3][IMAGE CUTOUT] usable=${usable.length} cutout=${cutoutSuccess} original=${cutoutSkipped}`);

  return {
    thumbnail,
    bodyImages,
    placements,
    excludedCount: images.length - usable.length,
    excludedBreakdown: {
      uiAsset: excludedUiAsset,
      tooSmall: excludedTooSmall,
      duplicateContent: excludedDuplicateContent,
      fetchFailed: excludedFetchFailed,
    },
    cutout: {
      success: cutoutSuccess,
      skipped: cutoutSkipped,
    },
  };
}

module.exports = { selectAndPlaceImages, looksLikeUiAsset };
