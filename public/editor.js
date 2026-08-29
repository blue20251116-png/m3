/*
 * M3 Global Shorts — consolidated editor, single templateState Source of Truth.
 *
 * TS below is sent to /api/render, /api/export-uploaded, /api/thumbnail
 * AS-IS under the `templateState` key — there is no intermediate
 * "stylePayload()" that renames/recomputes fields. src/shortsRenderer.js's
 * normTemplateState() only clamps ranges; it must never invent a coordinate
 * relationship this file didn't already send (e.g. it never computes
 * "video.y = header.height"). If you add a field here, add the matching
 * clamp in normTemplateState() with the SAME field name and SAME meaning.
 *
 * FONTS below must mirror TITLE_FONTS in src/shortsRenderer.js exactly
 * (bold / scaleXPercent / spacingPx) so wide/condensed/serifWide stretch
 * identically in the CSS preview and in the final ASS render.
 */
(() => {
const $ = id => document.getElementById(id);
const CANVAS = { width: 1080, height: 1920 };

const FONTS = [
  ['heavy', '고딕 Heavy', '"Noto Sans CJK JP",sans-serif', true, 100, 0],
  ['clean', '고딕 Clean', '"Noto Sans CJK JP",sans-serif', false, 100, 0],
  ['serif', '명조 Bold', '"Noto Serif CJK JP",serif', true, 100, 0],
  ['wide', '고딕 Wide', '"Noto Sans CJK JP",sans-serif', true, 108, 0],
  ['condensed', '고딕 Condensed', '"Noto Sans CJK JP",sans-serif', true, 88, -1],
  ['mono', '모노 고딕', '"Noto Sans Mono CJK JP",monospace', true, 100, 0],
  ['serifWide', '명조 Wide', '"Noto Serif CJK JP",serif', true, 106, 1],
  ['mplusBlack', 'M+ Black', '"M PLUS 1",sans-serif', true, 100, 0],
  ['mplusBold', 'M+ Bold', '"M PLUS 1",sans-serif', true, 100, 0],
  ['mplusRegular', 'M+ Regular', '"M PLUS 1",sans-serif', false, 100, 0],
  ['vlGothic', 'VL 고딕', '"VL Gothic",sans-serif', false, 100, 0],
  ['vlPGothic', 'VL P고딕', '"VL PGothic",sans-serif', false, 100, 0],
  ['bizGothic', 'BIZ UD 고딕', '"BIZ UD Gothic",sans-serif', true, 100, 0],
  ['bizPGothic', 'BIZ UDP 고딕', '"BIZ UDPGothic",sans-serif', true, 100, 0],
  ['bizMincho', 'BIZ UD 명조', '"BIZ UDMincho",serif', false, 100, 0],
  ['ipaGothic', 'IPA 고딕', '"IPAGothic",sans-serif', false, 100, 0],
  ['ipaPGothic', 'IPA P고딕', '"IPAPGothic",sans-serif', false, 100, 0],
  ['ipaMincho', 'IPA 명조', '"IPAMincho",serif', false, 100, 0],
];
const FONT_MAP = Object.fromEntries(FONTS.map(f => [f[0], { family: f[2], bold: f[3], scaleXPercent: f[4], spacingPx: f[5] }]));
async function loadPreviewFonts(){for(const [key] of FONTS){try{const family=`M3_${key}`;const face=new FontFace(family,`url(/api/font/${encodeURIComponent(key)})`);await face.load();document.fonts.add(face);FONT_MAP[key].family=family}catch(e){console.warn('[FONT PREVIEW]',key,e.message)}}applyPreview()}
function fontMeta(key) { return FONT_MAP[key] || FONT_MAP.heavy; }

let videos = [], selected = new Set(), music = null, uploadedClip = null, analysis = null;

// ---- templateState (canonical shape shared verbatim with the server) ----
const TS = {
  header: {
    enabled: true, backgroundColor: '#FFFFFF', topGap: 60, height: 410,
    profileX: 50, profileY: 95, profileSize: 86, profilePath: '', profileUrl: '',
    nameText: '此処ではない何処か', nameX: 155, nameY: 105, nameFontSize: 38, nameColor: '#080808',
    handleText: '@kokodewanai_dokoka', handleX: 155, handleY: 160, handleFontSize: 27, handleColor: '#606060',
  },
  title: {
    text: '', x: 70, y: 210, width: 940, fontKey: 'heavy', fontSize: 72, align: 'left',
    color: '#080808', strokeWidth: 0, strokeColor: '#000000', shadowSize: 0, shadowColor: '#000000', runs: [],
  },
  video: { x: 0, y: 410, width: 1080, height: 1290 },
  bottomSpace: { x: 0, y: 1700, width: 1080, height: 220, backgroundColor: '#FFFFFF' },
  caption: {
    x: 70, y: 1650, width: 940, fontKey: 'heavy', fontSize: 54, align: 'center',
    fontColor: '#FFFFFF', outlineColor: '#000000', outlineWidth: 5, shadowColor: '#000000', shadowSize: 4,
  },
  captions: [{ text: '', start: 0, end: 2 }], // caption timing list (separate from the caption *style* box above)
};

function getPath(obj, p) { return p.reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, p, v) { let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('m3TemplateStateV3') || 'null');
    if (!s) return;
    for (const k of ['header', 'title', 'video', 'bottomSpace', 'caption']) if (s[k]) Object.assign(TS[k], s[k]);
    if (Array.isArray(s.captions)) TS.captions = s.captions;
  } catch {}
}
function saveState() { try { localStorage.setItem('m3TemplateStateV3', JSON.stringify(TS)); } catch {} }

// ---- title run-based highlight coloring ----
function subtractRun(runs, a, b) { const out = []; for (const r of runs) { if (r.end <= a || r.start >= b) { out.push(r); continue; } if (r.start < a) out.push({ ...r, end: a }); if (r.end > b) out.push({ ...r, start: b }); } return out; }
function colorAt(i, base) { for (let n = TS.title.runs.length - 1; n >= 0; n--) { const r = TS.title.runs[n]; if (i >= r.start && i < r.end) return r.color; } return base; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function titleHtml() {
  const src = TS.title.text, base = TS.title.color;
  let html = '', i = 0;
  while (i < src.length) {
    if (src[i] === '\n') { html += '<br>'; i++; continue; }
    const c = colorAt(i, base);
    let j = i + 1;
    while (j < src.length && src[j] !== '\n' && colorAt(j, base) === c) j++;
    html += `<span style="color:${c}">${esc(src.slice(i, j))}</span>`;
    i = j;
  }
  return html || '<span style="opacity:.4">タイトル</span>';
}

// ---- duration ----
function totalStockVideo() { return [...selected].map(i => videos[i]).filter(Boolean).reduce((s, v) => s + (Number(v.duration) > 0 ? Number(v.duration) : 5), 0); }
function duration() {
  if (uploadedClip?.duration) return uploadedClip.duration;
  const st = totalStockVideo();
  if (st) return st;
  const pv = $('previewVideo');
  if (pv?.duration) return pv.duration;
  return Math.max(0.5, +$('musicLength').value || 20);
}

// ---- preview: title/caption anchor formulas mirror titleAnchor()/captionXExpr() in src/shortsRenderer.js ----
function titleAnchorCss(t) {
  // align='left' -> box left edge at x; 'center' -> box centered on x+width/2; 'right' -> box right edge at x+width.
  // CSS: place a width:title.width box at left:x, and let text-align do the rest — same effective anchor as ASS an7/8/9+\pos.
  return { left: t.x, width: t.width };
}
function applyPreview() {
  const outer = $('previewOuter'), canvas = $('previewCanvas');
  const scale = (outer.getBoundingClientRect().width || 270) / CANVAS.width;
  canvas.style.transform = `scale(${scale})`;

  const bg = $('canvasBg'); bg.style.left = '0px'; bg.style.top = '0px'; bg.style.width = CANVAS.width + 'px'; bg.style.height = CANVAS.height + 'px'; bg.style.background = TS.header.backgroundColor;
  const bs = $('canvasBottomBar'); bs.style.left = TS.bottomSpace.x + 'px'; bs.style.top = TS.bottomSpace.y + 'px'; bs.style.width = TS.bottomSpace.width + 'px'; bs.style.height = TS.bottomSpace.height + 'px'; bs.style.background = TS.bottomSpace.backgroundColor;

  const v = $('previewVideo'); v.style.left = TS.video.x + 'px'; v.style.top = TS.video.y + 'px'; v.style.width = TS.video.width + 'px'; v.style.height = TS.video.height + 'px';

  const av = $('previewAvatar'), fb = $('previewAvatarFallback');
  const showHeader = !!TS.header.enabled;
  [av, fb, $('previewChannelName'), $('previewHandle')].forEach(el => el.style.display = showHeader ? '' : 'none');
  if (showHeader) {
    const size = TS.header.profileSize;
    [av, fb].forEach(el => { el.style.left = TS.header.profileX + 'px'; el.style.top = TS.header.profileY + 'px'; el.style.width = size + 'px'; el.style.height = size + 'px'; });
    if (TS.header.profileUrl) { av.src = TS.header.profileUrl; av.style.display = 'block'; fb.style.display = 'none'; } else { av.style.display = 'none'; fb.style.display = 'block'; }
    const nm = $('previewChannelName'), hd = $('previewHandle');
    nm.style.left = TS.header.nameX + 'px'; nm.style.top = TS.header.nameY + 'px'; nm.style.fontSize = TS.header.nameFontSize + 'px'; nm.style.color = TS.header.nameColor; nm.style.fontWeight = '700'; nm.textContent = TS.header.nameText;
    hd.style.left = TS.header.handleX + 'px'; hd.style.top = TS.header.handleY + 'px'; hd.style.fontSize = TS.header.handleFontSize + 'px'; hd.style.color = TS.header.handleColor; hd.style.fontWeight = '400'; hd.textContent = TS.header.handleText;
  }

  const t = $('previewTitle'), tf = fontMeta(TS.title.fontKey), tAnchor = titleAnchorCss(TS.title);
  t.style.left = tAnchor.left + 'px'; t.style.width = tAnchor.width + 'px'; t.style.top = TS.title.y + 'px';
  t.style.fontSize = TS.title.fontSize + 'px'; t.style.textAlign = TS.title.align; t.style.lineHeight = '1.2';
  t.style.fontFamily = tf.family; t.style.fontWeight = tf.bold ? '900' : '400';
  t.style.letterSpacing = (tf.spacingPx || 0) + 'px';
  t.style.transformOrigin = TS.title.align === 'right' ? 'right top' : TS.title.align === 'center' ? 'center top' : 'left top';
  t.style.transform = tf.scaleXPercent !== 100 ? `scaleX(${tf.scaleXPercent / 100})` : 'none';
  t.style.color = TS.title.color;
  t.style.webkitTextStroke = TS.title.strokeWidth ? `${TS.title.strokeWidth}px ${TS.title.strokeColor}` : '0px transparent';
  t.style.textShadow = TS.title.shadowSize ? `${TS.title.shadowSize}px ${TS.title.shadowSize}px ${TS.title.shadowSize * 1.4}px ${TS.title.shadowColor}` : 'none';
  t.innerHTML = titleHtml();

  const c = $('previewCaption'), cf = fontMeta(TS.caption.fontKey);
  c.style.left = TS.caption.x + 'px'; c.style.width = TS.caption.width + 'px'; c.style.top = TS.caption.y + 'px';
  c.style.fontSize = TS.caption.fontSize + 'px'; c.style.textAlign = TS.caption.align;
  c.style.fontFamily = cf.family; c.style.fontWeight = cf.bold ? '900' : '400';
  c.style.color = TS.caption.fontColor;
  c.style.webkitTextStroke = TS.caption.outlineWidth ? `${TS.caption.outlineWidth}px ${TS.caption.outlineColor}` : '0px transparent';
  c.style.textShadow = TS.caption.shadowSize ? `${TS.caption.shadowSize}px ${TS.caption.shadowSize}px ${TS.caption.shadowSize * 1.4}px ${TS.caption.shadowColor}` : 'none';
  const time = $('previewVideo')?.currentTime || 0;
  const active = TS.captions.find(x => time >= x.start && time <= x.end);
  c.textContent = active?.text || '';

  saveState();
}

// ---- what gets sent to the server: TS itself, no transformation ----
function captionsPayload() { return TS.captions.filter(x => String(x.text || '').trim() && x.end > x.start).map(x => ({ text: x.text, start: +x.start, end: +x.end })); }
function templateStatePayload() { return { canvas: { ...CANVAS }, header: { ...TS.header }, title: { ...TS.title }, video: { ...TS.video }, bottomSpace: { ...TS.bottomSpace }, caption: { ...TS.caption } }; }

// ---- schema-driven numeric/color/select field builder ----
function field(path, label, type, opts = {}) {
  const wrap = document.createElement('div'); wrap.className = 'field';
  const lab = document.createElement('label'); lab.textContent = label; wrap.appendChild(lab);
  let input;
  if (type === 'select') {
    input = document.createElement('select');
    (opts.options || []).forEach(([v, n]) => { const o = document.createElement('option'); o.value = v; o.textContent = n; input.appendChild(o); });
  } else {
    input = document.createElement('input'); input.type = type;
    if (type === 'number') { if (opts.step != null) input.step = opts.step; }
  }
  input.value = getPath(TS, path);
  input.oninput = () => { let v = input.value; if (type === 'number') v = v === '' ? 0 : +v; setPath(TS, path, v); applyPreview(); };
  wrap.appendChild(input);
  return wrap;
}
function buildFields(containerId, schema) {
  const root = $(containerId); root.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'fieldGrid'; root.appendChild(grid);
  schema.forEach(([path, label, type, opts]) => grid.appendChild(field(path, label, type, opts)));
}
const FONT_OPTIONS = FONTS.map(([v, n]) => [v, n]);
const ALIGN_OPTIONS = [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']];

function buildAllFields() {
  buildFields('titleFields', [
    [['title', 'x'], 'x', 'number'], [['title', 'y'], 'y', 'number'], [['title', 'width'], 'width', 'number'], [['title', 'align'], '정렬', 'select', { options: ALIGN_OPTIONS }],
    [['title', 'fontKey'], '폰트', 'select', { options: FONT_OPTIONS }], [['title', 'fontSize'], '크기', 'number'], [['title', 'color'], '색', 'color'], [['title', 'strokeColor'], '외곽선색', 'color'],
    [['title', 'strokeWidth'], '외곽선두께', 'number'], [['title', 'shadowColor'], '그림자색', 'color'], [['title', 'shadowSize'], '그림자강도', 'number'],
  ]);
  buildFields('captionFields', [
    [['caption', 'x'], 'x', 'number'], [['caption', 'y'], 'y (텍스트 상단)', 'number'], [['caption', 'width'], 'width', 'number'], [['caption', 'align'], '정렬', 'select', { options: ALIGN_OPTIONS }],
    [['caption', 'fontKey'], '폰트', 'select', { options: FONT_OPTIONS }], [['caption', 'fontSize'], '크기', 'number'], [['caption', 'fontColor'], '색', 'color'], [['caption', 'outlineColor'], '외곽선색', 'color'],
    [['caption', 'outlineWidth'], '외곽선두께', 'number'], [['caption', 'shadowColor'], '그림자색', 'color'], [['caption', 'shadowSize'], '그림자강도', 'number'],
  ]);
  buildFields('headerFields', [
    [['header', 'backgroundColor'], '상단 배경색', 'color'], [['header', 'height'], '상단 높이', 'number'],
    [['header', 'profileX'], '프로필 x', 'number'], [['header', 'profileY'], '프로필 y', 'number'], [['header', 'profileSize'], '프로필 크기', 'number'],
    [['header', 'nameText'], '계정명', 'text'], [['header', 'nameX'], '계정명 x', 'number'], [['header', 'nameY'], '계정명 y', 'number'], [['header', 'nameFontSize'], '계정명 크기', 'number'], [['header', 'nameColor'], '계정명 색', 'color'],
    [['header', 'handleText'], '@아이디', 'text'], [['header', 'handleX'], '아이디 x', 'number'], [['header', 'handleY'], '아이디 y', 'number'], [['header', 'handleFontSize'], '아이디 크기', 'number'], [['header', 'handleColor'], '아이디 색', 'color'],
  ]);
  buildFields('videoFields', [
    [['video', 'x'], 'x', 'number'], [['video', 'y'], 'y', 'number'], [['video', 'width'], 'width', 'number'], [['video', 'height'], 'height', 'number'],
  ]);
  buildFields('bottomFields', [
    [['bottomSpace', 'x'], 'x', 'number'], [['bottomSpace', 'y'], 'y', 'number'], [['bottomSpace', 'width'], 'width', 'number'], [['bottomSpace', 'height'], 'height', 'number'], [['bottomSpace', 'backgroundColor'], '배경색', 'color'],
  ]);
}
function refreshFieldValues() {
  document.querySelectorAll('#titleFields input,#titleFields select,#captionFields input,#captionFields select,#headerFields input,#headerFields select,#videoFields input,#bottomFields input').forEach(() => {});
  buildAllFields(); // simplest correct way to reflect programmatic TS changes (e.g. after 자동 배치 / AI 분석) back into inputs
}

// ---- convenience: recompute video/bottomSpace/header-linked positions from header.height/topGap (explicit action only, never automatic) ----
function autoLayout() {
  const gap = TS.header.topGap;
  TS.header.profileY = 35 + gap; TS.header.nameY = 45 + gap; TS.header.handleY = 100 + gap;
  TS.video.x = 0; TS.video.y = TS.header.height; TS.video.width = CANVAS.width; TS.video.height = CANVAS.height - TS.header.height - TS.bottomSpace.height;
  TS.bottomSpace.x = 0; TS.bottomSpace.width = CANVAS.width; TS.bottomSpace.y = CANVAS.height - TS.bottomSpace.height;
  refreshFieldValues(); applyPreview();
}

// ---- caption timing list ----
function renderCaptionList() {
  const root = $('captionList'); root.innerHTML = '';
  TS.captions.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'capRow';
    row.innerHTML = `<input data-t="${i}" value="${esc(c.text)}" placeholder="자막 ${i + 1}"><input data-s="${i}" type="number" min="0" step="0.1" value="${(+c.start).toFixed(1)}"><input data-e="${i}" type="number" min="0" step="0.1" value="${(+c.end).toFixed(1)}"><button data-x="${i}" class="secondary">×</button>`;
    root.appendChild(row);
  });
  root.querySelectorAll('[data-t]').forEach(n => n.oninput = e => { TS.captions[+e.target.dataset.t].text = e.target.value; applyPreview(); });
  root.querySelectorAll('[data-s]').forEach(n => n.oninput = e => { TS.captions[+e.target.dataset.s].start = Math.max(0, +e.target.value || 0); applyPreview(); });
  root.querySelectorAll('[data-e]').forEach(n => n.oninput = e => { TS.captions[+e.target.dataset.e].end = Math.max(0, +e.target.value || 0); applyPreview(); });
  root.querySelectorAll('[data-x]').forEach(n => n.onclick = e => { TS.captions.splice(+e.target.dataset.x, 1); renderCaptionList(); applyPreview(); });
}

// ---- generic helpers ----
async function json(url, opt) { const r = await fetch(url, opt); const d = await r.json(); if (!r.ok) throw new Error(d.error || r.statusText); return d; }

// ---- stock video search ----
async function health() { try { const d = await json('/api/health'); $('health').textContent = `Pexels ${d.pexels ? 'ON' : 'OFF'} · Pixabay ${d.pixabay ? 'ON' : 'OFF'}`; } catch { $('health').textContent = 'API ERROR'; } }
function updateDuration() { const t = totalStockVideo(); $('durationInfo').textContent = t ? `선택 ${selected.size}개 · 원본 합계 ${t.toFixed(1)}초` : '선택된 영상 없음'; }
function setPreviewSrc(url) { const p = $('previewVideo'); if (!url) { p.removeAttribute('src'); p.load(); return; } p.src = url; p.load(); }
function renderCards() {
  const root = $('videos'); root.innerHTML = '';
  videos.forEach((v, i) => {
    const el = document.createElement('div'); el.className = 'card' + (selected.has(i) ? ' selected' : '');
    const vv = document.createElement('video'); vv.src = v.downloadUrl; vv.poster = v.preview || ''; vv.controls = true; vv.muted = true; vv.playsInline = true; vv.preload = 'metadata';
    const m = document.createElement('div'); m.className = 'meta'; m.textContent = `${v.provider.toUpperCase()} · ${v.orientation} · ${v.duration || '?'}s · score ${Math.round(v.qualityScore || 0)} · ${v.creator || ''}`;
    const b = document.createElement('button'); b.className = 'secondary selectBtn'; b.textContent = selected.has(i) ? '선택 해제' : '이 영상 선택';
    b.onclick = () => { selected.has(i) ? selected.delete(i) : selected.add(i); renderCards(); updateDuration(); if (!uploadedClip) setPreviewSrc((videos[[...selected][0]] || v).downloadUrl); };
    el.append(vv, m, b); root.appendChild(el);
  });
  if (videos[0] && !selected.size && !uploadedClip) setPreviewSrc(videos[0].downloadUrl);
}
async function search(term) {
  $('videos').innerHTML = '<div class="small">시네마틱 영상 검색 중...</div>'; selected.clear(); updateDuration();
  const q = encodeURIComponent($('subject').value);
  const d = await json('/api/search?q=' + q + (term ? '&term=' + encodeURIComponent(term) : ''));
  videos = d.videos; $('terms').innerHTML = '';
  d.terms.forEach(t => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = t; c.onclick = () => search(t); $('terms').appendChild(c); });
  renderCards(); await makeCopy();
}

// ---- AI copy generation ----
async function makeCopy() {
  const d = await json('/api/copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: $('subject').value, mood: $('mood').value, duration: music ? +$('musicLength').value : duration(), target: $('target').value }) });
  TS.title.text = d.title || ''; TS.title.runs = [];
  const caps = Array.isArray(d.captions) ? d.captions : [];
  const dur = duration(), q = dur / Math.max(1, caps.length);
  TS.captions = caps.map((text, i) => ({ text: String(text), start: +(i * q).toFixed(2), end: +Math.min(dur, (i + 1) * q).toFixed(2) }));
  if (!TS.captions.length) TS.captions = [{ text: '', start: 0, end: Math.min(2, dur) }];
  $('titleText').value = TS.title.text;
  $('previewTitle').dir = d.direction || 'ltr'; $('previewCaption').dir = d.direction || 'ltr';
  renderCaptionList(); applyPreview();
}

// ---- music ----
function updateMusicVals() {
  const start = +$('musicStart').value, maxLen = music ? Math.max(0.5, music.duration - start) : 1;
  $('musicLength').max = maxLen; if (+$('musicLength').value > maxLen) $('musicLength').value = maxLen;
  $('musicStartVal').textContent = start.toFixed(1) + 's'; $('musicLengthVal').textContent = (+$('musicLength').value).toFixed(1) + 's'; $('musicVolumeVal').textContent = $('musicVolume').value + '%';
}
async function uploadMusic() {
  const f = $('musicFile').files[0]; if (!f) return alert('음원 파일을 선택하세요');
  $('musicName').textContent = '업로드 중...';
  const r = await fetch('/api/music/upload', { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(f.name) }, body: f });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || '업로드 실패');
  music = d; $('musicName').textContent = `${d.originalName} · ${d.duration.toFixed(1)}초`; $('musicPlayer').src = d.url;
  $('musicStart').max = Math.max(0, d.duration - 1); $('musicLength').max = d.duration; $('musicLength').value = Math.min(d.duration, 20);
  updateMusicVals(); await makeCopy();
}

// ---- direct video upload + AI analysis ----
function probeDuration(file) { return new Promise(resolve => { const v = document.createElement('video'), u = URL.createObjectURL(file); v.preload = 'metadata'; v.onloadedmetadata = () => { const d = Number(v.duration) || 5; URL.revokeObjectURL(u); resolve(d); }; v.onerror = () => { URL.revokeObjectURL(u); resolve(5); }; v.src = u; }); }
let localVideoUrl = '';
async function uploadDirectVideo(file) {
  if (!file) return;
  $('directVideoStatus').textContent = '업로드 중...';
  try {
    const dur = await probeDuration(file);
    const r = await fetch('/api/video/upload', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    uploadedClip = { uploadId: j.uploadId, downloadUrl: j.downloadUrl, duration: dur };
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    localVideoUrl = URL.createObjectURL(file);
    $('previewVideo').src = localVideoUrl; $('previewVideo').load();
    $('directVideoStatus').textContent = `업로드 완료 · ${file.name} · ${dur.toFixed(1)}초`;
    applyPreview();
  } catch (e) { uploadedClip = null; $('directVideoStatus').textContent = '업로드 실패 · ' + e.message; }
}
const LANGS = ['ja', 'en', 'ar', 'es'];
async function analyzeVideo() {
  if (!uploadedClip) return alert('영상을 먼저 업로드하세요');
  $('analysisStatus').textContent = '영상 분석 중...';
  try {
    const j = await json('/api/video/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uploadId: uploadedClip.uploadId, downloadUrl: uploadedClip.downloadUrl, duration: uploadedClip.duration }) });
    analysis = j; $('analysisStatus').textContent = `${j.sceneSummary || ''}${j.viralAngle ? ' · ' + j.viralAngle : ''}`;
    applyLang($('target').value);
  } catch (e) { $('analysisStatus').textContent = '분석 실패 · ' + e.message; }
}
function applyLang(lang) {
  const p = analysis?.[lang]; if (!p) return;
  if (LANGS.includes(lang)) $('target').value = lang;
  TS.title.text = p.titles?.[0] || ''; TS.title.runs = [];
  $('titleText').value = TS.title.text;
  TS.captions = Array.isArray(p.captions) && p.captions.length ? p.captions.map(x => ({ text: String(x.text || ''), start: +x.start || 0, end: +x.end || 0 })) : [{ text: '', start: 0, end: Math.min(2, duration()) }];
  const rtl = lang === 'ar';
  $('previewTitle').dir = rtl ? 'rtl' : 'ltr'; $('previewCaption').dir = rtl ? 'rtl' : 'ltr';
  renderCaptionList(); applyPreview();
}
async function uploadProfile(file) {
  if (!file) return;
  const r = await fetch('/api/profile/upload', { method: 'POST', headers: { 'content-type': file.type || 'image/jpeg', 'x-file-name': encodeURIComponent(file.name) }, body: file });
  const j = await r.json(); if (!r.ok) return;
  TS.header.profileUrl = j.url; TS.header.profilePath = j.url; applyPreview();
}

// ---- render / thumbnail ----
async function doRender() {
  try {
    const title = TS.title.text.trim(); if (!title) throw new Error('제목을 입력하세요');
    $('status').textContent = '렌더링 중...'; $('resultBox').innerHTML = '';
    const music_ = music ? { url: music.url, start: +$('musicStart').value, duration: +$('musicLength').value, volume: +$('musicVolume').value / 100 } : null;
    let d;
    if (uploadedClip) {
      d = await json('/api/export-uploaded', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uploadId: uploadedClip.uploadId, duration: uploadedClip.duration, templateState: templateStatePayload(), captions: captionsPayload(), target: $('target').value, music: music_ }) });
    } else {
      const clips = [...selected].map(i => videos[i]).filter(Boolean);
      if (!clips.length) throw new Error('영상을 먼저 선택하거나 업로드하세요');
      d = await json('/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clips, templateState: templateStatePayload(), captions: captionsPayload(), target: $('target').value, music: music_ }) });
    }
    $('status').textContent = `완료 · ${d.duration}s`;
    $('resultBox').innerHTML = `<a class="link" href="${d.url}" target="_blank">완성 영상 열기</a> <a class="link" href="${d.downloadUrl}" download>⬇ 다운로드</a>`;
  } catch (e) { $('status').textContent = '실패: ' + e.message; }
}
async function doThumbnail() {
  try {
    const clip = uploadedClip || (videos[[...selected][0]] || videos[0]);
    if (!clip) throw new Error('영상을 먼저 검색/선택/업로드하세요');
    const title = TS.title.text.trim(); if (!title) throw new Error('제목을 입력하세요');
    $('status').textContent = '썸네일 생성 중...';
    const d = await json('/api/thumbnail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clip: uploadedClip ? { downloadUrl: uploadedClip.downloadUrl, duration: uploadedClip.duration } : clip, templateState: templateStatePayload(), timestamp: 1 }) });
    $('status').textContent = '썸네일 완료';
    $('resultBox').innerHTML = `<a class="link" href="${d.url}" target="_blank">썸네일 열기</a> <a class="link" href="${d.downloadUrl}" download>⬇ 저장</a><br><img src="${d.url}">`;
  } catch (e) { $('status').textContent = '썸네일 실패: ' + e.message; }
}

// ---- wiring ----
function bindTitleTextarea() {
  $('titleText').addEventListener('input', () => { TS.title.text = $('titleText').value.replace(/\r/g, ''); TS.title.runs = TS.title.runs.map(r => ({ ...r, start: Math.max(0, Math.min(TS.title.text.length, r.start)), end: Math.max(0, Math.min(TS.title.text.length, r.end)) })).filter(r => r.end > r.start); applyPreview(); });
  $('applySelectionColor').onclick = () => { const ta = $('titleText'), a = ta.selectionStart, b = ta.selectionEnd; if (a === b) return; TS.title.runs = [...TS.title.runs, { start: a, end: b, color: $('selectionColor').value }]; ta.focus(); ta.setSelectionRange(a, b); applyPreview(); };
  $('clearSelectionColor').onclick = () => { const ta = $('titleText'), a = ta.selectionStart, b = ta.selectionEnd; if (a === b) return; TS.title.runs = subtractRun(TS.title.runs, a, b); ta.focus(); ta.setSelectionRange(a, b); applyPreview(); };
}
function bindMisc() {
  $('searchBtn').onclick = () => search();
  $('regenBtn').onclick = makeCopy;
  $('target').onchange = makeCopy;
  $('uploadMusicBtn').onclick = () => uploadMusic().catch(e => $('musicName').textContent = '실패: ' + e.message);
  ['musicStart', 'musicLength', 'musicVolume'].forEach(id => $(id).oninput = updateMusicVals);
  $('directVideoFile').onchange = e => uploadDirectVideo(e.target.files?.[0]);
  $('analyzeVideoBtn').onclick = analyzeVideo;
  $('applyJaBtn').onclick = () => applyLang('ja'); $('applyEnBtn').onclick = () => applyLang('en');
  $('applyArBtn').onclick = () => applyLang('ar'); $('applyEsBtn').onclick = () => applyLang('es');
  $('headerEnabled').onchange = () => { TS.header.enabled = $('headerEnabled').checked; applyPreview(); };
  $('profileFile').addEventListener('change', e => uploadProfile(e.target.files?.[0]));
  $('addCaptionRow').onclick = () => { const d = duration(), last = TS.captions.at(-1), s = Math.max(0, Math.min(d - 0.1, last ? +last.end || 0 : 0)), e = Math.min(d, s + 2); TS.captions.push({ text: '새 자막', start: +s.toFixed(2), end: +e.toFixed(2) }); renderCaptionList(); applyPreview(); };
  $('autoCaptionTiming').onclick = () => { const d = duration(), q = d / Math.max(1, TS.captions.length); TS.captions = TS.captions.map((x, i) => ({ ...x, start: +(i * q).toFixed(2), end: +Math.min(d, (i + 1) * q).toFixed(2) })); renderCaptionList(); applyPreview(); };
  $('autoLayoutBtn').onclick = autoLayout;
  $('renderBtn').onclick = doRender; $('thumbBtn').onclick = doThumbnail;
  $('previewVideo').addEventListener('timeupdate', applyPreview);
  new ResizeObserver(applyPreview).observe($('previewOuter'));
  addEventListener('resize', applyPreview);
}

function init() {
  loadState();
  $('titleText').value = TS.title.text;
  $('headerEnabled').checked = TS.header.enabled;
  if (TS.header.profileUrl) $('previewAvatar').src = TS.header.profileUrl;
  buildAllFields();
  renderCaptionList();
  bindTitleTextarea(); bindMisc();
  health();
  applyPreview();
  loadPreviewFonts();
  makeCopy().catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
