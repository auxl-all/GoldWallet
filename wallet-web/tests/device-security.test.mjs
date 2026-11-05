import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

globalThis.PublicKeyCredential=class{};
globalThis.isSecureContext=true;
const {biometricEnabled,disableBiometric,enableBiometric,unlockBiometric}=await import('../.test-build/device-security.mjs');
const memoryStorage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};

test('WebAuthn PRF protects and restores the mnemonic after device verification',async()=>{
  const storage=memoryStorage(),secret=new Uint8Array(32).fill(7),rawId=new Uint8Array([1,2,3,4]).buffer;
  let createOptions;
  const credentials={create:async options=>{createOptions=options;return{rawId,getClientExtensionResults:()=>({prf:{results:{first:secret.buffer}}})}},get:async()=>({getClientExtensionResults:()=>({prf:{results:{first:secret.buffer}}})})};
  const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  await enableBiometric(phrase,{storage,credentials,cryptoApi:webcrypto});
  assert.equal(biometricEnabled(storage),true);
  assert.equal(createOptions.publicKey.authenticatorSelection.userVerification,'required');
  assert.equal(await unlockBiometric({storage,credentials,cryptoApi:webcrypto}),phrase);
  disableBiometric(storage);
  assert.equal(biometricEnabled(storage),false);
});

test('enrollment fails closed when the authenticator has no PRF support',async()=>{
  const storage=memoryStorage(),credentials={create:async()=>({rawId:new Uint8Array([9]).buffer,getClientExtensionResults:()=>({})}),get:async()=>({getClientExtensionResults:()=>({})})};
  await assert.rejects(()=>enableBiometric('test phrase',{storage,credentials,cryptoApi:webcrypto}),/PRF is unavailable/);
  assert.equal(biometricEnabled(storage),false);
});
