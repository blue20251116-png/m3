(()=>{
  const $=id=>document.getElementById(id);
  let last={video:null,thumb:null};
  function enable(type,url){if(!url)return;last[type]=url;const b=$(type==='video'?'saveVideoBtn':'saveThumbBtn');if(b)b.disabled=false}
  async function saveUrl(url,name){
    if(!url)return alert('먼저 수정본을 렌더해 주세요');
    try{
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const blob=await r.blob();
      if(!blob.size)throw new Error('빈 파일입니다');
      const a=document.createElement('a'),u=URL.createObjectURL(blob);
      a.href=u;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(u),5000);
    }catch(e){
      try{const a=document.createElement('a');a.href=url;a.download=name;a.target='_blank';document.body.appendChild(a);a.click();a.remove()}catch{}
      alert('자동 저장이 막히면 새로 열린 영상에서 저장해 주세요');
    }
  }
  function mount(){
    const render=$('renderBtn'),thumb=$('thumbBtn');
    if(!render||!thumb)return setTimeout(mount,150);
    if(!$('saveVideoBtn')){const b=document.createElement('button');b.id='saveVideoBtn';b.type='button';b.className='secondary';b.textContent='⬇ 수정본 저장';b.disabled=true;render.insertAdjacentElement('afterend',b);b.onclick=()=>saveUrl(last.video,'m3-edited-short.mp4')}
    if(!$('saveThumbBtn')){const b=document.createElement('button');b.id='saveThumbBtn';b.type='button';b.className='secondary';b.textContent='⬇ 썸네일 저장';b.disabled=true;thumb.insertAdjacentElement('afterend',b);b.onclick=()=>saveUrl(last.thumb,'m3-thumbnail.jpg')}
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