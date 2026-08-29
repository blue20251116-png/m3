(()=>{
  const $=id=>document.getElementById(id);
  function mount(){
    const render=$('renderBtn');
    if(!render)return setTimeout(mount,150);
    if($('simpleSaveBtn'))return;
    const b=document.createElement('button');
    b.id='simpleSaveBtn';
    b.type='button';
    b.className='secondary';
    b.textContent='⬇ 수정본 저장';
    render.insertAdjacentElement('afterend',b);
    b.onclick=()=>{
      const direct=$('directRenderDownload');
      if(!direct?.href){alert('먼저 렌더해 주세요');return}
      window.location.href=direct.href;
    };
  }
  mount();
})();