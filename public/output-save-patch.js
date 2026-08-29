(()=>{
  const $=id=>document.getElementById(id);
  let last={video:null,thumb:null};
  function enable(type,url){if(!url)return;last[type]=url;const b=$(type==='video'?'saveVideoBtn':'saveThumbBtn');if(b)b.disabled=false}
  function fileFromUrl(url){try{const u=new URL(url,location.origin);return decodeURIComponent(u.pathname.split('/').pop()||'')}catch{return String(url||'').split('/').pop().split('?')[0]}}
  function saveDirect(url){
    if(!url)return alert('먼저 수정본을 렌더해 주세요');
    const file=fileFromUrl(url);
    if(!file)return alert('저장할 파일을 찾지 못했습니다');
    const a=document.createElement('a');
    a.href='/api/download?file='+encodeURIComponent(file);
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function mount(){
    const render=$('renderBtn'),thumb=$('thumbBtn');
    if(!render||!thumb)return setTimeout(mount,150);
    if(!$('saveVideoBtn')){const b=document.createElement('button');b.id='saveVideoBtn';b.type='button';b.className='secondary';b.textContent='⬇ 수정본 저장';b.disabled=true;render.insertAdjacentElement('afterend',b);b.onclick=()=>saveDirect(last.video)}
    if(!$('saveThumbBtn')){const b=document.createElement('button');b.id='saveThumbBtn';b.type='button';b.className='secondary';b.textContent='⬇ 썸네일 저장';b.disabled=true;thumb.insertAdjacentElement('afterend',b);b.onclick=()=>saveDirect(last.thumb)}
    const box=$('resultBox');
    if(box&&!box.dataset.saveWatch){box.dataset.saveWatch='1';const scan=()=>{for(const a of box.querySelectorAll('a[href]')){const h=a.getAttribute('href')||'';if(/\/renders\/[^?]+\.mp4(?:\?|$)/i.test(h))enable('video',h);if(/\/renders\/[^?]+\.(?:jpg|jpeg|png)(?:\?|$)/i.test(h))enable('thumb',h)}};new MutationObserver(scan).observe(box,{childList:true,subtree:true,attributes:true});scan()}
  }
  function wrapFetch(){
    if(window.__m3OutputSaveWrapped)return;window.__m3OutputSaveWrapped=true;
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const u=typeof input==='string'?input:String(input?.url||'');
      const r=await original(input,init);
      if(r.ok&&(u.includes('/api/render')||u.includes('/api/thumbnail'))){
        try{const j=await r.clone().json();if(j?.url){if(u.includes('/api/render'))enable('video',j.url);else enable('thumb',j.url)}}catch{}
      }
      return r
    }
  }
  wrapFetch();mount();
})();