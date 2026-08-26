const axios = require('axios');

class QualityHoldError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'QualityHoldError';
    Object.assign(this, extra);
  }
}

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
  return key;
}

const MIN_GENERATED_BODY_CHARS = 1200;
const TARGET_BODY_CHARS = '1600~2200자';

const CATEGORY_STRUCTURES = [
  {
    match: /주방|조리|그릇|냄비|프라이팬|식기/,
    structure: ['도입', '어떤 상황에서 불편했는지', '선택 기준', '관리 방법', '크기와 소재', '구매 전 확인할 점', '정리', 'CTA'],
  },
  {
    match: /가전|전자|청소기|가습기|스피커|이어폰|충전/,
    structure: ['도입', '사용 환경', '주요 기능', '스펙', '호환성', '주의할 점', '정리', 'CTA'],
  },
  {
    match: /식품|간식|음료|과자|건강식품|영양제/,
    structure: ['도입', '구성', '용량', '보관 방법', '활용 방법', '구매 전 확인할 점', '정리', 'CTA'],
  },
  {
    match: /화장품|뷰티|스킨케어|메이크업/,
    structure: ['도입', '제품 유형', '실제 확인 가능한 성분', '사용 방법', '주의할 점', '정리', 'CTA'],
  },
  {
    match: /육아|유아|아기|기저귀|젖병|유모차/,
    structure: ['도입', '사용 상황', '재질', '연령대', '실제 확인되는 안전 정보', '정리', 'CTA'],
  },
];

const TRAVEL_STRUCTURE = ['도입', '지역', '일정', '포함사항', '이용조건', '예약 전 확인사항', '정리', 'CTA'];

const GENERIC_STRUCTURE = [
  '도입',
  '검색자가 궁금해할 문제',
  '상품 특징',
  '실제 활용 포인트',
  '장점',
  '구매 전 확인할 점',
  '어떤 사람에게 맞는지',
  '정리',
  'CTA',
];

function pickStructure(extracted) {
  if (extracted.productType === 'travel') return TRAVEL_STRUCTURE;
  const hay = `${extracted.category || ''} ${extracted.productName || ''}`;
  for (const c of CATEGORY_STRUCTURES) {
    if (c.match.test(hay)) return c.structure;
  }
  return GENERIC_STRUCTURE;
}

function bodyLength(body) {
  return String(body || '').replace(/\s/g, '').length;
}

function buildSystemPrompt(structure) {
  const structureBlock = structure.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `너는 네이버 블로그용 상품 소개 글을 쓰는 정보형 콘텐츠 작가다.

절대 규칙:
- 아래 [상품 데이터]에 없는 사실(가격, 용량, 인증, 효능 등)을 절대 새로 만들지 않는다. 제공된 productFacts 외의 제품 사실을 만들지 않는다
- 직접 사용/구매 경험을 지어내지 않는다. "제가 직접 사용해봤는데" "며칠 사용해보니" "우리 집에서 써봤어요" "아이에게 사용했는데" "남편이 써봤는데" "친구가 추천해서 샀어요" 같은 문장을 절대 쓰지 않는다
- 사용자가 실제 경험을 입력하지 않았다면 경험담을 만들지 않는다. 대신 확인 가능한 상품 정보, 선택 기준, 활용 맥락, 구매 전 확인사항을 자연스럽게 풀어 쓴다
- Threads/SNS 반응형 말투(ㅋㅋ, 미쳤다, 대박, 개꿀 등)를 쓰지 않는다
- 상품명이나 핵심 키워드를 어색하게 반복하지 않는다
- 검증 불가능한 정보를 SEO 목적으로 지어내지 않는다
- 같은 문장이나 같은 의미를 반복해서 글자 수를 채우지 않는다
- 정보가 적더라도 새로운 사실을 만들지 말고, 주어진 정보를 바탕으로 사용 상황·선택 기준·확인 포인트를 충분히 설명한다
- 자연스러운 정보형 문장으로, 검색해서 들어온 사람이 실제로 읽을 이유가 있는 글을 쓴다
- 본문은 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자 이상 작성하고, 가능하면 ${TARGET_BODY_CHARS} 범위를 목표로 한다

본문 구조 (이 상품 카테고리에 맞게 정해진 순서):
${structureBlock}

JSON으로만 응답한다: {"titles": ["제목1","제목2","제목3","제목4","제목5"], "body": "본문 전체 텍스트"}`;
}

async function callOpenAi(messages) {
  try {
    return await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${getOpenAiKey()}` }, timeout: 60000 }
    );
  } catch (e) {
    throw new QualityHoldError(`[NAVER BLOG][AI FAILED] OpenAI 호출 실패: ${e.message}`, { cause: e });
  }
}

function parseResponse(resp) {
  let parsed;
  try {
    const content = resp.data?.choices?.[0]?.message?.content;
    parsed = JSON.parse(content);
  } catch (e) {
    throw new QualityHoldError('[NAVER BLOG][AI FAILED] OpenAI 응답을 JSON으로 파싱하지 못했습니다.');
  }

  if (!Array.isArray(parsed.titles) || parsed.titles.length < 5 || !parsed.body) {
    throw new QualityHoldError('[NAVER BLOG][AI FAILED] OpenAI 응답 구조가 기대한 형식이 아닙니다(titles 5개 또는 body 누락).');
  }
  return parsed;
}

async function generateTitlesAndBody(extracted, keywords) {
  const structure = pickStructure(extracted);

  const productDataBlock = JSON.stringify(
    {
      productType: extracted.productType,
      productName: extracted.productName,
      brand: extracted.brand,
      category: extracted.category,
      price: extracted.price,
      currency: extracted.currency,
      seller: extracted.seller,
      description: extracted.description,
      travel: extracted.travel || undefined,
      mainKeyword: keywords.mainKeyword,
      subKeywords: keywords.subKeywords,
    },
    null,
    2
  );

  const systemPrompt = buildSystemPrompt(structure);
  const userPrompt = `[상품 데이터]\n${productDataBlock}\n\n위 데이터만 근거로 제목 5개와 본문을 만들어줘. 본문은 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자 이상, 가능하면 ${TARGET_BODY_CHARS}로 작성해.`;

  let parsed = parseResponse(await callOpenAi([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]));

  const firstLength = bodyLength(parsed.body);
  if (firstLength < MIN_GENERATED_BODY_CHARS) {
    console.warn(`[NAVER BLOG][LENGTH RETRY] first=${firstLength} target>=${MIN_GENERATED_BODY_CHARS} → 1회 확장 재작성`);
    const retryPrompt = `[상품 데이터]\n${productDataBlock}\n\n[첫 초안]\n${parsed.body}\n\n첫 초안이 공백 제외 ${firstLength}자로 너무 짧다. 상품 데이터에 없는 사실·숫자·효능·사용 경험을 절대 추가하지 말고, 같은 내용을 반복하지도 말고, 각 구조의 설명·선택 기준·활용 맥락·구매 전 확인사항을 더 구체적으로 풀어서 본문을 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자 이상, 가능하면 ${TARGET_BODY_CHARS}로 다시 작성해. 제목도 5개를 함께 JSON으로 반환해.`;
    parsed = parseResponse(await callOpenAi([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: retryPrompt },
    ]));
    console.log(`[NAVER BLOG][LENGTH RETRY] rewritten=${bodyLength(parsed.body)}`);
  }

  return { titles: parsed.titles, body: parsed.body, structure };
}

module.exports = { generateTitlesAndBody, QualityHoldError, pickStructure };
