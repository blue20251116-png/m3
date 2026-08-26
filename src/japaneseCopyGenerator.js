const TITLE_PATTERNS = [
  ({ subject }) => `${subject}が美しすぎる`,
  ({ subject }) => `一度は見たい${subject}`,
  ({ subject }) => `ずっと見ていたい${subject}`,
  ({ subject }) => `${subject}に行きたくなる瞬間`,
  ({ subject }) => `この${subject}、忘れられない`
];

const MOOD_LINES = {
  dreamy: ['ただ、この景色を見ていたい', '時間が止まればいいのに', 'こんな夜を忘れたくない'],
  nostalgic: ['少しだけ昔を思い出す', 'なぜか懐かしくなる景色', 'あの頃に戻れそうな気がする'],
  freedom: ['遠くに行きたい夜がある', '何も考えずに旅に出たい', 'ここまで来れば全部忘れられそう'],
  calm: ['何もしない時間も悪くない', '静かな景色に救われる', '今日は少しゆっくりしよう'],
  romantic: ['大切な人と見たい景色', 'こんな夜なら歩き続けたい', '言葉はいらない気がする'],
  energetic: ['この瞬間だけは止まりたくない', '街の光を見ると少し元気になる', 'まだ帰りたくない夜']
};

function normalizeSubject(input = '') {
  const raw = input.trim();
  if (!raw) return '景色';
  const map = {
    'new york': 'ニューヨークの夜', tokyo: '東京の夜', paris: 'パリの街',
    switzerland: 'スイスの絶景', ocean: '海', sunset: '夕焼け',
    aurora: 'オーロラ', snow: '雪景色', rain: '雨の夜',
    'night drive': '夜のドライブ', 'airplane window': '空から見る景色',
    'train window': '列車から見る景色'
  };
  return map[raw.toLowerCase()] || raw;
}

function hash(text) {
  let n = 0;
  for (const c of text) n = ((n << 5) - n + c.charCodeAt(0)) | 0;
  return Math.abs(n);
}

export function generateJapaneseCopy({ subject, mood = 'dreamy', duration = 20 } = {}) {
  const normalized = normalizeSubject(subject);
  const seed = hash(`${normalized}:${mood}:${Math.floor(Date.now() / 60000)}`);
  const title = TITLE_PATTERNS[seed % TITLE_PATTERNS.length]({ subject: normalized });
  const pool = MOOD_LINES[mood] || MOOD_LINES.dreamy;
  const count = Math.max(3, Math.min(5, Math.round(duration / 5)));
  const captions = [];
  for (let i = 0; i < count; i += 1) captions.push(pool[(seed + i) % pool.length]);
  return { title, captions: [...new Set(captions)], mood, subject: normalized };
}

export function suggestSearchTerms(subject = '') {
  const base = subject.trim() || 'beautiful scenery';
  return [
    base,
    `${base} cinematic`,
    `${base} vertical`,
    `${base} aesthetic`,
    `${base} travel`,
    `${base} night`
  ];
}
