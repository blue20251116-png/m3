(()=>{
  let lastUploadId='';
  const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:String(input?.url||'');
    if(url.includes('/api/video/analyze')&&init?.body){
      try{
        const body=JSON.parse(init.body);
        if(lastUploadId&&!body.uploadId)body.uploadId=lastUploadId;
        init={...init,body:JSON.stringify(body)};
      }catch{}
    }
    const res=await original(input,init);
    if(url.includes('/api/video/upload')&&res.ok){
      try{
        const data=await res.clone().json();
        if(data?.uploadId)lastUploadId=data.uploadId;
      }catch{}
    }
    return res;
  };
  window.addEventListener('pageshow',()=>{lastUploadId=''});
})();
