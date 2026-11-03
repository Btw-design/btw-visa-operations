/* Opt-in local OCR diagnostics. Enable with ?ocr_debug=1.
   Does not modify recognized text, parser decisions or form fields.
   No network requests, console logging or persistent storage. */
(()=>{
 if(new URLSearchParams(location.search).get('ocr_debug')!=='1')return;
 const records=[],fields=['given','surname','dob','sex','birthplace','birthstate','nationality','passport','issued','expiry','issueplace','issuecountry'];
 let output,runCount=0;
 const add=(entry)=>{
  records.push(entry);
  if(output)output.textContent=records.map((e,i)=>'Record '+(i+1)+' — '+e.stage+'\n'+JSON.stringify(e,null,2)).join('\n\n');
 };
 const show=()=>{
  if(document.getElementById('ocr-debug-panel'))return;
  const status=document.getElementById('status');
  if(!status)return;
  const box=document.createElement('details');box.id='ocr-debug-panel';
  box.style.cssText='margin:12px 0;border:2px solid #b45309;border-radius:9px;padding:12px;background:#fff8ed;color:#222;';
  const title=document.createElement('summary');title.textContent='OCR diagnostic (browser only — sensitive document text)';
  const help=document.createElement('p');help.textContent='Enabled only by ?ocr_debug=1. Data stays on this device. Do not share an unredacted report or passport details publicly.';
  help.style.cssText='font-size:12px;margin:10px 0;';
  const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Copy private diagnostic report';
  copy.onclick=()=>{const txt=JSON.stringify(records,null,2);if(!txt)return;navigator.clipboard?.writeText(txt).then(()=>{copy.textContent='Copied — contains personal data';}).catch(()=>{copy.textContent='Copy failed; select report below';});};
  const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='Clear report';
  clear.style.marginLeft='8px';clear.onclick=()=>{records.length=0;if(output)output.textContent='Cleared.';};
  output=document.createElement('pre');output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;background:white;border:1px solid #ddd;padding:9px;font-size:11px;';
  output.textContent='Waiting for Read passport details…';
  box.append(title,help,copy,clear,output);status.insertAdjacentElement('afterend',box);
  new MutationObserver(()=>{
   if(/^Read \d+ details\.|^Could not read document:|^Could not identify the details/.test(status.textContent||'')){
    const form=Object.fromEntries(fields.map(id=>[id,document.getElementById(id)?.value||'']));
    const last=records.at(-1);
    if(last?.stage==='form-result'&&JSON.stringify(last.form)===JSON.stringify(form))return;
    add({stage:'form-result',message:status.textContent,form});
   }
  }).observe(status,{childList:true,characterData:true,subtree:true});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
 const original=window.Tesseract?.createWorker;
 if(typeof original!=='function'){add({stage:'error',message:'Tesseract.createWorker unavailable at diagnostic initialization'});return;}
 window.Tesseract.createWorker=async function(...args){
  const worker=await original.apply(this,args);
  const recognize=worker.recognize.bind(worker);
  worker.recognize=async function(image,options,...rest){
   const pass=++runCount;const result=await recognize(image,options,...rest);
   const raw=result?.data?.text||'';
   const entry={stage:'tesseract-pass',pass,rectangle:options?.rectangle||null,raw};
   add(entry);
   import('./parser.js').then(m=>{entry.parsed=m.parsePassport(raw);if(output)output.textContent=records.map((e,i)=>'Record '+(i+1)+' — '+e.stage+'\n'+JSON.stringify(e,null,2)).join('\n\n');}).catch(err=>{entry.parserError=String(err);});
   return result;
  };
  return worker;
 };
})();
