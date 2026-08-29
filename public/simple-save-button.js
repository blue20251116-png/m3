(()=>{
  const $=id=>document.getElementById(id);
  let uploaded=null,busy=false;
  function status(t){const n=$('status')||$('directVideoStatus');if(n)n.textContent=t}
  function probe(file){return new Promise(resolve=>{const v=document.createElement('video'),u=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{const d=Number(v.duration)||5;URL.revokeObjectURL(u);resolve(d)};v.onerror=()=>{URL.revokeObjectURL(u);resolve(5)};v.src=u})}
  async function ensureUpload(){
    if(uploaded)return uploaded;
    const input=$('directVideoFile');
    const file=input?.files?.[0];
    if(!file)throw new Error('영상을 먼저 업로드하세요');
    status('영상 업로드 중...');
    const duration=await probe(file);
    const r=await fetch('/api/video/upload',{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||`업로드 실패 HTTP ${r.status}`);
    uploaded={uploadId:j.uploadId,duration};
    return uploaded;
  }
  function readStyle(){
    const title={};
    const caption={};
    const v=id=>$(id)?.value;
    if(v('titleSize'))title.fontSize=+v('titleSize');
    if(v('titleAlign'))title.align=v('titleAlign');
    if(v('titleColorText'))title.color=v('titleColorText');
    if(v('highlightColorText'))title.highlightColor=v('highlightColorText');
    if(v('titleBgText'))title.backgroundColor=v('titleBgText');
    if(v('barHeight'))title.backgroundHeight=+v('barHeight');
    if(v('titleY'))title.y=+v('titleY');
    if(v('captionSize'))caption.fontSize=+v('captionSize');
    if(v('captionAlign'))caption.align=v('captionAlign');
    if(v('captionColorText'))caption.color=v('captionColorText');
    if(v('strokeColorText'))caption.strokeColor=v('strokeColorText');
    if(v('strokeWidth'))caption.strokeWidth=+v('strokeWidth');
    if(v('captionBottom'))caption.bottom=+v('captionBottom');
    const top=$('igTopSpace'),bottom=$('igBottomSpace'),name=$('igChannelName'),handle=$('igHandle');
    if(top)title.backgroundHeight=+top.value;
    if(bottom)title.bottomSpace=+bottom.value;
    if(name)title.channelName=name.value;
    if(handle)title.handle=handle.value;
    title.socialHeader=true;
    return{title,caption};
  }
  function readCaptions(){
    const rows=[...document.querySelectorAll('#captionList .capRow')];
    if(rows.length)return rows.map(r=>({text:r.querySelector('[data-t]')?.value||'',start:+(r.querySelector('[data-s]')?.value||0),end:+(r.querySelector('[data-e]')?.value||0)})).filter(x=>x.text&&x.end>x.start);
    return [...document.querySelectorAll('#captions textarea')].map(x=>x.value).filter(Boolean);
  }
  async function save(){
    if(busy)return;
    busy=true;
    const b=$('simpleSaveBtn');if(b)b.disabled=true;
    try{
      const u=await ensureUpload();
      const title=$('veTitleText')?.value||$('title')?.value||'';
      if(!title.trim())throw new Error('제목을 입력하세요');
      status('수정본 만드는 중...');
      const body={uploadId:u.uploadId,duration:u.duration,title,captions:readCaptions(),style:readStyle(),target:$('target')?.value||'ja'};
      const r=await fetch('/api/render-uploaded',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||`렌더 실패 HTTP ${r.status}`);
      status('완료 · 다운로드 시작');
      window.location.assign(j.downloadUrl);
    }catch(e){status('실패: '+e.message);alert(e.message)}finally{busy=false;if(b)b.disabled=false}
  }
  function mount(){
    const render=$('renderBtn');if(!render)return setTimeout(mount,150);
    let b=$('simpleSaveBtn');
    if(!b){b=document.createElement('button');b.id='simpleSaveBtn';b.type='button';b.className='secondary';render.insertAdjacentElement('afterend',b)}
    b.textContent='⬇ 수정본 저장';b.onclick=save;
    $('directVideoFile')?.addEventListener('change',()=>{uploaded=null},true);
  }
  mount();
})();