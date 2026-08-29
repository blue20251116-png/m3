(()=>{
  const $=id=>document.getElementById(id);
  let last={video:null,thumb:null};
  function enable(type,url){if(!url)return;last[type]=url;const b=$(type==='video'?'saveVideoBtn':'saveThumbBtn');if(b){b.disabled=false;b.dataset.href=url}}
  function saveDirect(url){if(!url)return alert('먼저 수정본을 렌더해 주세요');window.location.href=url}
  function mount(){
    const render=$('renderBtn'),thumb=$('thumbBtn');
    if(!render||!thumb)return setTimeout(mount,150);
    if(!$('saveVideoBtn')){const b=document.createElement('button');b.id='saveVideoBtn';b.type='button';b.className='secondary';b.textContent='⬇ 수정본 저장';b.disabled=true;render.insertAdjacentElement('afterend',b);b.onclick=()=>saveDirect(last.video)}
    if(!$('saveThumbBtn')){const b=document.createElement('button');b.id='saveThumbBtn';b.type='button';b.className='secondary';b.textContent='⬇ 썸네일 저장';b.disabled=true;thumb.insertAdjacentElement('afterend',b);b.onclick=()=>saveDirect(last.thumb)}
  }
  function wrapFetch(){
    if(window.__m3OutputSaveWrapped)return;window.__m3OutputSaveWrapped=true;
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const u=typeof input==='string'?input:String(input?.url||'');
      const r=await original(input,init);
      if(r.ok&&(u.includes('/api/render')||u.includes('/api/thumbnail'))){
        try{const j=await r.clone().json();const dl=j?.downloadUrl||j?.url;if(dl){if(u.includes('/api/render'))enable('video',dl);else enable('thumb',dl)}}catch{}
      }
      return r
    }
  }
  wrapFetch();mount();
})();