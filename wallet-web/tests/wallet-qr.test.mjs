import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWalletQr} from '../.test-build/wallet-qr.mjs';

const address='bc1qr376r573797suy4un8qt2ee0xsjr580g4msjf2',validate=value=>{if(value!==address)throw new Error('invalid')};
test('routes a payment QR to Send',()=>assert.deepEqual(classifyWalletQr(`bitcoinII:${address}?amount=1`,validate),{kind:'send',address}));
test('routes a trusted BC2Market QR to Connect',()=>{
  const expiresAt=new Date(Date.now()+5*60*1000).toISOString(),network='bip122:0000000028f062b221c1a8a5cf0244b1',challenge='00112233445566778899aabbccddeeff';
  const request={v:1,type:'bc2_connect',id:'a'.repeat(32),origin:'https://bc2market.com',network,message:`BC2 Market login\nDomain: bc2market.com\nNetwork: ${network}\nChallenge: ${challenge}\nExpires: ${expiresAt}`,expiresAt,callback:'https://bc2market.com/api/wallet-connect/verify'};
  assert.deepEqual(classifyWalletQr(JSON.stringify(request),validate),{kind:'connect'});
});
test('rejects an unrelated QR',()=>assert.throws(()=>classifyWalletQr('https://evil.example',validate),/not a valid BC2/));
