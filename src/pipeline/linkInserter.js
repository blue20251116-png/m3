/**
 * 제휴 링크는 문장 중간이 아니라 완결된 문단 경계에만 삽입한다.
 * 중후반 1회 + 글 마지막 CTA 1회를 기본으로 한다.
 */
function insertAffiliateLink(body, affiliateUrl, linkLabel = '상품 보러가기') {
  if (!affiliateUrl) throw new Error('affiliateUrl이 없습니다.');
  let out = normalizeNewlines(body);
  const linkBlock = `${linkLabel}: ${affiliateUrl}`;

  // 기존 생성문에 링크가 섞여 있으면 중복 제거 후 안전하게 다시 배치한다.
  out = out
    .split('\n')
    .filter(line => !line.trim().startsWith(`${linkLabel}:`))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const preferredHeaders = [
    '⚠️ 아쉬운 점', '⚠️ 아쉬운점', '아쉬운 점', '아쉬운점',
    '✅ 이런 분에게', '🎁 추천 대상', '추천 대상',
    '🔍 구매 체크', '🔍 구매 전', '구매 체크', '구매 전 확인'
  ];
  let insertAt = -1;
  for (const header of preferredHeaders) {
    const idx = out.indexOf(header);
    if (idx > 0 && (insertAt === -1 || idx < insertAt)) insertAt = idx;
  }

  if (insertAt === -1) {
    // 헤더가 없으면 전체 글의 약 65% 이후 첫 문단 경계를 사용한다.
    const target = Math.floor(out.length * 0.65);
    const boundary = out.indexOf('\n\n', target);
    insertAt = boundary === -1 ? out.length : boundary;
  } else {
    // 헤더 바로 앞의 문단 경계로 보정한다.
    const before = out.lastIndexOf('\n\n', insertAt);
    if (before >= 0) insertAt = before;
  }

  const first = out.slice(0, insertAt).trimEnd();
  const second = out.slice(insertAt).trimStart();
  out = `${first}\n\n🛒 ${linkBlock}\n\n${second}`.trim();

  // 마지막 CTA는 항상 완결된 글 뒤에 별도 블록으로 둔다.
  if (!out.endsWith(linkBlock)) out += `\n\n🛒 ${linkBlock}`;
  return out;
}

function normalizeNewlines(text) {
  return String(text || '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function insertDisclosure(body, disclosureText) {
  if (!disclosureText) throw new Error('제휴 고지 문구가 설정되지 않았습니다. 사용자가 고지문구를 먼저 입력해야 합니다.');
  return `${disclosureText.trim()}\n\n${normalizeNewlines(body).trim()}`;
}

module.exports = { insertAffiliateLink, insertDisclosure, normalizeNewlines };
