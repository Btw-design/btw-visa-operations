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
test('complete primary OCR skips extra passes and restores worker settings',async()=>{const calls=[];const worker={setParameters:async p=>calls.push(p),recognize:async()=>({data:{text:visual}})};assert.equal(await recognizePassport({},worker),visual);assert.deepEqual(calls.map(x=>x.tessedit_pageseg_mode),['3','6']);assert.equal(calls.at(-1).tessedit_char_whitelist,'');});
test('weak OCR retries contrast and MRZ with bounded calls and frees the canvas',async()=>{let canvas;globalThis.document={createElement:()=>canvas={width:0,height:0,getContext:()=>({drawImage(){}})}};let n=0;const settings=[];const worker={setParameters:async p=>settings.push(p),recognize:async()=>({data:{text:++n===3?mrz():'unreadable'}})};try{const p=parsePassport(await recognizePassport({width:1200,height:800},worker));assert.equal(n,3);assert.equal(p.passport,'A1234567');assert.equal(canvas.width,0);assert.equal(settings.at(-1).tessedit_char_whitelist,'');}finally{delete globalThis.document;}});
test('OCR errors restore worker parameters instead of leaking the MRZ whitelist to the next document',async()=>{const calls=[];const worker={setParameters:async p=>calls.push(p),recognize:async()=>{throw Error('worker failed');}};await assert.rejects(()=>recognizePassport({},worker),/worker failed/);assert.equal(calls.at(-1).tessedit_char_whitelist,'');});
