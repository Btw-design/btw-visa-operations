import {postalDirectory} from './postal-directory.js';
const normalize=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const districtNames=[...new Set(Object.values(postalDirectory).flat().map(x=>x[0]))];
export function identifyDistrict(address,state='',country=''){
 const a=String(address||'').toUpperCase(),norm=normalize(a),st=normalize(state);
 if(country&&!/^(INDIA|INDIAN|IND)$/i.test(country.trim()))return '';
 const explicit=a.match(/(?:\bDISTRICT\b|\bDIST\.?)(?:\s*[:=-]\s*|\s+)([A-Z][A-Z .-]*?)(?=,|\n|\bPIN\b|\d{6}|$)/);
 if(explicit)return normalize(explicit[1]);
 const pins=[...a.matchAll(/\b[1-9]\d{5}\b/g)].map(x=>x[0]),segments=a.split(/[,\n]/).map(normalize);
 let candidates=[...new Map(pins.flatMap(p=>postalDirectory[p]||[]).map(r=>[r.join('|'),r])).values()];
 if(st&&candidates.length){const matching=candidates.filter(r=>normalize(r[1])===st);if(!matching.length)return '';candidates=matching;}
 let districts=[...new Set(candidates.map(r=>r[0]))];if(districts.length===1)return districts[0];
 if(districts.length>1){const matches=districts.filter(d=>segments.includes(normalize(d)));return matches.length===1?matches[0]:'';}
 // Without a directory match, accept an exact address component only; never guess from a street name.
 const matches=districtNames.filter(d=>segments.includes(normalize(d)));return matches.length===1?matches[0]:'';
}
