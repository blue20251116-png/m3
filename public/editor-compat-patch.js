(()=>{
  const $=id=>document.getElementById(id);
  const hex=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).toUpperCase():null;
  function setVal(id,v){const el=$(id);if(!el||v==null)return;el.value=String(v)}
  function mount(){
    const tf=$('veTitleFont'),cf=$('veCaptionFont');
    if(!tf||!cf)return setTimeout(mount,180);
    const options=`<option value="heavy">쇼츠 고딕 굵게</option><option value="clean">깔끔한 고딕</option><option value="serif">명조체 굵게</option>`;
    const keepTitle=['heavy','clean','serif'].includes(tf.value)?tf.value:'heavy';
    const keepCaption=['heavy','clean','serif'].includes(cf.value)?cf.value:'heavy';
    tf.innerHTML=options;cf.innerHTML=options;tf.value=keepTitle;cf.value=keepCaption;

    const refreshCaption=()=>{const v=$('previewVideo');if(v)v.dispatchEvent(new Event('timeupdate'))};
    const refreshTitle=()=>{const t=$('veTitleText');if(t)t.dispatchEvent(new Event('input',{bubbles:true}))};

    function mirrorEditorToLegacy(){
      const tc=hex($('veTitleColor')?.value)||'#080808';
      const cc=hex($('veCaptionColor')?.value)||'#FFFFFF';
      const sc=hex($('veCaptionStroke')?.value)||'#000000';
      setVal('titleColorText',tc);setVal('titleColor',tc.toLowerCase());
      setVal('captionColorText',cc);setVal('captionColor',cc.toLowerCase());
      setVal('strokeColorText',sc);setVal('strokeColor',sc.toLowerCase());
      setVal('titleSize',$('veTitleSize')?.value||72);
      setVal('captionSize',$('veCaptionSize')?.value||54);
      setVal('strokeWidth',$('veCaptionStrokeWidth')?.value||0);
      setVal('captionBottom',$('veCaptionBottom')?.value||270);
      const top=$('igTopSpace')?.value;
      if(top)setVal('barHeight',top);
    }

    function enforcePreview(){
      mirrorEditorToLegacy();
      const c=$('previewCaption');
      if(c){
        const color=hex($('veCaptionColor')?.value)||'#FFFFFF';
        const stroke=hex($('veCaptionStroke')?.value)||'#000000';
        const sw=Math.max(0,+$('veCaptionStrokeWidth')?.value||0);
        const shadow=hex($('veCaptionShadow')?.value)||'#000000';
        const sh=Math.max(0,+$('veCaptionShadowSize')?.value||0);
        c.style.setProperty('color',color,'important');
        c.style.setProperty('-webkit-text-stroke',`${Math.max(0,sw*.28)}px ${stroke}`,'important');
        c.style.setProperty('text-shadow',sh?`${Math.max(1,sh*.35)}px ${Math.max(1,sh*.35)}px ${Math.max(1,sh*.7)}px ${shadow}`:'none','important');
        c.style.setProperty('font-size',`${Math.max(10,Math.round((+$('veCaptionSize')?.value||54)*.38))}px`,'important');
        c.style.setProperty('bottom',`${Math.round((+$('veCaptionBottom')?.value||270)*.18)}px`,'important');
      }
      const t=$('previewTitle');
      if(t){
        const color=hex($('veTitleColor')?.value)||'#080808';
        const stroke=hex($('veTitleStroke')?.value)||'#000000';
        const sw=Math.max(0,+$('veTitleStrokeWidth')?.value||0);
        const shadow=hex($('veTitleShadow')?.value)||'#000000';
        const sh=Math.max(0,+$('veTitleShadowSize')?.value||0);
        t.style.setProperty('color',color,'important');
        t.style.setProperty('background','#FFFFFF','important');
        t.style.setProperty('-webkit-text-stroke',`${Math.max(0,sw*.28)}px ${stroke}`,'important');
        t.style.setProperty('text-shadow',sh?`${Math.max(1,sh*.35)}px ${Math.max(1,sh*.35)}px ${Math.max(1,sh*.7)}px ${shadow}`:'none','important');
      }
    }

    const editorIds=['veTitleFont','veTitleSize','veTitleColor','veTitleStroke','veTitleStrokeWidth','veTitleShadow','veTitleShadowSize','veCaptionFont','veCaptionSize','veCaptionColor','veCaptionStroke','veCaptionStrokeWidth','veCaptionShadow','veCaptionShadowSize','veCaptionBottom','igTopSpace'];
    editorIds.forEach(id=>$(id)?.addEventListener('input',()=>{mirrorEditorToLegacy();setTimeout(enforcePreview,0);setTimeout(enforcePreview,60)}));
    $('captionList')?.addEventListener('input',()=>{setTimeout(refreshCaption,0);setTimeout(enforcePreview,0)});
    $('captionList')?.addEventListener('click',()=>{setTimeout(refreshCaption,0);setTimeout(enforcePreview,0)});
    ['applyJaBtn','applyEnBtn','aiApplyCaptions','applySelectionColor','clearSelectionColor'].forEach(id=>$(id)?.addEventListener('click',()=>{setTimeout(refreshCaption,30);setTimeout(enforcePreview,40)}));
    document.addEventListener('click',()=>setTimeout(enforcePreview,0));
    new MutationObserver(()=>{setTimeout(refreshCaption,0);setTimeout(enforcePreview,0)}).observe($('captionList'),{childList:true,subtree:true});

    tf.dispatchEvent(new Event('input',{bubbles:true}));
    cf.dispatchEvent(new Event('input',{bubbles:true}));
    mirrorEditorToLegacy();refreshCaption();enforcePreview();
    setInterval(enforcePreview,350);
  }
  mount();
})();