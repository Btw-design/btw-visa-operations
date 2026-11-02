import {countryNames} from './countries.js';
import {identifyDistrict} from './address.js';
export function parsePassport(text) {
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean), out={};
 const issuingMrz=lines.find(x=>/P<[A-Z]{3}/.test(x));
 const issuer=issuingMrz?.match(/P<([A-Z]{3})/)?.[1];
 if(issuer&&countryNames[issuer])out.issuecountry=countryNames[issuer];
 else if(/REPUBLIC OF INDIA/i.test(text))out.issuecountry='INDIA';
 const mrz=lines.find(x=>/P<IND/.test(x));
 if(mrz){const n=mrz.slice(mrz.indexOf('P<IND')+5).split('<<');out.surname=n[0].replace(/</g,' ').trim();out.given=(n[1]||'').replace(/</g,' ').trim();out.nationality='INDIAN';out.documentType='International Passport';}
 const doc=lines.find(x=>/^[A-Z][0-9]{7}</.test(x));
 if(doc)out.passport=doc.slice(0,8);
 const dates=[...text.matchAll(/\b([0-3]\d)[/.-]([01]\d)[/.-]((?:19|20)\d{2})\b/g)].map(x=>`${x[3]}-${x[2]}-${x[1]}`);
 if(dates.length>=3){[out.dob,out.issued,out.expiry]=dates;}
 if(doc&&/[FM]\d{6}/.test(doc))out.sex=doc.match(/([FM])\d{6}/)[1]==='F'?'Female':'Male';
 const birth=lines.findIndex(x=>/Place of Birth/i.test(x));
 if(birth>=0){const val=lines[birth+1]?.match(/([A-Z]+)[, ]+([A-Z ]+)/);if(val){out.birthplace=val[1];out.birthstate=val[2].trim();}}
 const issue=lines.findIndex(x=>/Place of issue/i.test(x));
 if(issue>=0){const v=lines[issue+1]?.match(/^([A-Z][A-Z ]+)/);if(v)out.issueplace=v[1].trim();}
 const a=lines.findIndex(x=>/\/\s*Address/i.test(x));
 if(a>=0){let stop=lines.findIndex((x,i)=>i>a&&/Old Passport/i.test(x));if(stop<0)stop=lines.length;const v=lines.slice(a+1,stop).join(', ');out.address=v.replace(/\s*,\s*/g,', ').trim();}
 const residence=text.match(/PIN\s*:\s*\d{6}\s*,\s*([A-Z ]+)\s*,\s*(INDIA)\b/);if(residence){out.resstate=residence[1].trim();out.rescountry=residence[2];}
 if(out.address)out.district=identifyDistrict(out.address,out.resstate,out.rescountry);
 return out;
}
