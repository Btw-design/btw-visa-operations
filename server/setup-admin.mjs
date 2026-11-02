import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, emailOf, validEmail, validPassword, passwordHash } from './auth.mjs';

const db=openDatabase(process.env.AUTH_DB_PATH || resolve(dirname(fileURLToPath(import.meta.url)),'..','data','auth.sqlite'));
let hidden=false;
const output=new Writable({write(chunk,encoding,callback){if(!hidden)process.stdout.write(chunk);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:Boolean(process.stdin.isTTY)});
try {
  if(db.prepare("SELECT id FROM users WHERE role='admin'").get())throw Error('An administrator already exists. Use the account screen to change its password.');
  const email=emailOf(await rl.question('Administrator work email: '));
  const name=(await rl.question('Administrator name: ')).trim();
  process.stdout.write('Administrator password (12-128 characters; hidden): ');hidden=true;
  const password=await rl.question('');hidden=false;process.stdout.write('\n');
  process.stdout.write('Confirm password (hidden): ');hidden=true;
  const confirmation=await rl.question('');hidden=false;process.stdout.write('\n');
  if(!validEmail(email)||!name||name.length>100)throw Error('Enter a valid email and name.');
  if(!validPassword(password)||password!==confirmation)throw Error('Passwords must match and contain 12-128 characters.');
  const hash=await passwordHash(password);
  db.prepare("INSERT INTO users(email,name,password_hash,role,must_change,created_at) VALUES (?,?,?,'admin',0,?)").run(email,name,hash,Date.now());
  console.log('Administrator created. Run node server/server.mjs to start the company login app.');
} catch(e){console.error(e.message);process.exitCode=1;} finally{rl.close();db.close();}
