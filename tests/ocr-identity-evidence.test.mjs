import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverIdentityEvidence} from '../dist/ocr-identity-evidence.js';
import {combinePassportPasses} from '../dist/passport-ocr.js';
import {parsePassport} from '../dist/parser.js';

const fixture=[
  'Surname\\nSAMPLE\\nPassport No A1234567\\nGiven Name(s)\\nTEST PERSON\\nPlace of Issue\\nPUNE\\nDate of Issue Date of Expiry\\n22/11/2018 21/11/2028',
  'Nationality / Sex Date of Birth\\nINDIAN M 19/01/2003\\n4567<4IND0301198M2811213<<<<',
  'Country Code\\nP IND\\nPlace of Issue\\nPUNE',
  'Country Code\\nP IND\\nPassport No A1234567'
].map(x=>x.replaceAll('\\n','\n'));

test('corroborated fields complete OCR text without replacing existing ones',()=>{
 const combined=combinePassportPasses(fixture);
 const parsed=parsePassport(combined);
 assert.equal(parsed.dob,'2003-01-19');
 assert.equal(parsed.sex,'Male');
 assert.equal(parsed.issueplace,'PUNE');
 assert.equal(parsed.issuecountry,'INDIA');
});

test('MRZ and printed date must agree for DOB recovery',()=>{
 const changed=fixture.map(x=>x.replace('19/01/2003','20/01/2003'));
 const accepted={passport:'A1234567',expiry:'2028-11-21'};
 assert.equal(recoverIdentityEvidence(changed,accepted).dob,undefined);
});

test('foreign document evidence cannot fill missing identity fields',()=>{
 const result=recoverIdentityEvidence(fixture,{passport:'Z9876543',expiry:'2028-11-21'});
 assert.equal(result.dob,undefined);
 assert.equal(result.sex,undefined);
});

test('one unsupported place of issue is not auto-filled',()=>{
 const result=recoverIdentityEvidence(fixture.slice(0,2),{passport:'A1234567'});
 assert.equal(result.issueplace,undefined);
});
