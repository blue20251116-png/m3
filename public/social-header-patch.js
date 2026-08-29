(()=>{
  const $=id=>document.getElementById(id);
  let profile={url:'',path:''};
  let uploadedClip=null;
  let localVideoUrl='';
  let wordColors=[];
  let captionTimings=[];
  const palette=['#F4008A','#FF8A00','#FFD600','#22C55E','#3B82F6','#A855F7','#FFFFFF'];

  function mount(){
    if($('socialHeaderSettings'))return;
    const styleTitle=[...document.querySelectorAll('h2')].find(x=>x.textContent.includes('스타일 편집'));
    if(!styleTitle)return setTimeout(mount,200);
    installStickyPreview();
    const videoPanel=[...document.querySelectorAll('.panel')].find(x=>x.querySelector('h2')?.textContent.includes('영상 후보'));
    if(videoPanel&&!$('directVideoUpload')){
      const up=document.createElement('div');up.id='directVideoUpload';up.style.marginBottom='14px';up.innerHTML=`<h3 style="margin:0 0 8px">📤 내 영상 직접 업로드</h3><div class="help">검색 영상 대신 직접 가진 MP4/MOV/WebM을 넣어 편집할 수 있습니다.</div><div class="styleGrid"><div class="control"><label>영상 파일</label><input id="directVideoFile" type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"></div><div class="control"><label>상태</label><div id="directVideoStatus" class="small">영상 파일을 선택하세요</div><button id="directVideoClear" class="secondary" type="button" style="margin-top:8px">업로드 영상 해제</button></div></div>`;
      videoPanel.insertBefore(up,videoPanel.children[1]||null);
    }
    const box=document.createElement('div');
    box.id='socialHeaderSettings';
    box.innerHTML=`<div class="divider"></div><h2>📱 인스타형 프로필 헤더</h2><div class="help">흰색 상단 영역은 고정됩니다. 제목을 입력해도 검은색으로 바뀌지 않습니다.</div><div class="styleGrid"><div class="control"><label>프로필 사진</label><input id="socialProfileFile" type="file" accept="image/*"><div id="socialProfileStatus" class="small">사진을 선택하세요</div></div><div class="control"><label>계정명</label><input id="socialChannelName" value="此処ではない何処か" maxlength="40"></div><div class="control"><label>@아이디</label><input id="socialHandle" value="@kokodewanai_dokoka" maxlength="50"></div><div class="control"><label>썸네일 안전영역</label><label style="display:flex;align-items:center;gap:8px;justify-content:flex-start"><input id="socialSafeMode" type="checkbox" checked style="width:auto"> 좌우 70px + 상단 여백 고정</label></div><div class="control"><label>일본어 제목 글꼴</label><select id="socialFont"><option value="sans">Noto Sans CJK JP Bold</option><option value="serif">Noto Serif CJK JP Bold</option></select></div></div><div class="divider"></div><h3>🎨 단어별 강조색</h3><div class="help">제목 전체를 바꾸지 않고 원하는 단어나 문구만 따로 색칠합니다. 예: 「エグい」만 핑크, 「待って」만 초록.</div><div id="wordColorRows"></div><button id="addWordColor" class="secondary" type="button">+ 강조 단어 추가</button>`;
    styleTitle.parentNode.insertBefore(box,styleTitle);
    addCaptionTimingPanel();
    addPreview();
    bind();
    load();
    renderWordColorRows();
    rebuildCaptionTimings(true);
    syncPreview();
    enforceWhiteHeader();
  }

  function installStickyPreview(){
    if($('m3StickyPatch'))return;
    const s=document.createElement('style');s.id='m3StickyPatch';s.textContent=`.previewWrap{position:sticky!important;top:16px!important;align-self:start!important;z-index:20!important}.preview{box-shadow:0 18px 50px rgba(0,0,0,.38)}#captionTimingRows{display:grid;gap:8px}.timingRow{display:grid;grid-template-columns:minmax(0,1fr) 88px 88px 62px;gap:8px;align-items:center}.timingRow input{min-width:0}.wordColorRow{display:grid;grid-template-columns:minmax(0,1fr) 70px 48px;gap:8px;margin:8px 0;align-items:center}@media(max-width:860px){.previewWrap{position:sticky!important;top:8px!important;z-index:20!important}.timingRow{grid-template-columns:1fr 70px 70px 50px}}`;
    document.head.appendChild(s);
  }

  function addPreview(){
    const preview=$('previewTitle')?.parentNode;if(!preview||$('socialPreview'))return;
    const row=document.createElement('div');row.id='socialPreview';row.style.cssText='height:48px;background:#fff;color:#111;display:flex;align-items:center;gap:8px;padding:7px 14px 0;font-family:"Noto Sans CJK JP",sans-serif;flex:0 0 auto';
    row.innerHTML='<img id="socialPreviewImg" style="width:34px;height:34px;border-radius:50%;object-fit:cover;background:#ddd;display:none"><div style="min-width:0"><div id="socialPreviewName" style="font-weight:900;font-size:11px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div><div id="socialPreviewHandle" style="font-size:8px;color:#666;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div></div>';
    preview.insertBefore(row,$('previewTitle'));
  }

  function addCaptionTimingPanel(){
    if($('captionTimingPanel'))return;
    const cap=$('captions');if(!cap)return;
    const panel=document.createElement('div');panel.id='captionTimingPanel';panel.innerHTML=`<div class="divider"></div><h2>⏱ 자막 타이밍 편집</h2><div class="help">각 자막이 몇 초부터 몇 초까지 나오는지 직접 설정합니다. ▶ 버튼을 누르면 해당 시작 시점으로 미리보기가 이동합니다.</div><div id="captionTimingRows"></div><button id="autoCaptionTiming" class="secondary" type="button" style="margin-top:8px">자동 균등 배치</button>`;
    cap.parentNode.insertBefore(panel,cap.nextSibling);
  }

  function values(){return{channelName:$('socialChannelName')?.value.trim()||'此処ではない何処か',handle:$('socialHandle')?.value.trim()||'@kokodewanai_dokoka',safe:$('socialSafeMode')?.checked!==false,profileImageUrl:profile.url,profileImagePath:profile.path,fontKey:$('socialFont')?.value||'sans'}}

  function enforceWhiteHeader(){
    const bgText=$('titleBgText'),bg=$('titleBg'),t=$('previewTitle'),scene=t?.parentNode;
    if(bgText&&bgText.value!=='#FFFFFF')bgText.value='#FFFFFF';
    if(bg&&bg.value.toLowerCase()!=='#ffffff')bg.value='#ffffff';
    if(t){t.style.setProperty('background','#fff','important');t.style.setProperty('color',$('titleColorText')?.value||'#080808');}
    if(scene)scene.style.setProperty('background','#fff','important');
  }

  function syncPreview(){
    const v=values();
    if($('socialPreviewName'))$('socialPreviewName').textContent=v.channelName;
    if($('socialPreviewHandle'))$('socialPreviewHandle').textContent=v.handle;
    const img=$('socialPreviewImg');if(img){img.src=v.profileImageUrl||'';img.style.display=v.profileImageUrl?'block':'none'}
    const t=$('previewTitle');if(t){t.style.textAlign='left';t.style.justifyContent='flex-start';t.style.padding='8px 14px 12px';t.style.fontFamily=v.fontKey==='serif'?'"Noto Serif CJK JP",serif':'"Noto Sans CJK JP",sans-serif';t.style.fontWeight='950';applyWordColorsToPreview()}
    localStorage.setItem('m3SocialHeader',JSON.stringify({...v,wordColors,captionTimings}));
    enforceWhiteHeader();
  }

  function applyWordColorsToPreview(){
    const root=$('previewTitle');if(!root)return;
    const raw=$('title')?.value||'';
    const base=$('titleColorText')?.value||'#080808';
    const highlight=$('highlightColorText')?.value||'#F4008A';
    let html=escapeHtml(raw).replace(/\{\{([\s\S]*?)\}\}/g,(_,x)=>`<span style="color:${highlight}">${x}</span>`).replace(/\n/g,'<br>');
    for(const r of wordColors.filter(x=>x.word)){const q=escapeRegExp(escapeHtml(r.word));html=html.replace(new RegExp(q,'g'),m=>`<span style="color:${r.color}">${m}</span>`)}
    root.innerHTML=html||'タイトル';root.style.color=base;
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

  function renderWordColorRows(){
    const root=$('wordColorRows');if(!root)return;root.innerHTML='';
    wordColors.forEach((r,i)=>{const row=document.createElement('div');row.className='wordColorRow';row.innerHTML=`<input data-wc-word="${i}" value="${escapeHtml(r.word||'')}" placeholder="강조할 단어/문구"><input data-wc-color="${i}" type="color" value="${r.color||palette[i%palette.length]}"><button data-wc-del="${i}" class="secondary" type="button">삭제</button>`;root.appendChild(row)});
    root.querySelectorAll('[data-wc-word]').forEach(x=>x.addEventListener('input',e=>{wordColors[+e.target.dataset.wcWord].word=e.target.value;syncPreview()}));
    root.querySelectorAll('[data-wc-color]').forEach(x=>x.addEventListener('input',e=>{wordColors[+e.target.dataset.wcColor].color=e.target.value;syncPreview()}));
    root.querySelectorAll('[data-wc-del]').forEach(x=>x.addEventListener('click',e=>{wordColors.splice(+e.target.dataset.wcDel,1);renderWordColorRows();syncPreview()}));
  }

  function captionTexts(){return [...document.querySelectorAll('#captions textarea')].map(x=>x.value.trim()).filter(Boolean)}
  function currentDuration(){const pv=$('previewVideo');const d=Number(uploadedClip?.duration)||Number(pv?.duration)||Number($('musicLength')?.value)||20;return Number.isFinite(d)&&d>0?d:20}
  function rebuildCaptionTimings(force=false){
    const texts=captionTexts(),duration=currentDuration();
    if(force||captionTimings.length!==texts.length||captionTimings.some((x,i)=>x.text!==texts[i])){const block=duration/Math.max(texts.length,1);captionTimings=texts.map((text,i)=>({text,start:+(i*block).toFixed(2),end:+Math.min(duration,(i+1)*block).toFixed(2)}))}
    renderCaptionTimingRows();
  }
  function renderCaptionTimingRows(){
    const root=$('captionTimingRows');if(!root)return;root.innerHTML='';
    captionTimings.forEach((r,i)=>{const row=document.createElement('div');row.className='timingRow';row.innerHTML=`<input data-ct-text="${i}" value="${escapeHtml(r.text)}"><input data-ct-start="${i}" type="number" min="0" step="0.1" value="${Number(r.start).toFixed(1)}" title="시작 초"><input data-ct-end="${i}" type="number" min="0" step="0.1" value="${Number(r.end).toFixed(1)}" title="끝 초"><button data-ct-seek="${i}" class="secondary" type="button">▶</button>`;root.appendChild(row)});
    root.querySelectorAll('[data-ct-text]').forEach(x=>x.addEventListener('input',e=>{captionTimings[+e.target.dataset.ctText].text=e.target.value;saveState()}));
    root.querySelectorAll('[data-ct-start]').forEach(x=>x.addEventListener('input',e=>{captionTimings[+e.target.dataset.ctStart].start=Math.max(0,Number(e.target.value)||0);saveState()}));
    root.querySelectorAll('[data-ct-end]').forEach(x=>x.addEventListener('input',e=>{captionTimings[+e.target.dataset.ctEnd].end=Math.max(0,Number(e.target.value)||0);saveState()}));
    root.querySelectorAll('[data-ct-seek]').forEach(x=>x.addEventListener('click',e=>{const r=captionTimings[+e.target.dataset.ctSeek],v=$('previewVideo');if(v&&r){v.currentTime=Math.min(Number(v.duration)||999,r.start);v.play().catch(()=>{})}}));
  }
  function saveState(){const v=values();localStorage.setItem('m3SocialHeader',JSON.stringify({...v,wordColors,captionTimings}))}
  function updateCaptionPreviewByTime(){const v=$('previewVideo'),box=$('previewCaption');if(!v||!box)return;const t=v.currentTime||0,r=captionTimings.find(x=>t>=x.start&&t<=x.end);if(r)box.textContent=r.text}

  async function uploadProfile(file){if(!file)return;const st=$('socialProfileStatus');st.textContent='프로필 사진 업로드 중…';try{const r=await fetch('/api/profile/upload',{method:'POST',headers:{'content-type':file.type||'image/jpeg','x-file-name':encodeURIComponent(file.name)},body:file});const j=await r.json();if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);profile={url:j.url||'',path:j.path||''};st.textContent='프로필 사진 적용 완료';syncPreview()}catch(e){st.textContent=`업로드 실패 · ${e.message}`}}
  function probeDuration(file){return new Promise(resolve=>{const v=document.createElement('video');const u=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{const d=Number(v.duration)||5;URL.revokeObjectURL(u);resolve(d)};v.onerror=()=>{URL.revokeObjectURL(u);resolve(5)};v.src=u})}
  async function uploadVideo(file){if(!file)return;const st=$('directVideoStatus');st.textContent='영상 업로드 중…';try{const duration=await probeDuration(file);const r=await fetch('/api/video/upload',{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file});const j=await r.json();if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);uploadedClip={downloadUrl:j.downloadUrl,duration,provider:'upload',creator:'내 영상'};if(localVideoUrl)URL.revokeObjectURL(localVideoUrl);localVideoUrl=URL.createObjectURL(file);const pv=$('previewVideo');if(pv){pv.src=localVideoUrl;pv.load();pv.play().catch(()=>{})}st.textContent=`적용 완료 · ${file.name} · ${duration.toFixed(1)}초`;localStorage.setItem('m3DirectVideoName',file.name);setTimeout(()=>rebuildCaptionTimings(true),100)}catch(e){uploadedClip=null;st.textContent=`업로드 실패 · ${e.message}`}}
  function clearVideo(){uploadedClip=null;if(localVideoUrl){URL.revokeObjectURL(localVideoUrl);localVideoUrl=''}if($('directVideoFile'))$('directVideoFile').value='';if($('directVideoStatus'))$('directVideoStatus').textContent='업로드 영상 해제됨 · 검색 영상을 사용합니다';localStorage.removeItem('m3DirectVideoName')}

  function styleFromDom(){const clean=(v,f)=>/^#[0-9A-Fa-f]{6}$/.test(String(v||''))?String(v):f;const v=values();const title={fontSize:Number($('titleSize')?.value)||72,color:clean($('titleColorText')?.value,'#080808'),highlightColor:clean($('highlightColorText')?.value,'#F4008A'),backgroundColor:'#FFFFFF',backgroundHeight:Number($('barHeight')?.value)||430,y:Number($('titleY')?.value)||210,align:$('titleAlign')?.value||'left',socialHeader:true,channelName:v.channelName,handle:v.handle,profileImagePath:v.profileImagePath,profileImageUrl:v.profileImageUrl,fontKey:v.fontKey,wordColors};if(v.safe){title.align='left';title.backgroundHeight=Math.max(390,title.backgroundHeight);title.y=Math.max(180,title.y);title.fontSize=Math.min(82,title.fontSize)}return{title,caption:{fontSize:Number($('captionSize')?.value)||46,color:clean($('captionColorText')?.value,'#FFE600'),strokeColor:clean($('strokeColorText')?.value,'#000000'),strokeWidth:Number($('strokeWidth')?.value)||5,bottom:Number($('captionBottom')?.value)||270,align:$('captionAlign')?.value||'center'}}}
  function timedCaptions(){if(!captionTimings.length)rebuildCaptionTimings(true);return captionTimings.map(x=>({text:x.text,start:Number(x.start)||0,end:Number(x.end)||0})).filter(x=>x.text&&x.end>x.start)}
  async function renderUploaded(){const status=$('status'),result=$('resultBox');status.textContent='업로드 영상 렌더링 중...';result.innerHTML='';const body={clips:[uploadedClip],title:$('title')?.value||'{{まるで別世界}}\n地球に実在する絶景',captions:timedCaptions(),style:styleFromDom(),target:$('target')?.value||'ja',music:null};const r=await fetch('/api/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);status.textContent=`완료 · ${j.duration}s`;result.innerHTML=`<a class="link" href="${j.url}" target="_blank">완성 영상 열기</a>`}
  async function thumbnailUploaded(){const status=$('status'),result=$('resultBox');status.textContent='업로드 영상 썸네일 생성 중...';const r=await fetch('/api/thumbnail',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clip:uploadedClip,title:$('title')?.value||'{{まるで別世界}}\n地球に実在する絶景',style:styleFromDom(),timestamp:1})}),j=await r.json();if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);status.textContent='썸네일 완료';result.innerHTML=`<a class="link" href="${j.url}" target="_blank">썸네일 열기</a><br><img src="${j.url}">`}

  function load(){try{const s=JSON.parse(localStorage.getItem('m3SocialHeader')||'null');if(!s)return;if(s.channelName)$('socialChannelName').value=s.channelName;if(s.handle)$('socialHandle').value=s.handle;if(s.safe===false)$('socialSafeMode').checked=false;if(s.fontKey)$('socialFont').value=s.fontKey;profile={url:s.profileImageUrl||'',path:s.profileImagePath||''};if(Array.isArray(s.wordColors))wordColors=s.wordColors;if(Array.isArray(s.captionTimings))captionTimings=s.captionTimings}catch{}}

  function bind(){
    $('socialProfileFile').addEventListener('change',e=>uploadProfile(e.target.files?.[0]));
    $('directVideoFile')?.addEventListener('change',e=>uploadVideo(e.target.files?.[0]));
    $('directVideoClear')?.addEventListener('click',clearVideo);
    $('addWordColor')?.addEventListener('click',()=>{wordColors.push({word:'',color:palette[wordColors.length%palette.length]});renderWordColorRows();syncPreview()});
    $('autoCaptionTiming')?.addEventListener('click',()=>rebuildCaptionTimings(true));
    ['socialChannelName','socialHandle','socialSafeMode','socialFont','titleColorText','highlightColorText'].forEach(id=>$(id)?.addEventListener('input',syncPreview));
    $('title')?.addEventListener('input',()=>requestAnimationFrame(()=>{syncPreview();enforceWhiteHeader()}));
    ['titleBgText','titleBg'].forEach(id=>$(id)?.addEventListener('input',()=>requestAnimationFrame(enforceWhiteHeader)));
    $('previewVideo')?.addEventListener('timeupdate',updateCaptionPreviewByTime);
    $('previewVideo')?.addEventListener('loadedmetadata',()=>rebuildCaptionTimings(false));
    const cap=$('captions');if(cap){new MutationObserver(()=>setTimeout(()=>rebuildCaptionTimings(false),20)).observe(cap,{childList:true,subtree:true});cap.addEventListener('input',()=>setTimeout(()=>rebuildCaptionTimings(false),0))}
    $('renderBtn')?.addEventListener('click',async e=>{if(!uploadedClip)return;e.preventDefault();e.stopImmediatePropagation();try{await renderUploaded()}catch(err){if($('status'))$('status').textContent='실패: '+err.message}},true);
    $('thumbBtn')?.addEventListener('click',async e=>{if(!uploadedClip)return;e.preventDefault();e.stopImmediatePropagation();try{await thumbnailUploaded()}catch(err){if($('status'))$('status').textContent='썸네일 실패: '+err.message}},true);
    const original=window.fetch.bind(window);window.fetch=async(input,init)=>{try{const url=typeof input==='string'?input:String(input?.url||'');if((url.includes('/api/render')||url.includes('/api/thumbnail'))&&init?.body&&typeof init.body==='string'){const data=JSON.parse(init.body),v=values();data.style=data.style||{};data.style.title=data.style.title||{};Object.assign(data.style.title,{socialHeader:true,channelName:v.channelName,handle:v.handle,profileImagePath:v.profileImagePath,profileImageUrl:v.profileImageUrl,fontKey:v.fontKey,wordColors,backgroundColor:'#FFFFFF'});if(url.includes('/api/render'))data.captions=timedCaptions();if(v.safe){data.style.title.align='left';data.style.title.backgroundHeight=Math.max(390,Number(data.style.title.backgroundHeight)||430);data.style.title.y=Math.max(180,Number(data.style.title.y)||210);data.style.title.fontSize=Math.min(82,Number(data.style.title.fontSize)||72)}init={...init,body:JSON.stringify(data)}}}catch{}return original(input,init)};
    setInterval(enforceWhiteHeader,600);
  }
  mount();
})();