import {parsePassport,passportNeedsRetry} from './parser.js';

function score(text){const p=parsePassport(text);return ['passport','given','surname','dob','issued','expiry','sex','nationality'].reduce((n,k)=>n+(p[k]?1:0),0);}
// One worker per read, bounded sequential retries. Nothing is uploaded or logged.
export async function recognizePassport(canvas,worker,onRetry=()=>{}){
 const run=async(surface,mode,whitelist='')=>{
  await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  return (await worker.recognize(surface,{rotateAuto:true})).data.text||'';
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
    const mrz=(result.data.text||'').split(/\r?\n/).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x)).join('\n');
    if(mrz)machineLines=mrz;
   }
  }
  attempts.sort((a,b)=>score(b)-score(a));
  // Other passes contribute MRZ candidates only, not conflicting labelled dates/names.
  const mrz=attempts.slice(1).flatMap(x=>x.split(/\r?\n/)).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x));
  return [attempts[0],...mrz,machineLines].filter(Boolean).join('\n');
 }finally{
  if(enhanced){enhanced.width=0;enhanced.height=0;}
  await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'0'});
 }
}
