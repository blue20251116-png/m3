(()=>{
  const $=id=>document.getElementById(id);
  function mount(){const tf=$('veTitleFont'),cf=$('veCaptionFont');if(!tf||!cf)return setTimeout(mount,180);const options=`<option value="heavy">쇼츠 고딕 굵게</option><option value="clean">깔끔한 고딕</option><option value="serif">명조체 굵게</option>`;const keepTitle=['heavy','clean','serif'].includes(tf.value)?tf.value:'heavy',keepCaption=['heavy','clean','serif'].includes(cf.value)?cf.value:'heavy';tf.innerHTML=options;cf.innerHTML=options;tf.value=keepTitle;cf.value=keepCaption;tf.dispatchEvent(new Event('input',{bubbles:true}));cf.dispatchEvent(new Event('input',{bubbles:true}));
    const refresh=()=>{const v=$('previewVideo');if(v)v.dispatchEvent(new Event('timeupdate'))};
    $('captionList')?.addEventListener('input',()=>setTimeout(refresh,0));
    $('captionList')?.addEventListener('click',()=>setTimeout(refresh,0));
    $('applyJaBtn')?.addEventListener('click',()=>setTimeout(refresh,30));
    $('applyEnBtn')?.addEventListener('click',()=>setTimeout(refresh,30));
    $('aiApplyCaptions')?.addEventListener('click',()=>setTimeout(refresh,30));
    new MutationObserver(()=>setTimeout(refresh,0)).observe($('captionList'),{childList:true,subtree:true});
    refresh();
  }
  mount();
})();