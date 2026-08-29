// Run with: node test/templateState.test.mjs
// No ffmpeg/network required — this checks the pure coordinate math that
// public/editor.js's preview and src/shortsRenderer.js's ASS/filter builders
// both consume. It intentionally uses non-default numbers (see README note
// in the PR/commit) so a "looks right because it matches the defaults"
// false-positive can't hide a hardcoded layout constant.
import { normTemplateState, titleAnchor, captionXExpr, createAss } from '../src/shortsRenderer.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const RAW = {
  canvas: { width: 1080, height: 1920 },
  header: {
    enabled: true, backgroundColor: '#EE00EE',
    profileX: 91, profileY: 73, profileSize: 117, profilePath: '',
    nameText: '오디트채널', nameX: 200, nameY: 60, nameFontSize: 30, nameColor: '#123456',
    handleText: '@audit', handleX: 200, handleY: 100, handleFontSize: 20, handleColor: '#654321',
  },
  title: { text: '제목텍스트', x: 123, y: 287, width: 500, fontKey: 'heavy', fontSize: 60, align: 'left', color: '#FFFFFF', strokeWidth: 3, strokeColor: '#000000', shadowSize: 2, shadowColor: '#333333', runs: [] },
  video: { x: 17, y: 433, width: 991, height: 1103 },
  bottomSpace: { x: 0, y: 1700, width: 1080, height: 220, backgroundColor: '#00EEEE' },
  caption: { x: 141, y: 1517, width: 800, fontKey: 'heavy', fontSize: 44, align: 'left', fontColor: '#00FF00', outlineColor: '#000000', outlineWidth: 4, shadowColor: '#000000', shadowSize: 3 },
};

let failures = 0;
function check(name, fn) { try { fn(); console.log(`ok  - ${name}`); } catch (e) { failures++; console.error(`FAIL - ${name}: ${e.message}`); } }

const ts = normTemplateState(RAW);

check('normTemplateState echoes video x/y/width/height verbatim', () => {
  assert.equal(ts.video.x, 17); assert.equal(ts.video.y, 433); assert.equal(ts.video.width, 991); assert.equal(ts.video.height, 1103);
});
check('normTemplateState echoes header.profileX/Y/Size verbatim', () => {
  assert.equal(ts.header.profileX, 91); assert.equal(ts.header.profileY, 73); assert.equal(ts.header.profileSize, 117);
});
check('normTemplateState echoes title.x/y and caption.x/y verbatim', () => {
  assert.equal(ts.title.x, 123); assert.equal(ts.title.y, 287);
  assert.equal(ts.caption.x, 141); assert.equal(ts.caption.y, 1517);
});
check('titleAnchor formula depends only on x/width/align (left/center/right)', () => {
  for (const [align, expectX, expectAn] of [['left', 123, 7], ['center', 373, 8], ['right', 623, 9]]) {
    const t2 = normTemplateState({ ...RAW, title: { ...RAW.title, align } });
    const { an, x } = titleAnchor(t2.title);
    assert.equal(x, expectX, `align=${align} x`); assert.equal(an, expectAn, `align=${align} an`);
  }
});
check('captionXExpr formula depends only on x/width/align; y is used directly (no "bottom" concept)', () => {
  const left = normTemplateState({ ...RAW, caption: { ...RAW.caption, align: 'left' } });
  const right = normTemplateState({ ...RAW, caption: { ...RAW.caption, align: 'right' } });
  const center = normTemplateState({ ...RAW, caption: { ...RAW.caption, align: 'center' } });
  assert.equal(captionXExpr(left.caption), '141');
  assert.equal(captionXExpr(right.caption), '941-text_w');
  assert.equal(captionXExpr(center.caption), '141+(800-text_w)/2');
  assert.equal(ts.caption.y, 1517);
});

const dir = await mkdtemp(path.join(tmpdir(), 'm3test-'));
const assFile = await createAss(dir, ts);
const assText = await readFile(assFile, 'utf8');
check('ASS title \\pos is the literal (123,287) — not recomputed from any other field', () => {
  assert.ok(assText.includes('\\pos(123,287)'));
});
check('ASS channel/handle \\pos are the literal (200,60)/(200,100) — not 155/45+topGap style constants', () => {
  assert.ok(assText.includes('\\pos(200,60)'));
  assert.ok(assText.includes('\\pos(200,100)'));
});
check('ASS Channel/Handle style fontsize come from nameFontSize/handleFontSize (30/20), not hardcoded 38/27', () => {
  assert.ok(/Style: Channel,[^,]+,30,/.test(assText));
  assert.ok(/Style: Handle,[^,]+,20,/.test(assText));
});
await rm(dir, { recursive: true, force: true });

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
