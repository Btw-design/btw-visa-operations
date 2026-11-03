import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

// Content hashes version the entire module graph, not just the entry script.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dist=resolve(root,'dist');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const done=new Map(),visiting=new Set();
async function version(path){
 if(done.has(path))return done.get(path);
 if(visiting.has(path))throw Error('Cyclic asset imports: '+path);
 visiting.add(path);
 let source=await readFile(path,'utf8');
 const imports=[...source.matchAll(/\b(?:from\s*|import\s*)(['"])(\.{1,2}\/[^'"?]+\.m?js)(?:\?v=[a-f0-9]+)?\1/g)];
 for(const match of imports){
  const dependency=resolve(dirname(path),match[2]);
  const hash=dependency.startsWith(resolve(dist,'vendor')+'/')?digest(await readFile(dependency)):await version(dependency);
  source=source.replace(match[0],match[0].replace(/\?v=[a-f0-9]+/,'').replace(match[2]+match[1],match[2]+'?v='+hash+match[1]));
 }
 await writeFile(path,source);
 const hash=digest(source);done.set(path,hash);visiting.delete(path);return hash;
}
for(const name of (await readdir(dist)).filter(x=>x.endsWith('.js')).sort())await version(resolve(dist,name));
for(const path of [resolve(dist,'index.html'),resolve(root,'index.html')]){
 let html=await readFile(path,'utf8');
 for(const match of [...html.matchAll(/\bsrc="([^"?]+\.m?js)(?:\?v=[a-f0-9]+)?"/g)]){
  const hash=done.get(resolve(dist,match[1]))||digest(await readFile(resolve(dist,match[1])));
  html=html.replace(match[0],`src="${match[1]}?v=${hash}"`);
 }
 await writeFile(path,html);
}
const files=Object.fromEntries([...done].sort(([a],[b])=>a.localeCompare(b)).map(([path,hash])=>[relative(dist,path),hash]));
await writeFile(resolve(dist,'ocr-release.json'),JSON.stringify({appVersion:files['app.js'].slice(0,12),files},null,2)+'\n');
console.log('Passport reader release '+files['app.js'].slice(0,12));
