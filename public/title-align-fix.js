(()=>{
  const $=id=>document.getElementById(id);
  function mount(){
    const titleFont=$('veTitleFont');
    if(!titleFont)return setTimeout(mount,180);
    if(!$('veTitleAlign')){
      const wrap=document.createElement('div');
      wrap.className='veControl';
      wrap.innerHTML='<label>제목 정렬</label><select id="veTitleAlign"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select>';
      const grid=titleFont.closest('.veGrid');
      if(grid)grid.insertBefore(wrap,titleFont.closest('.veControl')?.nextSibling||grid.firstChild);
    }
    const sel=$('veTitleAlign');
    const legacy=$('titleAlign');
    const saved=localStorage.getItem('m3TitleAlign')||legacy?.value||'left';
    sel.value=['left','center','right'].includes(saved)?saved:'left';
    function apply(){
      const a=sel.value;
      if(legacy)legacy.value=a;
      const p=$('previewTitle');
      if(p){
        p.style.setProperty('text-align',a,'important');
        p.style.setProperty('justify-content',a==='left'?'flex-start':a==='right'?'flex-end':'center','important');
        p.style.setProperty('align-items','flex-start','important');
        p.style.setProperty('width','100%','important');
      }
      const ta=$('veTitleText');
      if(ta)ta.style.textAlign=a;
      localStorage.setItem('m3TitleAlign',a);
    }
    sel.addEventListener('input',apply);
    sel.addEventListener('change',apply);
    apply();
    if(!window.__m3TitleAlignFetch){
      window.__m3TitleAlignFetch=true;
      const original=window.fetch.bind(window);
      window.fetch=async(input,init)=>{
        try{
          const u=typeof input==='string'?input:String(input?.url||'');
          if((u.includes('/api/render')||u.includes('/api/thumbnail'))&&init?.body){
            const d=JSON.parse(init.body);
            d.style=d.style||{};
            d.style.title=d.style.title||{};
            d.style.title.align=$('veTitleAlign')?.value||localStorage.getItem('m3TitleAlign')||'left';
            init={...init,body:JSON.stringify(d)};
          }
        }catch{}
        return original(input,init);
      };
    }
    new MutationObserver(apply).observe($('previewTitle'),{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
