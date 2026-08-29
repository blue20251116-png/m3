import { getTargetProfile } from './targetProfiles.js';

function normalizeSubject(input = '', target = 'ja') {
  const raw = input.trim();
  if (!raw) return target === 'ja' ? '景色' : target === 'ar' ? 'هذا المشهد' : target === 'es' ? 'este lugar' : 'this view';
  const maps = {
    ja: {'new york':'ニューヨークの夜',tokyo:'東京の夜',paris:'パリの街',switzerland:'スイスの絶景',ocean:'海',sunset:'夕焼け',aurora:'オーロラ',snow:'雪景色',rain:'雨の夜','night drive':'夜のドライブ','airplane window':'空から見る景色','train window':'列車から見る景色'},
    en: {'new york':'New York at night',tokyo:'Tokyo at night',paris:'Paris',switzerland:'Switzerland',ocean:'the ocean',sunset:'this sunset',aurora:'the northern lights',snow:'this winter view',rain:'a rainy night','night drive':'a night drive','airplane window':'the view from above','train window':'the view from the train'},
    ar: {'new york':'نيويورك ليلاً',tokyo:'طوكيو ليلاً',paris:'باريس',switzerland:'سويسرا',ocean:'البحر',sunset:'غروب الشمس',aurora:'الشفق القطبي',snow:'مشهد الشتاء',rain:'ليلة ممطرة','night drive':'قيادة ليلية','airplane window':'المنظر من السماء','train window':'المنظر من القطار'},
    es: {'new york':'Nueva York de noche',tokyo:'Tokio de noche',paris:'París',switzerland:'Suiza',ocean:'el océano',sunset:'este atardecer',aurora:'la aurora boreal',snow:'este paisaje de invierno',rain:'una noche lluviosa','night drive':'un paseo nocturno en coche','airplane window':'la vista desde el cielo','train window':'la vista desde el tren'}
  };
  return maps[target]?.[raw.toLowerCase()] || raw;
}

function hash(text) { let n=0; for (const c of text) n=((n<<5)-n+c.charCodeAt(0))|0; return Math.abs(n); }

export function generateTargetCopy({ subject, mood='dreamy', duration=20, target='ja' }={}) {
  const profile=getTargetProfile(target);
  const normalized=normalizeSubject(subject, profile.id);
  const seed=hash(`${profile.id}:${normalized}:${mood}:${Math.floor(Date.now()/60000)}`);
  const pattern=profile.titlePatterns[seed%profile.titlePatterns.length];
  const title=pattern.replace('{subject}', normalized);
  const pool=profile.moodLines[mood] || profile.moodLines.dreamy;
  const count=Math.max(3,Math.min(5,Math.round(duration/5)));
  const captions=[];
  for(let i=0;i<count;i+=1) captions.push(pool[(seed+i)%pool.length]);
  return {title,captions:[...new Set(captions)],mood,subject:normalized,target:profile.id,language:profile.language,direction:profile.direction,fontFamily:profile.fontFamily,musicMarket:profile.musicMarket};
}

export const generateJapaneseCopy = (args={}) => generateTargetCopy({...args,target:'ja'});

const STOCK_SEARCH_TRANSLATIONS = [
  ['엠파이어 스테이트 빌딩','Empire State Building'],['엠파이어스테이트빌딩','Empire State Building'],
  ['타임스 스퀘어','Times Square'],['타임스퀘어','Times Square'],['센트럴 파크','Central Park'],['센트럴파크','Central Park'],
  ['브루클린 브리지','Brooklyn Bridge'],['브루클린브리지','Brooklyn Bridge'],['자유의 여신상','Statue of Liberty'],
  ['뉴욕','New York City'],['맨해튼','Manhattan'],['서울','Seoul'],['부산','Busan'],['제주','Jeju'],['도쿄','Tokyo'],['오사카','Osaka'],
  ['교토','Kyoto'],['파리','Paris'],['런던','London'],['로마','Rome'],['베니스','Venice'],['두바이','Dubai'],['스위스','Switzerland'],
  ['라스베이거스','Las Vegas'],['로스앤젤레스','Los Angeles'],['샌프란시스코','San Francisco'],['시드니','Sydney'],['싱가포르','Singapore'],
  ['홍콩','Hong Kong'],['방콕','Bangkok'],['하와이','Hawaii'],['몰디브','Maldives'],
  ['야경','night skyline'],['밤거리','night street'],['밤','night'],['스카이라인','skyline'],['도시 전경','city skyline'],['도시','city'],
  ['고층 빌딩','skyscrapers'],['고층빌딩','skyscrapers'],['빌딩','buildings'],['랜드마크','landmark'],['거리','street'],
  ['드론','drone'],['항공','aerial'],['공중','aerial'],['시네마틱','cinematic'],['감성','cinematic aesthetic'],['영화같은','cinematic'],
  ['타임랩스','timelapse'],['파노라마','panorama'],['이동샷','tracking shot'],['움직이는','moving camera'],['쭉 보여주는','moving camera'],
  ['바다','ocean'],['해변','beach'],['해안','coast'],['산','mountain'],['폭포','waterfall'],['호수','lake'],['숲','forest'],['사막','desert'],
  ['노을','sunset'],['일몰','sunset'],['일출','sunrise'],['오로라','aurora'],['눈','snow'],['비','rain'],['구름','clouds'],
  ['드라이브','driving'],['자동차','car'],['기차','train'],['비행기','airplane'],['호텔','hotel'],['카페','cafe'],['레스토랑','restaurant'],
  ['여행','travel'],['풍경','scenery'],['전경','view'],['뷰','view'],['4K','4K'],['4k','4K']
];

function toEnglishStockSearch(subject='') {
  const raw=String(subject||'').trim();
  if (!raw) return 'beautiful cinematic scenery';
  if (!/[가-힣]/.test(raw)) return raw;

  let translated=` ${raw} `;
  for (const [ko,en] of STOCK_SEARCH_TRANSLATIONS) translated=translated.split(ko).join(` ${en} `);

  translated=translated
    .replace(/[가-힣]+/g,' ')
    .replace(/[^A-Za-z0-9\s'-]/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  return translated || 'beautiful cinematic travel scenery';
}

export function suggestSearchTerms(subject='') {
  const base=toEnglishStockSearch(subject);
  const lower=base.toLowerCase();
  const isCity=/city|new york|manhattan|seoul|tokyo|osaka|paris|london|dubai|hong kong|singapore|skyline|skyscraper|building|landmark|times square/.test(lower);
  const isNature=/ocean|beach|coast|mountain|waterfall|lake|forest|desert|sunset|sunrise|aurora|snow|scenery/.test(lower);
  const isDrive=/driv|car|road|street|train|airplane/.test(lower);

  const terms=[];
  const add=(term)=>{const clean=String(term).replace(/\s+/g,' ').trim();if(clean&&!terms.includes(clean))terms.push(clean);};

  add(base);
  if (isCity) {
    add(`${base} aerial drone cinematic`);
    add(`${base} skyline night 4K`);
    add(`${base} cinematic moving camera`);
    add(`${base} aerial city lights`);
  } else if (isNature) {
    add(`${base} cinematic aerial 4K`);
    add(`${base} drone landscape`);
    add(`${base} cinematic moving shot`);
    add(`${base} travel film`);
  } else if (isDrive) {
    add(`${base} cinematic tracking shot`);
    add(`${base} POV moving camera`);
    add(`${base} travel cinematic 4K`);
    add(`${base} night cinematic`);
  } else {
    add(`${base} cinematic`);
    add(`${base} cinematic moving camera`);
    add(`${base} aesthetic 4K`);
    add(`${base} travel film`);
  }

  return terms.slice(0,5);
}
