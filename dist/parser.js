import {countryNames} from './countries.js';
import {identifyDistrict} from './address.js';

const labels={
 surname:/\bSURNAME\b/i,
 given:/\b(?:GIVEN\s*NAMES?(?:\s*\(S\))?|FIRST\s*NAME(?:\(S\))?)/i,
 passport:/\b(?:PASSPORT\s*(?:NO\.?|NUMBER)|TRAVEL\s*DOCUMENT\s*(?:NO\.?|NUMBER))\b/i,
 dob:/\b(?:DATE\s*OF\s*BIRTH|BIRTH\s*DATE|DOB)\b/i,
 issued:/\b(?:DATE\s*OF\s*ISSUE|ISSUE\s*DATE)\b/i,
 expiry:/\b(?:DATE\s*OF\s*EXPIRY|EXPIRY\s*DATE|DATE\s*OF\s*EXPIRATION)\b/i,
 birthplace:/\bPLACE\s*OF\s*BIRTH\b/i,issueplace:/\bPLACE\s*OF\s*ISSUE\b/i,
 nationality:/\bNATIONALITY\b/i,sex:/\b(?:SEX|GENDER)\b/i,address:/\bADDRESS\b/i
};
const datePattern=/\b([0-3]?\d)\s*[/.-]\s*([01]?\d)\s*[/.-]\s*((?:19|20)\d{2})\b/;
const oldPassport=/\b(?:OLD\s*PASSPORT|FILE\s*(?:NO|NUMBER)|FATHER|MOTHER|SPOUSE)\b/i;
function validDate(year,month,day){const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;}
function visualDate(value){const m=value.match(datePattern);if(!m)return '';const[,d,mth,y]=m;return validDate(+y,+mth,+d)?`${y}-${mth.padStart(2,'0')}-${d.padStart(2,'0')}`:'';}
function cleanName(value){const s=value.replace(/^[\s:/.|\-]+/,'').replace(/\s+/g,' ').trim();return /^[A-Z]+(?:[ '\-][A-Z]+)*$/.test(s)&&!Object.values(labels).some(re=>re.test(s))&&!oldPassport.test(s)?s:'';}
// Read English labels and their values, including two-column date rows.
function labelled(lines,key){
 for(let i=0;i<lines.length;i++){
  if(oldPassport.test(lines[i]))continue;
  const matches=Object.entries(labels).flatMap(([id,re])=>{const m=re.exec(lines[i]);return m?[{id,start:m.index,end:m.index+m[0].length}]:[];}).sort((a,b)=>a.start-b.start);
  const at=matches.findIndex(x=>x.id===key);if(at<0)continue;
  const tail=lines[i].slice(matches[at].end,matches[at+1]?.start).replace(/^[\s:/.|\-()]+/,'').trim();
  if(tail&&/[A-Z0-9]/.test(tail))return tail;
  for(let n=1;n<=2&&i+n<lines.length;n++){
   const next=lines[i+n];if(oldPassport.test(next)||Object.values(labels).some(re=>re.test(next)))break;
   if(!/[A-Z0-9]/.test(next))continue;
   if(['dob','issued','expiry'].includes(key)){
    const dates=[...next.matchAll(new RegExp(datePattern.source,'g'))],dateLabels=matches.filter(x=>['dob','issued','expiry'].includes(x.id));
    return dates[dateLabels.findIndex(x=>x.id===key)]?.[0]||'';
   }
   return next;
  }
 }
 return '';
}
function checkDigit(value,digit){if(!/^\d$/.test(digit))return false;const w=[7,3,1];let sum=0;for(let i=0;i<value.length;i++){const c=value[i],n=c==='<'?0:/\d/.test(c)?+c:c.charCodeAt(0)-55;if(n<0||n>35)return false;sum+=n*w[i%3];}return sum%10===+digit;}
function mrzDate(s,birth){if(!/^\d{6}$/.test(s))return '';let year=2000+(+s.slice(0,2));const today=new Date().toISOString().slice(0,10);if(birth&&`${year}-${s.slice(2,4)}-${s.slice(4,6)}`>today)year-=100;return validDate(year,+s.slice(2,4),+s.slice(4,6))?`${year}-${s.slice(2,4)}-${s.slice(4,6)}`:'';}
export function passportNeedsRetry(text){const p=parsePassport(text);return ['passport','dob','expiry'].some(k=>!p[k])||(!p.given&&!p.surname);}
export function passportWarnings(p){const missing=[['given','given name'],['surname','surname'],['passport','passport number'],['dob','date of birth'],['issued','issue date'],['expiry','expiry date']].filter(([k])=>!p[k]).map(([,label])=>label);return missing.length?`Not read reliably: ${missing.join(', ')}. Check the original and enter missing details.`:'';}
export function parsePassport(text){
 text=String(text).normalize('NFKC').toUpperCase();const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out={};
 for(const key of ['surname','given']){const v=cleanName(labelled(lines,key));if(v)out[key]=v;}
 const passport=labelled(lines,'passport').match(/\b([A-Z]\s*\d(?:\s*\d){6})\b/);if(passport)out.passport=passport[1].replace(/\s/g,'');
 for(const key of ['dob','issued','expiry']){const v=visualDate(labelled(lines,key));if(v)out[key]=v;}
 const nat=labelled(lines,'nationality');if(/\bINDIAN\b/.test(nat))out.nationality='INDIAN';else if(countryNames[nat])out.nationality=countryNames[nat];
 const sex=labelled(lines,'sex').match(/\b(FEMALE|MALE|F|M)\b/);if(sex)out.sex=/^(F|FEMALE)$/.test(sex[1])?'Female':'Male';
 const birthValue=labelled(lines,'birthplace'),birth=birthValue.match(/^([A-Z][A-Z .'-]*?)(?:\s*,\s*|\s{2,})([A-Z][A-Z .'-]*)$/);
 if(birth){out.birthplace=birth[1].trim();out.birthstate=birth[2].trim();}else{const v=cleanName(birthValue);if(v)out.birthplace=v;}
 const issue=cleanName(labelled(lines,'issueplace'));if(issue)out.issueplace=issue;
 const mrz=lines.map(x=>x.replace(/[«‹＜]/g,'<').replace(/\s/g,'')).filter(x=>/^[A-Z0-9<]+$/.test(x));
 const first=mrz.find(x=>/^P<[A-Z]{3}/.test(x)),issuer=first?.slice(2,5);
 if(issuer&&countryNames[issuer])out.issuecountry=countryNames[issuer];else if(/REPUBLIC\s+OF\s+INDIA/.test(text))out.issuecountry='INDIA';
 const second=mrz.find(x=>x.length===44&&/^[A-Z0-9<]{9}\d[A-Z<]{3}[A-Z0-9]{6}\d[FM<]/.test(x));
 if(first&&second){
  const numeric=s=>s.replace(/[OQ]/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/B/g,'8');
  const doc=second.slice(0,9),dob=numeric(second.slice(13,19)),expiry=numeric(second.slice(21,27));
  const dv=checkDigit(doc,second[9]),bv=checkDigit(dob,second[19]),ev=checkDigit(expiry,second[27]);
  if(dv)out.passport=doc.replace(/<+$/,'');
  if(bv&&!out.dob){const v=mrzDate(dob,true);if(v)out.dob=v;}
  if(ev&&!out.expiry){const v=mrzDate(expiry,false);if(v)out.expiry=v;}
  if(dv&&bv&&ev&&first.length===44){
   const names=first.slice(5).split('<<'),surname=cleanName(names[0].replace(/</g,' ').trim()),given=cleanName((names[1]||'').replace(/</g,' ').trim());
   if(surname&&!out.surname)out.surname=surname;if(given&&!out.given)out.given=given;
   if(!out.sex&&/[FM]/.test(second[20]))out.sex=second[20]==='F'?'Female':'Male';
   const n=second.slice(10,13);if(n==='IND')out.nationality='INDIAN';else if(countryNames[n])out.nationality=countryNames[n];
  }
 }
 if(out.passport)out.documentType='International Passport';
 // Never silently swap dates or populate a contradictory chronology.
 if(out.issued&&out.expiry&&out.issued>=out.expiry){delete out.issued;delete out.expiry;}
 if(out.dob&&out.issued&&out.dob>=out.issued){delete out.dob;delete out.issued;}
 if(out.dob&&out.dob>new Date().toISOString().slice(0,10))delete out.dob;
 const a=lines.findIndex(x=>labels.address.test(x)&&!oldPassport.test(x));
 if(a>=0){let stop=lines.findIndex((x,i)=>i>a&&(oldPassport.test(x)||/^P</.test(x)||/--- DOCUMENT PAGE ---/.test(x)));if(stop<0)stop=lines.length;
  const inline=lines[a].slice(lines[a].search(labels.address)+7).replace(/^[\s:/.|\-]+/,'');
  const value=[inline,...lines.slice(a+1,stop)].filter(Boolean).join(', ').replace(/\s*,\s*/g,', ').trim();if(value)out.address=value;
 }
 if(out.address){const r=out.address.match(/PIN\s*:?\s*\d{6}\s*,\s*([A-Z ]+)\s*,\s*(INDIA)\b/);if(r){out.resstate=r[1].trim();out.rescountry='INDIA';}out.district=identifyDistrict(out.address,out.resstate,out.rescountry);if(!out.district)delete out.district;}
 return out;
}
