import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSetting } from './configStore.js';

const ROOT = process.env.WORK_DIR || '/tmp/m3-shorts';

function run(cmd,args){return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',d=>err+=d.toString());child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`${cmd} failed (${code}) ${err.slice(-1800)}`)))})}
function safeUploadPath(publicDir,{uploadId='',downloadUrl=''}={}){
  const raw=String(uploadId||'').trim()||path.basename(String(downloadUrl||'').split('?')[0]);
  const name=path.basename(raw);
  if(!/^video-[a-f0-9-]+\.(mp4|mov|m4v|webm|mkv)$/i.test(name))throw new Error('업로드 영상 식별값이 올바르지 않습니다');
  return path.join(publicDir,'uploads',name);
}
async function frameDataUrls(videoPath,duration=12){
  const dir=path.join(ROOT,`vision-${crypto.randomUUID()}`);await mkdir(dir,{recursive:true});
  try{
    const d=Math.max(1,Number(duration)||12),points=[.08,.32,.58,.84].map(p=>Math.max(0,Math.min(d-.05,d*p)));
    const out=[];
    for(let i=0;i<points.length;i++){
      const f=path.join(dir,`f${i}.jpg`);
      await run('ffmpeg',['-y','-ss',String(points[i]),'-i',videoPath,'-frames:v','1','-vf','scale=720:-2','-q:v','5',f]);
      const b=await readFile(f);out.push(`data:image/jpeg;base64,${b.toString('base64')}`);
    }
    return out;
  } finally { await rm(dir,{recursive:true,force:true}).catch(()=>{}); }
}
function extractText(json){
  if(typeof json?.output_text==='string'&&json.output_text.trim())return json.output_text;
  for(const item of json?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')return c.text;
  return '';
}
function parseJson(text){
  const cleaned=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(cleaned)}catch{}
  const m=cleaned.match(/\{[\s\S]*\}/);if(m)return JSON.parse(m[0]);
  throw new Error('AI 분석 결과 JSON 파싱 실패');
}
export async function analyzeVideoForMemes({publicDir,uploadId,downloadUrl,duration}){
  const key=await getSetting('OPENAI_API_KEY');if(!key)throw new Error('관리자 API 설정에서 OpenAI API Key를 먼저 입력하세요');
  const videoPath=safeUploadPath(publicDir,{uploadId,downloadUrl}),frames=await frameDataUrls(videoPath,duration);
  const prompt=`You are a short-form viral copy editor for Japanese and English-speaking Gen Z audiences. Analyze the four chronological frames from ONE short video. Infer only what is visually supported. Do not invent identities, facts, locations, relationships, or events you cannot see. Create punchy internet-native copy, not literal translation. Japanese may naturally use expressions such as え、待って, エグい, やば, 草, www, 無理, 天才かよ when appropriate. English may naturally use BRO, NAH, WAIT, AIN'T NO WAY, bro is cooking, I'm crying, 💀, 😭 when appropriate. Avoid forcing slang when the clip is beautiful, calm, emotional, or serious.

Return ONLY valid JSON in this exact shape:
{
 "sceneSummary":"short Korean summary of what visibly happens",
 "viralAngle":"short Korean explanation of the strongest hook",
 "reactionType":"funny|surprise|cute|beautiful|emotional|fail|twist|skill|weird|other",
 "ja":{"titles":["title 1 with optional line break as \\n","title 2","title 3"],"captions":[{"text":"...","start":0.0,"end":2.2},{"text":"...","start":2.2,"end":4.8}]},
 "en":{"titles":["title 1 with optional line break as \\n","title 2","title 3"],"captions":[{"text":"...","start":0.0,"end":2.2},{"text":"...","start":2.2,"end":4.8}]}
}
Rules: 2-5 caption beats per language; times must be ascending, non-overlapping, and within ${Math.max(1,Number(duration)||12).toFixed(1)} seconds. Titles should be thumbnail-safe: usually 2 short lines, each line concise. Japanese and English should feel natively written and can differ substantially.`;
  const content=[{type:'input_text',text:prompt},...frames.map(image_url=>({type:'input_image',image_url}))];
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify({model:process.env.M3_VISION_MODEL||'gpt-5.6-luna',input:[{role:'user',content}],max_output_tokens:1800})});
  const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`OpenAI ${r.status}`);
  const parsed=parseJson(extractText(j));
  return {...parsed,model:process.env.M3_VISION_MODEL||'gpt-5.6-luna'};
}
