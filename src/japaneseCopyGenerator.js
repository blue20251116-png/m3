import { getTargetProfile } from './targetProfiles.js';

function normalizeSubject(input = '', target = 'ja') {
  const raw = input.trim();
  if (!raw) return target === 'ja' ? '景色' : target === 'ar' ? 'هذا المشهد' : 'this view';
  const maps = {
    ja: {'new york':'ニューヨークの夜',tokyo:'東京の夜',paris:'パリの街',switzerland:'スイスの絶景',ocean:'海',sunset:'夕焼け',aurora:'オーロラ',snow:'雪景色',rain:'雨の夜','night drive':'夜のドライブ','airplane window':'空から見る景色','train window':'列車から見る景色'},
    en: {'new york':'New York at night',tokyo:'Tokyo at night',paris:'Paris',switzerland:'Switzerland',ocean:'the ocean',sunset:'this sunset',aurora:'the northern lights',snow:'this winter view',rain:'a rainy night','night drive':'a night drive','airplane window':'the view from above','train window':'the view from the train'},
    ar: {'new york':'نيويورك ليلاً',tokyo:'طوكيو ليلاً',paris:'باريس',switzerland:'سويسرا',ocean:'البحر',sunset:'غروب الشمس',aurora:'الشفق القطبي',snow:'مشهد الشتاء',rain:'ليلة ممطرة','night drive':'قيادة ليلية','airplane window':'المنظر من السماء','train window':'المنظر من القطار'}
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

export function suggestSearchTerms(subject='') {
  const base=subject.trim()||'beautiful scenery';
  return [base,`${base} cinematic`,`${base} vertical`,`${base} aesthetic`,`${base} travel`,`${base} night`];
}
