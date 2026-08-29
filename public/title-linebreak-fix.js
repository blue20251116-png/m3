(()=>{
  const $=id=>document.getElementById(id);
  function mount(){
    const p=$('previewTitle');
    if(!p)return setTimeout(mount,150);
    const style=document.createElement('style');
    style.textContent=`#previewTitle.titlePreviewFix{display:block!important;white-space:pre-wrap!important;word-break:keep-all!important;overflow-wrap:normal!important;text-align:left!important}#previewTitle.titlePreviewFix br{display:block!important;content:""!important}`;
    document.head.appendChild(style);
    const refresh=()=>{
      const ta=$('veTitleText');
      if(!ta)return;
      const src=String(ta.value||'').replace(/\r/g,'');
      const runs=JSON.parse(localStorage.getItem('m3VisualEditorState')||'{}').titleRuns||[];
      const base=$('veTitleColor')?.value||'#080808';
      const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const colorAt=i=>{for(let n=runs.length-1;n>=0;n--){const r=runs[n];if(i>=r.start&&i<r.end)return r.color||base}return base};
      let html='',i=0;
      while(i<src.length){
        if(src[i]==='\n'){html+='<br>';i++;continue}
        const c=colorAt(i);let j=i+1;
        while(j<src.length&&src[j]!=='\n'&&colorAt(j)===c)j++;
        html+=`<span style="color:${c}">${esc(src.slice(i,j))}</span>`;i=j;
      }
      p.classList.add('titlePreviewFix');
      p.innerHTML=html||'<span style="color:#080808">タイトル</span>';
    };
    $('veTitleText')?.addEventListener('input',()=>setTimeout(refresh,0));
    $('applySelectionColor')?.addEventListener('click',()=>setTimeout(refresh,0));
    $('clearSelectionColor')?.addEventListener('click',()=>setTimeout(refresh,0));
    setInterval(refresh,500);
    refresh();
  }
  mount();
})();
