(()=>{
  const $=id=>document.getElementById(id);
  let profile={url:'',path:''};
  function mount(){
    if($('socialHeaderSettings'))return;
    const styleTitle=[...document.querySelectorAll('h2')].find(x=>x.textContent.includes('스타일 편집'));
    if(!styleTitle)return setTimeout(mount,200);
    const box=document.createElement('div');
    box.id='socialHeaderSettings';
    box.innerHTML=`<div class="divider"></div><h2>📱 인스타형 프로필 헤더</h2><div class="help">레퍼런스처럼 흰색 상단에 프로필 사진 · 계정명 · @아이디 · 굵은 일본어 제목을 배치합니다. 썸네일에서 잘리지 않도록 좌우 안전여백을 고정합니다.</div><div class="styleGrid"><div class="control"><label>프로필 사진</label><input id="socialProfileFile" type="file" accept="image/*"><div id="socialProfileStatus" class="small">사진을 선택하세요</div></div><div class="control"><label>계정명</label><input id="socialChannelName" value="此処ではない何処か" maxlength="40"></div><div class="control"><label>@아이디</label><input id="socialHandle" value="@kokodewanai_dokoka" maxlength="50"></div><div class="control"><label>썸네일 안전영역</label><label style="display:flex;align-items:center;gap:8px;justify-content:flex-start"><input id="socialSafeMode" type="checkbox" checked style="width:auto"> 좌우 70px + 상단 여백 고정</label></div></div>`;
    styleTitle.parentNode.insertBefore(box,styleTitle);
    addPreview();bind();syncPreview();
  }
  function addPreview(){
    const preview=$('previewTitle')?.parentNode;if(!preview||$('socialPreview'))return;
    const row=document.createElement('div');row.id='socialPreview';row.style.cssText='height:48px;background:#fff;color:#111;display:flex;align-items:center;gap:8px;padding:7px 14px 0;font-family:"Noto Sans JP","Noto Sans CJK JP",sans-serif;flex:0 0 auto';
    row.innerHTML='<img id="socialPreviewImg" style="width:34px;height:34px;border-radius:50%;object-fit:cover;background:#ddd;display:none"><div style="min-width:0"><div id="socialPreviewName" style="font-weight:900;font-size:11px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div><div id="socialPreviewHandle" style="font-size:8px;color:#666;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div></div>';
    preview.insertBefore(row,$('previewTitle'));
  }
  function values(){return{channelName:$('socialChannelName')?.value.trim()||'此処ではない何処か',handle:$('socialHandle')?.value.trim()||'@kokodewanai_dokoka',safe:$('socialSafeMode')?.checked!==false,profileImageUrl:profile.url,profileImagePath:profile.path}}
  function syncPreview(){const v=values();if($('socialPreviewName'))$('socialPreviewName').textContent=v.channelName;if($('socialPreviewHandle'))$('socialPreviewHandle').textContent=v.handle;const img=$('socialPreviewImg');if(img){img.src=v.profileImageUrl||'';img.style.display=v.profileImageUrl?'block':'none'}const t=$('previewTitle');if(t){t.style.background='#fff';t.style.color=$('titleColorText')?.value||'#080808';t.style.textAlign='left';t.style.justifyContent='flex-start';t.style.padding='8px 14px 12px';t.style.fontFamily='"Noto Sans JP","Noto Sans CJK JP",sans-serif';t.style.fontWeight='950';}const p=t?.parentNode;if(p)p.style.background='#fff';localStorage.setItem('m3SocialHeader',JSON.stringify(v))}
  async function uploadProfile(file){if(!file)return;const st=$('socialProfileStatus');st.textContent='프로필 사진 업로드 중…';try{const r=await fetch('/api/profile/upload',{method:'POST',headers:{'content-type':file.type||'image/jpeg','x-file-name':encodeURIComponent(file.name)},body:file});const j=await r.json();if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);profile={url:j.url||'',path:j.path||''};st.textContent='프로필 사진 적용 완료';syncPreview()}catch(e){st.textContent=`업로드 실패 · ${e.message}`}}
  function load(){try{const s=JSON.parse(localStorage.getItem('m3SocialHeader')||'null');if(!s)return;if(s.channelName)$('socialChannelName').value=s.channelName;if(s.handle)$('socialHandle').value=s.handle;if(s.safe===false)$('socialSafeMode').checked=false;profile={url:s.profileImageUrl||'',path:s.profileImagePath||''}}catch{}}
  function bind(){load();$('socialProfileFile').addEventListener('change',e=>uploadProfile(e.target.files?.[0]));['socialChannelName','socialHandle','socialSafeMode','titleColorText','highlightColorText'].forEach(id=>$(id)?.addEventListener('input',syncPreview));
    const original=window.fetch.bind(window);window.fetch=async(input,init)=>{try{const url=typeof input==='string'?input:String(input?.url||'');if((url.includes('/api/render')||url.includes('/api/thumbnail'))&&init?.body&&typeof init.body==='string'){const data=JSON.parse(init.body),v=values();data.style=data.style||{};data.style.title=data.style.title||{};Object.assign(data.style.title,{socialHeader:true,channelName:v.channelName,handle:v.handle,profileImagePath:v.profileImagePath,profileImageUrl:v.profileImageUrl});if(v.safe){data.style.title.align='left';data.style.title.backgroundColor='#FFFFFF';data.style.title.backgroundHeight=Math.max(390,Number(data.style.title.backgroundHeight)||430);data.style.title.y=Math.max(180,Number(data.style.title.y)||210);data.style.title.fontSize=Math.min(82,Number(data.style.title.fontSize)||72)}init={...init,body:JSON.stringify(data)}}}catch{}return original(input,init)};
  }
  mount();
})();