(()=>{
  const $=id=>document.getElementById(id);
  let clip=null,analysis=null,localUrl='';
  function wait(){
    const input=$('directVideoFile'),an=$('analyzeVideoBtn');
    if(!input||!an)return setTimeout(wait,150);
    bind(input,an);
  }
  function status(t){const n=$('directVideoStatus');if(n)n.textContent=t}
  function astatus(t){const n=$('analysisStatus');if(n)n.textContent=t}
  function probe(file){return new Promise(resolve=>{const v=document.createElement('video'),u=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{const d=Number(v.duration)||5;URL.revokeObjectURL(u);resolve(d)};v.onerror=()=>{URL.revokeObjectURL(u);resolve(5)};v.src=u})}
  async function doUpload(file){
    if(!file)return;
    status('업로드 중...');
    try{
      const duration=await probe(file);
      const r=await fetch('/api/video/upload',{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);
      clip={downloadUrl:j.downloadUrl,url:j.url,uploadId:j.uploadId,duration};
      if(localUrl)URL.revokeObjectURL(localUrl);
      localUrl=URL.createObjectURL(file);
      const pv=$('previewVideo');if(pv){pv.src=localUrl;pv.load()}
      status(`업로드 완료 · ${file.name} · ${duration.toFixed(1)}초`);
    }catch(e){clip=null;status('업로드 실패 · '+e.message)}
  }
  async function doAnalyze(){
    if(!clip){alert('영상을 먼저 업로드하세요');return}
    astatus('영상 분석 중...');
    try{
      const r=await fetch('/api/video/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uploadId:clip.uploadId,downloadUrl:clip.downloadUrl,duration:clip.duration})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);
      analysis=j;astatus(`${j.sceneSummary||''}${j.viralAngle?' · '+j.viralAngle:''}`);
      apply($('target')?.value==='en'?'en':'ja');
    }catch(e){astatus('분석 실패 · '+e.message)}
  }
  function rows(){return [...document.querySelectorAll('#captionList .capRow')]}
  function apply(lang){
    const p=analysis?.[lang];if(!p)return;
    const t=$('veTitleText');if(t){t.value=p.titles?.[0]||'';t.dispatchEvent(new Event('input',{bubbles:true}))}
    const caps=Array.isArray(p.captions)?p.captions:[];let rs=rows();
    while(rs.length<caps.length&&$('addCaptionRow')){$('addCaptionRow').click();rs=rows()}
    while(rs.length>caps.length&&rs.length){const d=rs.at(-1)?.querySelector('[data-x]');if(!d)break;d.click();rs=rows()}
    rs=rows();caps.forEach((c,i)=>{const r=rs[i];if(!r)return;const tx=r.querySelector('[data-t]'),s=r.querySelector('[data-s]'),e=r.querySelector('[data-e]');if(tx){tx.value=String(c.text||'');tx.dispatchEvent(new Event('input',{bubbles:true}))}if(s){s.value=Number(c.start||0).toFixed(1);s.dispatchEvent(new Event('input',{bubbles:true}))}if(e){e.value=Number(c.end||0).toFixed(1);e.dispatchEvent(new Event('input',{bubbles:true}))}});
    $('previewVideo')?.dispatchEvent(new Event('timeupdate'));
  }
  function bind(input,an){
    input.addEventListener('change',e=>{e.stopImmediatePropagation();doUpload(e.target.files?.[0])},true);
    an.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();doAnalyze()},true);
    $('applyJaBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();apply('ja')},true);
    $('applyEnBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();apply('en')},true);
    const original=window.fetch.bind(window);
    window.fetch=async(inputArg,init)=>{try{const u=typeof inputArg==='string'?inputArg:String(inputArg?.url||'');if(clip&&(u.includes('/api/render')||u.includes('/api/thumbnail'))&&init?.body){const d=JSON.parse(init.body);if(u.includes('/api/render'))d.clips=[clip];else d.clip=clip;init={...init,body:JSON.stringify(d)}}}catch{}return original(inputArg,init)};
    if(input.files?.[0])doUpload(input.files[0]);
  }
  wait();
})();
