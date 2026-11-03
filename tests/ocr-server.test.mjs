import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createOcrGateway} from '../server/ocr-gateway.mjs';
import {websiteOcrConfig,readWebsitePassport} from '../dist/website-ocr.js';

const token='test-ocr-gateway-token-not-a-production-secret';
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
const visual=number=>`REPUBLIC OF INDIA\nPassport No. ${number}\nSurname\nSAMPLE\nGiven Name(s)\nTEST PERSON\nNationality / Sex\nINDIAN F\nDate of Birth\n19/01/2003\nPlace of Birth\nMUMBAI, MAHARASHTRA\nPlace of Issue\nMUMBAI\nDate of Issue\n28/10/2026\nDate of Expiry\n27/10/2036`;
function result(bytes,number='AB123456'){
 return {engine:'paddleocr',pipeline_version:'unit-test-pipeline-v1',input_sha256:createHash('sha256').update(bytes).digest('hex'),pages:[{visual_texts:[visual(number)],mrz_texts:[]}]};
}
async function request(handler,files=[png],{method='POST',path='/api/ocr/passport',origin='https://visa.example.com'}={}){
 const form=new FormData();for(const file of files)form.append('files',new Blob([file],{type:'image/png'}),'passport.png');
 const encoded=new Request('http://localhost/upload',{method:'POST',body:form}),bytes=Buffer.from(await encoded.arrayBuffer());
 const req=Readable.from([bytes]);req.method=method;req.headers={host:'visa.example.com',origin,'content-type':encoded.headers.get('content-type'),'content-length':String(bytes.length)};
 const res=new EventEmitter();res.destroyed=false;res.writableEnded=false;
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};res.end=body=>{res.body=JSON.parse(body);res.writableEnded=true;};
 assert.equal(await handler(req,res,path),true);return res;
}

test('website gateway forwards original bytes and returns canonical fields and the requested JSON format',async()=>{
 let calls=0;
 const handler=createOcrGateway({url:'http://ocr-worker:8000',token,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'http://ocr-worker:8000/ocr');assert.equal(options.headers.Authorization,'Bearer '+token);assert.deepEqual(options.body,png);
  return Response.json(result(options.body));
 }});
 const first=await request(handler),second=await request(handler);
 assert.equal(calls,2);assert.equal(first.status,200);assert.equal(first.headers['Cache-Control'],'no-store');
 assert.deepEqual(first.body,second.body);
 assert.equal(first.body.fields.passport,'AB123456');assert.equal(first.body.fields.issued,'2026-10-28');
 assert.equal(first.body.extraction.issue_date,'28-10-2026');assert.equal(first.body.extraction.place_of_birth,'MUMBAI, MAHARASHTRA');
 assert.equal(first.body.extraction.country_of_birth,'INDIA');assert.equal(Object.keys(first.body.extraction).length,14);
 assert.ok(!JSON.stringify(first.body).includes(token));assert.ok(!('visual_texts' in first.body));
});

test('different applicants in one upload are rejected before fields are returned',async()=>{
 let calls=0;const handler=createOcrGateway({url:'http://worker',token,fetchImpl:async(url,o)=>Response.json(result(o.body,++calls===1?'AB123456':'CD765432'))});
 const response=await request(handler,[png,Buffer.concat([png,Buffer.from([1])])]);
 assert.equal(response.status,409);assert.match(response.body.error,/one applicant/);assert.equal(response.body.fields,undefined);
});

test('wrong origins never invoke the OCR worker',async()=>{
 let calls=0;const handler=createOcrGateway({url:'http://worker',token,fetchImpl:async()=>{calls++;}});
 assert.equal((await request(handler,[png],{origin:'https://another.example'})).status,403);assert.equal(calls,0);
});

test('unavailable workers and mismatched document hashes fail without browser fallback',async()=>{
 for(const fetchImpl of [async()=>{throw Error('unreachable');},async(url,o)=>Response.json({...result(o.body),input_sha256:'wrong'})]){
  const handler=createOcrGateway({url:'http://worker',token,fetchImpl});const response=await request(handler);
  assert.ok([502,503].includes(response.status));assert.equal(response.body.fields,undefined);
 }
});

test('configuration exposes the selected engine without exposing its token or service URL',async()=>{
 const handler=createOcrGateway({url:'http://internal-worker:8000',token});
 const response=await request(handler,[],{method:'GET',path:'/api/ocr/config'});
 assert.deepEqual(response.body,{mode:'paddle',engine:'PaddleOCR',uploadsToServer:true});
 const legacy=await request(createOcrGateway({url:''}),[],{method:'GET',path:'/api/ocr/config'});
 assert.equal(legacy.body.mode,'browser');
});

test('MRZ crop output cannot provide an unlabelled issue date',async()=>{
 const handler=createOcrGateway({url:'http://worker',token,fetchImpl:async(url,o)=>{
  const value=result(o.body);value.pages[0].visual_texts=[visual('AB123456').replace('Date of Issue\n28/10/2026\n','')];
  value.pages[0].mrz_texts=['Date of Issue\n01/01/2010'];return Response.json(value);
 }});
 const response=await request(handler);assert.equal(response.status,200);assert.equal(response.body.extraction.issue_date,null);
});

test('the website client uploads files directly without decoding or resizing them',async()=>{
 const file=new File([png],'passport.png',{type:'image/png'});
 const result=await readWebsitePassport([file],async(path,options)=>{
  assert.equal(path,'/api/ocr/passport');assert.equal(options.credentials,'same-origin');
  assert.deepEqual(Buffer.from(await options.body.get('files').arrayBuffer()),png);
  return Response.json({engine:'PaddleOCR',fields:{passport:'AB123456'}});
 });
 assert.equal(result.fields.passport,'AB123456');
 await assert.rejects(()=>readWebsitePassport([file],async()=>Response.json({error:'OCR unavailable'},{status:503})),/OCR unavailable/);
});

test('a failed engine configuration is not silently treated as browser OCR',async()=>{
 assert.equal((await websiteOcrConfig(async()=>new Response('',{status:404}))).mode,'browser');
 await assert.rejects(()=>websiteOcrConfig(async()=>Response.json({error:'not available'},{status:503})),/Could not check/);
 assert.equal((await websiteOcrConfig(async()=>Response.json({mode:'paddle'}))).mode,'paddle');
});
