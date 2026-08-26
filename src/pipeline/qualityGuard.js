// 최종 본문 품질/사실성 하드 게이트
const SCORE_START = 100;
const KEYWORD_DENSITY_LIMIT = 1 / 120;
const PRODUCTNAME_DENSITY_LIMIT = 1 / 150;
const REPEATED_SENTENCE_START_THRESHOLD = 3;

const FAKE_PURCHASE_PATTERNS=[/제가\s*(?:직접\s*)?샀(?:는데|더니|어요)/,/제가\s*구매(?:했는데|했더니|해봤)/,/직접\s*구입해\s*봤/];
const FAKE_USE_PATTERNS=[/제가\s*(?:직접\s*)?써\s*봤는데/,/제가\s*써본\s*결과/,/실제로\s*사용해\s*본\s*후기/,/써보니까/,/사용해보니/,/며칠\s*(?:써|사용해)\s*보니/];
const FAKE_RELATION_PATTERNS=[/(?:엄마|아빠|아내|와이프|남편|친구|아이|애들|동생|형|누나|언니|오빠)(?:가|는|한테|께서)?.{0,20}(?:써봤|사용해봤|좋다고\s*했|추천해서|사줬는데|물어봤)/];
const UNVERIFIED_EFFECT_PATTERNS=[/효과(?:를|가)?\s*(?:봤|있었|느꼈)/,/(?:피부|몸)\s*(?:가|이)\s*(?:좋아졌|개선됐)/,/확실히\s*(?:좋아졌|나아졌)/];
const EXAGGERATION_PATTERNS=[/국내\s*최초/,/업계\s*최고/,/압도적/,/완벽한/,/무조건/,/100%\s*(?:만족|보장)/,/최고의\s*선택/];
const AI_CLICHE_PHRASES=['무엇보다','이러한 이유로','다양한 매력을 가진','여러분께 소개','지금 바로 만나보세요','다양한 장점을 자랑하는','놓치지 마세요','한번 알아보겠습니다','어떤 매력을 지니고 있는지','가격 대비 성능이 뛰어난'];

// 이 표현들은 일반 상식만으로 특정 제품의 사실처럼 단정하면 안 된다.
// support는 상품명 같은 광고 카피가 아니라 상세 description 쪽에서 근거가 있을 때만 인정한다.
const EVIDENCE_GATES=[
  {label:'저소음/낮은 소음', claim:/저소음|소음이\s*(?:적|낮)|소음\s*걱정\s*없이/, support:/저소음|소음|dB|데시벨/i},
  {label:'고효율/배터리 절약', claim:/효율(?:성)?이\s*(?:높|좋)|에너지\s*효율|배터리\s*(?:소모|사용량)을?\s*줄/, support:/효율|에너지|배터리|전력/i},
  {label:'강한 흡입 성능', claim:/강력한?\s*흡입|흡입력이\s*(?:강|뛰어나|우수)|청소\s*성능이\s*(?:강|뛰어나|우수)/, support:/\d[\d,.]*\s*(?:pa|kpa|aw)|흡입력\s*[:：]?\s*\d/i},
  {label:'경량/가벼운 무게', claim:/경량|가벼운\s*무게|무게가\s*(?:가볍|적게)|이동이\s*(?:쉽|편)/, support:/\d+(?:\.\d+)?\s*(?:kg|g)\b|무게\s*[:：]/i},
  {label:'직관적 버튼/조작', claim:/직관적(?:인)?\s*(?:조작|버튼)|버튼\s*배치|조작이\s*(?:간편|쉽)/, support:/버튼|조작|컨트롤|디스플레이/i},
  {label:'보관/크기/디자인', claim:/현대적(?:인)?\s*디자인|보관이\s*(?:용이|쉽)|작은\s*공간.*보관|크기도\s*적당|인테리어.*조화/, support:/디자인|크기|사이즈|폭|높이|보관|스탠딩/i},
  {label:'액세서리/브러시 구성', claim:/다양한\s*액세서리|브러시(?:가|를)?\s*(?:포함|제공)|액세서리(?:가|를)?\s*(?:포함|제공)|구성품이\s*다양/, support:/브러시|액세서리|구성품|노즐|헤드|키트/i},
  {label:'사용자 후기/만족', claim:/실제\s*사용자|사용자(?:들)?(?:은|이).*만족|만족도(?:가)?\s*높|후기(?:가)?\s*많|긍정적(?:인)?\s*(?:평가|반응)|소비자(?:들)?에게.*(?:평가|반응)/, support:/후기|리뷰|평점|사용자\s*평가/i},
  {label:'다양한 바닥 성능', claim:/다양한\s*바닥(?:재)?에서.*(?:성능|사용)|여러\s*바닥(?:재)?.*(?:우수|적합)/, support:/바닥|카펫|마루|타일|러그/i},
  {label:'내구성/수명/유지비', claim:/내구성이\s*(?:뛰어나|좋)|오랜\s*사용|수명이\s*(?:길|긴)|유지보수\s*비용.*(?:적|낮)/, support:/내구|수명|보증|내구성|유지보수/i},
  {label:'알레르기/건강 편익', claim:/알레르기.*(?:유용|도움|좋)|먼지에\s*민감한.*(?:유용|추천)/, support:/알레르기|헤파|HEPA|미세먼지|필터.*등급/i},
  {label:'시장 비교/희소성', claim:/시장.*찾기\s*힘|비슷한\s*가격대.*(?:드물|없)|다른\s*제품.*비교.*(?:우수|뛰어나)|가격\s*대비\s*성능.*(?:뛰어나|우수)|가성비가\s*(?:뛰어나|우수)/, support:/비교|경쟁|동급|가성비|가격대.*비교/i},
];

function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function stripNonProse(text){return String(text||'')
 .replace(/https?:\/\/[^\s)\]}]+/gi,' ')
 .replace(/\[IMAGE:[^\]]*\]/gi,' ')
 .replace(/\[SPEC_CARD:[^\]]*\]/gi,' ')
 .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
 .replace(/\[[^\]]+\]\(https?:\/\/[^)]*\)/g,' ')
 .replace(/\s+/g,' ').trim();}
function sourceEvidenceText(extracted){return clean([extracted?.description,extracted?.category,extracted?.price,extracted?.travel?JSON.stringify(extracted.travel):''].filter(Boolean).join(' '));}
function splitSentences(text){return clean(text).split(/(?<=[.!?다])\s+|\n+/).map(s=>s.trim()).filter(Boolean);}
function countMatches(text,patterns){const hits=[];for(const p of patterns){const f=text.match(p);if(f)hits.push(f[0]);}return hits;}
function findUnsupportedEvidenceClaims(body,extracted){const prose=stripNonProse(body);const source=sourceEvidenceText(extracted);const hits=[];for(const gate of EVIDENCE_GATES){const m=prose.match(gate.claim);if(m&&!gate.support.test(source))hits.push(`${gate.label}: ${m[0]}`);}return hits;}

function extractNumbersFromKnownData(extracted){const known=new Set();const push=s=>{const nums=String(s||'').match(/\d+/g);if(nums)nums.forEach(n=>known.add(n));};push(extracted.price);push(extracted.productName);push(extracted.description);push(extracted.category);if(extracted.travel){push(extracted.travel.duration);push(extracted.travel.departureDate);push(extracted.travel.returnDate);}return known;}
const NUMERIC_UNITS=['mAh','GB','TB','mg','ml','kg','cm','mm','개월','단계','시간','%','원','분','일','년','g','L','W','V','개','매','장','배','회'];
const UNIT_ALTERNATION=NUMERIC_UNITS.map(u=>u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
const NUMBER_WITH_UNIT_RE=new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${UNIT_ALTERNATION})(?![a-zA-Z0-9가-힣])`,'g');
function extractNumberUnitPairsFromKnownData(extracted){const known=new Set();const push=s=>{const matches=String(s||'').match(NUMBER_WITH_UNIT_RE);if(matches)matches.forEach(m=>known.add(m.replace(/\s+/g,'')));};push(extracted.price);push(extracted.productName);push(extracted.description);push(extracted.category);if(extracted.travel){push(extracted.travel.duration);push(extracted.travel.departureDate);push(extracted.travel.returnDate);}return known;}
function findUnverifiedNumberUnitPairs(body,extracted){const prose=stripNonProse(body),known=extractNumberUnitPairsFromKnownData(extracted),matches=prose.match(NUMBER_WITH_UNIT_RE)||[];return[...new Set(matches.map(m=>m.replace(/\s+/g,'')))].filter(m=>!known.has(m));}
function findUnverifiedNumbers(body,extracted){const prose=stripNonProse(body),known=extractNumbersFromKnownData(extracted),nums=prose.match(/\d+/g)||[];return[...new Set(nums)].filter(n=>n.length>=3&&!known.has(n));}
function countKeywordDensity(body,keyword){if(!keyword)return 0;const prose=stripNonProse(body),re=new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');return(prose.match(re)||[]).length/Math.max(1,prose.length);}
function findRepeatedSentences(sentences){const seen=new Map(),dups=[];for(const s of sentences){const k=s.toLowerCase();seen.set(k,(seen.get(k)||0)+1);}for(const[k,c]of seen)if(c>1&&k.length>5)dups.push({sentence:k,count:c});return dups;}
function findRepeatedSentenceStarts(sentences){const starts=new Map();for(const s of sentences){const k=s.slice(0,6);if(k)starts.set(k,(starts.get(k)||0)+1);}return[...starts.entries()].filter(([,c])=>c>=REPEATED_SENTENCE_START_THRESHOLD);}

function checkQuality({titles,body,extracted,keywords,affiliateUrl,disclosureText}){
 let score=SCORE_START;const issues=[],warnings=[];const proseBody=stripNonProse(body);const allText=[...(titles||[]),proseBody].join('\n');
 const fakePurchase=countMatches(allText,FAKE_PURCHASE_PATTERNS),fakeUse=countMatches(allText,FAKE_USE_PATTERNS),fakeRelation=countMatches(allText,FAKE_RELATION_PATTERNS);
 if(fakePurchase.length){issues.push(`허위 구매 경험: ${fakePurchase.join(', ')}`);score-=40;}if(fakeUse.length){issues.push(`허위 사용 경험: ${fakeUse.join(', ')}`);score-=40;}if(fakeRelation.length){issues.push(`제공되지 않은 가족/지인 경험: ${fakeRelation.join(', ')}`);score-=40;}
 const unsupportedClaims=findUnsupportedEvidenceClaims(proseBody,extracted);if(unsupportedClaims.length){issues.push(`원본 근거 없는 제품 주장: ${unsupportedClaims.join(' | ')}`);score-=30;}
 const unverifiedEffect=countMatches(proseBody,UNVERIFIED_EFFECT_PATTERNS);if(unverifiedEffect.length){warnings.push(`검증되지 않은 효능 표현: ${unverifiedEffect.join(', ')}`);score-=10;}
 const allUnverifiedNumbers=[...new Set([...findUnverifiedNumbers(body,extracted),...findUnverifiedNumberUnitPairs(body,extracted)])];if(allUnverifiedNumbers.length){issues.push(`상품정보에 없는 숫자/용량/인증 추정치: ${allUnverifiedNumbers.join(', ')}`);score-=20;}
 const exaggeration=countMatches(allText,EXAGGERATION_PATTERNS);if(exaggeration.length){warnings.push(`과장 광고 표현: ${exaggeration.join(', ')}`);score-=10;}
 const kwDensity=countKeywordDensity(body,keywords?.mainKeyword);if(kwDensity>KEYWORD_DENSITY_LIMIT){warnings.push(`메인 키워드 밀도 과다 (${(kwDensity*100).toFixed(2)}%)`);score-=10;}
 const nameDensity=countKeywordDensity(body,extracted?.productName);if(nameDensity>PRODUCTNAME_DENSITY_LIMIT){warnings.push(`상품명 밀도 과다 (${(nameDensity*100).toFixed(2)}%)`);score-=10;}
 const sentences=splitSentences(proseBody),dups=findRepeatedSentences(sentences);if(dups.length){warnings.push(`동일 문장 반복 ${dups.length}건`);score-=5*dups.length;}const starts=findRepeatedSentenceStarts(sentences);if(starts.length){warnings.push(`동일 문장 시작 과다 반복: ${starts.map(([k,c])=>`"${k}"x${c}`).join(', ')}`);score-=5*starts.length;}
 const cliches=AI_CLICHE_PHRASES.filter(p=>allText.includes(p));if(cliches.length){warnings.push(`AI 상투 문구: ${cliches.join(', ')}`);score-=5*cliches.length;}
 if(!affiliateUrl||!body.includes(affiliateUrl)){issues.push('본문에 affiliateUrl이 없습니다');score-=20;}if(!disclosureText||!body.includes(disclosureText)){issues.push('본문에 제휴 고지 문구가 없습니다');score-=20;}
 const bodyLen=proseBody.replace(/\s/g,'').length;if(bodyLen<1000){issues.push(`본문 길이 부족 (${bodyLen}자)`);score-=20;}else if(bodyLen<1500){warnings.push(`본문이 목표 대비 짧음 (${bodyLen}자)`);score-=5;}
 const coreToken=clean(extracted?.productName).split(/\s+/).find(t=>t.length>=2);if(coreToken&&!proseBody.includes(coreToken)){issues.push(`본문에 상품명 핵심 토큰("${coreToken}")이 없음`);score-=30;}
 score=Math.max(0,Math.min(100,score));return{passed:issues.length===0,score,issues,warnings};
}
module.exports={checkQuality,findUnverifiedNumberUnitPairs,findUnverifiedNumbers,findUnsupportedEvidenceClaims,NUMBER_WITH_UNIT_RE,stripNonProse};
