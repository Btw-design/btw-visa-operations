import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/server.mjs';
import { passwordHash, tokenHash, openDatabase } from '../server/auth.mjs';

function rawFetch(url,options={}) {
  return new Promise((resolve,reject)=>{
    const req=httpRequest(url,{method:options.method||'GET',headers:options.headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on('error',reject);req.end(options.body);
  });
}

test('company login protects app and enforces staff lifecycle',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'btw-auth-'));
  const dbPath=join(dir,'auth.sqlite'), origin='http://127.0.0.1:3000';
  const {server,db}=await createApp({databasePath:dbPath,origin});
  const adminPassword='Admin-test-password-1234';
  const hash=await passwordHash(adminPassword);
  db.prepare("INSERT INTO users(email,name,password_hash,role,must_change,created_at) VALUES (?, ?, ?, 'admin',0,?)").run('admin@example.com','Test Admin',hash,Date.now());
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,{cookie,body,originHeader=origin,method=body===undefined?'GET':'POST'}={})=>{
    const headers={Host:'127.0.0.1:3000'};
    if(cookie)headers.Cookie=cookie;
    if(method==='POST'){headers.Origin=originHeader;headers['Content-Type']='application/json';}
    return rawFetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  };
  const login=async(email,password)=>{
    const r=await request('/api/login',{body:{email,password}});
    return {r,cookie:r.headers.get('set-cookie')?.split(';')[0],user:await r.json()};
  };
  let admin, staff, id, temporaryPassword;
  try {
    await t.test('anonymous app assets redirect; private APIs reject; account data cannot be fetched',async()=>{
      for(const path of ['/','/app.js','/vendor/lang/eng.traineddata.gz','/form-14a.pdf','/index.html']){
        const r=await request(path);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
      }
      assert.equal((await request('/api/me')).status,401);
      const r=await request('/login');assert.equal(r.status,200);assert.match(await r.text(),/Authorised staff only/);
    });
    await t.test('generic errors, origin protection and secure session hashing',async()=>{
      assert.equal((await login('nobody@example.com','wrong')).r.status,401);
      const csrf=await request('/api/login',{body:{email:'admin@example.com',password:adminPassword},originHeader:'https://evil.example'});assert.equal(csrf.status,403);
      admin=await login('ADMIN@example.com',adminPassword);assert.equal(admin.r.status,200);
      assert.match(admin.r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
      const token=admin.cookie.split('=')[1];assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash,tokenHash(token));
      const r=await request('/',{cookie:admin.cookie});assert.equal(r.status,200);assert.match(await r.text(),/Prepare it here/);
      for(const path of ['/server/auth.mjs','/data/auth.sqlite','/.gitignore','/../server/auth.mjs'])assert.equal((await request(path,{cookie:admin.cookie})).status,404);
    });
    await t.test('admin creates staff and temporary password blocks form until changed',async()=>{
      const r=await request('/api/admin/users',{cookie:admin.cookie,body:{email:'staff@example.com',name:'Test Staff'}});assert.equal(r.status,201);
      const result=await r.json();id=result.user.id;temporaryPassword=result.temporaryPassword;
      assert.ok(temporaryPassword.length>=12);assert.notEqual(db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash,temporaryPassword);
      staff=await login('staff@example.com',temporaryPassword);assert.equal(staff.r.status,200);assert.equal(staff.user.mustChangePassword,true);
      assert.equal((await request('/',{cookie:staff.cookie})).headers.get('location'),'/account');
      assert.equal((await request('/api/admin/users',{cookie:staff.cookie})).status,403);
      assert.equal((await request('/api/password',{cookie:staff.cookie,body:{currentPassword:temporaryPassword,newPassword:'short'}})).status,400);
      const changed=await request('/api/password',{cookie:staff.cookie,body:{currentPassword:temporaryPassword,newPassword:'Staff-own-password-1234'}});assert.equal(changed.status,200);
      const next=changed.headers.get('set-cookie').split(';')[0];assert.notEqual(next,staff.cookie);
      assert.equal((await request('/api/me',{cookie:staff.cookie})).status,401);staff.cookie=next;
      assert.equal((await request('/',{cookie:staff.cookie})).status,200);
    });
    await t.test('staff cannot administer accounts; only allowlisted users have access',async()=>{
      assert.equal((await request('/api/admin/users',{cookie:staff.cookie})).status,403);
      assert.equal((await request('/api/admin/users',{cookie:staff.cookie,body:{email:'rogue@example.com',name:'Rogue'}})).status,403);
      assert.equal((await request('/api/register',{body:{email:'rogue@example.com',password:'Some-password-1234'}})).status,401);
      const r=await request('/api/admin/users',{cookie:admin.cookie});const list=await r.json();assert.equal(list.length,2);assert.ok(list.every(x=>!('password_hash' in x)));
    });
    await t.test('disable revokes sessions; enable does not restore old sessions; reset forces new password',async()=>{
      assert.equal((await request(`/api/admin/users/${id}/disable`,{cookie:admin.cookie,body:{}})).status,200);
      assert.equal((await request('/api/me',{cookie:staff.cookie})).status,401);
      assert.equal((await login('staff@example.com','Staff-own-password-1234')).r.status,401);
      await request(`/api/admin/users/${id}/enable`,{cookie:admin.cookie,body:{}});
      assert.equal((await request('/api/me',{cookie:staff.cookie})).status,401);
      staff=await login('staff@example.com','Staff-own-password-1234');assert.equal(staff.r.status,200);
      const reset=await request(`/api/admin/users/${id}/reset`,{cookie:admin.cookie,body:{}});assert.equal(reset.status,200);
      assert.equal((await request('/api/me',{cookie:staff.cookie})).status,401);
      assert.equal((await login('staff@example.com','Staff-own-password-1234')).r.status,401);
      const fresh=await login('staff@example.com',(await reset.json()).temporaryPassword);assert.equal(fresh.user.mustChangePassword,true);
    });
    await t.test('sessions time out, logout revokes tokens, admin cannot disable itself',async()=>{
      assert.equal((await request('/api/admin/users/1/disable',{cookie:admin.cookie,body:{}})).status,400);
      db.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(Date.now()-3600001,tokenHash(admin.cookie.split('=')[1]));
      assert.equal((await request('/api/me',{cookie:admin.cookie})).status,401);
      admin=await login('admin@example.com',adminPassword);
      assert.equal((await request('/api/logout',{cookie:admin.cookie,body:{}})).status,200);
      assert.equal((await request('/api/me',{cookie:admin.cookie})).status,401);
    });
    await t.test('login throttling and request bounds',async()=>{
      for(let i=0;i<10;i++)assert.equal((await login('locked@example.com','wrong')).r.status,401);
      assert.equal((await login('locked@example.com','wrong')).r.status,429);
      assert.equal((await request('/api/login',{body:{email:'other@example.com',password:'x'.repeat(9000)}})).status,413);
    });
    await t.test('credentials persist across database reopen',async()=>{
      const second=openDatabase(dbPath);assert.equal(second.prepare('SELECT email FROM users WHERE id=?').get(id).email,'staff@example.com');second.close();
    });
  } finally {await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('production requires HTTPS and issues Secure host-scoped cookies',async()=>{
  await assert.rejects(()=>createApp({databasePath:':memory:',origin:'http://company.example',production:true}),/HTTPS/);
  const {server,db}=await createApp({databasePath:':memory:',origin:'https://company.example',production:true});
  db.prepare("INSERT INTO users(email,name,password_hash,role,must_change,created_at) VALUES (?, ?, ?, 'admin',0,?)").run('admin@example.com','Admin',await passwordHash('Test-password-123456'),Date.now());
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const r=await rawFetch(`http://127.0.0.1:${server.address().port}/api/login`,{method:'POST',headers:{Host:'company.example',Origin:'https://company.example','Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.com',password:'Test-password-123456'})});
    assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/^__Host-btw_session=.*; Secure$/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
