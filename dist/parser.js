import {countryNames} from './countries.js';
import {identifyDistrict} from './address.js';
import {readPassportMrz} from './passport-mrz.js';

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
const oldPassport=/\b(?:(?:OLD|PREVIOUS)\s*PASSPORT|FILE\s*(?:NO|NUMBER)|FATHER|MOTHER|SPOUSE)\b/i;
const indianStates=['ANDAMAN AND NICOBAR ISLANDS','ANDHRA PRADESH','ARUNACHAL PRADESH','ASSAM','BIHAR','CHANDIGARH','CHHATTISGARH','DADRA AND NAGAR HAVELI AND DAMAN AND DIU','DELHI','GOA','GUJARAT','HARYANA','HIMACHAL PRADESH','JAMMU AND KASHMIR','JHARKHAND','KARNATAKA','KERALA','LADAKH','LAKSHADWEEP','MADHYA PRADESH','MAHARASHTRA','MANIPUR','MEGHALAYA','MIZORAM','NAGALAND','ODISHA','PUDUCHERRY','PUNJAB','RAJASTHAN','SIKKIM','TAMIL NADU','TELANGANA','TRIPURA','UTTAR PRADESH','UTTARAKHAND','WEST BENGAL'];
// A continuation of an old-passport block must not become current identity data.
function currentPassportLines(lines){
 let old=false;
 return lines.filter(line=>{
  if(/--- DOCUMENT PAGE ---|^P<|REPUBLIC\s+OF\s+INDIA/.test(line))old=false;
  if(/\b(?:OLD|PREVIOUS)\s*PASSPORT\b/.test(line))old=true;
  return !old;
 });
}
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
export function passportNeedsRetry(text){const p=parsePassport(text);return ['passport','dob','expiry','given','surname','issued',...(p.issuecountry==='INDIA'?['birthplace','birthstate','issueplace']:[])].some(k=>!p[k]);}
export function passportWarnings(p){const missing=[['given','given name'],['surname','surname'],['passport','passport number'],['dob','date of birth'],['issued','issue date'],['expiry','expiry date']].filter(([k])=>!p[k]).map(([,label])=>label);return missing.length?`Not read reliably: ${missing.join(', ')}. Check the original and enter missing details.`:'';}
export function parsePassport(text){
 text=String(text).normalize('NFKC').toUpperCase();const lines=text.replace(/[\u0900-\u097f]+/g,' ').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),current=currentPassportLines(lines),out={};
 for(const key of ['surname','given']){const v=cleanName(labelled(current,key));if(v)out[key]=v;}
 const passport=labelled(current,'passport').match(/\b((?:[A-Z]\s*\d(?:\s*\d){6}|[A-Z]\s*[A-Z]\s*\d(?:\s*\d){5}))\b/);if(passport)out.passport=passport[1].replace(/\s/g,'');
 for(const key of ['dob','issued','expiry']){const v=visualDate(labelled(current,key));if(v)out[key]=v;}
 const nat=labelled(current,'nationality');if(/\bINDIAN\b/.test(nat))out.nationality='INDIAN';else if(countryNames[nat])out.nationality=countryNames[nat];
 const sex=labelled(current,'sex').match(/\b(FEMALE|MALE|F|M)\b/);if(sex)out.sex=/^(F|FEMALE)$/.test(sex[1])?'Female':'Male';
 const birthValue=labelled(current,'birthplace'),birth=birthValue.match(/^([A-Z][A-Z .'-]*?)(?:\s*,\s*|\s{2,})([A-Z][A-Z .'-]*)$/);
 if(birth){out.birthplace=birth[1].trim();out.birthstate=birth[2].trim();}else{const v=cleanName(birthValue);if(v)out.birthplace=v;}
 const state=indianStates.find(s=>birthValue===s||birthValue.endsWith(', '+s)||birthValue.endsWith(','+s)||birthValue.endsWith(' '+s));
 if(state){const place=cleanName(birthValue.slice(0,-state.length).replace(/[ ,]+$/,''));if(place)out.birthplace=place;else delete out.birthplace;out.birthstate=state;out.birthcountry='INDIA';}
 const issue=cleanName(labelled(current,'issueplace'));if(issue)out.issueplace=issue;
 const mrz=readPassportMrz(text);
 if(!out.issuecountry&&/REPUBLIC\s+OF\s+INDIA/.test(text))out.issuecountry='INDIA';
 const conflict=['passport','dob','expiry'].some(key=>out[key]&&mrz[key]&&out[key]!==mrz[key]);
 if(conflict){for(const key of ['passport','dob','expiry','given','surname','issued','sex','nationality'])delete out[key];}
 else for(const [key,value]of Object.entries(mrz)){
  if(!out[key])out[key]=value;
  else if(['given','surname'].includes(key)){
   if(out[key].replace(/[^A-Z]/g,'')!==value.replace(/[^A-Z]/g,''))delete out[key];
  }else if(['sex','nationality'].includes(key)&&out[key]!==value)delete out[key];
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
