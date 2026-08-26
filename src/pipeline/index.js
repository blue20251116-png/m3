const { resolveFinalUrl, LinkResolveError } = require('./linkResolver');
const { extractProductInfo } = require('./productExtractor');
const { extractWithSearchFallback } = require('./searchFallback');
const { requestBrowserExtraction } = require('./browserBridge');
const { validateProduct, MIN_CONFIDENCE_TO_ACCEPT } = require('./productValidator');
const { generateKeywords } = require('./keywordGenerator');
const { generateTitlesAndBody, QualityHoldError } = require('./contentGenerator');
const { checkQuality } = require('./qualityGuard');
const { selectAndPlaceImages } = require('./imagePlacer');
const { insertAffiliateLink, insertDisclosure } = require('./linkInserter');

class PipelineError extends Error {
  constructor(stage, code, message, extra = {}) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
    this.code = code;
    Object.assign(this, extra);
  }
}

async function runPipeline({ shoppingConnectUrl, disclosureText, imageLinkLabel, knownProductNameHint }) {
  const affiliateUrl = shoppingConnectUrl;
  let resolved = null;
  try {
    resolved = await resolveFinalUrl(affiliateUrl);
  } catch (e) {
    console.log(`[NAVER BLOG][PRODUCT EXTRACT FAILED] stage=resolveLink reason=${e.message} → Browser Bridge 시도`);
  }
  let destinationUrl = resolved ? resolved.finalUrl : null;
  let extracted = null;
  let missing = [];
  let usedFallback = false;
  let fallbackSeed = null;

  if (resolved) {
    const direct = extractProductInfo(resolved.html, resolved.finalUrl);
    extracted = direct.extracted;
    missing = direct.missing;
    extracted.affiliateUrl = affiliateUrl;
    extracted.destinationUrl = destinationUrl;
  }

  if (!resolved || missing.length) {
    console.log(`[NAVER BLOG][BROWSER BRIDGE] 직접 추출 불완전 → 원 링크 브라우저 추출 요청`);
    const bridged = await requestBrowserExtraction(affiliateUrl, { timeoutMs: Number(process.env.M3_BROWSER_BRIDGE_TIMEOUT_MS || 45000) });
    if (bridged && bridged.productName && Array.isArray(bridged.images) && bridged.images.length) {
      extracted = bridged;
      extracted.affiliateUrl = affiliateUrl;
      destinationUrl = bridged.destinationUrl || bridged.productUrl || destinationUrl;
      extracted.destinationUrl = destinationUrl;
      missing = [];
      usedFallback = true;
      console.log(`[NAVER BLOG][BROWSER BRIDGE] 성공 product="${extracted.productName}" images=${extracted.images.length}`);
    } else {
      console.log('[NAVER BLOG][BROWSER BRIDGE] 응답 없음/불완전 → 네이버 검색 폴백');
    }
  }

  if ((!extracted || missing.length) && extracted?.dataSource !== 'browser-bridge') {
    fallbackSeed = (extracted && extracted.productName) || knownProductNameHint || null;
    console.log(`[NAVER BLOG][SEARCH FALLBACK] seed="${fallbackSeed || '(없음)'}" 진입`);
    const fallback = await extractWithSearchFallback({ knownProductName: fallbackSeed });
    if (fallback.extracted) {
      extracted = fallback.extracted;
      extracted.affiliateUrl = affiliateUrl;
      extracted.destinationUrl = extracted.productUrl || null;
      destinationUrl = extracted.destinationUrl;
      extracted.dataSource = 'search-fallback';
      missing = [];
      usedFallback = true;
      console.log(`[NAVER BLOG][SEARCH FALLBACK] 성공 (${fallback.candidatesTried}개 후보 시도, 소스: ${extracted.searchFallbackSourceTitle || '알수없음'})`);
    } else {
      console.log(`[NAVER BLOG][PRODUCT EXTRACT FAILED] stage=searchFallback reason=${fallback.failReason} candidatesTried=${fallback.candidatesTried}`);
      throw new PipelineError('extractProduct', 'MISSING_FIELDS_AFTER_FALLBACK',
        `직접 추출, Browser Bridge, 검색 폴백 모두 실패: ${fallback.failReason}`,
        { extracted: extracted || { productName: fallbackSeed }, missing: missing.length ? missing : ['productName', 'images'], requiresManualInput: true }
      );
    }
  } else if (extracted?.dataSource !== 'browser-bridge') {
    extracted.dataSource = 'direct';
  }

  if (!fallbackSeed) fallbackSeed = knownProductNameHint || null;
  const validation = validateProduct({ extracted, knownProductName: fallbackSeed });
  console.log(`[NAVER BLOG][VALIDATE] source=${validation.source} confidence=${validation.confidence} valid=${validation.valid}`);
  if (!validation.valid) {
    console.log(`[NAVER BLOG][PRODUCT VALIDATION FAILED] confidence=${validation.confidence} (기준=${MIN_CONFIDENCE_TO_ACCEPT}) warnings=${validation.warnings.join('; ')}`);
    throw new PipelineError('validateProduct', 'LOW_CONFIDENCE_MATCH',
      `상품 일치 신뢰도가 낮습니다 (${validation.confidence} < ${MIN_CONFIDENCE_TO_ACCEPT})`,
      { extracted, validation, missing: [], requiresManualInput: true }
    );
  }

  console.log(`[NAVER BLOG][EXTRACT] source=${extracted.dataSource} productName="${extracted.productName}"`);

  let keywords;
  try { keywords = generateKeywords(extracted); }
  catch (e) { throw new PipelineError('keywords', 'KEYWORD_GEN_FAILED', e.message); }

  let titles, body, structure;
  try { ({ titles, body, structure } = await generateTitlesAndBody(extracted, keywords)); }
  catch (e) {
    console.log(`[NAVER BLOG][QUALITY HOLD] stage=generateContent reason=${e.message}`);
    throw new PipelineError('generateContent', 'QUALITY_HOLD', e.message);
  }

  const imageResult = await selectAndPlaceImages(extracted.images, body, structure);
  if (!imageResult.thumbnail) {
    console.log('[NAVER BLOG][PRODUCT EXTRACT FAILED] stage=images reason=no-usable-images');
    throw new PipelineError('images', 'NO_USABLE_IMAGES', '사용 가능한 이미지가 없습니다.', { extracted, requiresManualInput: true });
  }

  let bodyWithLink;
  try { bodyWithLink = insertAffiliateLink(body, affiliateUrl, imageLinkLabel); }
  catch (e) { throw new PipelineError('insertLink', 'LINK_INSERT_FAILED', e.message); }

  let finalBody;
  try { finalBody = insertDisclosure(bodyWithLink, disclosureText); }
  catch (e) { throw new PipelineError('disclosure', 'DISCLOSURE_MISSING', e.message); }

  const quality = checkQuality({ titles, body: finalBody, extracted, keywords, affiliateUrl, disclosureText });
  console.log(`[NAVER BLOG][QUALITY CHECK] score=${quality.score} passed=${quality.passed} issues=${quality.issues.length} warnings=${quality.warnings.length}`);
  if (!quality.passed) {
    console.log(`[NAVER BLOG][QUALITY HOLD] issues=${quality.issues.join(' | ')}`);
    throw new PipelineError('qualityGuard', 'QUALITY_HOLD',
      `최종 품질 검증 실패: ${quality.issues.join(', ')}`,
      { extracted, quality, requiresManualInput: false }
    );
  }

  return {
    titles,
    mainKeyword: keywords.mainKeyword,
    subKeywords: keywords.subKeywords,
    longTailKeywords: keywords.longTailKeywords,
    searchIntent: keywords.searchIntent,
    body: finalBody,
    thumbnail: imageResult.thumbnail,
    bodyImages: imageResult.bodyImages,
    imagePlacements: imageResult.placements,
    excludedImages: imageResult.excludedBreakdown,
    affiliateUrl,
    destinationUrl,
    disclosureText,
    validation,
    quality,
    usedFallback,
    extracted,
  };
}

module.exports = { runPipeline, PipelineError };
