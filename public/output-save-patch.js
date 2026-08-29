(()=>{
  const $=id=>document.getElementById(id);
  let last={video:null,thumb:null};
  async function saveUrl(url,name){
    if(!url)return alert('먼저 렌더하거나 썸네일을 만들어 주세요');
    try{
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const blob=await r.blob();
      const a=document.createElement('a');
      const u=URL.createObjectURL(blob);
      a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(u),1500);
    }catch(e){alert('저장 실패: '+e.message)}
  }
  function mount(){
    const render=$('renderBtn'),thumb=$('thumbBtn');
    if(!render||!thumb)return setTimeout(mount,150);
    if(!$('saveVideoBtn')){
      const b=document.createElement('button');b.id='saveVideoBtn';b.type='button';b.className='secondary';b.textContent='⬇ 영상 저장';b.disabled=true;
      render.insertAdjacentElement('afterend',b);b.onclick=()=>saveUrl(last.video,'m3-short.mp4');
    }
    if(!$('saveThumbBtn')){
      const b=document.createElement('button');b.id='saveThumbBtn';b.type='button';b.className='secondary';b.textContent='⬇ 썸네일 저장';b.disabled=true;
      thumb.insertAdjacentElement('afterend',b);b.onclick=()=>saveUrl(last.thumb,'m3-thumbnail.jpg');
    }
    const box=$('resultBox');
    if(box&&!box.dataset.saveWatch){
      box.dataset.saveWatch='1';
      const scan=()=>{
        for(const a of box.querySelectorAll('a[href]')){
          const h=a.getAttribute('href')||'';
          if(/\/renders\/[^?]+\.mp4(?:\?|$)/i.test(h)){last.video=h;const b=$('saveVideoBtn');if(b)b.disabled=false}
          if(/\/renders\/[^?]+\.(?:jpg|jpeg|png)(?:\?|$)/i.test(h)){last.thumb=h;const b=$('saveThumbBtn');if(b)b.disabled=false}
        }
      };
      new MutationObserver(scan).observe(box,{childList:true,subtree:true});scan();
    }
  }
  mount();
})();