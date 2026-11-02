const $ = id => document.getElementById(id);
async function api(path, value) {
  const r = await fetch(path, value === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const result = await r.json();
  if (!r.ok) throw Error(result.error || 'Request failed.');
  return result;
}
function message(text) { $('message').textContent = text; }
function form(fields, label, submit) {
  const f = document.createElement('form');
  for (const [name,text,type,autocomplete] of fields) {
    const l = document.createElement('label'), input = document.createElement('input');
    l.htmlFor = name; l.textContent = text;
    input.id = input.name = name; input.type = type; input.required = true;
    if (autocomplete) input.autocomplete = autocomplete;
    input.maxLength = type === 'password' ? 128 : name === 'name' ? 100 : 254;
    if (name === 'newPassword') input.minLength = 12;
    f.append(l,input);
  }
  const button = document.createElement('button'); button.textContent = label; f.append(button);
  f.addEventListener('submit',async event => {
    event.preventDefault(); button.disabled = true; message('');
    try { await submit(Object.fromEntries(new FormData(f))); } catch(e) { message(e.message); }
    finally { button.disabled = false; }
  });
  return f;
}
function link(text, href) { const a=document.createElement('a');a.textContent=text;a.href=href;return a; }
function button(text, action) {
  const b=document.createElement('button');b.type='button';b.textContent=text;
  b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){message(e.message);}finally{b.disabled=false;}};
  return b;
}
async function init() {
  const path = location.pathname;
  if (path === '/login') {
    $('heading').textContent='Sign in to Visa Operations';
    $('intro').textContent='Use the work email and password provided by your administrator.';
    $('content').append(form([['email','Work email','email','username'],['password','Password','password','current-password']],'Sign in',async data=>{
      const user=await api('/api/login',data); location.assign(user.mustChangePassword ? '/account' : '/');
    }));
    const note=document.createElement('p');note.textContent='Forgot your password? Ask your administrator to reset it.';$('content').append(note);
    return;
  }
  const user = await api('/api/me');
  if (!$('auth-root')) {
    if(user.role!=='admin')document.querySelector('.btw-accountbar a[href="/admin"]')?.remove();
    return;
  }
  if (path === '/account') {
    $('heading').textContent=user.mustChangePassword ? 'Choose your own password' : 'My account';
    $('intro').textContent=`${user.name} · ${user.email}. ${user.mustChangePassword ? 'Change your temporary password before opening the app.' : 'You can change your password or sign out here.'}`;
    $('content').append(form([['currentPassword',user.mustChangePassword?'Temporary password':'Current password','password','current-password'],['newPassword','New password (at least 12 characters)','password','new-password'],['confirmPassword','Confirm new password','password','new-password']],'Save password',async data=>{
      if(data.newPassword!==data.confirmPassword)throw Error('The new passwords do not match.');
      await api('/api/password',data);location.assign('/');
    }));
    $('content').append(button('Sign out',async()=>{await api('/api/logout',{});location.assign('/login');}));
    if(!user.mustChangePassword)$('content').append(link('Back to the app','/'));
  }
  if(path === '/admin') {
    $('heading').textContent='Staff access';
    $('intro').textContent='Create staff accounts, disable access or issue a new temporary password. Share temporary passwords securely with the intended staff member.';
    $('content').append(link('Back to the app','/'));
    $('content').append(form([['name','Staff name','text','off'],['email','Work email','email','off']],'Create staff account',async data=>{
      const result=await api('/api/admin/users',data);
      message(`Account created: ${result.user.email}\nTemporary password: ${result.temporaryPassword}\nCopy it now. It is shown only in this response. The staff member must change it on first sign-in.`);
      await users();
    }));
    const container=document.createElement('div');container.id='users';container.className='btw-scroll';$('content').append(container);
    async function users() {
      const list=await api('/api/admin/users');container.replaceChildren();
      const table=document.createElement('table');
      const header=document.createElement('tr');for(const text of ['Staff','Status','Actions']){const th=document.createElement('th');th.textContent=text;header.append(th);}table.append(header);
      for(const person of list){
        const row=document.createElement('tr'),who=document.createElement('td'),status=document.createElement('td'),actions=document.createElement('td');
        who.textContent=`${person.name} (${person.email})`;status.textContent=person.active ? (person.mustChangePassword?'Password change required':'Active') : 'Disabled';
        if(person.role==='staff'){
          actions.append(button(person.active?'Disable':'Enable',async()=>{
            if(!confirm(`${person.active?'Disable':'Enable'} access for ${person.email}?`))return;
            await api(`/api/admin/users/${person.id}/${person.active?'disable':'enable'}`,{});message('Staff access updated.');await users();
          }),button('Reset password',async()=>{
            if(!confirm(`Reset the password and sign out ${person.email}?`))return;
            const result=await api(`/api/admin/users/${person.id}/reset`,{});
            message(`New temporary password for ${person.email}: ${result.temporaryPassword}\nShare it securely. All previous sessions have been revoked.`);await users();
          }));
        } else actions.textContent='Administrator';
        row.append(who,status,actions);table.append(row);
      }
      container.append(table);
    }
    await users();
  }
}
init().catch(e=>{if($('message'))message(e.message);else location.assign('/login');});
