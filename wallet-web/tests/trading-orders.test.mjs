import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTradingAccount,signTradingOrder,tradingOrderDigest} from '../.test-build/trading-orders.mjs';

const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const address='0x9858effd232b4033e47d90003d41ec34ecaeda94';
const typedOrder={
  chainId:31337,
  verifyingContract:'0x1111111111111111111111111111111111111111',
  order:{maker:address,sellToken:'0x2222222222222222222222222222222222222222',buyToken:'0x3333333333333333333333333333333333333333',sellAmount:'100000000',buyAmount:'250000',nonce:'7',expiry:'1800000000'}
};

test('derives the standard EVM trading account',()=>{
  const account=deriveTradingAccount(mnemonic);
  assert.equal(account.address,address);
  assert.equal(account.path,"m/44'/60'/0'/0/0");
  assert.equal('privateKey' in account,false);
});

test('produces a stable EIP-712 digest and a 65-byte low-s signature',()=>{
  const signed=signTradingOrder(mnemonic,typedOrder);
  assert.equal(signed.digest,tradingOrderDigest(typedOrder));
  assert.equal(signed.digest,'0x6023f67f7743c5245d666864b5d93bc598534fd36e9b43cf83440e5e9da7b13b');
  assert.equal(signed.signature,'0xf6afb8ce07a8fc2a304cbf391f17f26c2fb098dece8c8f0f5c5cb489bba28ab309482034789bd79be4a961b37e518b1d79642e7f1d8614c7232ff3f4afdb03a91b');
  assert.match(signed.digest,/^0x[0-9a-f]{64}$/);
  assert.match(signed.signature,/^0x[0-9a-f]{130}$/);
  assert.ok(['1b','1c'].includes(signed.signature.slice(-2)));
});

test('refuses to sign an order for another maker or malformed address',()=>{
  assert.throws(()=>signTradingOrder(mnemonic,{...typedOrder,order:{...typedOrder.order,maker:'0x4444444444444444444444444444444444444444'}}),/does not match/);
  assert.throws(()=>tradingOrderDigest({...typedOrder,verifyingContract:'not-an-address'}),/Invalid EVM address/);
});
