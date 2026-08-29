(()=>{
  const $=id=>document.getElementById(id);
  const fonts=[
    ['heavy','Noto 고딕 Heavy','"Noto Sans CJK JP",sans-serif'],
    ['clean','Noto 고딕 Regular','"Noto Sans CJK JP",sans-serif'],
    ['serif','Noto 명조 Bold','"Noto Serif CJK JP",serif'],
    ['mplusBlack','M+ Black','"M PLUS 1", "Mplus 1", sans-serif'],
    ['mplusBold','M+ Bold','"M PLUS 1", "Mplus 1", sans-serif'],
    ['mplusRegular','M+ Regular','"M PLUS 1", "Mplus 1", sans-serif'],
    ['vlGothic','VL 고딕','"VL Gothic",sans-serif'],
    ['vlPGothic','VL P고딕','"VL PGothic",sans-serif'],
    ['bizGothic','BIZ UD 고딕','"BIZ UD Gothic",sans-serif'],
    ['bizPGothic','BIZ UDP 고딕','"BIZ UDPGothic",sans-serif'],
    ['bizMincho','BIZ UD 명조','"BIZ UDMincho",serif'],
    ['ipaGothic','IPA 고딕','"IPAGothic",sans-serif'],
    ['ipaPGothic','IPA P고딕','"IPAPGothic",sans-serif'],
    ['ipaMincho','IPA 명조','"IPAMincho",serif']
  ];
  function options(){return fonts.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}
  function cssFont(key){return fonts.find(x=>x[0]===key)?.[2]||'"Noto Sans CJK JP",sans-serif'}
  function mount(){
    const tf=$('veTitleFont'),cf=$('veCaptionFont');
    if(!tf||!cf)return setTimeout(mount,180);
    const oldT=localStorage.getItem('m3TitleFontChoice')||tf.value||'heavy';
    const oldC=localStorage.getItem('m3CaptionFontChoice')||cf.value||'heavy';
    tf.innerHTML=options();cf.innerHTML=options();
    tf.value=fonts.some(x=>x[0]===oldT)?oldT:'heavy';
    cf.value=fonts.some(x=>x[0]===oldC)?oldC:'heavy';
    const apply=()=>{
      const pt=$('previewTitle'),pc=$('previewCaption');
      if(pt)pt.style.fontFamily=cssFont(tf.value);
      if(pc)pc.style.fontFamily=cssFont(cf.value);
      localStorage.setItem('m3TitleFontChoice',tf.value);
      localStorage.setItem('m3CaptionFontChoice',cf.value);
    };
    tf.addEventListener('input',()=>{apply();tf.dispatchEvent(new Event('change',{bubbles:true}))});
    cf.addEventListener('input',()=>{apply();cf.dispatchEvent(new Event('change',{bubbles:true}))});
    new MutationObserver(apply).observe($('previewTitle'),{childList:true,subtree:true,attributes:true});
    new MutationObserver(apply).observe($('previewCaption'),{childList:true,subtree:true,attributes:true});
    apply();
  }
  mount();
})();
