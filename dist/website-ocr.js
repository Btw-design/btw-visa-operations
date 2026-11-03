// Original bytes go to the same-origin website, never to an external OCR API.
export async function websiteOcrConfig(fetchImpl=fetch){
 const response=await fetchImpl('/api/ocr/config',{cache:'no-store',credentials:'same-origin'});
 if(response.status===404)return {mode:'browser',engine:'Tesseract.js',uploadsToServer:false};
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Could not check the website reader. Sign in again or contact the administrator.');
 const config=await response.json();
 if(!['browser','paddle'].includes(config.mode))throw Error('The website reader configuration is invalid.');
 return config;
}

export async function readWebsitePassport(files,fetchImpl=fetch){
 const body=new FormData();for(const file of files)body.append('files',file);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
 try{
  const response=await fetchImpl('/api/ocr/passport',{method:'POST',body,credentials:'same-origin',signal:controller.signal});
  let result;try{result=await response.json();}catch{throw Error('The website OCR server did not return a document result. Sign in again or contact the administrator.');}
  if(!response.ok)throw Error(result.error||'The website OCR server could not read this document.');
  if(result.engine!=='PaddleOCR'||!result.fields||typeof result.fields!=='object'||Array.isArray(result.fields))throw Error('The website OCR result is invalid.');
  return result;
 }catch(e){if(e.name==='AbortError')throw Error('Website OCR timed out. Try fewer pages or a smaller scan.');throw e;}
 finally{clearTimeout(timer);}
}
