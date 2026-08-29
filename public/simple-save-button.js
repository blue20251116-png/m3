(()=>{
  const $=id=>document.getElementById(id);
  let uploaded=null,busy=false;
  function status(t){const n=$('status')||$('directVideoStatus');if(n)n.textContent=t}
  function probe(file){return new Promise(resolve=>{const v=document.createElement('video'),u=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{const d=Number(v.duration)||5;URL.revokeObjectURL(u);resolve(d)};v.onerror=()=>{URL.revokeObjectURL(u);resolve(5)};v.src=u})}
  async function ensureUpload(){if(uploaded)return uploaded;const input=$('directVideoFile'),file=input?.files?.[0];if(!file)throw new Error('영상을 먼저 업로드하세요');status('영상 업로드 중...');const duration=await probe(file),r=await fetch('/api/video/upload',{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file}),j=await r.json();if(!r.ok)throw new Error(j.error||`업로드 실패 HTTP ${r.status}`);uploaded={uploadId:j.uploadId,duration};return uploaded}
  function num(...ids){for(const id of ids){const e=$(id);if(e&&e.value!==''&&Number.isFinite(+e.value))return +e.value}return undefined}
  function val(...ids){for(const id of ids){const e=$(id);if(e&&e.value!=='')return e.value}return undefined}
  function readEditorState(){try{return JSON.parse(localStorage.getItem('m3VisualEditorState')||'{}')||{}}catch{return{}}}
  function readStyle(){
    const title={},caption={},saved=readEditorState();
    const fontSize=num('veTitleSize','titleSize');if(fontSize!=null)title.fontSize=fontSize;
    const align=val('veTitleAlign','titleAlign');if(align)title.align=align;
    const color=val('veTitleColor','titleColor');if(color)title.color=color;
    const fontKey=val('veTitleFont','titleFont');if(fontKey)title.fontKey=fontKey;
    const strokeColor=val('veTitleStroke','titleStrokeColor');if(strokeColor)title.strokeColor=strokeColor;
    const strokeWidth=num('veTitleStrokeWidth','titleStrokeWidth');if(strokeWidth!=null)title.strokeWidth=strokeWidth;
    const shadowColor=val('veTitleShadow','titleShadowColor');if(shadowColor)title.shadowColor=shadowColor;
    const shadowSize=num('veTitleShadowSize','titleShadowSize');if(shadowSize!=null)title.shadowSize=shadowSize;
    const titleY=num('titleY');if(titleY!=null)title.y=titleY;
    const top=num('igTopSpace','barHeight');if(top!=null)title.backgroundHeight=top;
    const bottom=num('igBottomSpace');if(bottom!=null)title.bottomSpace=bottom;
    title.backgroundColor='#FFFFFF';title.socialHeader=true;
    const name=val('igChannelName');if(name!=null)title.channelName=name;
    const handle=val('igHandle');if(handle!=null)title.handle=handle;
    if(Array.isArray(saved.titleRuns))title.titleRuns=saved.titleRuns;
    try{const s=JSON.parse(localStorage.getItem('m3InstagramTemplate')||'{}');if(s.profilePath)title.profileImagePath=s.profilePath}catch{}
    const cfont=val('veCaptionFont','captionFont');if(cfont)caption.fontKey=cfont;
    const csize=num('veCaptionSize','captionSize');if(csize!=null)caption.fontSize=csize;
    const calign=val('veCaptionAlign','captionAlign');if(calign)caption.align=calign;
    const ccolor=val('veCaptionColor','captionColor');if(ccolor)caption.color=ccolor;
    const cs=val('veCaptionStroke','strokeColor');if(cs)caption.strokeColor=cs;
    const csw=num('veCaptionStrokeWidth','strokeWidth');if(csw!=null)caption.strokeWidth=csw;
    const cb=num('veCaptionBottom','captionBottom');if(cb!=null)caption.bottom=cb;
    const csh=val('veCaptionShadow','captionShadowColor');if(csh)caption.shadowColor=csh;
    const cshs=num('veCaptionShadowSize','captionShadowSize');if(cshs!=null)caption.shadowSize=cshs;
    return{title,caption};
  }
  function readCaptions(){const rows=[...document.querySelectorAll('#captionList .capRow')];if(rows.length)return rows.map(r=>({text:r.querySelector('[data-t]')?.value||'',start:+(r.querySelector('[data-s]')?.value||0),end:+(r.querySelector('[data-e]')?.value||0)})).filter(x=>x.text&&x.end>x.start);const s=readEditorState();return Array.isArray(s.captionTimings)?s.captionTimings:[]}
  async function save(){if(busy)return;busy=true;const b=$('simpleSaveBtn');if(b)b.disabled=true;try{const u=await ensureUpload(),title=$('veTitleText')?.value||$('title')?.value||'';if(!title.trim())throw new Error('제목을 입력하세요');status('수정본 만드는 중...');const body={uploadId:u.uploadId,duration:u.duration,title,captions:readCaptions(),style:readStyle(),target:$('target')?.value||'ja'};const r=await fetch('/api/export-uploaded',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw new Error(j.error||`렌더 실패 HTTP ${r.status}`);status('완료 · 다운로드 시작');window.location.assign(j.downloadUrl)}catch(e){status('실패: '+e.message);alert(e.message)}finally{busy=false;if(b)b.disabled=false}}
  function mount(){const render=$('renderBtn');if(!render)return setTimeout(mount,150);let b=$('simpleSaveBtn');if(!b){b=document.createElement('button');b.id='simpleSaveBtn';b.type='button';b.className='secondary';render.insertAdjacentElement('afterend',b)}b.textContent='⬇ 수정본 저장';b.onclick=save;$('directVideoFile')?.addEventListener('change',()=>{uploaded=null},true)}
  mount();
})();