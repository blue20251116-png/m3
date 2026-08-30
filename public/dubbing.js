(() => {
const $ = id => document.getElementById(id);
let uploaded = null;
let analysis = null;
const state = { speakers: [], dialogues: [], voices: [] };

function setStatus(id, msg){ $(id).textContent = msg || ''; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function jsonFetch(url, options={}){
  const r = await fetch(url, options);
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j?.error || `${r.status} ${r.statusText}`);
  return j;
}
async function uploadVideo(file){
  const r = await fetch('/api/video/upload',{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j?.error || '영상 업로드 실패');
  return j;
}
function renderSpeakers(){
  const root = $('speakers'); root.innerHTML='';
  $('speakerCount').textContent = state.speakers.length ? `감지된 화자 ${state.speakers.length}명 · 자동 생성된 만큼 표시됩니다.` : '';
  state.speakers.forEach((s,idx)=>{
    const box=document.createElement('div'); box.className='speaker';
    const options=(state.voices.length?state.voices:['marin','cedar','coral','ash','nova']).map(v=>`<option value="${esc(v)}" ${v===s.voice?'selected':''}>${esc(v)}</option>`).join('');
    box.innerHTML=`<div class="speakerTop"><strong>${esc(s.displayName||`화자 ${idx+1}`)}</strong><span class="pill">${esc(s.id)}</span></div><select>${options}</select><div class="character">${esc(s.character||'캐릭터 분석 없음')}</div>`;
    const select=box.querySelector('select'); select.onchange=()=>{ state.speakers[idx].voice=select.value; };
    root.appendChild(box);
  });
}
function renderDialogues(){
  const root=$('dialogues'); root.innerHTML='';
  state.dialogues.forEach((d,idx)=>{
    const row=document.createElement('div'); row.className='dialogue';
    row.innerHTML=`<div class="time">${Number(d.start).toFixed(2)}s<br>→ ${Number(d.end).toFixed(2)}s</div><div class="speakerId">${esc(d.speaker)}</div><div class="orig">${esc(d.original)}</div><textarea spellcheck="false">${esc(d.korean)}</textarea>`;
    row.querySelector('textarea').oninput=e=>{ state.dialogues[idx].korean=e.target.value; };
    root.appendChild(row);
  });
}
function applyAnalysis(j){
  analysis=j;
  state.speakers=Array.isArray(j.speakers)?j.speakers.map(x=>({...x})):[];
  state.dialogues=Array.isArray(j.dialogues)?j.dialogues.map(x=>({...x})):[];
  state.voices=Array.isArray(j.availableVoices)?j.availableVoices.slice():[];
  $('summary').innerHTML=`<strong>상황:</strong> ${esc(j.sceneSummary||'-')}<br><strong>훅:</strong> ${esc(j.viralHook||'-')}<br><span class="small">${esc(j.models?.transcription||'')} → ${esc(j.models?.script||'')}</span>`;
  renderSpeakers(); renderDialogues(); $('render').disabled=!state.dialogues.length;
}

$('uploadAnalyze').onclick=async()=>{
  const file=$('file').files?.[0]; if(!file){setStatus('uploadStatus','먼저 영상 파일을 선택하세요.');return;}
  const btn=$('uploadAnalyze'); btn.disabled=true; $('render').disabled=true;
  try{
    setStatus('uploadStatus','1/2 영상 업로드 중...');
    uploaded=await uploadVideo(file);
    const pv=$('sourcePreview'); pv.src=uploaded.url; pv.style.display='block';
    setStatus('uploadStatus','2/2 중국어 STT + 화자 분리 + 병맛 대본 생성 중... 영상 길이에 따라 시간이 걸릴 수 있습니다.');
    const j=await jsonFetch('/api/dubbing/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uploadId:uploaded.uploadId,humorLevel:$('humor').value})});
    applyAnalysis(j);
    setStatus('uploadStatus',`완료 · ${state.speakers.length}명 화자 / ${state.dialogues.length}개 대사 감지`);
  }catch(e){ console.error(e); setStatus('uploadStatus',`실패: ${e.message}`); }
  finally{ btn.disabled=false; }
};

$('render').onclick=async()=>{
  if(!uploaded?.uploadId){setStatus('renderStatus','업로드 영상이 없습니다.');return;}
  const btn=$('render'); btn.disabled=true;
  try{
    setStatus('renderStatus',`원본 오디오는 제외하고 화자별 TTS ${state.dialogues.length}개 생성 후 FFmpeg 렌더 중...`);
    const out=await jsonFetch('/api/dubbing/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uploadId:uploaded.uploadId,speakers:state.speakers,dialogues:state.dialogues})});
    $('result').innerHTML=`<video controls playsinline src="${esc(out.downloadUrl)}"></video><br><a href="${esc(out.downloadUrl)}">완성 MP4 다운로드</a>`;
    setStatus('renderStatus','완료. 원본 영상 음성은 포함되지 않고 한국어 TTS만 사용됩니다.');
  }catch(e){ console.error(e); setStatus('renderStatus',`실패: ${e.message}`); }
  finally{ btn.disabled=false; }
};
})();