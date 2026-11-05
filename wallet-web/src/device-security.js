import {nativeAvailable,nativeRequest} from './native-bridge.js';
const BIOMETRIC_KEY='bc2-mobile-mainnet-biometric-v1';
const toBytes=value=>value instanceof Uint8Array?value:new Uint8Array(value);
const base64url=bytes=>{const value=typeof Buffer==='undefined'?btoa(String.fromCharCode(...bytes)):Buffer.from(bytes).toString('base64');return value.replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
const fromBase64url=value=>{const padded=String(value).replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(String(value).length/4)*4,'='),binary=typeof Buffer==='undefined'?atob(padded):Buffer.from(padded,'base64').toString('binary');return Uint8Array.from(binary,c=>c.charCodeAt(0))};
const random=(cryptoApi,size=32)=>cryptoApi.getRandomValues(new Uint8Array(size));
const stored=(storage,key)=>{try{return JSON.parse(storage.getItem(key))}catch{return null}};
const importKey=(cryptoApi,secret)=>cryptoApi.subtle.importKey('raw',secret,{name:'AES-GCM'},false,['encrypt','decrypt']);

async function getPrf({credentials,cryptoApi,credentialId,salt}){
  const id=fromBase64url(credentialId),credential=await credentials.get({publicKey:{challenge:random(cryptoApi),allowCredentials:[{type:'public-key',id}],userVerification:'required',timeout:60000,extensions:{prf:{evalByCredential:{[credentialId]:{first:salt}}}}}}),result=credential?.getClientExtensionResults?.()?.prf?.results?.first;
  if(!result)throw new Error('This device authenticated, but WebAuthn PRF is unavailable. Use the wallet password.');
  return toBytes(result);
}

export function biometricAvailable({credentials=globalThis.navigator?.credentials}={}){return nativeAvailable()?globalThis.BC2Native.biometricAvailable():Boolean(globalThis.PublicKeyCredential&&credentials?.create&&credentials?.get&&globalThis.isSecureContext)}
export function biometricEnabled(storage=globalThis.localStorage){return nativeAvailable()?globalThis.BC2Native.biometricEnabled():Boolean(stored(storage,BIOMETRIC_KEY))}
export function disableBiometric(storage=globalThis.localStorage){if(nativeAvailable())globalThis.BC2Native.disableBiometric();else storage.removeItem(BIOMETRIC_KEY)}

export async function enableBiometric(mnemonic,{storage=globalThis.localStorage,credentials=globalThis.navigator?.credentials,cryptoApi=globalThis.crypto}={}){
  if(nativeAvailable())return nativeRequest('enableBiometric',mnemonic);
  if(!biometricAvailable({credentials}))throw new Error('Biometric unlock requires an HTTPS browser with a platform authenticator.');
  const salt=random(cryptoApi),credential=await credentials.create({publicKey:{challenge:random(cryptoApi),rp:{name:'BC2 Wallet'},user:{id:random(cryptoApi),name:'bc2-wallet-mainnet',displayName:'BC2 Wallet'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},attestation:'none',timeout:60000,extensions:{prf:{eval:{first:salt}}}}});
  if(!credential?.rawId)throw new Error('Biometric credential creation was cancelled.');
  const credentialId=base64url(toBytes(credential.rawId));
  let secret=credential.getClientExtensionResults?.()?.prf?.results?.first;
  if(!secret)secret=await getPrf({credentials,cryptoApi,credentialId,salt});
  const iv=random(cryptoApi,12),key=await importKey(cryptoApi,toBytes(secret)),ciphertext=await cryptoApi.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(mnemonic));
  storage.setItem(BIOMETRIC_KEY,JSON.stringify({version:1,credentialId,salt:base64url(salt),iv:base64url(iv),ciphertext:base64url(new Uint8Array(ciphertext))}));
}

export async function unlockBiometric({storage=globalThis.localStorage,credentials=globalThis.navigator?.credentials,cryptoApi=globalThis.crypto}={}){
  if(nativeAvailable())return nativeRequest('unlockBiometric');
  const vault=stored(storage,BIOMETRIC_KEY);if(!vault||vault.version!==1)throw new Error('Biometric unlock is not enabled.');
  const salt=fromBase64url(vault.salt),secret=await getPrf({credentials,cryptoApi,credentialId:vault.credentialId,salt}),key=await importKey(cryptoApi,secret);
  try{const plaintext=await cryptoApi.subtle.decrypt({name:'AES-GCM',iv:fromBase64url(vault.iv)},key,fromBase64url(vault.ciphertext));return new TextDecoder().decode(plaintext)}catch{throw new Error('Biometric vault could not be decrypted. Use the wallet password.')}
}
