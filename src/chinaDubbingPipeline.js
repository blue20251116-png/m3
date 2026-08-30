import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { getSetting } from './configStore.js';

const WORK_ROOT = process.env.WORK_DIR || '/tmp/m3-shorts';
const DEFAULT_TRANSCRIBE_MODEL = process.env.M3_DIARIZE_MODEL || 'gpt-4o-transcribe-diarize';
const DEFAULT_SCRIPT_MODEL = process.env.M3_SCRIPT_MODEL || 'gpt-5.6-luna';
const DEFAULT_TTS_MODEL = process.env.M3_TTS_MODEL || 'gpt-4o-mini-tts';
const VOICES = ['marin','cedar','coral','ash','nova','echo','sage','shimmer','verse','alloy','onyx','fable','ballad'];

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => { err += d.toString(); if (err.length > 12000) err = err.slice(-12000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} failed (${code}) ${err.slice(-2500)}`)));
  });
}

function safeUploadPath(publicDir, uploadId) {
  const name = path.basename(String(uploadId || '').trim());
  if (!/^video-[a-f0-9-]+\.(mp4|mov|m4v|webm|mkv)$/i.test(name)) throw new Error('업로드 영상 식별값이 올바르지 않습니다');
  return path.join(publicDir, 'uploads', name);
}

function extractText(json) {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text;
  for (const item of json?.output || []) for (const c of item?.content || []) if (typeof c?.text === 'string') return c.text;
  return '';
}

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('AI 대본 JSON 파싱 실패');
}

async function requireOpenAIKey() {
  const key = await getSetting('OPENAI_API_KEY');
  if (!key) throw new Error('관리자 API 설정에서 OpenAI API Key를 먼저 입력하세요');
  return key;
}

async function extractAudio(videoPath, outPath) {
  await run('ffmpeg', ['-y','-i',videoPath,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',outPath]);
}

async function transcribeDiarized(audioPath, key) {
  const bytes = await readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', DEFAULT_TRANSCRIBE_MODEL);
  form.append('response_format', 'diarized_json');
  form.append('language', 'zh');
  form.append('chunking_strategy', 'auto');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `OpenAI transcription ${r.status}`);
  if (!Array.isArray(j?.segments)) throw new Error('화자 분리 결과에 segments가 없습니다');
  return j;
}

function normalizeTranscript(j) {
  const segments = (j.segments || []).map((s, i) => ({
    id: String(s.id || `seg_${String(i + 1).padStart(3, '0')}`),
    speaker: String(s.speaker || 'A'),
    start: Math.max(0, Number(s.start) || 0),
    end: Math.max(0, Number(s.end) || 0),
    original: String(s.text || '').trim(),
  })).filter(s => s.original && s.end > s.start);
  const speakerIds = [...new Set(segments.map(s => s.speaker))];
  const speakers = speakerIds.map((id, i) => ({
    id,
    displayName: `화자 ${i + 1}`,
    voice: VOICES[i % VOICES.length],
    voiceIndex: i % VOICES.length,
  }));
  return { duration: Number(j.duration) || Math.max(0, ...segments.map(s => s.end)), text: String(j.text || ''), speakers, segments };
}

function humorRules(level) {
  if (level === 'original') return '원문 의미를 90% 이상 보존하고 번역투만 자연스럽게 없앤다. 억지 개그를 추가하지 않는다.';
  if (level === 'max') return '영상에서 실제로 일어나는 사건과 대화 관계는 반드시 유지하되, 한국 쇼츠에서 자연스럽게 들리는 황당한 리액션과 펀치라인을 적극적으로 넣는다. 원문 핵심 의미는 약 50~60% 보존한다.';
  return '원문 사건과 핵심 대화는 약 70% 보존하고, 한국식 예능 리액션과 병맛 펀치라인을 30% 정도 추가한다. 억지 밈 남발은 금지한다.';
}

async function rewriteKorean({ transcript, humorLevel = 'variety', key }) {
  const compact = transcript.segments.map(s => ({ id:s.id, speaker:s.speaker, start:s.start, end:s.end, original:s.original }));
  const prompt = `너는 한국 유튜브 쇼츠의 중국 병맛 상황극 현지화 작가다. 아래 중국어 화자별 대사를 한국어 더빙 대본으로 재작성한다.\n\n핵심 규칙:\n1. 화면에 없는 사건, 물건, 관계, 신분을 새로 만들지 않는다.\n2. 화자 ID, segment id, start, end를 절대 변경하지 않는다.\n3. 같은 화자는 영상 전체에서 같은 말투 캐릭터를 유지한다.\n4. 앞뒤 대화 문맥을 함께 보고 질문-반박-끼어듦-펀치라인 흐름을 살린다.\n5. 각 korean 문장은 (end-start)초 안에 TTS가 들어갈 정도로 짧게 쓴다. 1초당 한국어 약 4~6음절을 기준으로 너무 길면 과감히 압축한다.\n6. 직역투, 설명조, 과도한 유행어 반복을 피한다. 'ㅋㅋ'는 필요한 장면에만 사용한다.\n7. 욕설/혐오 표현 없이도 웃기게 만든다.\n8. ${humorRules(humorLevel)}\n\n반환은 JSON만. 정확한 형식:\n{"sceneSummary":"한국어 한두 문장","viralHook":"가장 웃긴 포인트","speakers":[{"id":"A","character":"짧은 한국어 캐릭터 설명"}],"dialogues":[{"id":"seg_001","speaker":"A","start":0.0,"end":1.5,"original":"원문","korean":"한국어 대사"}]}\n\n입력:\n${JSON.stringify(compact)}`;
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type':'application/json', authorization:`Bearer ${key}` },
    body: JSON.stringify({ model: DEFAULT_SCRIPT_MODEL, input: prompt, max_output_tokens: 5000 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `OpenAI script ${r.status}`);
  const parsed = parseJson(extractText(j));
  const byId = new Map(transcript.segments.map(s => [s.id, s]));
  const dialogues = [];
  for (const d of parsed.dialogues || []) {
    const src = byId.get(String(d.id));
    if (!src) continue;
    dialogues.push({
      id: src.id,
      speaker: src.speaker,
      start: src.start,
      end: src.end,
      original: src.original,
      korean: String(d.korean || '').trim() || src.original,
    });
  }
  for (const src of transcript.segments) if (!dialogues.some(d => d.id === src.id)) dialogues.push({ ...src, korean: src.original });
  dialogues.sort((a,b) => a.start - b.start);
  const speakerCharacter = new Map((parsed.speakers || []).map(s => [String(s.id), String(s.character || '')]));
  const speakers = transcript.speakers.map(s => ({ ...s, character: speakerCharacter.get(s.id) || '' }));
  return { sceneSummary:String(parsed.sceneSummary || ''), viralHook:String(parsed.viralHook || ''), speakers, dialogues };
}

export async function analyzeChinaDubbing({ publicDir, uploadId, humorLevel = 'variety' }) {
  const key = await requireOpenAIKey();
  const work = path.join(WORK_ROOT, `dub-analyze-${crypto.randomUUID()}`);
  await mkdir(work, { recursive:true });
  try {
    const videoPath = safeUploadPath(publicDir, uploadId);
    const audioPath = path.join(work, 'audio.wav');
    await extractAudio(videoPath, audioPath);
    const raw = await transcribeDiarized(audioPath, key);
    const transcript = normalizeTranscript(raw);
    const localized = await rewriteKorean({ transcript, humorLevel, key });
    return {
      ok:true,
      mode:'china-meme-dubbing',
      humorLevel,
      duration:transcript.duration,
      sourceText:transcript.text,
      sceneSummary:localized.sceneSummary,
      viralHook:localized.viralHook,
      speakers:localized.speakers,
      dialogues:localized.dialogues,
      models:{ transcription:DEFAULT_TRANSCRIBE_MODEL, script:DEFAULT_SCRIPT_MODEL, tts:DEFAULT_TTS_MODEL },
      availableVoices:VOICES,
    };
  } finally {
    await rm(work, { recursive:true, force:true }).catch(()=>{});
  }
}

function assTime(sec) {
  const n = Math.max(0, Number(sec) || 0), h = Math.floor(n/3600), m = Math.floor((n%3600)/60), s = n%60;
  return `${h}:${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;
}
function assEsc(s) { return String(s || '').replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}').replace(/\r?\n/g,'\\N'); }
function buildAss(dialogues) {
  const events = dialogues.filter(d => String(d.korean || '').trim() && Number(d.end) > Number(d.start)).map(d => `Dialogue: 0,${assTime(d.start)},${assTime(d.end)},Default,,0,0,0,,${assEsc(d.korean)}`).join('\n');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Noto Sans CJK KR,64,&H00FFFFFF,&H000000FF,&H00000000,&H70000000,-1,0,0,0,100,100,0,0,1,5,2,2,70,70,180,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${events}\n`;
}

async function synthesizeSegment({ key, text, voice, outPath }) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method:'POST',
    headers:{ 'content-type':'application/json', authorization:`Bearer ${key}` },
    body:JSON.stringify({ model:DEFAULT_TTS_MODEL, voice:voice || 'marin', input:text, response_format:'wav', instructions:'한국어 쇼츠 더빙처럼 자연스럽고 또렷하게. 대사를 과장하지 말고 상황극 리듬을 살려 말한다.' }),
  });
  if (!r.ok) {
    let msg = `OpenAI TTS ${r.status}`;
    try { const j = await r.json(); msg = j?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  await writeFile(outPath, Buffer.from(await r.arrayBuffer()));
}

export async function renderChinaDubbing({ publicDir, renderDir, uploadId, speakers = [], dialogues = [], originalVolume = 0.12 }) {
  const key = await requireOpenAIKey();
  const videoPath = safeUploadPath(publicDir, uploadId);
  const validDialogues = (dialogues || []).filter(d => String(d.korean || '').trim() && Number(d.end) > Number(d.start)).sort((a,b)=>Number(a.start)-Number(b.start));
  if (!validDialogues.length) throw new Error('더빙할 한국어 대사가 없습니다');
  const work = path.join(WORK_ROOT, `dub-render-${crypto.randomUUID()}`);
  await mkdir(work,{recursive:true}); await mkdir(renderDir,{recursive:true});
  try {
    const voiceBySpeaker = new Map((speakers || []).map((s,i)=>[String(s.id), VOICES.includes(String(s.voice)) ? String(s.voice) : VOICES[i % VOICES.length]]));
    const audioFiles = [];
    for (let i=0;i<validDialogues.length;i++) {
      const d = validDialogues[i], f = path.join(work, `tts-${String(i).padStart(3,'0')}.wav`);
      await synthesizeSegment({ key, text:String(d.korean), voice:voiceBySpeaker.get(String(d.speaker)) || VOICES[i % VOICES.length], outPath:f });
      audioFiles.push(f);
    }
    const assPath = path.join(work,'captions.ass'); await writeFile(assPath,buildAss(validDialogues),'utf8');
    const outName = `china-dub-${crypto.randomUUID()}.mp4`, outPath = path.join(renderDir,outName);
    const args = ['-y','-i',videoPath];
    for (const f of audioFiles) args.push('-i',f);
    const filters = [`[0:a]volume=${Math.max(0,Math.min(1,Number(originalVolume)||0))}[orig]`];
    const mixLabels = ['[orig]'];
    validDialogues.forEach((d,i)=>{
      const delay=Math.max(0,Math.round(Number(d.start)*1000)), label=`t${i}`;
      filters.push(`[${i+1}:a]adelay=${delay}|${delay},volume=1.0[${label}]`); mixLabels.push(`[${label}]`);
    });
    filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:normalize=0[aout]`);
    filters.push(`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${assPath.replace(/([\\':])/g,'\\$1')}[vout]`);
    args.push('-filter_complex',filters.join(';'),'-map','[vout]','-map','[aout]','-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-c:a','aac','-b:a','192k','-movflags','+faststart',outPath);
    await run('ffmpeg',args);
    return { ok:true, filename:outName, duration:Math.max(...validDialogues.map(d=>Number(d.end)||0)), voices:Object.fromEntries(voiceBySpeaker) };
  } finally {
    await rm(work,{recursive:true,force:true}).catch(()=>{});
  }
}

export function listDubbingVoices(){ return [...VOICES]; }
