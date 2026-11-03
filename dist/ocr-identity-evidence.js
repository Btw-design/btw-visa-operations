// Conservative, independently testable recovery of passport fields from OCR.
// No person-specific patterns, hard-coded document values, or network access.
const linesOf = text => String(text || '').toUpperCase().split(/\r?\n/).map(s => s.replace(/\s+/g,' ').trim());
const dateISO = (d,m,y) => {
  const t = new Date(Date.UTC(+y,+m-1,+d));
  return t.getUTCFullYear()===+y && t.getUTCMonth()+1===+m && t.getUTCDate()===+d
    ? [y,m,d].join('-') : '';
};
const digit = text => text.replace(/[OQ]/g,'0').replace(/[IL]/g,'1');
const checksum = (digits,check) =>
  /^\d$/.test(check) && [...digits].reduce((sum,v,i)=>sum+(+v)*[7,3,1][i%3],0)%10===+check;
const unique = values => {
  const distinct=[...new Set(values.filter(Boolean))];
  return distinct.length===1?distinct[0]:'';
};
function validMrzFragment(passes,identity){
  const options=[];
  for(const text of passes)for(const line of linesOf(text)){
    const row=line.replace(/\s/g,'').replace(/[«‹＜]/g,'<');
    for(const m of row.matchAll(/IND([0-9OQIL]{6})([0-9OQIL])([MF<])([0-9OQIL]{6})([0-9OQIL])/g)){
      const before=row.slice(0,m.index),suffix=String(identity.passport||'').slice(-4);
      if(!suffix||!before.includes(suffix+'<'))continue;
      const birth=digit(m[1]),birthCheck=digit(m[2]),expiry=digit(m[4]),expiryCheck=digit(m[5]);
      if(!checksum(birth,birthCheck)||!checksum(expiry,expiryCheck))continue;
      const dob=dateISO(birth.slice(4,6),birth.slice(2,4),'20'+birth.slice(0,2));
      const expiryDate=dateISO(expiry.slice(4,6),expiry.slice(2,4),'20'+expiry.slice(0,2));
      if(dob&&expiryDate&&dob<expiryDate)options.push({dob,expiry:expiryDate,sex:m[3]==='M'?'Male':m[3]==='F'?'Female':''});
    }
  }
  const signature=unique(options.map(x=>x.dob+'|'+x.expiry+'|'+x.sex));
  return signature?options[0]:null;
}
function printedDates(passes){
  const dates=new Set();
  for(const text of passes)for(const line of linesOf(text))
    for(const m of line.matchAll(/\b([0-3]?\d)[/.\-]([01]?\d)[/.\-]((?:19|20)\d{2})\b/g)){
      const date=dateISO(m[1].padStart(2,'0'),m[2].padStart(2,'0'),m[3]);
      if(date)dates.add(date);
    }
  return dates;
}
function printedPlaceOfIssue(passes){
  const votes=new Map();
  passes.forEach((text,i)=>{
    const lines=linesOf(text);
    for(let j=0;j<lines.length;j++){
      if(!/PLACE\s+OF\s+ISSUE/.test(lines[j]))continue;
      for(let k=j+1;k<=Math.min(j+3,lines.length-1);k++){
        if(/DATE\s+OF|GIVEN\s+NAME|PLACE\s+OF\s+BIRTH/.test(lines[k]))break;
        const m=/^(?:\d{1,2}\s+)?([A-Z]{4,24})\s*$/.exec(lines[k]);
        if(!m)continue;
        if(!votes.has(m[1]))votes.set(m[1],new Set());
        votes.get(m[1]).add(i);
        break;
      }
    }
  });
  const candidates=[...votes].filter(([,indices])=>indices.size>=2);
  return candidates.length===1?candidates[0][0]:'';
}
function printedIssuer(passes){
  const votes=new Set();
  passes.forEach((text,i)=>{
    const lines=linesOf(text);
    for(let j=0;j<lines.length;j++)
      if(/COUNTRY\s+CODE/.test(lines[j])&&lines.slice(j,j+3).some(line=>/\bIND\b/.test(line)))votes.add(i);
  });
  return votes.size>=2?'INDIA':'';
}
// Returns fields only if the OCR evidence is consistent and independently
// corroborated. Missing or contradictory evidence leaves the field blank.
export function recoverIdentityEvidence(passes,accepted={}){
  const fields={},mrz=validMrzFragment(passes,accepted);
  if(mrz&&printedDates(passes).has(mrz.dob)&&(!accepted.expiry||mrz.expiry===accepted.expiry)){
    if(!accepted.dob||accepted.dob===mrz.dob)fields.dob=mrz.dob;
    if(mrz.sex&&(!accepted.sex||accepted.sex===mrz.sex))fields.sex=mrz.sex;
  }
  const place=printedPlaceOfIssue(passes);
  if(place&&(!accepted.issueplace||accepted.issueplace===place))fields.issueplace=place;
  const country=printedIssuer(passes);
  if(country&&(!accepted.issuecountry||accepted.issuecountry===country))fields.issuecountry=country;
  return fields;
}
