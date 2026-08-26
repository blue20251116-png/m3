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
    structure: ['도입', '이런 제품을 찾게 되는 상황', '선택할 때 볼 점', '활용 방법', '관리 포인트', '구매 전 확인할 점', '정리', 'CTA'],
  },
  {
    match: /가전|전자|청소기|가습기|스피커|이어폰|충전/,
    structure: ['도입', '어떤 용도의 제품인지', '활용하기 좋은 상황', '선택 기준', '확인된 제품 특징', '구매 전 확인할 점', '정리', 'CTA'],
  },
  {
    match: /식품|간식|음료|과자|건강식품|영양제/,
    structure: ['도입', '어떤 제품인지', '먹거나 활용하는 상황', '선택할 때 볼 점', '보관과 활용 팁', '구매 전 확인할 점', '정리', 'CTA'],
  },
  {
    match: /화장품|뷰티|스킨케어|메이크업/,
    structure: ['도입', '어떤 유형의 제품인지', '활용 상황', '선택 기준', '확인된 제품 정보', '사용 전 확인할 점', '정리', 'CTA'],
  },
  {
    match: /육아|유아|아기|기저귀|젖병|유모차/,
    structure: ['도입', '어떤 용도의 제품인지', '사용 상황', '선택 기준', '확인된 제품 정보', '구매 전 확인할 점', '정리', 'CTA'],
  },
];

const TRAVEL_STRUCTURE = ['도입', '어떤 상품인지', '여행 상황', '선택 기준', '확인된 일정·조건', '예약 전 확인사항', '정리', 'CTA'];

const GENERIC_STRUCTURE = [
  '도입',
  '어떤 상품인지',
  '이런 상품을 찾는 상황',
  '활용 포인트',
  '선택할 때 볼 점',
  '확인된 상품 특징',
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
  return `너는 네이버 블로그용 상품 소개 글을 새로 작성하는 콘텐츠 작가다.

작업 목적:
- 입력된 상품 데이터는 원문을 요약하기 위한 자료가 아니라, 링크와 사진에서 파악한 "어떤 상품인지"를 알려주는 식별 단서다
- 먼저 상품명·카테고리·설명 등으로 상품의 정체와 용도를 이해한 다음, 그 상품을 주제로 완전히 새로운 네이버 블로그 글을 작성한다
- 원문 문장을 늘이거나 상세페이지 문구를 순서대로 다시 쓰는 방식으로 작성하지 않는다
- 상품 데이터가 짧아도 블로그 글 자체는 카테고리에 맞는 사용 상황, 일반적인 선택 기준, 활용 아이디어, 구매 전 체크 포인트를 충분히 설명할 수 있다

사실성 규칙:
- 특정 상품에 귀속되는 가격, 용량, 크기, 재질, 성분, 인증, 성능 수치, 효능, 구성품, 호환 모델 등 구체적 사실은 [상품 파악 결과]에서 확인된 내용만 단정한다
- 확인되지 않은 상품 고유 스펙을 상식이나 추측으로 만들어내지 않는다
- 반면 해당 상품군에 일반적으로 적용되는 선택 기준, 활용 상황, 관리 방법, 비교 관점은 블로그 정보로 자연스럽게 설명해도 된다. 단, 이것을 해당 제품의 고유 성능인 것처럼 표현하지 않는다
- 직접 구매하거나 사용한 경험을 지어내지 않는다. "직접 써봤다", "며칠 써보니", "가족이 사용했다" 같은 허위 체험담을 쓰지 않는다
- 과장된 효능이나 보장 표현을 쓰지 않는다

글쓰기 규칙:
- 상품을 실제로 검색한 사람이 읽기 편한 네이버 블로그 글처럼 작성한다
- 단순 상품정보 나열이 아니라 도입 → 상품 이해 → 활용 맥락 → 선택 기준 → 확인된 특징 → 구매 전 체크 → 정리 흐름으로 쓴다
- 상품명과 메인 키워드는 자연스럽게 사용하고 억지로 반복하지 않는다
- 같은 문장이나 같은 의미를 반복해서 분량을 채우지 않는다
- Threads/SNS식 반응형 말투(ㅋㅋ, 미쳤다, 대박, 개꿀 등)는 쓰지 않는다
- 본문은 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자 이상, 가능하면 ${TARGET_BODY_CHARS} 정도로 충분히 작성한다
- 제공된 데이터가 적더라도 상품군에 대한 일반적이고 안전한 설명으로 본문을 풍부하게 만들되, 확인되지 않은 제품 고유 사실은 만들지 않는다

본문 구조:
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
        temperature: 0.72,
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

  const productContextBlock = JSON.stringify(
    {
      productType: extracted.productType,
      productName: extracted.productName,
      brand: extracted.brand,
      category: extracted.category,
      price: extracted.price,
      currency: extracted.currency,
      seller: extracted.seller,
      description: extracted.description,
      imageCount: Array.isArray(extracted.images) ? extracted.images.length : 0,
      dataSource: extracted.dataSource,
      travel: extracted.travel || undefined,
      mainKeyword: keywords.mainKeyword,
      subKeywords: keywords.subKeywords,
    },
    null,
    2
  );

  const systemPrompt = buildSystemPrompt(structure);
  const userPrompt = `[상품 파악 결과]\n${productContextBlock}\n\n이 정보는 원문 요약용이 아니라 상품 식별용 단서다. 먼저 이 상품이 무엇이고 어떤 용도의 상품인지 파악한 뒤, 이 상품을 주제로 네이버 블로그 글을 새로 작성해. 상품 고유의 확인되지 않은 스펙은 만들지 말고, 해당 상품군의 일반적인 사용 상황·선택 기준·활용 아이디어·구매 전 체크 포인트를 충분히 활용해 본문을 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자 이상, 가능하면 ${TARGET_BODY_CHARS}로 작성해. 제목도 검색 의도에 맞게 5개 작성해.`;

  let parsed = parseResponse(await callOpenAi([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]));

  const firstLength = bodyLength(parsed.body);
  if (firstLength < MIN_GENERATED_BODY_CHARS) {
    console.warn(`[NAVER BLOG][LENGTH RETRY] first=${firstLength} target>=${MIN_GENERATED_BODY_CHARS} → 블로그 본문 1회 재작성`);
    const retryPrompt = `[상품 파악 결과]\n${productContextBlock}\n\n[첫 초안]\n${parsed.body}\n\n첫 초안은 공백 제외 ${firstLength}자로 짧다. 원문을 억지로 늘이지 말고 이 상품의 정체와 카테고리를 기준으로 블로그 글을 다시 작성해. 해당 상품군의 일반적인 사용 상황, 선택 기준, 활용 아이디어, 관리·구매 전 체크 포인트를 더 충분히 설명하되, 이 제품의 확인되지 않은 가격·수치·재질·성능·효능·인증·구성품은 새로 만들지 마. 같은 내용 반복이나 허위 사용 경험도 금지한다. 본문은 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자 이상, 가능하면 ${TARGET_BODY_CHARS}로 작성하고 제목 5개도 함께 JSON으로 반환해.`;
    parsed = parseResponse(await callOpenAi([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: retryPrompt },
    ]));
    console.log(`[NAVER BLOG][LENGTH RETRY] rewritten=${bodyLength(parsed.body)}`);
  }

  return { titles: parsed.titles, body: parsed.body, structure };
}

module.exports = { generateTitlesAndBody, QualityHoldError, pickStructure };
