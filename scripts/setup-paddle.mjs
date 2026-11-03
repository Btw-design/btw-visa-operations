import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
const terminal=createInterface({input:process.stdin,output:process.stdout});
try{
 const host=(await terminal.question('Website hostname, for example visa.example.com: ')).trim().toLowerCase();
 if(!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)||!host.includes('.')||host.includes('..'))throw Error('Enter a hostname without https://, a port, or a path.');
 await writeFile(resolve('paddle.env'),`SITE_HOST=${host}\nOCR_SERVICE_TOKEN=${randomBytes(32).toString('hex')}\n`,{flag:'wx',mode:0o600});
 console.log('Created paddle.env. Keep it on the server and out of GitHub. No credentials were printed.');
}finally{terminal.close();}
