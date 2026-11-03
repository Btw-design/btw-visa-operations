import {createHash} from 'node:crypto';
import {parsePassport,passportWarnings} from '../dist/parser.js';
import {readPassportMrz} from '../dist/passport-mrz.js';
import {combinePassportPasses} from '../dist/passport-ocr.js';

const MAX_FILE=20*1024*1024,MAX_BODY=4*MAX_FILE+1024*1024;
const error=(status,message)=>Object.assign(new Error(message),{status});
const date=value=>value?value.split('-').reverse().join('-'):null;
export function passportJSON(p){
 return {given_name:p.given||null,surname:p.surname||null,date_of_birth:date(p.dob),sex:p.sex?.toUpperCase()||null,nationality:p.nationality||null,travel_document_type:p.documentType?.toUpperCase()||null,travel_document_number:p.passport||null,issue_date:date(p.issued),expiry_date:date(p.expiry),place_of_birth:[p.birthplace,p.birthstate].filter(Boolean).join(', ')||null,country_of_birth:p.birthcountry||null,state_of_birth:p.birthstate||null,place_of_issue:p.issueplace||null,country_of_issue:p.issuecountry||null};
}
function mrzOnly(text){return text.normalize('NFKC').toUpperCase().split(/\r?\n/).map(x=>x.replace(/[«‹＜]/g,'<').replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x)).join('\n');}
function mime(bytes){if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';if(bytes[0]===0xff&&bytes[1]===0xd8)return 'image/jpeg';if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';throw error(415,'Use valid PDF, JPG or PNG files.');}

export function createOcrGateway({url=process.env.PADDLE_OCR_URL||'',token=process.env.OCR_SERVICE_TOKEN||'',fetchImpl=globalThis.fetch}={}){
 let endpoint;
 if(url){
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('PADDLE_OCR_URL must be an HTTP(S) service origin.');
  if(!/^[A-Za-z0-9_-]{32,}$/.test(token))throw Error('Set OCR_SERVICE_TOKEN to a random URL-safe value of at least 32 characters.');
  endpoint=new URL('/ocr',parsed).href;
 }
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 return async function handle(req,res,path){
  if(path==='/api/ocr/config'&&req.method==='GET'){
   send(res,200,{mode:endpoint?'paddle':'browser',engine:endpoint?'PaddleOCR':'Tesseract.js',uploadsToServer:!!endpoint});return true;
  }
  if(path!=='/api/ocr/passport')return false;
  if(req.method!=='POST'){send(res,405,{error:'Method not allowed.'});return true;}
  if(!endpoint){send(res,503,{error:'PaddleOCR is not configured on this website. Contact the administrator.'});return true;}
  // Browser submissions must originate from this website. Authentication, when
  // enabled, is checked by the parent server before this handler is called.
  let origin;try{origin=new URL(req.headers.origin);}catch{send(res,403,{error:'Invalid request origin.'});return true;}
  if(origin.host!==req.headers.host){send(res,403,{error:'Invalid request origin.'});return true;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
  const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',disconnected);
  try{
   if(!String(req.headers['content-type']||'').startsWith('multipart/form-data;'))throw error(415,'Upload files using multipart form data.');
   const announced=Number(req.headers['content-length']);if(announced>MAX_BODY)throw error(413,'Select at most four files, each 20 MB or smaller.');
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw error(413,'Select at most four files, each 20 MB or smaller.');chunks.push(chunk);}
   let form;try{form=await new Request('http://localhost/upload',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();}catch{throw error(400,'Could not read the uploaded files.');}
   const files=form.getAll('files');
   if(!files.length||files.length>4||files.some(f=>typeof f.arrayBuffer!=='function'))throw error(400,'Select one to four passport files.');
   const texts=[],hashes=[],versions=new Set(),numbers=new Set();
   for(const file of files){
    if(!file.size||file.size>MAX_FILE)throw error(413,'Each file must contain data and be 20 MB or smaller.');
    const bytes=Buffer.from(await file.arrayBuffer()),inputHash=createHash('sha256').update(bytes).digest('hex');
    let response;try{response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':mime(bytes),Authorization:'Bearer '+token},body:bytes,signal:controller.signal});}catch(e){if(e.status)throw e;throw error(controller.signal.aborted?504:503,'The website OCR server is unavailable or timed out. Please try again.');}
    let result;try{result=await response.json();}catch{throw error(502,'The OCR server returned an invalid response.');}
    if(!response.ok)throw error(response.status===429?429:response.status===400?400:503,response.status===429?'The OCR server is busy. Try again shortly.':response.status===400?'Could not read this document. Use a valid, unlocked PDF, JPG or PNG.':'The website OCR server is unavailable. Contact the administrator.');
    if(result.engine!=='paddleocr'||result.input_sha256!==inputHash||typeof result.pipeline_version!=='string'||!Array.isArray(result.pages)||!result.pages.length||result.pages.length>6)throw error(502,'The OCR server returned an invalid document result.');
    versions.add(result.pipeline_version);hashes.push(inputHash);
    for(const page of result.pages){
     if(!Array.isArray(page.visual_texts)||!Array.isArray(page.mrz_texts)||page.visual_texts.length>4||page.mrz_texts.length>3||[...page.visual_texts,...page.mrz_texts].some(t=>typeof t!=='string'||t.length>50000))throw error(502,'The OCR server returned invalid page data.');
     const machine=page.mrz_texts.map(mrzOnly).filter(Boolean).join('\n'),text=combinePassportPasses(page.visual_texts,machine);
     texts.push(text);const parsed=parsePassport(text);if(parsed.passport)numbers.add(parsed.passport);
     // Inspect each checked number line as well as the combined result, so
     // conflicting valid MRZ candidates cannot hide a second applicant.
     for(const row of text.split(/\r?\n/)){const p=readPassportMrz(row);if(p.passport)numbers.add(p.passport);}
    }
   }
   if(versions.size!==1)throw error(503,'The OCR server version changed during this read. Please try again.');
   if(numbers.size>1)throw error(409,'Different passport numbers were found. Upload files for one applicant only.');
   texts.sort((a,b)=>Number(/^P</m.test(b))-Number(/^P</m.test(a)));
   const fields=parsePassport(texts.join('\n--- DOCUMENT PAGE ---\n'));
   send(res,200,{engine:'PaddleOCR',pipelineVersion:[...versions][0],inputHashes:hashes,fields,extraction:passportJSON(fields),warning:passportWarnings(fields)});
  }catch(e){if(!res.destroyed)send(res,e.status||500,{error:e.status?e.message:'Passport processing failed. Please try again.'});}
  finally{clearTimeout(timer);res.removeListener('close',disconnected);}
  return true;
 };
}
