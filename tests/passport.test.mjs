import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePassport,passportNeedsRetry,passportWarnings} from '../dist/parser.js';
import {recognizePassport} from '../dist/passport-ocr.js';
const visual=`REPUBLIC OF INDIA
Passport No.: A1234567
Surname
SAMPLE
Given Name(s)
TEST PERSON
Nationality / Sex
INDIAN F
Date of Birth
19/01/2003
Place of Birth
MUMBAI, MAHARASHTRA
Place of Issue
MUMBAI
Date of Expiry
21/11/2028
Date of Issue
22/11/2018`;
function digit(s){return String([...s].reduce((n,c,i)=>n+(c==='<'?0:/\d/.test(c)?+c:c.charCodeAt(0)-55)*[7,3,1][i%3],0)%10);}
function mrz(doc='A1234567<',dob='030119',expiry='281121',issuer='IND'){
 const one=`P<${issuer}SAMPLE<<TEST<PERSON`.padEnd(44,'<');
 const partial=doc+digit(doc)+issuer+dob+digit(dob)+'F'+expiry+digit(expiry)+'<'.repeat(14)+'0';
 return one+'\n'+partial+digit(partial.slice(0,10)+partial.slice(13,20)+partial.slice(21,43));
}
test('visual labels recover passport details without any MRZ, in label order rather than OCR date order',()=>{
 const p=parsePassport(visual);assert.equal(p.given,'TEST PERSON');assert.equal(p.surname,'SAMPLE');assert.equal(p.passport,'A1234567');assert.equal(p.dob,'2003-01-19');assert.equal(p.issued,'2018-11-22');assert.equal(p.expiry,'2028-11-21');assert.equal(p.sex,'Female');assert.equal(p.nationality,'INDIAN');assert.equal(p.birthplace,'MUMBAI');assert.equal(p.birthstate,'MAHARASHTRA');assert.equal(passportNeedsRetry(visual),false);
});
test('two column date labels assign the date below the correct column',()=>{const p=parsePassport('Date of Issue     Date of Expiry\n22.11.2018     21.11.2028');assert.equal(p.issued,'2018-11-22');assert.equal(p.expiry,'2028-11-21');});
test('unlabelled dates, including date stamps and old passport dates, never become current issue/expiry dates',()=>{const p=parsePassport('19/01/2003\n28/10/2026\n22/11/2018\nOld Passport No.\nB7654321\nDate of issue 01/01/2000');assert.equal(p.dob,undefined);assert.equal(p.expiry,undefined);assert.equal(p.passport,undefined);});
test('impossible and contradictory dates are left empty with a specific review warning',()=>{const p=parsePassport('Date of Birth 31/02/2003\nDate of Issue 28/10/2026\nDate of Expiry 22/11/2018');for(const k of ['dob','issued','expiry'])assert.equal(p[k],undefined);assert.match(passportWarnings(p),/issue date, expiry date/);});
test('checksum validated TD3 lines recover identity, dates, sex and nationality',()=>{const p=parsePassport(mrz());assert.equal(p.passport,'A1234567');assert.equal(p.given,'TEST PERSON');assert.equal(p.dob,'2003-01-19');assert.equal(p.expiry,'2028-11-21');assert.equal(p.sex,'Female');assert.equal(p.issued,undefined);});
test('TD3 supports issuers beyond India and embedded spaces in OCR lines',()=>{const raw=mrz('L898902C3','740812','320415','GBR');const p=parsePassport(raw.split('\n').map(x=>x.match(/.{1,11}/g).join(' ')).join('\n'));assert.equal(p.passport,'L898902C3');assert.equal(p.issuecountry,'UNITED KINGDOM');assert.equal(p.dob,'1974-08-12');});
test('failed check digits and incomplete MRZ cannot supply a fabricated identity',()=>{const raw=mrz().replace('A1234567','A1234568');const p=parsePassport(raw);assert.equal(p.passport,undefined);assert.equal(p.given,undefined);assert.equal(parsePassport('P<INDSAMPLE<<TEST').given,undefined);});
test('numeric OCR substitutions in MRZ require passing check digits',()=>{const p=parsePassport(mrz().replace('030119','O3O119'));assert.equal(p.dob,'2003-01-19');});
test('passport surname may be absent without making up a surname',()=>{const p=parsePassport('Surname\nGiven Name(s)\nTEST PERSON\nPassport No. A1234567');assert.equal(p.surname,undefined);assert.equal(p.given,'TEST PERSON');});
test('addresses do not absorb other passport pages or old passport data',()=>{const p=parsePassport('/ Address\n21 EXAMPLE ROAD\nPIN:700006, WEST BENGAL, INDIA\n--- DOCUMENT PAGE ---\nDate of Birth\n19/01/2003');assert.equal(p.address,'21 EXAMPLE ROAD, PIN:700006, WEST BENGAL, INDIA');assert.equal(p.district,'KOLKATA');});
test('empty/unreadable input has no false successful details',()=>{assert.deepEqual(parsePassport('...'),{});assert.equal(passportNeedsRetry('...'),true);});
test('a missing issue date or either name requests another OCR pass',()=>{
 for(const fragment of ['Date of Issue\n22/11/2018','Given Name(s)\nTEST PERSON','Surname\nSAMPLE']){
  assert.equal(passportNeedsRetry(visual.replace(fragment,'')),true,fragment);
 }
});
async function recognizePasses(texts){
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
 let calls=0;
 const worker={setParameters:async()=>{},recognize:async()=>({data:{text:texts[calls++]||''}})};
 try{return {text:await recognizePassport({width:1200,height:800},worker),calls};}
 finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
test('a second visual pass recovers an issue date when the higher-scoring pass lacks it',async()=>{
 const primary=visual.replace('Date of Issue\n22/11/2018','');
 const secondary=visual.replace('Nationality / Sex\nINDIAN F\n','');
 const result=await recognizePasses([primary,secondary]);
 assert.equal(result.calls,2);
 const p=parsePassport(result.text);assert.equal(p.issued,'2018-11-22');assert.equal(p.nationality,'INDIAN');assert.equal(p.sex,'Female');
});
test('a second visual pass recovers either missing name with a matching passport identity',async()=>{
 for(const [key,fragment,value] of [['given','Given Name(s)\nTEST PERSON','TEST PERSON'],['surname','Surname\nSAMPLE','SAMPLE']]){
  const primary=visual.replace(fragment,'');
  const secondary=visual.replace('Nationality / Sex\nINDIAN F\n','');
  const result=await recognizePasses([primary,secondary]);
  assert.equal(result.calls,2);assert.equal(parsePassport(result.text)[key],value);
 }
});
test('alternate visual fields are rejected when identity is conflicting or incomplete',async()=>{
 const primary=visual.replace('Date of Issue\n22/11/2018','');
 for(const secondary of [
  visual.replace('A1234567','B7654321'),
  visual.replace('19/01/2003','20/01/2003'),
  visual.replace('21/11/2028','22/11/2028'),
  visual.replace('Passport No.: A1234567\n','')
 ]){
  const result=await recognizePasses([primary,secondary.replace('Nationality / Sex\nINDIAN F\n','')]);
  assert.equal(parsePassport(result.text).issued,undefined);
 }
});
test('complete primary OCR skips extra passes and restores worker settings',async()=>{const calls=[];const worker={setParameters:async p=>calls.push(p),recognize:async()=>({data:{text:visual}})};assert.equal(await recognizePassport({},worker),visual);assert.deepEqual(calls.map(x=>x.tessedit_pageseg_mode),['3','6']);assert.equal(calls.at(-1).tessedit_char_whitelist,'');});
test('weak OCR retries contrast, MRZ and printed details with bounded calls and frees the canvas',async()=>{let canvas;globalThis.document={createElement:()=>canvas={width:0,height:0,getContext:()=>({drawImage(){}})}};let n=0;const settings=[];const worker={setParameters:async p=>settings.push(p),recognize:async()=>({data:{text:++n===3?mrz():'unreadable'}})};try{const p=parsePassport(await recognizePassport({width:1200,height:800},worker));assert.equal(n,4);assert.equal(p.passport,'A1234567');assert.equal(canvas.width,0);assert.equal(settings.at(-1).tessedit_char_whitelist,'');}finally{delete globalThis.document;}});
test('focused landscape OCR recovers printed names and issue date after full-page passes fail',async()=>{
 const previous=globalThis.document,settings=[],options=[];
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
 const partial=mrz().replace('TEST<PERSON','TEST<PERS0N');
 const texts=[partial,partial,partial,visual];
 const worker={setParameters:async p=>settings.push(p),recognize:async(surface,opts)=>{options.push(opts);return {data:{text:texts[options.length-1]}};}};
 try{
  const p=parsePassport(await recognizePassport({width:1200,height:800},worker));
  assert.equal(p.given,'TEST PERSON');assert.equal(p.surname,'SAMPLE');assert.equal(p.issued,'2018-11-22');
  assert.equal(options.length,4);
  assert.deepEqual(options[3].rectangle,{left:360,top:0,width:840,height:600});
  assert.equal(settings[3].tessedit_char_whitelist,'');
  assert.equal(settings[3].preserve_interword_spaces,'1');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('portrait and stacked documents use bounded lower and middle MRZ retries',async()=>{
 const previous=globalThis.document;let calls=0;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
 const worker={setParameters:async()=>{},recognize:async()=>{calls++;return {data:{text:'unreadable'}};}};
 try{await recognizePassport({width:800,height:1200},worker);assert.equal(calls,5);}
 finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('OCR errors restore worker parameters instead of leaking the MRZ whitelist to the next document',async()=>{const calls=[];const worker={setParameters:async p=>calls.push(p),recognize:async()=>{throw Error('worker failed');}};await assert.rejects(()=>recognizePassport({},worker),/worker failed/);assert.equal(calls.at(-1).tessedit_char_whitelist,'');});

test('position-specific country and Indian passport OCR repairs pass all three checks',()=>{
 const damaged=mrz().replace('P<IND','P<1ND').replace('A1234567','A123456T').replace('IND030119','1ND030119');
 const p=parsePassport(damaged);assert.equal(p.passport,'A1234567');assert.equal(p.issuecountry,'INDIA');assert.equal(p.dob,'2003-01-19');assert.equal(p.expiry,'2028-11-21');
});

test('small native images get a separate background-suppressed pass without changing their identity',async()=>{
 const previous=globalThis.document,canvases=[],options=[],settings=[];
 globalThis.document={createElement:()=>{
  const canvas={width:0,height:0,frame:null,getContext:()=>({
   fillRect(){},drawImage(){},
   getImageData:()=>({data:Uint8ClampedArray.from({length:canvas.width*canvas.height*4},(_,i)=>i%4===3?255:i%256)}),
   createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
   putImageData:frame=>{canvas.frame=frame;}
  })};canvases.push(canvas);return canvas;
 }};
 const texts=['unreadable','unreadable',mrz(),'unreadable','unreadable'];
 const worker={setParameters:async p=>settings.push(p),recognize:async(surface,opts)=>{
  options.push(opts);
  if(options.length===3){
   assert.equal(surface.width,192);assert.equal(surface.height,144);
   assert.ok(surface.frame.data.some((v,i)=>i%4===0&&v>0));
   for(let i=0;i<surface.frame.data.length;i+=4){
    assert.equal(surface.frame.data[i],surface.frame.data[i+1]);
    assert.equal(surface.frame.data[i],surface.frame.data[i+2]);
    assert.equal(surface.frame.data[i+3],255);
   }
  }
  return {data:{text:texts[options.length-1]}};
 }};
 try{
  const p=parsePassport(await recognizePassport({width:1200,height:800},worker,()=>{},{width:64,height:48}));
  assert.equal(p.given,'TEST PERSON');assert.equal(p.surname,'SAMPLE');assert.equal(p.passport,'A1234567');
  assert.equal(p.issued,undefined);assert.equal(options.length,5);
  assert.equal(options[2].rotateAuto,false);
  assert.ok(canvases.every(c=>c.width===0&&c.height===0));
  assert.equal(settings.at(-1).tessedit_char_whitelist,'');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('small-image retry failures free canvases and restore worker parameters',async()=>{
 const previous=globalThis.document,canvases=[],settings=[];let calls=0;
 globalThis.document={createElement:()=>{
  const canvas={width:0,height:0,getContext:()=>({
   fillRect(){},drawImage(){},putImageData(){},
   getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4).fill(255)}),
   createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})
  })};canvases.push(canvas);return canvas;
 }};
 const worker={setParameters:async p=>settings.push(p),recognize:async()=>{
  if(++calls===3)throw Error('small-image worker failed');
  return {data:{text:'unreadable'}};
 }};
 try{
  await assert.rejects(()=>recognizePassport({width:1200,height:800},worker,()=>{},{width:32,height:32}),/small-image worker failed/);
  assert.ok(canvases.every(c=>c.width===0&&c.height===0));
  assert.equal(settings.at(-1).tessedit_char_whitelist,'');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('numeric corrections cannot rescue a passport when another checked field is invalid',()=>{
 const damaged=mrz().replace('A1234567','A123456T').replace('030119','030118');
 const p=parsePassport(damaged);assert.equal(p.passport,undefined);assert.equal(p.dob,undefined);
});
test('filler-truncated MRZ names are supported when the complete number line validates',()=>{
 const raw=mrz().split('\n');raw[0]=raw[0].slice(0,38);const p=parsePassport(raw.join('\n'));assert.equal(p.surname,'SAMPLE');assert.equal(p.given,'TEST PERSON');
});
test('conflicting names across OCR passes remain empty unless printed text corroborates one',()=>{
 const raw=mrz(),bad=raw.split('\n')[0].replace('TEST<PERSON','TEST<PERSOM');
 const p=parsePassport(raw+'\n'+bad);assert.equal(p.surname,'SAMPLE');assert.equal(p.given,undefined);
 assert.equal(parsePassport(raw+'\n'+bad+'\nTEST PERSON').given,'TEST PERSON');
});
test('conflicting checksum-valid identities cannot be combined into a fabricated passport',()=>{
 const p=parsePassport(mrz()+'\n'+mrz('B1234567<'));assert.equal(p.passport,undefined);assert.equal(p.dob,undefined);
});

test('bilingual Indian visual labels accept two-letter passport numbers without requiring an MRZ',()=>{
 const text=visual.replace('A1234567','AB123456').replace('Surname\n','Surname / उपनाम\n').replace('Given Name(s)\n','दिया गया नाम / Given Name(s)\n').replace('Place of Birth\n','जन्म स्थान / Place of Birth\n').replace('Date of Issue\n','जारी करने की तिथि / Date of Issue\n');
 const p=parsePassport(text);
 assert.equal(p.passport,'AB123456');assert.equal(p.given,'TEST PERSON');assert.equal(p.surname,'SAMPLE');
 assert.equal(p.issued,'2018-11-22');assert.equal(p.expiry,'2028-11-21');
 assert.equal(p.birthplace,'MUMBAI');assert.equal(p.birthstate,'MAHARASHTRA');assert.equal(p.birthcountry,'INDIA');assert.equal(p.issueplace,'MUMBAI');
});

test('Indian birth states can be read without a comma and nationality does not determine birth country',()=>{
 const p=parsePassport('Place of Birth\nMUMBAI MAHARASHTRA\nNationality\nINDIAN');
 assert.equal(p.birthplace,'MUMBAI');assert.equal(p.birthstate,'MAHARASHTRA');assert.equal(p.birthcountry,'INDIA');
 assert.equal(parsePassport('Place of Birth\nLONDON\nNationality\nINDIAN').birthcountry,undefined);
});

test('old-passport continuation dates never supply the current issue date, regardless of page order',()=>{
 const back=`Address\n21 EXAMPLE ROAD\nPIN:400054, MAHARASHTRA, INDIA\nOld Passport No. with Date and Place of Issue\nB7654321\nDate of Issue\n01/01/2010\nPlace of Issue\nDELHI\nFile No.\nAB123456789`;
 const front=visual.replace('Date of Issue\n22/11/2018','');
 for(const text of [front+'\n--- DOCUMENT PAGE ---\n'+back,back+'\n--- DOCUMENT PAGE ---\n'+front]){
  const p=parsePassport(text);assert.equal(p.issued,undefined);assert.equal(p.passport,'A1234567');assert.equal(p.issueplace,'MUMBAI');
  assert.ok(!p.address.includes('B7654321'));assert.ok(!p.address.includes('01/01/2010'));
 }
 assert.equal(parsePassport(back).issued,undefined);
});

test('two-letter MRZ prefixes are preserved when correcting only the numeric positions',()=>{
 const raw=mrz('AB123458<');
 assert.equal(parsePassport(raw).passport,'AB123458');
 assert.equal(parsePassport(raw.replace('AB123458','AB12345B')).passport,'AB123458');
 assert.equal(parsePassport(raw.replace('AB123458','AB12345B').replace('030119','030118')).passport,undefined);
});

test('different passport numbers block identity mixing while preserving independently agreed fields',()=>{
 const p=parsePassport(visual.replace('A1234567','B7654321')+'\n'+mrz());
 for(const key of ['passport','given','surname','issued'])assert.equal(p[key],undefined,key);
 assert.equal(p.dob,'2003-01-19');assert.equal(p.expiry,'2028-11-21');
 assert.match(passportWarnings(p),/passport numbers disagree/);
});

test('one noisy printed date uses the checked MRZ date without clearing the other matching details',()=>{
 for(const fragment of [visual.replace('19/01/2003','20/01/2003'),visual.replace('21/11/2028','22/11/2028')]){
  const p=parsePassport(fragment+'\n'+mrz());
  for(const key of ['passport','given','surname','dob','issued','expiry','sex','nationality'])assert.equal(p[key],parsePassport(visual)[key],key);
  assert.match(passportWarnings(p),/checksum-verified MRZ date/);
 }
});

test('an impossible issue date does not erase a checked birth date or expiry',()=>{
 for(const issue of ['21/11/2028','19/01/2003']){
  const p=parsePassport(visual.replace('22/11/2018',issue)+'\n'+mrz());
  assert.equal(p.issued,undefined);assert.equal(p.dob,'2003-01-19');assert.equal(p.expiry,'2028-11-21');assert.equal(p.passport,'A1234567');
  assert.match(passportWarnings(p),/issue date/);
 }
});

test('a conflicting name requests review without clearing unrelated fields',()=>{
 const p=parsePassport(visual.replace('TEST PERSON','OTHER PERSON')+'\n'+mrz());
 assert.equal(p.given,undefined);assert.equal(p.surname,'SAMPLE');
 assert.equal(p.passport,'A1234567');assert.equal(p.issued,'2018-11-22');
 assert.match(passportWarnings(p),/names disagree/);
});

test('MRZ verification preserves the visual spelling when only name punctuation differs',()=>{
 const p=parsePassport(visual.replace('TEST PERSON','TEST-PERSON')+'\n'+mrz());
 assert.equal(p.given,'TEST-PERSON');assert.equal(p.surname,'SAMPLE');
});

test('matching alternate passes recover birthplace, state and place of issue',async()=>{
 const primary=visual.replace('Place of Birth\nMUMBAI, MAHARASHTRA\n','').replace('Place of Issue\nMUMBAI\n','');
 const alternate=visual.replace('Surname\nSAMPLE\n','').replace('Given Name(s)\nTEST PERSON\n','').replace('Nationality / Sex\nINDIAN F\n','');
 const {text}=await recognizePasses([primary,alternate]);const p=parsePassport(text);
 assert.equal(p.given,'TEST PERSON');assert.equal(p.birthplace,'MUMBAI');assert.equal(p.birthstate,'MAHARASHTRA');assert.equal(p.issueplace,'MUMBAI');
});

test('missing Indian place fields trigger OCR retries even when core identity is complete',()=>{
 for(const fragment of ['Place of Birth\nMUMBAI, MAHARASHTRA','Place of Issue\nMUMBAI'])assert.equal(passportNeedsRetry(visual.replace(fragment,'')),true);
});

test('stacked passport images search the upper MRZ band and preserve the passport number header in the visual crop',async()=>{
 const previous=globalThis.document,options=[];
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
 const texts=['unreadable','unreadable','unreadable',mrz(),visual];
 const worker={setParameters:async()=>{},recognize:async(surface,opts)=>{options.push(opts);return {data:{text:texts[options.length-1]}};}};
 try{
  const p=parsePassport(await recognizePassport({width:1200,height:1600},worker));
  assert.equal(p.passport,'A1234567');assert.equal(p.issued,'2018-11-22');assert.equal(p.birthstate,'MAHARASHTRA');
  assert.equal(options.length,5);
  assert.deepEqual(options[3].rectangle,{left:0,top:560,width:1200,height:320});
  assert.deepEqual(options[4].rectangle,{left:360,top:0,width:840,height:704});
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('browser adaptive MRZ fallback recovers a checked identity and frees temporary canvases',async()=>{
 const previous=globalThis.document,allocated=[];
 globalThis.document={createElement:()=>{
  const canvas={width:0,height:0,getContext(){return {
   fillRect(){},drawImage(){},putImageData(){},
   getImageData(){const data=new Uint8ClampedArray(canvas.width*canvas.height*4);data.fill(220);return {data};}
  };}};allocated.push(canvas);return canvas;
 }};
 const original={width:1200,height:800,getContext(){return {getImageData(){}}}};
 let count=0;
 const worker={setParameters:async()=>{},recognize:async()=>({data:{text:++count===4?mrz():'unreadable'}})};
 try{
  const read=parsePassport(await recognizePassport(original,worker));
  assert.equal(read.passport,'A1234567');
  assert.equal(read.dob,'2003-01-19');
  assert.ok(count>=4);
  assert.ok(allocated.every(c=>c.width===0&&c.height===0));
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
