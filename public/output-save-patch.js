(()=>{
  const $=id=>document.getElementById(id);
  function saveLatest(type){window.location.assign('/api/download/latest?type='+(type==='thumb'?'thumb':'video'))}
  function mount(){
    const render=$('renderBtn'),thumb=$('thumbBtn');
    if(!render||!thumb)return setTimeout(mount,150);
    let vb=$('saveVideoBtn');
    if(!vb){vb=document.createElement('button');vb.id='saveVideoBtn';vb.type='button';vb.className='secondary';render.insertAdjacentElement('afterend',vb)}
    vb.textContent='⬇ 수정본 저장';vb.disabled=false;vb.onclick=()=>saveLatest('video');
    let tb=$('saveThumbBtn');
    if(!tb){tb=document.createElement('button');tb.id='saveThumbBtn';tb.type='button';tb.className='secondary';thumb.insertAdjacentElement('afterend',tb)}
    tb.textContent='⬇ 썸네일 저장';tb.disabled=false;tb.onclick=()=>saveLatest('thumb');
  }
  mount();
})();