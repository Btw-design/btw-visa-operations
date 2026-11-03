import * as pdfjs from './vendor/pdf.min.mjs?v=27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c';
import {identifyDistrict} from './address.js?v=3a747d4404ba88a2e17ca483092b14ba305ea85ae4924ae3b86d7da82ed13f47';
import {parsePassport,passportNeedsRetry,passportWarnings} from './parser.js?v=3684b54660747a0f85433c14dfc8a3ac6c76161316cd6867f1ff49fd377ff7b3';
import {recognizePassport} from './passport-ocr.js?v=280a481901b6d5265dd7786572f5bdc1344c241129e52141c4993bddb365c768';
import {websiteOcrConfig,readWebsitePassport} from './website-ocr.js?v=653ab090c8369d8a097b14a708329cdf33ea0fdd3d9584a55c4c031e74478500';
import {parseInvitation,invitationFormText} from './invitation-parser.js?v=66a95a94cd8d182c8330bb8b0ac12179c8240ae58b84e11062c85042ee0976fd';
import {defaultHotelPatch} from './hotel-defaults.js?v=ac397997aee5485c1ca33a1bf03c772314ddccc97b8da33c305e1d6090897d44';
import {parseHotel} from './hotel-parser.js?v=a828cc872558a0e5b00a0cbfc1c3bdb9bd56d6abab8cc21b99c2ef1e4ab2da7b';
import {sections,allFields,applicable,ageOn,missingFields} from './schema.js?v=5df55e6f323c5295b63afc823cafb500f36f9f03fa86e4e51978fb783ebb578d';
import {fillDraft} from './pdf.js?v=bd9a417a84bfca2892ed256edaa3a56f8fb73286dc925c9e18621b799a6a1615';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);let generating=false,busy=false,selected=[],hotelFile=null,paymentPending=false,inviteFile=null,invitationResult=null,invitationRead=false,previousVisit='Tourism';
if($('readerVersion'))$('readerVersion').textContent='Passport reader '+(new URL(import.meta.url).searchParams.get('v')?.slice(0,12)||'development');
const websiteReader=websiteOcrConfig().then(config=>{
 const version=new URL(import.meta.url).searchParams.get('v')?.slice(0,12)||'development';
 if($('readerVersion'))$('readerVersion').textContent=(config.mode==='paddle'?'PaddleOCR':'Browser reader')+' · '+version;
 if($('processingTitle'))$('processingTitle').textContent=config.mode==='paddle'?'Passport reading on this website':'Documents stay in this browser';
 if($('processingPrivacy'))$('processingPrivacy').textContent=config.mode==='paddle'?'Passport files are sent to this website’s OCR server and processed in memory. Hotel and invitation documents are read in your browser. Applicant files and form details are not saved by this app.':'Documents are read on your device. Applicant details are not saved on the website. Download your form before closing or refreshing this page.';
 return config;
});
websiteReader.catch(()=>{$('status').textContent='The website reader is unavailable. Sign in again or contact the administrator.';});
const passportIds=sections[0][3].map(x=>x[0]).filter(x=>!['alias','marital','spouseType','spouseNric','spouseNationality','race'].includes(x)).concat(['address','rescountry','resstate','district']);
let districtWasAutomatic=false;const defaultHotelFields=new Map();
function applyDefaultHotel(){const patch=defaultHotelPatch(data(),{visitType:$('visitType').value,hasHotelFile:!!hotelFile});for(const[id,value]of Object.entries(patch)){setField(id,value);defaultHotelFields.set(id,value);}if(Object.keys(patch).length)$('hotelok').checked=false;}
function clearDefaultHotel(){for(const[id,value]of defaultHotelFields)if(id!=='accommodation'&&$(id).value===value)setField(id,'');defaultHotelFields.clear();}
function hasManualStayDetails(ids){return ids.some(k=>$(k).value&&defaultHotelFields.get(k)!==$(k).value);}

function setField(id,value){const el=$(id);if(el.tagName==='SELECT'){el.value=[...el.options].find(o=>o.value.toUpperCase()===String(value||'').toUpperCase())?.value||'';}else el.value=String(value||'').toUpperCase();}
function inferDistrict(){const district=identifyDistrict($('address').value,$('resstate').value,$('rescountry').value);if(district||districtWasAutomatic){setField('district',district);districtWasAutomatic=!!district;}}
function capitalize(el){if((el.tagName==='INPUT'&&['text','email','tel'].includes(el.type))||el.tagName==='TEXTAREA'){const start=el.selectionStart,end=el.selectionEnd;el.value=el.value.toUpperCase();try{el.setSelectionRange(start,end);}catch{}}}
const data=()=>({...Object.fromEntries(allFields.map(([id])=>[id,$(id).value.trim()])),visitType:$('visitType').value});
const familyVisit=()=>['Family Visit','Friend Visit'].includes($('visitType').value);
const rows=()=>[...document.querySelectorAll('.resrow')].map(row=>Object.fromEntries([...row.querySelectorAll('input,textarea')].map(el=>[el.dataset.key,el.value.trim()])));
function field(spec){const [id,label,type,condition]=spec,wrap=document.createElement('div');wrap.className='field'+(type==='textarea'?' wide':'');wrap.id='wrap-'+id;wrap.dataset.condition=condition||'';const l=document.createElement('label');l.htmlFor=id;l.textContent=label;const el=document.createElement(Array.isArray(type)?'select':type==='textarea'?'textarea':'input');el.id=id;el.autocomplete='off';if(Array.isArray(type)){for(const v of ['',...type]){const op=document.createElement('option');op.value=v;op.textContent=(v||'Choose an answer').toUpperCase();el.append(op);}}else if(type!=='textarea'){el.type=type||'text';el.maxLength=120;if(type==='number'){el.min='0';el.step='0.01';}}wrap.append(l,el);if(id==='district'){const help=document.createElement('small');help.textContent='Identified from the address / PIN where possible. Please check.';wrap.append(help);}return wrap;}
for(const [i,[id,title,description,specs]]of sections.entries()){const details=document.createElement('details');details.className='card formsection';details.id='section-'+id;details.open=i<4;const summary=document.createElement('summary');const badge=document.createElement('span');badge.className='sectionbadge';badge.textContent=String(i+1).padStart(2,'0');const names=document.createElement('div');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=description;names.append(h,p);const count=document.createElement('span');count.className='sectioncount';count.id='count-'+id;summary.append(badge,names,count);const body=document.createElement('div');body.className='sectionbody';const fields=document.createElement('div');fields.className='fields';for(const s of specs)fields.append(field(s));body.append(fields);details.append(summary,body);$('sections').append(details);const link=document.createElement('a');link.href='#section-'+id;link.textContent=title;link.onclick=()=>{details.open=true;};$('sectionnav').append(link);const c=link.cloneNode(true);c.onclick=()=>{details.open=true;};const n=document.createElement('span');n.id='check-'+id;c.append(n);$('checklist').append(c);
 if(id==='hotel'){const note=document.createElement('p');note.className='hint';note.textContent='Check the Singapore stay address and contact number. Enter the expected arrival date in Occupation & travel.';body.append(note);}
 if(id==='history'){const area=document.createElement('div');area.id='residenceEntries';const list=document.createElement('div');list.id='residenceRows';const btn=document.createElement('button');btn.type='button';btn.id='addResidence';btn.className='secondary';btn.textContent='+ Add country of residence';btn.onclick=()=>addResidence();const note=document.createElement('p');note.className='hint';note.textContent='Up to four entries fit this form. If more are needed, prepare an additional sheet.';area.append(list,btn,note);body.append(area);}
 if(id==='companion'){const note=document.createElement('p');note.id='agehint';note.className='hint';body.prepend(note);}
 if(id==='local'){const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.id='copyHotelContact';btn.textContent='Use hotel as local contact';btn.onclick=()=>{if(['localName','localPhone','localEmail'].some(k=>$(k).value)&&!confirm('Replace the local contact with the hotel details?'))return;copyHotelContact();changed();};body.append(btn);}
}
function today(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
$('applicationDate').value=today();$('purpose').value='Social';
function addResidence(){const i=document.querySelectorAll('.resrow').length;if(i>=4)return;const row=document.createElement('div');row.className='resrow';const head=document.createElement('div');head.className='resrowhead';const title=document.createElement('strong');title.textContent='Residence '+(i+1);const remove=document.createElement('button');remove.type='button';remove.className='textbutton';remove.textContent='Remove';remove.onclick=()=>{row.remove();renumberRows();changed();};head.append(title,remove);const fields=document.createElement('div');fields.className='fields';for(const [key,label,type]of [['country','Country / place'],['address','Address','textarea'],['from','From','date'],['to','To','date']]){const w=field(['rh-'+i+'-'+key,label,type]);w.querySelector('input,textarea').dataset.key=key;fields.append(w);}row.append(head,fields);$('residenceRows').append(row);renumberRows();changed();}
function renumberRows(){document.querySelectorAll('.resrow').forEach((r,i)=>{r.querySelector('strong').textContent='Residence '+(i+1);r.querySelectorAll('.field').forEach(w=>{const el=w.querySelector('input,textarea');el.id=`rh-${i}-${el.dataset.key}`;w.querySelector('label').htmlFor=el.id;});});$('addResidence').disabled=document.querySelectorAll('.resrow').length>=4;}
function copyHotelContact(){for(const [a,b]of [['localName','hotelName'],['localPhone','hotelPhone'],['localEmail','hotelEmail']])setField(a,$(b).value);$('localRelation').value='HOTEL';}
function changed(){ $('reviewed').checked=false; $('errors').hidden=true; $('pdfstatus').textContent='';update();}
function update(){const d=data();const family=familyVisit();$('invitationUpload').hidden=!family;$('hotelUpload').hidden=family&&d.accommodation!=='Hotel';$('copyHotelContact').hidden=d.accommodation!=='Hotel'&&(family||d.accommodation!=='');$('defaultHotelNotice').hidden=!(!hotelFile&&d.accommodation==='Hotel'&&defaultHotelFields.size);$('stayconfirmation').textContent=(family||!hotelFile)?' I confirmed the Singapore stay address and contact details for this applicant.':' I checked the hotel address and confirmed this booking covers this applicant.';updateInvitationNotice();for(const [id,,,condition]of allFields)$('wrap-'+id).hidden=!applicable(condition,d);$('residenceEntries').hidden=d.resided!=='Yes';const age=ageOn(d.dob,d.applicationDate);$('agehint').textContent=age===null?'Enter date of birth and application date to determine whether companion details are needed.':`Age on application date: ${age}. `+(age<=12?'Answer the airline representative question below.':'Travelling companion details are not needed for this applicant.');
 const missing=missingFields(d,d.resided==='Yes'?rows():[]);$('completion').textContent=missing.length?`${missing.length} information item${missing.length===1?'':'s'} still to complete.`:'Information entered. Review the details and confirmations below.';for(const [id,,,specs]of sections){const ids=specs.map(x=>x[0]);const n=missing.filter(x=>ids.includes(x.id)||(id==='history'&&/rh-|addResidence/.test(x.id))).length;$('count-'+id).textContent=n?n+' pending':'✓ Entered';$('check-'+id).textContent=n?n:'✓';}
 if(age===null){$('count-companion').textContent='Awaiting age';$('check-companion').textContent='—';}else if(age>12){$('count-companion').textContent='Not applicable';$('check-companion').textContent='—';}

}
$('application').addEventListener('input',e=>{capitalize(e.target);if(e.target.id==='accommodation'){if(e.target.value!=='Hotel')clearDefaultHotel();else applyDefaultHotel();}if(e.target.id==='hotelName'&&defaultHotelFields.has('hotelName')&&e.target.value!=='HOTEL BOSS')clearDefaultHotel();defaultHotelFields.delete(e.target.id);if(['passport','given','surname'].includes(e.target.id))$('inviteok').checked=false;if(e.target.id==='district')districtWasAutomatic=false;if(['address','rescountry','resstate'].includes(e.target.id))inferDistrict();if(['reviewed','addressok','hotelok'].includes(e.target.id)){if(e.target.id!=='reviewed')$('reviewed').checked=false;return;}if(['given','surname','hotelName','hotelPhone','accommodation','postal','block','street','building','localName','localPhone','localEmail','localRelation'].includes(e.target.id))$('hotelok').checked=false;if(['address','rescountry','resstate','district'].includes(e.target.id))$('addressok').checked=false;changed();});
$('application').addEventListener('submit',e=>e.preventDefault());
function choosePassport(files){if(busy)return;selected=[...files];$('filelist').textContent=selected.map(f=>f.name).join(' · ');$('read').disabled=!selected.length;}
function chooseHotel(file){if(busy)return;clearDefaultHotel();hotelFile=file||null;$('hotelfilename').textContent=hotelFile?.name||'';$('readhotel').disabled=!hotelFile;$('hotelok').checked=false;applyDefaultHotel();changed();}
$('files').onchange=e=>choosePassport(e.target.files);$('hotelfile').onchange=e=>chooseHotel(e.target.files[0]);
for(const [id,fn]of [['drop',choosePassport],['hoteldrop',files=>chooseHotel(files[0])]])for(const ev of ['drop','dragover'])$(id).addEventListener(ev,e=>{e.preventDefault();if(ev==='drop'&&!busy)fn([...e.dataTransfer.files]);});
function lock(value){busy=value;$('visitType').disabled=value;$('invitefile').disabled=value;$('readinvite').disabled=value||!inviteFile;$('usehostaddress').disabled=value;for(const id of ['files','hotelfile','clear','draft','download'])$(id).disabled=value;$('read').disabled=value||!selected.length;$('readhotel').disabled=value||!hotelFile;$('application').inert=value;$('progress').hidden=!value;}
async function createReader(status){return Tesseract.createWorker('eng',1,{workerPath:new URL('./vendor/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/core/',import.meta.url).href,langPath:new URL('./vendor/lang/',import.meta.url).href,workerBlobURL:false,cacheMethod:'none',logger:m=>{if(m.progress)$('progress').value=m.progress;if(m.status==='recognizing text')$(status).textContent='Reading document… '+Math.round(m.progress*100)+'%';}});}
async function documentText(file,reader,passport=false){
 if(file.size>20*1024*1024)throw Error('Each file must be 20 MB or smaller.');
 const recognize=async (canvas,source=canvas)=>{
  const worker=await reader();let timer;
  try{return await Promise.race([
   passport?recognizePassport(canvas,worker,message=>{$('status').textContent=message;},source):worker.recognize(canvas).then(r=>r.data.text),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Document reading timed out. Try a cropped, upright passport page.')),180000);})
  ]);}finally{clearTimeout(timer);}
 };
 if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  try{
   if(pdf.numPages>6)throw Error('Please upload no more than 6 pages per document.');const texts=[];
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),content=await page.getTextContent(),lines=new Map();
    for(const item of content.items){if(!item.str)continue;const y=Math.round(item.transform[5]);if(!lines.has(y))lines.set(y,[]);lines.get(y).push(item);}
    let t=[...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')).join('\n');
    if(t.replace(/\s/g,'').length<80||(passport&&passportNeedsRetry(t))){
     const base=page.getViewport({scale:1}),v=page.getViewport({scale:Math.min(4,(passport?3200:2000)/Math.max(base.width,base.height))}),canvas=document.createElement('canvas');
     canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
     try{await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;const ocr=await recognize(canvas);
      if(!passport||Object.keys(parsePassport(ocr)).length>Object.keys(parsePassport(t)).length)t=ocr;
     }finally{canvas.width=0;canvas.height=0;}
    }
    const formValues=invitationFormText(await page.getAnnotations());if(formValues)t=formValues+'\n'+t;texts.push(t);page.cleanup();
   }
   return texts;
  }finally{await pdf.destroy();}
 }
 if(!['image/jpeg','image/png'].includes(file.type)&&!(/\.(jpe?g|png)$/i.test(file.name)&&!file.type))throw Error('Use PDF, JPG or PNG files.');
 const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
 const longest=Math.max(bitmap.width,bitmap.height),scale=passport?Math.min(4,3200/longest):Math.min(1,2200/longest);
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 try{const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return [await recognize(canvas,bitmap)];}
 finally{bitmap.close();canvas.width=0;canvas.height=0;}
}
async function readDocuments(kind){
 if(busy)return;
 const hotel=kind==='hotel',status=hotel?'hotelstatus':'status',files=hotel?[hotelFile]:selected;
 if(!files.length||!files[0])return;
 if(files.length>4){$(status).textContent='Select at most 4 passport files.';return;}
 const ids=hotel?sections.find(s=>s[0]==='hotel')[3].map(x=>x[0]):passportIds;
 if(ids.some(k=>$(k).value&&(!hotel||k!=='accommodation'))&&!confirm(hotel?'Replace current hotel details with this booking?':'Replace passport and address details? Other answers will be retained; check they belong to this applicant.'))return;
 lock(true);$(status).textContent='Reading document…';let worker;
 const reader=async()=>worker||(worker=await createReader(status));
 try{
  let extracted,serverResult,texts=[];
  const config=hotel?{mode:'browser'}:await websiteReader;
  if(config.mode==='paddle'){
   $(status).textContent='Reading passport on the website OCR server…';
   serverResult=await readWebsitePassport(files);extracted=serverResult.fields;
  }else{
   for(const f of files)texts.push(...await documentText(f,reader,!hotel));
   if(!hotel){
    const numbers=new Set(texts.map(t=>parsePassport(t).passport).filter(Boolean));
    if(numbers.size>1)throw Error('Different passport numbers were found. Upload the first and address pages for one current passport only.');
    texts.sort((a,b)=>Number(/P<IND/.test(b))-Number(/P<IND/.test(a)));
    extracted=parsePassport(texts.join('\n--- DOCUMENT PAGE ---\n'));
   }
  }
  if(hotel){
   const result=parseHotel(texts.join('\n'));extracted=result.data;paymentPending=result.paymentPending;
   for(const id of ids)setField(id,extracted[id]||'');
   if(!['localName','localPhone','localEmail'].some(k=>$(k).value))copyHotelContact();
   $('hotelok').checked=false;$('bookingnotice').hidden=!paymentPending;
   $('bookingnotice').textContent='This document states that payment was pending when issued. Confirm the booking’s current status. No booking validity check is performed by this tool.';
  }else{
   for(const id of passportIds)setField(id,extracted[id]||'');districtWasAutomatic=!!extracted.district;
   $('inviteok').checked=false;$('addressok').checked=false;$('hotelok').checked=false;
  }
  const count=ids.filter(id=>extracted[id]).length;
  $(status).textContent=count?`Read ${count} details. ${hotel?'Review every value; blank fields need your input.':serverResult?.warning||passportWarnings(extracted)||'Review every value against the original passport.'}`:'Could not identify the details clearly after reading. Use an upright, close crop of the passport first page, with all text and both machine-readable lines visible, or enter the details manually.';
  changed();
 }catch(e){$(status).textContent='Could not read document: '+e.message+' You can enter details manually.';}
 finally{await worker?.terminate();lock(false);update();}
}
$('read').onclick=()=>readDocuments('passport');$('readhotel').onclick=()=>readDocuments('hotel');
function errorsFor(d,complete){const errors=[];if(!d.given&&!d.surname)errors.push({id:'given',label:'Enter the applicant name.'});if(!d.passport)errors.push({id:'passport',label:'Enter the travel document number.'});if(d.dob&&d.applicationDate&&d.dob>d.applicationDate)errors.push({id:'dob',label:'Date of birth cannot be after the application date.'});if(d.dob&&d.issued&&d.dob>d.issued)errors.push({id:'dob',label:'Date of birth cannot be after the passport issue date.'});if(d.issued&&d.expiry&&d.issued>=d.expiry)errors.push({id:'expiry',label:'Passport expiry must be after its issue date.'});if(d.income&&Number(d.income)<0)errors.push({id:'income',label:'Annual income cannot be negative.'});for(const [id,label,type,cond]of allFields){if(!applicable(cond,d))continue;const el=$(id);if(el.value&&!el.validity.valid)errors.push({id,label:'Check '+label.toLowerCase()+'.'});if(!Array.isArray(type)&&/[^\x20-\x7e\r\n]/.test(d[id]))errors.push({id,label:label+': use the English / Latin spelling for this form.'});}if(d.resided==='Yes')rows().forEach((r,i)=>{if(r.from&&r.to&&r.from>r.to)errors.push({id:`rh-${i}-to`,label:`Residence ${i+1}: To date must be after From date.`});});if(complete){if(familyVisit()){if(!invitationRead)errors.push({id:'invitefile',label:'Upload and read a V39A or invitation letter for this visit.'});if(!$('inviteok').checked)errors.push({id:'inviteok',label:'Confirm the V39A / invitation covers this applicant.'});}errors.push(...missingFields(d,d.resided==='Yes'?rows():[]));if(!$('addressok').checked)errors.push({id:'addressok',label:'Confirm the current residential address.'});if(!$('hotelok').checked)errors.push({id:'hotelok',label:familyVisit()?'Confirm the Singapore stay address and contact details.':'Confirm hotel details and that the booking covers this applicant.'});}if(!$('reviewed').checked)errors.push({id:'reviewed',label:'Check the entered details and tick the final review confirmation.'});return [...new Map(errors.map(x=>[x.id,x])).values()];}
function showErrors(errors){const box=$('errors');box.replaceChildren();const h=document.createElement('strong');h.textContent='Please complete or check these items:';const ul=document.createElement('ul');for(const {id,label}of errors){const li=document.createElement('li'),a=document.createElement('a');a.href='#'+id;a.textContent=label;a.onclick=e=>{e.preventDefault();const el=$(id);el?.closest('details')?.setAttribute('open','');el?.focus();el?.scrollIntoView({block:'center',behavior:'smooth'});};li.append(a);ul.append(li);$(id)?.closest('.field')?.classList.add('invalid');}box.append(h,ul);box.hidden=false;box.scrollIntoView({block:'center',behavior:'smooth'});}
async function download(complete){if(generating||busy)return;document.querySelectorAll('.field.invalid').forEach(x=>x.classList.remove('invalid'));const d=data(),errors=errorsFor(d,complete);if(errors.length){showErrors(errors);return;}$('errors').hidden=true;$('pdfstatus').textContent='Preparing Form 14A…';generating=true;$('download').disabled=true;$('draft').disabled=true;try{const clean={...d};for(const [id,,,condition]of allFields)if(!applicable(condition,d))clean[id]='';const response=await fetch('form-14a.pdf');if(!response.ok)throw Error('Could not load the blank form. Try again.');const bytes=await fillDraft(await response.arrayBuffer(),clean,PDFLib,$('addressok').checked,{complete,residences:d.resided==='Yes'?rows():[]});const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='Singapore_Form14A_'+(complete?'PREPARED_':'DRAFT_')+d.passport.replace(/[^A-Za-z0-9]/g,'')+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('pdfstatus').textContent=complete?'Form downloaded. Applicant must review and sign; affix the photograph separately.':'Draft downloaded. Unanswered fields remain blank and must be completed.';}catch(e){$('pdfstatus').textContent=e.message;}finally{generating=false;$('download').disabled=false;$('draft').disabled=false;}}
$('draft').onclick=()=>download(false);$('download').onclick=()=>download(true);
$('clear').onclick=()=>{if(!confirm('Clear all applicant details and selected documents?'))return;for(const [id]of allFields)$(id).value='';$('purpose').value='Social';$('applicationDate').value=today();$('residenceRows').replaceChildren();selected=[];hotelFile=null;paymentPending=false;districtWasAutomatic=false;inviteFile=null;invitationResult=null;invitationRead=false;$('visitType').value='Tourism';previousVisit='Tourism';$('invitefile').value='';$('invitefilename').textContent='';$('inviteok').checked=false;$('invitestatus').textContent='Host details can be checked and edited in Local contact.';for(const k of ['files','hotelfile'])$(k).value='';for(const k of ['filelist','hotelfilename'])$(k).textContent='';for(const k of ['addressok','hotelok','reviewed'])$(k).checked=false;$('bookingnotice').hidden=true;$('status').textContent='Choose files to begin.';$('hotelstatus').textContent='Or enter the hotel details manually.';defaultHotelFields.clear();applyDefaultHotel();lock(false);changed();};

function updateInvitationNotice(){
 if(!invitationResult){$('invitenotice').hidden=true;$('usehostaddress').hidden=true;return;}
 const r=invitationResult,messages=[];if(r.address)messages.push('HOST ADDRESS FOUND: '+r.address+'. Use the button below only if the applicant will stay there.');else messages.push('A complete Singapore host address was not found. Enter the stay address manually.');
 if(r.relationship)messages.push('V39A DESCRIBES THE APPLICANT AS: '+r.relationship+'. Check the suggested relationship of the host to the applicant in Local contact.');
 const passport=$('passport').value.trim().toUpperCase();if(passport&&r.applicantPassports.length&&!r.applicantPassports.includes(passport))messages.push('The applicant passport number was not found in this document. Check that it covers the current applicant.');
 $('invitenotice').textContent=messages.join(' ');$('invitenotice').hidden=false;$('usehostaddress').hidden=!r.address;
}
function chooseInvitation(file){if(busy)return;inviteFile=file||null;invitationRead=false;invitationResult=null;$('inviteok').checked=false;$('invitefilename').textContent=inviteFile?.name||'';$('readinvite').disabled=!inviteFile;$('invitestatus').textContent='Read the document, then check the host details.';changed();}
$('invitefile').onchange=e=>chooseInvitation(e.target.files[0]);for(const ev of ['drop','dragover'])$('invitedrop').addEventListener(ev,e=>{e.preventDefault();if(ev==='drop')chooseInvitation([...e.dataTransfer.files][0]);});
$('inviteok').onchange=()=>{$('reviewed').checked=false;$('errors').hidden=true;};
$('visitType').onchange=()=>{const next=$('visitType').value,ids=[...sections.find(s=>s[0]==='hotel')[3].map(x=>x[0]),...sections.find(s=>s[0]==='local')[3].map(x=>x[0])];if(hasManualStayDetails(ids)&&!confirm('Change visit type? Passport and personal answers will stay. Singapore stay and local contact details will be cleared to avoid mixing cases.')){$('visitType').value=previousVisit;return;}defaultHotelFields.clear();for(const id of ids)setField(id,'');previousVisit=next;$('purpose').value=next==='Business'?'Business':'Social';setField('purposeDetails',next==='Family Visit'?'FAMILY VISIT':next==='Friend Visit'?'VISITING FRIENDS':next==='Business'?'BUSINESS VISIT':'TOURISM');hotelFile=null;$('hotelfile').value='';$('hotelfilename').textContent='';$('readhotel').disabled=true;$('hotelstatus').textContent='Or enter the hotel details manually.';$('bookingnotice').hidden=true;inviteFile=null;invitationResult=null;invitationRead=false;$('invitefile').value='';$('invitefilename').textContent='';$('inviteok').checked=false;$('readinvite').disabled=true;$('hotelok').checked=false;$('invitestatus').textContent='Host details can be checked and edited in Local contact.';applyDefaultHotel();changed();};
$('readinvite').onclick=async()=>{if(busy||!inviteFile)return;if(['localName','localPhone','localEmail','localRelation'].some(k=>$(k).value)&&!confirm('Replace the local contact details with those read from this document?'))return;lock(true);$('invitestatus').textContent='Reading host details…';let worker;const reader=async()=>worker||(worker=await createReader('invitestatus'));try{const texts=await documentText(inviteFile,reader),result=parseInvitation(texts.join('\n'));for(const id of ['localName','localPhone','localEmail','localRelation'])setField(id,result.data[id]||'');invitationResult=result;invitationRead=true;$('inviteok').checked=false;$('hotelok').checked=false;$('section-local').open=true;$('invitestatus').textContent='Read '+result.type+'. Check the host details in Local contact; enter any missing answers.';changed();}catch(e){invitationRead=false;$('invitestatus').textContent='Could not read this document: '+e.message;}finally{await worker?.terminate();lock(false);update();}};
$('usehostaddress').onclick=()=>{if(!invitationResult?.address)return;if(['block','street','postal','floor','unit','building'].some(k=>$(k).value)&&!confirm('Replace the Singapore stay address with the host address?'))return;defaultHotelFields.clear();for(const id of ['block','street','postal','floor','unit','building','hotelPhone'])setField(id,invitationResult.stay[id]||'');setField('accommodation',$('visitType').value==='Friend Visit'?"Friend’s Place":"Relative’s Place");$('section-hotel').open=true;$('hotelok').checked=false;changed();};
applyDefaultHotel();
update();
