const axios = require('axios');
class QualityHoldError extends Error { constructor(message, extra={}) { super(message); this.name='QualityHoldError'; Object.assign(this,extra); } }
function getOpenAiKey(){const key=process.env.OPENAI_API_KEY;if(!key)throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');return key;}
const MIN_GENERATED_BODY_CHARS=1400;
const TARGET_BODY_CHARS='1800~2600자';
const BANNED=['주목해보세요','가성비를 자랑','큰 매력','든든한 동반자','추천할 만한 제품','완벽한 선택','최고의 선택','강력 추천','안성맞춤','흡입력을 자랑','가격 대비 성능이 뛰어나'];
function bodyLength(v){return String(v||'').replace(/\s/g,'').length;}
function normalizeBody(v){return String(v||'').replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
async function callOpenAi(messages,temperature=.55){try{return await axios.post('https://api.openai.com/v1/chat/completions',{model:'gpt-4o-mini',messages,temperature,response_format:{type:'json_object'}},{headers:{Authorization:`Bearer ${getOpenAiKey()}`},timeout:60000});}catch(e){throw new QualityHoldError(`[NAVER BLOG][AI FAILED] OpenAI 호출 실패: ${e.message}`,{cause:e});}}
function parse(resp,keys=[]){let p;try{p=JSON.parse(resp.data?.choices?.[0]?.message?.content);}catch{throw new QualityHoldError('[NAVER BLOG][AI FAILED] JSON 파싱 실패');}for(const k of keys)if(p[k]==null)throw new QualityHoldError(`[NAVER BLOG][AI FAILED] ${k} 누락`);return p;}
function buildContext(e,k){return JSON.stringify({productType:e.productType,productName:e.productName,brand:e.brand,category:e.category,price:e.price,currency:e.currency,seller:e.seller,description:e.description,images:Array.isArray(e.images)?e.images.slice(0,12):[],dataSource:e.dataSource,travel:e.travel||undefined,mainKeyword:k.mainKeyword,subKeywords:k.subKeywords,longTailKeywords:k.longTailKeywords},null,2);}
async function makePlan(ctx){const r=await callOpenAi([{role:'system',content:`너는 상품 팩트체커 겸 네이버 블로그 편집기획자다. 입력에 명시된 사실과 일반적인 구매 선택 기준을 엄격히 구분한다. 제품 고유 사실은 입력에 있는 것만 VERIFIED로 인정한다. BLDC라는 단어 하나만으로 저소음, 고효율, 긴 수명, 강한 흡입력, 배터리 절약을 그 제품 사실로 추론하면 안 된다. 후기 데이터가 없으면 사용자 만족/후기/평가를 절대 만들지 않는다. JSON만 답한다.`},{role:'user',content:`[원본 추출 데이터]\n${ctx}\n\nJSON 설계:\nverifiedFacts: 입력에서 문자 그대로 확인 가능한 제품 고유 사실 배열\nunknownClaims: 확인되지 않아 본문에서 제품 사실로 쓰면 안 되는 주장 배열\nreaderQuestions: 구매자가 실제로 확인할 질문 5~7개\nangle: 이 상품에서 가장 중요한 판단 관점\nsectionIdeas: '특징1/특징2' 같은 이름이 아니라 실제 사실 기반의 구체적인 소제목 후보 5~8개\nseoTerms: 자연스러운 관련 검색어\nimageRoles: 실제 확보 이미지로 보여주면 좋은 장면 역할 4~7개. 후기 캡처처럼 확보 여부가 불명확한 것은 요구하지 말 것`}],.25);return parse(r,['verifiedFacts','unknownClaims','readerQuestions','angle','sectionIdeas']);}
function writerPrompt(){return `너는 네이버에서 실제 사람이 운영하는 정보형 쇼핑 블로그의 편집자다.

절대 규칙:
1) VERIFIED FACTS에 없는 제품 고유 사실을 만들지 않는다.
2) 일반 지식은 '이 제품이 그렇다'고 단정하지 말고 구매자가 확인할 선택 기준으로만 설명한다.
3) 후기/리뷰 원문이 입력에 없으면 '실제 사용자들은', '후기가 많다', '만족도가 높다' 같은 문장을 절대 쓰지 않는다.
4) 입력에 없으면 경량, 저소음, 강력한 흡입력, 높은 효율, 긴 수명, 알레르기에 유용, 다양한 바닥에서 우수, 유지비 절감, 어린 자녀 가정 추천 등을 제품 사실로 쓰지 않는다.
5) 제품명에 '10만원대'가 포함돼도 실제 price 데이터가 없으면 현재 판매가처럼 단정하지 말고 상품명/포지션 표현임을 구분한다.
6) 글자 수를 채우기 위해 같은 장점을 반복하지 않는다. 정보가 부족하면 '구매 전 확인할 것'을 구체적으로 설명한다.

글 스타일:
- 공백 제외 ${TARGET_BODY_CHARS} 목표, 최소 ${MIN_GENERATED_BODY_CHARS}자.
- 첫 문장을 '청소기는 필수 가전입니다' 같은 사전식 문장으로 시작하지 않는다. 해당 상품을 검색한 사람이 왜 비교하는지 구체적인 고민으로 시작한다.
- 고정 템플릿 '특징1/특징2/특징3/실사용관점' 금지. 상품마다 VERIFIED FACTS에서 중요한 순서로 소제목을 새로 만든다.
- 소제목 6~9개, 짧은 문단, 모바일 줄바꿈.
- 📌 📊 💡 ✅ ⚠️ 🔍 🎁 이모지는 정보 탐색에 도움이 될 때만 사용한다.
- 핵심 숫자/모델명/판단 포인트만 **굵게** 표시한다.
- 장점은 확인된 사실에서만 도출한다. 단점이 확인되지 않았으면 가짜 단점을 만들지 말고 '구매 전 확인할 점'으로 쓴다.
- '추천 대상'도 확인된 기능과 용도 범위 안에서만 작성한다.
- 상품 링크 문구는 절대 작성하지 않는다. 링크는 후처리기가 넣는다.

이미지 규칙:
- [IMAGE: ...]를 4~7개 사용하되 반드시 관련 설명 바로 다음에 한 개씩 분산 배치한다.
- IMAGE 마커 2개를 연속 배치하지 않는다.
- 모든 IMAGE 마커를 글 마지막에 몰아넣지 않는다.
- 실제로 확보하지 않은 사용자 후기, 성능 테스트 결과 사진을 요구하지 않는다.
- 제원 4개 이상이 VERIFIED이면 핵심정보 섹션 직후 [SPEC_CARD: 상품명 핵심 제원] 1개. 아니면 SPEC_CARD를 만들지 않는다.

SEO:
- 제목에 상품명/메인키워드 자연스럽게 포함.
- 첫 150자에 상품명 또는 메인키워드 1회.
- 키워드 반복 횟수를 맞추지 않는다. 검색 질문을 해결하는 구체적인 관련어를 사용한다.
- 광고 상투어 금지.

JSON만 출력: {"titles":[5개],"body":"전체본문"}`;}
async function draft(ctx,plan){const r=await callOpenAi([{role:'system',content:writerPrompt()},{role:'user',content:`[상품 원본]\n${ctx}\n\n[팩트/기획]\n${JSON.stringify(plan,null,2)}\n\nverifiedFacts만 제품 사실로 사용해 완성형 네이버 블로그 글을 써. sectionIdeas를 그대로 기계적으로 복사하지 말고 자연스러운 구체 소제목으로 편집해. 이미지 마커는 해당 문단 사이에 실제로 분산해.`}],.62);return parse(r,['titles','body']);}
async function factReview(ctx,plan,current){const r=await callOpenAi([{role:'system',content:`너는 엄격한 광고 원고 팩트체커다. 초안에 원본 입력으로 입증되지 않는 제품 고유 주장이 있으면 삭제하거나 '구매 전 확인할 항목'으로 바꾼다. 특히 BLDC→강한 흡입/저소음/효율/내구성, 자동먼지비움→알레르기 유용, 후기 없음→사용자 만족 같은 추론을 삭제한다. 문체는 자연스러운 네이버 블로그형을 유지한다. 이미지 마커는 관련 문단 바로 뒤에 분산한다. 링크는 쓰지 않는다. JSON만 답한다.`},{role:'user',content:`[원본]\n${ctx}\n[검증 사실]\n${JSON.stringify(plan,null,2)}\n[초안]\n${JSON.stringify(current,null,2)}\n\n검수 후 전체 원고를 반환해. '특징1/2/3' 고정 템플릿과 광고 상투어도 제거해. 공백 제외 최소 ${MIN_GENERATED_BODY_CHARS}자를 목표로 하되 사실성을 분량보다 우선한다. {"titles":[5개],"body":"본문"}`}],.25);return parse(r,['titles','body']);}
async function expand(ctx,plan,current){const r=await callOpenAi([{role:'system',content:'너는 사실을 추가하지 않고 설명의 깊이만 보강하는 편집자다. 확인된 사실의 의미, 구매자가 비교할 기준, 구매 전 확인할 항목을 구체화한다. 동일 문장 반복 금지. 링크 생성 금지. JSON만 답한다.'},{role:'user',content:`[원본]\n${ctx}\n[팩트]\n${JSON.stringify(plan,null,2)}\n[현재글]\n${JSON.stringify(current,null,2)}\n현재 ${bodyLength(current.body)}자다. verifiedFacts 외 제품 사실을 추가하지 말고 1700~2200자 정도로 확장해. 이미지 마커 위치는 본문 사이에 유지해. {"titles":[5개],"body":"본문"}`}],.4);return parse(r,['titles','body']);}
function validateMarkers(body){const lines=normalizeBody(body).split('\n').map(v=>v.trim()).filter(Boolean);let imageCount=0,consecutive=false,lastImage=false;for(const line of lines){const is=/^\[IMAGE:/.test(line);if(is){imageCount++;if(lastImage)consecutive=true;}lastImage=is;}const tail=lines.slice(Math.floor(lines.length*.75));const tailImages=tail.filter(v=>/^\[IMAGE:/.test(v)).length;return{imageCount,consecutive,tailImages};}
function hasBanned(body){return BANNED.some(v=>String(body||'').includes(v));}
async function generateTitlesAndBody(extracted,keywords){const ctx=buildContext(extracted,keywords);console.log('[NAVER BLOG][FACT PLAN] 원본 사실/미확인 주장 분리');const plan=await makePlan(ctx);console.log(`[NAVER BLOG][FACT PLAN] verified=${plan.verifiedFacts.length} unknown=${plan.unknownClaims?.length||0}`);let final=await draft(ctx,plan);final.body=normalizeBody(final.body);console.log(`[NAVER BLOG][DRAFT] length=${bodyLength(final.body)}`);final=await factReview(ctx,plan,final);final.body=normalizeBody(final.body);let len=bodyLength(final.body);console.log(`[NAVER BLOG][FACT REVIEW] length=${len}`);if(len<MIN_GENERATED_BODY_CHARS){console.log(`[NAVER BLOG][SAFE EXPAND] ${len}자 → 사실 추가 없이 설명 보강`);final=await expand(ctx,plan,final);final.body=normalizeBody(final.body);len=bodyLength(final.body);}const markers=validateMarkers(final.body);console.log(`[NAVER BLOG][IMAGE PLAN] count=${markers.imageCount} consecutive=${markers.consecutive} tail=${markers.tailImages}`);if(hasBanned(final.body)){console.log('[NAVER BLOG][STYLE REVIEW] 광고 상투어 감지 → 재검수');final=await factReview(ctx,plan,final);final.body=normalizeBody(final.body);len=bodyLength(final.body);}if(len<1100)throw new QualityHoldError(`사실 기반으로 작성 가능한 본문이 지나치게 짧습니다 (${len}자). 상품 정보 보강이 필요합니다.`);return{titles:(final.titles||[]).slice(0,5),body:final.body,contentPlan:plan};}
module.exports={generateTitlesAndBody,QualityHoldError,normalizeBody};
