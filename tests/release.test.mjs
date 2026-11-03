import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dist=resolve(root,'dist');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('release hashes match every application module and its versioned dependencies',async()=>{
 const release=JSON.parse(await readFile(resolve(dist,'ocr-release.json'),'utf8'));
 for(const [name,hash]of Object.entries(release.files)){
  const bytes=await readFile(resolve(dist,name));assert.equal(digest(bytes),hash,name);
  for(const m of bytes.toString().matchAll(/\b(?:from\s*|import\s*)(['"])(\.{1,2}\/[^'"?]+\.m?js)\?v=([a-f0-9]+)\1/g)){
   assert.equal(digest(await readFile(resolve(dist,dirname(name),m[2]))),m[3],name+' -> '+m[2]);
  }
 }
 assert.equal(release.appVersion,release.files['app.js'].slice(0,12));
});

test('both entry pages use the current content hashes for scripts',async()=>{
 for(const page of [resolve(root,'index.html'),resolve(dist,'index.html')]){
  const html=await readFile(page,'utf8'),scripts=[...html.matchAll(/\bsrc="([^"?]+\.m?js)\?v=([a-f0-9]+)"/g)];
  assert.equal(scripts.length,3);
  for(const m of scripts)assert.equal(m[2],digest(await readFile(resolve(dist,m[1]))),m[1]);
  assert.match(html,/id="readerVersion"/);
 }
});

test('a changed dependency changes the entry URL and rebuilding is idempotent',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'ocr-release-'));
 try{
  await mkdir(resolve(dir,'scripts'));await mkdir(resolve(dir,'dist'));
  await copyFile(resolve(root,'scripts/version-assets.mjs'),resolve(dir,'scripts/version-assets.mjs'));
  await writeFile(resolve(dir,'dist/app.js'),"import {value} from './leaf.js';\nexport {value};\n");
  await writeFile(resolve(dir,'dist/leaf.js'),'export const value=1;\n');
  for(const path of ['index.html','dist/index.html'])await writeFile(resolve(dir,path),'<script type="module" src="app.js"></script>');
  let run=0;const build=()=>import(pathToFileURL(resolve(dir,'scripts/version-assets.mjs')).href+'?run='+run++);
  await build();const first=await readFile(resolve(dir,'dist/index.html'),'utf8');
  await build();assert.equal(await readFile(resolve(dir,'dist/index.html'),'utf8'),first);
  await writeFile(resolve(dir,'dist/leaf.js'),'export const value=2;\n');await build();
  assert.notEqual(await readFile(resolve(dir,'dist/index.html'),'utf8'),first);
  const app=await readFile(resolve(dir,'dist/app.js'),'utf8');assert.match(app,/leaf\.js\?v=[a-f0-9]{64}/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
