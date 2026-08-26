const axios = require('axios');
class QualityHoldError extends Error { constructor(message, extra={}) { super(message); this.name='QualityHoldError'; Object.assign(this,extra); } }
function getOpenAiKey(){ const key=process.env.OPENAI_API_KEY; if(!key) throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.'); return key; }
const MIN_GENERATED_BODY_CHARS=1400;
const TARGET_BODY_CHARS='1900~2800자';
const AI_CLICHE_BLACKLIST=['주목해보세요','가성비를 자랑','큰 매력','매력을 가지고','매력으로 작용','든든한 동반자','추천할 만한 제품','업무 효율성을 극대화','완벽한 선택','최고의 선택','놓치지 마세요','지금 바로','강력 추천','후회 없는 선택'];
const CATEGORY_STRUCTURES=[
 {match:/주방|조리|그릇|냄비|프라이팬|식기/,structure:['도입','핵심정보','선택기준','특징1','특징2','활용','장단점','추천대상','구매체크','CTA']},
 {match:/가전|전자|노트북|컴퓨터|청소기|가습기|스피커|이어폰|충전/,structure:['도입','핵심스펙','특징1','특징2','특징3','실사용관점','장단점','추천대상','구매체크','CTA']},
 {match:/식품|간식|음료|과자|건강식품|영양제/,structure:['도입','핵심정보','구성','특징','활용','보관·확인','장단점','추천대상','CTA']},
 {match:/화장품|뷰티|스킨케어|메이크업/,structure:['도입','핵심정보','제품유형','확인된특징','선택기준','사용전확인','추천대상','CTA']},
 {match:/육아|유아|아기|기저귀|젖병|유모차/,structure:['도입','핵심정보','제품용도','확인된특징','선택기준','사용전확인','장단점','추천대상','CTA']}
];
const TRAVEL_STRUCTURE=['도입','핵심정보','일정·조건','특징','선택기준','장단점','예약전확인','추천대상','CTA'];
const GENERIC_STRUCTURE=['도입','핵심정보','상품포지션','특징1','특징2','활용상황','장단점','추천대상','구매체크','CTA'];
function pickStructure(e){ if(e.productType==='travel')return TRAVEL_STRUCTURE; const h=`${e.category||''} ${e.productName||''}`; for(const c of CATEGORY_STRUCTURES)if(c.match.test(h))return c.structure; return GENERIC_STRUCTURE; }
function bodyLength(b){return String(b||'').replace(/\s/g,'').length;}
async function callOpenAi(messages,temperature=.65){try{return await axios.post('https://api.openai.com/v1/chat/completions',{model:'gpt-4o-mini',messages,temperature,response_format:{type:'json_object'}},{headers:{Authorization:`Bearer ${getOpenAiKey()}`},timeout:60000});}catch(e){throw new QualityHoldError(`[NAVER BLOG][AI FAILED] OpenAI 호출 실패: ${e.message}`,{cause:e});}}
function parseJsonResponse(resp,keys=[]){let p;try{p=JSON.parse(resp.data?.choices?.[0]?.message?.content);}catch(_){throw new QualityHoldError('[NAVER BLOG][AI FAILED] OpenAI 응답을 JSON으로 파싱하지 못했습니다.');}for(const k of keys)if(p[k]==null)throw new QualityHoldError(`[NAVER BLOG][AI FAILED] OpenAI 응답에 ${k}가 없습니다.`);return p;}
function buildProductContext(e,k){return JSON.stringify({productType:e.productType,productName:e.productName,brand:e.brand,category:e.category,price:e.price,currency:e.currency,seller:e.seller,description:e.description,imageCount:Array.isArray(e.images)?e.images.length:0,dataSource:e.dataSource,travel:e.travel||undefined,mainKeyword:k.mainKeyword,subKeywords:k.subKeywords,longTailKeywords:k.longTailKeywords},null,2);}
async function analyzeSearchIntent(ctx,structure){const r=await callOpenAi([{role:'system',content:'너는 네이버 검색 유입형 상품 콘텐츠 기획자다. 검색엔진을 속이는 반복 키워드가 아니라 검색자의 의도를 정확히 해결하는 콘텐츠를 설계한다. 확인되지 않은 제품 사실은 만들지 않는다. JSON으로만 답한다.'},{role:'user',content:`[상품 파악 결과]\n${ctx}\n\nprimaryIntent 1개, readerQuestions 5~7개, hiddenConcern 1개, verifiedFacts 배열, avoidClaims 배열, angle 1문장, seoTerms 5~10개, structure를 설계해. seoTerms는 입력에서 추론 가능한 일반 카테고리 관련어만 사용해. 기본 구조=${JSON.stringify(structure)}`}],.4);return parseJsonResponse(r,['primaryIntent','readerQuestions','verifiedFacts','angle']);}
function writerSystemPrompt(){return `너는 네이버 블로그 상품 분석 전문 에디터다.
[SEO]
- 제목에는 mainKeyword 또는 정확한 상품명을 자연스럽게 1회 포함한다.
- 제목 5개는 스펙/가격·혜택/선택기준/장단점/사용대상 등 서로 다른 검색의도를 반영한다.
- 본문 첫 150자 안에 메인키워드나 상품명을 자연스럽게 1회 언급한다.
- 메인키워드를 본문 전체에 자연스럽게 분산하되 키워드 밀도를 위한 반복은 금지한다.
- 관련어와 하위 주제로 검색자의 실제 질문에 답한다. 제목과 본문은 정확히 일치해야 한다.
[편집]
- 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자, 목표 ${TARGET_BODY_CHARS}.
- 모바일 기준 한 문단 1~3문장, 문단 사이 빈 줄.
- 도입은 3~5개 짧은 문단, 광고 인사말 대신 독자의 현실적 고민에서 시작.
- 소제목 6~10개. 핵심 기능은 카테고리 이모지+번호형 소제목 사용 가능.
- 역할 이모지: 📌 핵심, 📊 스펙, 💡 팁, ✅ 장점, ⚠️ 아쉬움/주의, 🔍 구매체크, 🎁 구성/혜택, 🛒 CTA. 일반 문장마다 이모지를 붙이지 않는다.
- 핵심 숫자·모델명·판단 포인트만 **선택적 굵은 강조**. 문단 전체 강조 금지.
- 확인된 스펙 4개 이상이면 '📊 한눈에 보는 핵심 정보'를 만들고 짧게 정리한다.
- 장점과 아쉬운 점을 분리한다. 억지 단점은 만들지 말고 확인 가능한 제한 또는 구매 전 확인사항을 쓴다.
- 추천대상과 구매 전 체크 섹션을 둔다.
- 본문 중 이미지가 들어갈 좋은 위치에 [IMAGE: 필요한 사진 역할] 마커 4~8개를 독립된 한 줄로 삽입한다.
- 제원이 충분하면 [SPEC_CARD: 상품명 핵심 제원] 마커 1개를 독립된 한 줄로 넣는다.
[신뢰]
- 상세페이지를 복사하지 않고 구매 판단을 돕는 새 글을 쓴다.
- 스펙은 의미까지 해석한다.
- 직접 구매/사용 경험을 지어내지 않는다.
- 확인되지 않은 가격·크기·무게·배터리·재질·효능·인증·A/S·성능 수치를 만들지 않는다.
- AI 광고 상투어와 무조건/보장/완벽/최고 같은 과장을 쓰지 않는다.
- 누구에게 맞고 누구에게는 다른 선택이 나을지 구분한다.
JSON으로만 응답: {"titles":[5개],"body":"본문"}`;}
async function draftArticle(ctx,plan){const r=await callOpenAi([{role:'system',content:writerSystemPrompt()},{role:'user',content:`[상품 파악 결과]\n${ctx}\n\n[검색의도 설계]\n${JSON.stringify(plan,null,2)}\n\n실제 네이버 블로그에서 읽기 좋은 완성형 글을 작성해. 이모지·번호형 소제목·짧은 줄바꿈·선택적 **강조**·장점/아쉬운점·추천대상·구매체크를 자연스럽게 사용해. 이미지 문맥에는 [IMAGE: ...], 제원이 충분하면 [SPEC_CARD: ...]를 넣어. 확인되지 않은 사실은 만들지 마.`}],.7);const p=parseJsonResponse(r,['titles','body']);if(!Array.isArray(p.titles)||p.titles.length<5)throw new QualityHoldError('[NAVER BLOG][AI FAILED] 제목 5개가 생성되지 않았습니다.');return p;}
async function editorialReview(ctx,plan,draft){const r=await callOpenAi([{role:'system',content:'너는 네이버 블로그 최종 편집자이자 SEO 품질 검수자다. 검색엔진 조작용 키워드 반복은 제거하고 검색의도 충족, 모바일 가독성, 정보 정확성, 자연스러운 강조를 높인다. 광고 카피, AI 상투어, 근거 없는 단정, 허위 체험담을 제거한다. JSON으로만 답한다.'},{role:'user',content:`[상품]\n${ctx}\n[기획]\n${JSON.stringify(plan,null,2)}\n[초안]\n${JSON.stringify(draft,null,2)}\n최종 검수: 제목-본문 일치, 첫 150자 상품/메인키워드 자연 등장, 키워드 억지 반복 금지, 짧은 문단/빈줄, 소제목·이모지 절제, 핵심만 **강조**, 스펙/장점/아쉬움/추천대상/구매체크, 확인되지 않은 단정 금지, [IMAGE: ...] 4~8개, 제원 충분 시 [SPEC_CARD: ...] 1개, AI 상투어 제거, 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자. 필요하면 전체 재편집. {"titles":[5개],"body":"최종본문","changes":["수정요약"]}로 답해.`}],.42);return parseJsonResponse(r,['titles','body']);}
function hasCliche(b){const t=String(b||'');return AI_CLICHE_BLACKLIST.some(p=>t.includes(p));}
async function generateTitlesAndBody(extracted,keywords){const structure=pickStructure(extracted),ctx=buildProductContext(extracted,keywords);console.log('[NAVER BLOG][CONTENT PLAN] 검색의도/SEO 설계 시작');const plan=await analyzeSearchIntent(ctx,structure);console.log(`[NAVER BLOG][CONTENT PLAN] intent="${plan.primaryIntent}" questions=${plan.readerQuestions?.length||0}`);console.log('[NAVER BLOG][DRAFT] 네이버 블로그형 초안 생성 시작');const draft=await draftArticle(ctx,plan);console.log(`[NAVER BLOG][DRAFT] length=${bodyLength(draft.body)}`);console.log('[NAVER BLOG][EDITOR] SEO/강조/이모지/가독성 최종 편집 시작');let final=await editorialReview(ctx,plan,draft),len=bodyLength(final.body);console.log(`[NAVER BLOG][EDITOR] length=${len} cliche=${hasCliche(final.body)?'yes':'no'}`);if(len<MIN_GENERATED_BODY_CHARS||hasCliche(final.body)){console.log(`[NAVER BLOG][EDITOR RETRY] length=${len} → 1회 재편집`);final=await editorialReview(ctx,plan,final);len=bodyLength(final.body);}if(len<MIN_GENERATED_BODY_CHARS)throw new QualityHoldError(`본문 생성 길이 부족 (${len}자, 최소 ${MIN_GENERATED_BODY_CHARS}자)`);if(hasCliche(final.body))throw new QualityHoldError('최종 편집 후에도 AI 광고형 상투어가 남아 있습니다.');return{titles:final.titles.slice(0,5),body:final.body.trim(),structure,contentPlan:plan};}
module.exports={generateTitlesAndBody,QualityHoldError,pickStructure};
