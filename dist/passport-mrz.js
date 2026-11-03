import {countryNames} from './countries.js';
// Corrections are position-specific, not global replacements in names or passport IDs.
const digits=s=>s.replace(/[OQ]/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/B/g,'8').replace(/T/g,'7');
const letters=s=>s.replace(/0/g,'O').replace(/1/g,'I').replace(/2/g,'Z').replace(/5/g,'S').replace(/8/g,'B');
function checked(value,digit){if(!/^\d$/.test(digit))return false;let sum=0;for(let i=0;i<value.length;i++){const c=value[i],v=c==='<'?0:/\d/.test(c)?+c:c.charCodeAt(0)-55;if(v<0||v>35)return false;sum+=v*[7,3,1][i%3];}return sum%10===+digit;}
function date(s,birth){if(!/^\d{6}$/.test(s))return '';let y=2000+(+s.slice(0,2));if(birth&&`${y}-${s.slice(2,4)}-${s.slice(4,6)}`>new Date().toISOString().slice(0,10))y-=100;const m=+s.slice(2,4),d=+s.slice(4,6),v=new Date(Date.UTC(y,m-1,d));return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d?`${y}-${s.slice(2,4)}-${s.slice(4,6)}`:'';}
function name(s){s=s.replace(/</g,' ').replace(/\s+/g,' ').trim();return /^[A-Z]+(?: [A-Z]+)*$/.test(s)?s:'';}
export function readPassportMrz(text){
 const rows=String(text).normalize('NFKC').toUpperCase().split(/\r?\n/).map(s=>s.replace(/[«‹＜]/g,'<').replace(/\s/g,'')).filter(s=>/^[A-Z0-9<]+$/.test(s));
 const firsts=rows.filter(s=>/^P<[A-Z0-9]{3}/.test(s)).map(s=>({line:s,issuer:letters(s.slice(2,5))})).filter(x=>countryNames[x.issuer]);
 const result={};if(firsts.length)result.issuecountry=countryNames[firsts[0].issuer];
 const candidates=[];
 for(const row of rows){
  if(row.length!==44||!/[FM<]/.test(row[20])||row.startsWith('P<'))continue;
  const nationality=letters(row.slice(10,13));if(!countryNames[nationality])continue;
  const birth=digits(row.slice(13,19)),expiry=digits(row.slice(21,27));
  const birthValid=checked(birth,digits(row[19]))&&!!date(birth,true),expiryValid=checked(expiry,digits(row[27]))&&!!date(expiry,false);
  let doc=row.slice(0,9),docValid=checked(doc,digits(row[9]));
  // Indian numbers may have one letter/seven digits or two letters/six digits.
  // Preserve the letter prefix; accept a repair only when it is unambiguous.
  if(!docValid&&firsts.some(x=>x.issuer==='IND')&&/^[A-Z][A-Z0-9]{7}<$/.test(doc)&&birthValid&&expiryValid){
   const fixes=[doc[0]+digits(doc.slice(1,8))+'<',doc.slice(0,2)+digits(doc.slice(2,8))+'<'];
   const valid=[...new Set(fixes.filter(x=>/^(?:[A-Z]\d{7}|[A-Z]{2}\d{6})<$/.test(x)&&checked(x,digits(row[9]))))];
   if(valid.length===1){doc=valid[0];docValid=true;}
  }
  if(!docValid||!birthValid||!expiryValid)continue;
  candidates.push({passport:doc.replace(/<+$/,''),dob:date(birth,true),expiry:date(expiry,false),sex:row[20]==='F'?'Female':row[20]==='M'?'Male':'',nationality:nationality==='IND'?'INDIAN':countryNames[nationality]});
 }
 if(!candidates.length)return result;
 const identities=new Set(candidates.map(x=>[x.passport,x.dob,x.expiry].join('|')));
 if(identities.size!==1)return result; // Conflicting valid passes need manual review.
 Object.assign(result,candidates[0]);if(!result.sex)delete result.sex;
 const names=firsts.filter(x=>x.line.length>=28&&x.line.length<=44&&x.line.slice(5).includes('<<')).map(x=>{const parts=x.line.slice(5).split('<<');return {surname:name(parts[0]),given:name(parts[1]||'')};});
 const printedNames=new Set(String(text).toUpperCase().split(/\r?\n/).map(name).filter(Boolean));
 for(const key of ['surname','given']){const values=new Set(names.map(x=>x[key]).filter(Boolean));const corroborated=[...values].filter(x=>printedNames.has(x));if(corroborated.length===1)result[key]=corroborated[0];else if(values.size===1)result[key]=[...values][0];}
 return result;
}
