(()=>{
const $=id=>document.getElementById(id);
const BASE_W=1080,BASE_H=1920;
function n(id,f=0){const e=$(id),v=Number(e?.value);return Number.isFinite(v)?v:f}
function hex(id,f){return $(id)?.value||f}
function fontFamily(k){return String(k||'heavy').startsWith('serif')?'"Noto Serif CJK JP",serif':String(k)==='mono'?'"Noto Sans Mono CJK JP",monospace':'"Noto Sans CJK JP",sans-serif'}
function scale(){const p=$('previewVideo')?.closest('.preview');return (p?.getBoundingClientRect().width||270)/BASE_W}
function apply(){const p=$('previewVideo')?.closest('.preview'),title=$('previewTitle'),scene=$('previewVideo')?.closest('.scene'),cap=$('previewCaption');if(!p||!title||!scene||!cap)return;
 const s=scale(),ig=(()=>{try{return JSON.parse(localStorage.getItem('m3InstagramTemplate')||'{}')}catch{return{}}})();
 const top=n('igTopSpace',Number(ig.topSpace)||410),bottom=n('igBottomSpace',Number(ig.bottomSpace)||220),gap=n('igHeaderTopGap',Number(ig.headerTopGap)||60),headerH=120;
 p.style.setProperty('height',(BASE_H*s)+'px','important');p.style.setProperty('width',(BASE_W*s)+'px','important');
 const gp=$('igPreviewTopGap');if(gp)gp.style.setProperty('height',(gap*s)+'px','important');
 const h=$('igPreviewHeader');if(h)h.style.setProperty('height',(headerH*s)+'px','important');
 const titleH=Math.max(0,top-gap-headerH);title.style.setProperty('height',(titleH*s)+'px','important');title.style.setProperty('min-height',(titleH*s)+'px','important');title.style.setProperty('flex','0 0 '+(titleH*s)+'px','important');
 title.style.setProperty('font-size',(n('veTitleSize',72)*s)+'px','important');title.style.setProperty('line-height','1.0','important');title.style.setProperty('padding','0 '+(70*s)+'px','important');title.style.setProperty('box-sizing','border-box','important');title.style.setProperty('justify-content',n('titleY',210)>top?'flex-end':'flex-start','important');title.style.setProperty('font-family',fontFamily($('veTitleFont')?.value),'important');title.style.setProperty('-webkit-text-stroke',(n('veTitleStrokeWidth',0)*s)+'px '+hex('veTitleStroke','#000'),'important');const ts=n('veTitleShadowSize',0);title.style.setProperty('text-shadow',ts?`${ts*s}px ${ts*s}px ${ts*s}px ${hex('veTitleShadow','#000')}`:'none','important');
 const pb=$('igPreviewBottom');if(pb)pb.style.setProperty('height',(bottom*s)+'px','important');
 scene.style.setProperty('flex','0 0 '+((BASE_H-top-bottom)*s)+'px','important');scene.style.setProperty('height',((BASE_H-top-bottom)*s)+'px','important');
 cap.style.setProperty('font-size',(n('veCaptionSize',54)*s)+'px','important');cap.style.setProperty('font-family',fontFamily($('veCaptionFont')?.value),'important');cap.style.setProperty('-webkit-text-stroke',(n('veCaptionStrokeWidth',5)*s)+'px '+hex('veCaptionStroke','#000'),'important');const cs=n('veCaptionShadowSize',4);cap.style.setProperty('text-shadow',cs?`${cs*s}px ${cs*s}px ${cs*s}px ${hex('veCaptionShadow','#000')}`:'none','important');cap.style.setProperty('bottom',(n('veCaptionBottom',270)*s)+'px','important');
}
function bind(){const ids=['veTitleSize','veTitleFont','veTitleStrokeWidth','veTitleStroke','veTitleShadowSize','veTitleShadow','veCaptionSize','veCaptionFont','veCaptionStrokeWidth','veCaptionStroke','veCaptionShadowSize','veCaptionShadow','veCaptionBottom','igTopSpace','igBottomSpace','igHeaderTopGap','titleY'];for(const id of ids){const e=$(id);if(e&&!e.dataset.parityBound){e.dataset.parityBound='1';e.addEventListener('input',()=>requestAnimationFrame(apply));e.addEventListener('change',()=>requestAnimationFrame(apply))}}}
function tick(){bind();apply()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{tick();setInterval(tick,700)},{once:true});else{tick();setInterval(tick,700)}addEventListener('resize',apply);
})();