(()=>{
  const $=id=>document.getElementById(id);
  function mount(){
    const t=$('target');if(!t)return setTimeout(mount,120);
    if(![...t.options].some(o=>o.value==='es')){
      const o=document.createElement('option');o.value='es';o.textContent='🇪🇸 스페인어권';t.appendChild(o);
    }
    const sync=()=>{const rtl=t.value==='ar';if($('previewTitle'))$('previewTitle').dir=rtl?'rtl':'ltr';if($('previewCaption'))$('previewCaption').dir=rtl?'rtl':'ltr'};
    t.addEventListener('change',sync);sync();
  }
  mount();
})();
