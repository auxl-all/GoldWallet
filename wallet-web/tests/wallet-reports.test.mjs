import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceReport,reportAmount,reportCsv,reportDate,reportMovement} from '../.test-build/wallet-reports.mjs';

const own='0014'+'11'.repeat(20),other='0014'+'22'.repeat(20);
const output=(value,hex=own)=>({value,scriptPubKey:{hex}});
const received=(txid,value,time,height=1)=>({height,timestamp:time,transaction:{txid,vin:[{coinbase:'00'}],vout:[output(value)]},previousTransactions:{}});
const outgoing={height:2,timestamp:Date.parse('2026-11-12T05:00:00Z')/1000,transaction:{txid:'sent',vin:[{txid:'received',vout:0}],vout:[output(.4,other),output(.59999)]},previousTransactions:{received:{vout:[output(1)]}}};
const now=Date.parse('2026-11-12T11:00:00Z');
const initial=received('received',1,Date.parse('2026-10-01T00:00:00Z')/1000);
const pending=received('pending',.1,null,0);
const options={transactions:[initial,outgoing,pending],walletScriptHex:own,confirmed:59999000,unconfirmed:10000000,start:'2026-10-29',end:'2026-11-12',now};

test('reconstructs opening balances from history before the period and excludes pending',()=>{
  const report=balanceReport(options);
  assert.equal(report.rows.length,15);assert.equal(report.opening,100000000);assert.equal(report.closing,59999000);
  assert.equal(report.incoming,0);assert.equal(report.outgoing,40000000);assert.equal(report.fees,1000);
  assert.equal(report.net,-40001000);assert.equal(report.pendingTransactions,1);assert.equal(report.unconfirmed,10000000);
  assert.equal(report.rows[0].balance,100000000);assert.equal(report.rows.at(-1).balance,59999000);
  assert.equal(report.opening+report.incoming-report.outgoing-report.fees,report.closing);
});
test('self transfers count only fees and change is not incoming cash flow',()=>{
  const self={...outgoing,transaction:{...outgoing.transaction,vout:[output(.99999)]}};
  assert.deepEqual(reportMovement(self,own),{txid:'sent',height:2,date:'2026-11-12',incoming:0,outgoing:0,fee:1000,net:-1000});
});
test('UTC+7 midnight selects the correct day',()=>{
  assert.equal(reportDate(Date.parse('2026-11-11T16:59:59Z')),'2026-11-11');
  assert.equal(reportDate(Date.parse('2026-11-11T17:00:00Z')),'2026-11-12');
});
test('fails closed on missing inputs, missing times, mismatched balances and duplicate history',()=>{
  assert.throws(()=>reportMovement({...outgoing,previousTransactions:{}},own),/incomplete/);
  assert.throws(()=>reportMovement({...initial,timestamp:null},own),/block time/);
  assert.throws(()=>balanceReport({...options,confirmed:1}),/does not match/);
  assert.throws(()=>balanceReport({...options,transactions:[initial,initial]}),/Duplicate/);
  const mixed={...outgoing,transaction:{...outgoing.transaction,vin:[...outgoing.transaction.vin,{txid:'foreign',vout:0}]},previousTransactions:{...outgoing.previousTransactions,foreign:{vout:[output(1,other)]}}};
  assert.throws(()=>reportMovement(mixed,own),/Mixed-input/);
});
test('validates date ranges and generates CSV with exact eight-decimal amounts',()=>{
  assert.throws(()=>balanceReport({...options,start:'2026-11-13'}),/valid date/);
  assert.throws(()=>balanceReport({...options,end:'2026-11-13'}),/valid date/);
  assert.throws(()=>balanceReport({...options,start:'2026-02-30'}),/valid date/);
  const csv=reportCsv(balanceReport(options));
  assert.ok(csv.startsWith('\ufeffDate (UTC+7),'));assert.match(csv,/2026-11-12,0.00000000,0.40000000,0.00001000,-0.40001000,0.59999000,1/);
  assert.equal(reportAmount(1),'0.00000001');assert.equal(reportAmount(-1),'-0.00000001');
});
