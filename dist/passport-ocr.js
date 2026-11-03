import {parsePassport,passportNeedsRetry} from './parser.js';

function score(text){const p=parsePassport(text);return ['passport','given','surname','dob','issued','expiry','sex','nationality'].reduce((n,k)=>n+(p[k]?1:0),0);}
// Recover missing visual fields only when both passes identify the same passport.
// MRZ does not contain an issue date, so a better visual pass still matters.
function recoveredVisualFields(attempts){
 const parsed=attempts.map(parsePassport),primary=parsed[0],identity=['passport','dob','expiry'];
 if(identity.some(k=>!primary[k]))return '';
 if(parsed.some(p=>identity.some(k=>p[k]&&p[k]!==primary[k])))return '';
 const matching=parsed.filter(p=>identity.every(k=>p[k]===primary[k]));
 const labels={given:'Given Names',surname:'Surname',issued:'Date of Issue'};
 return Object.entries(labels).flatMap(([key,label])=>{
  if(primary[key])return [];
  const values=[...new Set(matching.map(p=>p[key]).filter(Boolean))];
  if(values.length!==1)return [];
  const value=key==='issued'?values[0].split('-').reverse().join('/'):values[0];
  return [`${label}: ${value}`];
 }).join('\n');
}
// One worker per read, bounded sequential retries. Nothing is uploaded or logged.
export async function recognizePassport(canvas,worker,onRetry=()=>{}){
 const run=async(surface,mode,whitelist='',rectangle)=>{
  await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  return (await worker.recognize(surface,rectangle?{rectangle}:{rotateAuto:true})).data.text||'';
 };
 const attempts=[];let enhanced,machineLines='';
 try{
  attempts.push(await run(canvas,'3'));
  if(passportNeedsRetry(attempts[0])){
   onRetry('Checking passport again with enhanced contrast…');
   enhanced=document.createElement('canvas');enhanced.width=canvas.width;enhanced.height=canvas.height;
   const ctx=enhanced.getContext('2d');ctx.filter='grayscale(1) contrast(1.35)';ctx.drawImage(canvas,0,0);
   attempts.push(await run(enhanced,'6'));
   if(attempts.every(passportNeedsRetry)){
    onRetry('Checking the machine-readable passport lines…');
    await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',preserve_interword_spaces:'0'});
    const result=await worker.recognize(enhanced,{rectangle:{left:0,top:Math.floor(canvas.height*.55),width:canvas.width,height:canvas.height-Math.floor(canvas.height*.55)}});
    // Keep this pass separate from visual labels; it is only a candidate MRZ.
    const mrz=(result.data.text||'').split(/\r?\n/).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x)).join('\n');
    if(mrz)machineLines=mrz;
   }
   // Landscape TD3 pages commonly place the photograph on the left and MRZ
   // at the bottom. Isolate the printed details when full-page OCR is weak.
   // Keep this as another candidate, never a replacement for the full page.
   const ratio=canvas.width/canvas.height;
   if(attempts.every(passportNeedsRetry)&&ratio>=1.1&&ratio<=1.8){
    onRetry('Checking the printed passport details…');
    const left=Math.floor(canvas.width*.30),top=Math.floor(canvas.height*.16),bottom=Math.ceil(canvas.height*.75);
    attempts.push(await run(enhanced,'6','',{left,top,width:canvas.width-left,height:bottom-top}));
   }
  }
  attempts.sort((a,b)=>score(b)-score(a));
  // Preserve MRZ candidates for conflict checks; fill missing visual fields only
  // from passes corroborated by all three identity fields.
  const mrz=attempts.slice(1).flatMap(x=>x.split(/\r?\n/)).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x));
  return [recoveredVisualFields(attempts),attempts[0],...mrz,machineLines].filter(Boolean).join('\n');
 }finally{
  if(enhanced){enhanced.width=0;enhanced.height=0;}
  await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'0'});
 }
}
