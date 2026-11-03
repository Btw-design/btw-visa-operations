// Recover corroborated visual fields across independent Tesseract passes.
// Deliberately refuse conflicting identities and unlabelled dates.
const norm=s=>String(s||'').toUpperCase().replace(/\s+/g,' ').trim();
const docPattern=/(?:^|[^A-Z0-9])([A-Z](?:\s*\d){7}|[A-Z]{2}(?:\s*\d){6})(?=$|[^A-Z0-9])/g;
const datePattern=/\b([0-3]?\d)[/.\-]([01]?\d)[/.\-]((?:19|20)\d{2})\b/g;
const dateLabel=/DATE\s+OF\s+ISSUE|ISSUE\s+DATE|DATE\s+OF\s+EXP(?:IRY|LRY|IRATION)|EXPIRY\s+DATE/;
function validDate(s){
 const m=/^(\d\d?)[/.\-](\d\d?)[/.\-](\d{4})$/.exec(s);
 if(!m)return '';
 const y=+m[3],mo=+m[2],d=+m[1],dt=new Date(Date.UTC(y,mo-1,d));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d
  ?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';
}
function surname(lines){
 for(let i=0;i<lines.length;i++)if(/\bSURNAME\b/.test(lines[i])){
  for(let j=i+1;j<Math.min(i+4,lines.length);j++){
   const line=lines[j];
   if(/\b(?:GIVEN|NATIONALITY|DATE|BIRTH|PLACE|SEX|ISSUE)\b/.test(line))break;
   if(/\d/.test(line))continue;
   if(/^[A-Z]{2,20}(?: [A-Z]{2,20})?$/.test(line))return line;
  }
 }
 return '';
}
export function recoverOcrFields(passes){
 const keys=['surname','passport','issued','expiry','nationality','sex','issueplace'];
 const votes=Object.fromEntries(keys.map(k=>[k,new Map()]));
 const vote=(key,value,i)=>{if(!value)return;const m=votes[key];if(!m.has(value))m.set(value,new Set());m.get(value).add(i);};
 passes.forEach((raw,i)=>{
  const lines=String(raw||'').toUpperCase().split(/\r?\n/).map(norm).filter(Boolean);
  vote('surname',surname(lines),i);
  const docs=new Set();
  for(const line of lines)for(const match of line.matchAll(new RegExp(docPattern.source,'g'))){
   const doc=match[1].replace(/\s/g,'');
   if(/^(?:[A-Z]\d{7}|[A-Z]{2}\d{6})$/.test(doc))docs.add(doc);
  }
  for(const doc of docs)vote('passport',doc,i);
  if(lines.some(line=>/\bINDIAN\b|\bIND\b/.test(line)))vote('nationality','INDIAN',i);
  for(let j=0;j<lines.length;j++){
   const line=lines[j];
   if(/\bPLACE\s+OF\s+ISSUE\b/.test(line))
    for(let k=j+1;k<Math.min(j+3,lines.length);k++)
     if(/^[A-Z]{3,24}$/.test(lines[k])){vote('issueplace',lines[k],i);break;}
   const dates=[...line.matchAll(new RegExp(datePattern.source,'g'))].map(m=>validDate(m[0])).filter(Boolean);
   if(dates.length===2&&dates[0]<dates[1]&&lines.slice(Math.max(0,j-2),j+1).some(x=>dateLabel.test(x))){
    vote('issued',dates[0],i);vote('expiry',dates[1],i);
   }
   if(/\bINDIAN\b/.test(line)&&lines.slice(Math.max(0,j-3),j+1).some(x=>/\bSEX\b/.test(x))){
    if(/\bM\b/.test(line))vote('sex','Male',i);
    if(/\bF\b/.test(line))vote('sex','Female',i);
   }
  }
 });
 const fields={};
 for(const key of keys){const m=votes[key];if(m.size===1){const [value,ids]=[...m][0];if(ids.size>=2)fields[key]=value;}}
 const labels={surname:'Surname',passport:'Passport No',issued:'Date of Issue',expiry:'Date of Expiry',nationality:'Nationality',sex:'Sex',issueplace:'Place of Issue'};
 const lines=Object.entries(fields).map(([key,value])=>labels[key]+': '+(['issued','expiry'].includes(key)?value.split('-').reverse().join('/'):value)).join('\n');
 return {fields,lines};
}
