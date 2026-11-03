import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverOcrFields} from '../dist/ocr-field-recovery.js';
import {parsePassport} from '../dist/parser.js';
const passes=[
 'Surname\nA1234567\nGiven Names\nTEST PERSON\nNationality / Sex\nINDIAN M\nPlace of Birth\nMUMBAI, MAHARASHTRA\nDate of Issue Date of Explry\n22/11/2018 21/11/2028',
 'Given Names\nTEST PERSON\nNationality / Sex Date of Birth\nINDIAN M 19/01/2003\nDate of Issue Date of Expiry\n22/11/2018 21/11/2028',
 'Surname\nA 1 2 3 4 5 6 7\nSAMPLE\nGiven Names\nTEST PERSON\nNationality INDIAN',
 'Surname\nA 1 2 3 4 5 6 7\nSAMPLE\nGiven Names\nTEST PERSON\nDate of Issue Date of Expiry\n22/11/2018 21/11/2028'
];
test('recovers corroborated passport fields from split recognition passes',()=>{
 const data=recoverOcrFields(passes);
 for(const [key,value] of Object.entries({passport:'A1234567',surname:'SAMPLE',issued:'2018-11-22',expiry:'2028-11-21',nationality:'INDIAN'}))assert.equal(data.fields[key],value);
 const parsed=parsePassport(data.lines+'\nGiven Names: TEST PERSON');
 for(const key of ['passport','surname','issued','expiry','nationality'])assert.equal(parsed[key],data.fields[key]);
});
test('conflicting numbers and unverified names do not auto-fill',()=>{
 const data=recoverOcrFields([passes[0],passes[2].replace('A 1 2 3 4 5 6 7','B 7 6 5 4 3 2 1'),passes[3].replace('A 1 2 3 4 5 6 7','B 7 6 5 4 3 2 1')]);
 assert.equal(data.fields.passport,undefined);assert.equal(data.fields.surname,'SAMPLE');
});
test('unlabelled dates are not inferred as issue and expiry',()=>{
 const data=recoverOcrFields(['22/11/2018 21/11/2028','22/11/2018 21/11/2028']);
 assert.equal(data.fields.issued,undefined);assert.equal(data.fields.expiry,undefined);
});
