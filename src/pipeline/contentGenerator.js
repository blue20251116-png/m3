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
const TARGET_BODY_CHARS = '1700~2300자';
const AI_CLICHE_BLACKLIST = [
  '주목해보세요', '가성비를 자랑', '큰 매력', '매력을 가지고', '매력으로 작용',
  '든든한 동반자', '추천할 만한 제품', '업무 효율성을 극대화', '완벽한 선택',
  '최고의 선택', '놓치지 마세요', '지금 바로', '강력 추천', '후회 없는 선택',
];

const CATEGORY_STRUCTURES = [
  {
    match: /주방|조리|그릇|냄비|프라이팬|식기/,
    structure: ['도입', '이런 제품을 찾게 되는 상황', '제품을 볼 때 핵심 기준', '확인된 특징 해석', '활용 포인트', '아쉬움·확인사항', '구매 판단', 'CTA'],
  },
  {
    match: /가전|전자|노트북|컴퓨터|청소기|가습기|스피커|이어폰|충전/,
    structure: ['도입', '검색자가 먼저 고민할 점', '제품 포지션', '확인된 스펙의 의미', '실사용 관점에서 볼 점', '아쉬움·확인사항', '누구에게 맞는지', 'CTA'],
  },
  {
    match: /식품|간식|음료|과자|건강식품|영양제/,
    structure: ['도입', '어떤 제품인지', '고를 때 먼저 볼 점', '확인된 구성·정보', '활용 상황', '보관·확인사항', '누구에게 맞는지', 'CTA'],
  },
  {
    match: /화장품|뷰티|스킨케어|메이크업/,
    structure: ['도입', '검색자가 고민하는 지점', '제품 유형', '확인된 정보의 의미', '선택 기준', '사용 전 확인사항', '누구에게 맞는지', 'CTA'],
  },
  {
    match: /육아|유아|아기|기저귀|젖병|유모차/,
    structure: ['도입', '부모가 먼저 고민할 지점', '제품 용도', '확인된 정보', '선택 기준', '사용 전 확인사항', '누구에게 맞는지', 'CTA'],
  },
];

const TRAVEL_STRUCTURE = ['도입', '검색자가 궁금한 점', '상품 성격', '확인된 일정·조건', '선택 기준', '예약 전 확인사항', '누구에게 맞는지', 'CTA'];
const GENERIC_STRUCTURE = ['도입', '검색자의 실제 고민', '어떤 상품인지', '확인된 특징의 의미', '활용 상황', '선택 기준', '아쉬움·확인사항', '구매 판단', 'CTA'];

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

async function callOpenAi(messages, temperature = 0.65) {
  try {
    return await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages,
        temperature,
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${getOpenAiKey()}` }, timeout: 60000 }
    );
  } catch (e) {
    throw new QualityHoldError(`[NAVER BLOG][AI FAILED] OpenAI 호출 실패: ${e.message}`, { cause: e });
  }
}

function parseJsonResponse(resp, requiredKeys = []) {
  let parsed;
  try {
    const content = resp.data?.choices?.[0]?.message?.content;
    parsed = JSON.parse(content);
  } catch (e) {
    throw new QualityHoldError('[NAVER BLOG][AI FAILED] OpenAI 응답을 JSON으로 파싱하지 못했습니다.');
  }
  for (const key of requiredKeys) {
    if (parsed[key] == null) throw new QualityHoldError(`[NAVER BLOG][AI FAILED] OpenAI 응답에 ${key}가 없습니다.`);
  }
  return parsed;
}

function buildProductContext(extracted, keywords) {
  return JSON.stringify({
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
  }, null, 2);
}

async function analyzeSearchIntent(productContextBlock, structure) {
  const resp = await callOpenAi([
    {
      role: 'system',
      content: `너는 네이버 블로그 상품 콘텐츠의 검색의도 분석가다. 상품을 칭찬하지 말고, 이 상품명을 검색한 사람이 실제로 어떤 판단을 하려는지 먼저 파악한다. 확인되지 않은 제품 고유 사실은 만들지 않는다. JSON으로만 답한다.`,
    },
    {
      role: 'user',
      content: `[상품 파악 결과]\n${productContextBlock}\n\n다음을 설계해줘.\n- primaryIntent: 검색자의 가장 중요한 의도 1개\n- readerQuestions: 실제 구매자가 궁금해할 질문 4~6개\n- hiddenConcern: 흔한 광고글이 잘 다루지 않는 현실적 고민 1개\n- verifiedFacts: 입력에서 실제 확인되는 제품 사실만 배열\n- avoidClaims: 데이터가 없어 단정하면 안 되는 항목 배열\n- angle: 이 글이 취할 핵심 관점 1문장\n- structure: ${JSON.stringify(structure)}를 독자 질문에 맞게 설명한 배열`,
    },
  ], 0.45);
  return parseJsonResponse(resp, ['primaryIntent', 'readerQuestions', 'verifiedFacts', 'angle']);
}

function writerSystemPrompt() {
  return `너는 네이버 블로그에서 상품을 분석해주는 전문 에디터다.

핵심 원칙:
- 상품 상세페이지를 요약하지 않는다. 상품이 무엇인지 파악한 뒤 검색자의 구매 판단을 돕는 새 글을 쓴다.
- 첫 문단은 광고 문구가 아니라 독자의 실제 고민이나 선택 상황에서 시작한다.
- 제품 스펙을 나열하지 말고 "이 정보가 실제 사용에서 어떤 의미인지" 해석한다.
- 장점만 쓰지 않는다. 데이터가 부족한 부분, 구매 전에 확인할 부분, 어떤 사람에게는 맞지 않을 수 있는 조건을 함께 쓴다.
- 제품 고유 가격·크기·무게·배터리·재질·효능·인증·성능 수치는 입력에서 확인된 경우에만 단정한다.
- 해당 상품군의 일반적인 선택 기준이나 비교 관점은 설명해도 되지만 그것을 해당 제품 고유 성능처럼 말하지 않는다.
- 직접 구매·사용·가족·지인 경험을 지어내지 않는다.
- "주목해보세요", "가성비를 자랑", "큰 매력", "든든한 동반자", "추천할 만한", "업무 효율성을 극대화" 같은 전형적인 AI 광고 문구를 쓰지 않는다.
- "무조건", "보장", "완벽", "최고" 같은 과장 표현을 쓰지 않는다.
- 문단은 모바일에서 읽기 편하게 1~3문장 정도로 짧게 끊고, 문단 사이에 빈 줄을 둔다.
- 소제목은 자연스러운 일반 문장 형태로 넣되 ##, ** 같은 마크다운 헤딩 기호를 쓰지 않는다.
- 본문은 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자, 목표 ${TARGET_BODY_CHARS}.
- 같은 의미를 반복해서 분량을 채우지 않는다.
- 결론은 무조건 추천이 아니라 "누구에게 비교 가치가 있고, 무엇을 추가 확인해야 하는지"로 닫는다.

JSON으로만 응답한다: {"titles":["제목1","제목2","제목3","제목4","제목5"],"body":"본문"}`;
}

async function draftArticle(productContextBlock, plan) {
  const resp = await callOpenAi([
    { role: 'system', content: writerSystemPrompt() },
    {
      role: 'user',
      content: `[상품 파악 결과]\n${productContextBlock}\n\n[검색의도 설계]\n${JSON.stringify(plan, null, 2)}\n\n이 설계를 바탕으로 네이버 블로그 글을 작성해. 제목 5개는 검색의도와 상품명을 자연스럽게 반영하고, 본문은 검색자의 질문에 답하는 순서로 구성해. 확인된 사실은 설명하고 그 의미를 해석하되, 확인되지 않은 제품 고유 스펙은 절대 만들지 마.`,
    },
  ], 0.72);
  const parsed = parseJsonResponse(resp, ['titles', 'body']);
  if (!Array.isArray(parsed.titles) || parsed.titles.length < 5) {
    throw new QualityHoldError('[NAVER BLOG][AI FAILED] 제목 5개가 생성되지 않았습니다.');
  }
  return parsed;
}

async function editorialReview(productContextBlock, plan, draft) {
  const resp = await callOpenAi([
    {
      role: 'system',
      content: `너는 네이버 블로그의 최종 편집자다. 초안을 평가하고 필요한 경우 전체를 다시 쓴다. 광고 카피처럼 보이는 문장, AI 상투어, 근거 없는 단정, 스펙 나열, 같은 의미 반복을 제거한다. 제품을 무조건 칭찬하지 말고 독자가 구매 여부를 판단할 수 있게 만든다. 허위 체험담은 절대 추가하지 않는다. JSON으로만 답한다.`,
    },
    {
      role: 'user',
      content: `[상품 파악 결과]\n${productContextBlock}\n\n[검색의도 설계]\n${JSON.stringify(plan, null, 2)}\n\n[초안]\n${JSON.stringify(draft, null, 2)}\n\n다음 기준으로 최종 편집해:\n1. 첫 문단이 실제 검색자의 고민에서 시작하는가\n2. 확인된 스펙은 단순 나열하지 않고 의미까지 설명하는가\n3. 확인되지 않은 성능·효능·무게·배터리·화면품질·A/S 등을 사실처럼 단정하지 않았는가\n4. 장점과 함께 확인할 점이나 한계도 있는가\n5. AI 광고 상투어가 없는가\n6. 같은 의미 반복이 없는가\n7. 결론이 무조건 추천이 아니라 대상/조건을 구분하는가\n8. 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자를 충족하는가\n\n문제가 있으면 전체 글을 자연스럽게 다시 써. 최종 JSON은 {"titles":[5개],"body":"최종본문","changes":["수정요약"]} 형태로 반환해.`,
    },
  ], 0.45);
  return parseJsonResponse(resp, ['titles', 'body']);
}

function hasCliche(body) {
  const text = String(body || '');
  return AI_CLICHE_BLACKLIST.some((p) => text.includes(p));
}

async function generateTitlesAndBody(extracted, keywords) {
  const structure = pickStructure(extracted);
  const productContextBlock = buildProductContext(extracted, keywords);

  console.log('[NAVER BLOG][CONTENT PLAN] 검색의도 분석 시작');
  const plan = await analyzeSearchIntent(productContextBlock, structure);
  console.log(`[NAVER BLOG][CONTENT PLAN] intent="${String(plan.primaryIntent).slice(0, 120)}" questions=${Array.isArray(plan.readerQuestions) ? plan.readerQuestions.length : 0}`);

  console.log('[NAVER BLOG][DRAFT] 검색의도 기반 초안 생성 시작');
  let draft = await draftArticle(productContextBlock, plan);
  console.log(`[NAVER BLOG][DRAFT] length=${bodyLength(draft.body)}`);

  console.log('[NAVER BLOG][EDITOR] AI 광고티/근거 단정 최종 편집 시작');
  let edited = await editorialReview(productContextBlock, plan, draft);
  console.log(`[NAVER BLOG][EDITOR] length=${bodyLength(edited.body)} cliche=${hasCliche(edited.body) ? 'yes' : 'no'}`);

  if (bodyLength(edited.body) < MIN_GENERATED_BODY_CHARS || hasCliche(edited.body)) {
    console.warn(`[NAVER BLOG][EDITOR RETRY] length=${bodyLength(edited.body)} cliche=${hasCliche(edited.body) ? 'yes' : 'no'} → 1회 재편집`);
    edited = await editorialReview(productContextBlock, plan, edited);
    console.log(`[NAVER BLOG][EDITOR RETRY] rewritten=${bodyLength(edited.body)} cliche=${hasCliche(edited.body) ? 'yes' : 'no'}`);
  }

  if (!Array.isArray(edited.titles) || edited.titles.length < 5 || !edited.body) {
    throw new QualityHoldError('[NAVER BLOG][AI FAILED] 최종 편집 결과 구조가 올바르지 않습니다.');
  }

  return {
    titles: edited.titles.slice(0, 5),
    body: edited.body,
    structure,
    contentPlan: plan,
  };
}

module.exports = { generateTitlesAndBody, QualityHoldError, pickStructure };
