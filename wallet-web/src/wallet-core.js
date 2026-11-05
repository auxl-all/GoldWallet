import {generateMnemonic,mnemonicToSeedSync,validateMnemonic as isMnemonic} from '@scure/bip39';
import {wordlist} from '@scure/bip39/wordlists/english.js';
import {HDKey} from '@scure/bip32';
import {bech32,createBase58check} from '@scure/base';
import {sha256} from '@noble/hashes/sha2.js';
import {ripemd160} from '@noble/hashes/legacy.js';
import {secp256k1} from '@noble/curves/secp256k1.js';

const base58check=createBase58check(sha256),concat=(...values)=>{const size=values.reduce((sum,value)=>sum+value.length,0),out=new Uint8Array(size);let offset=0;for(const value of values){out.set(value,offset);offset+=value.length}return out},hash256=value=>sha256(sha256(value));
export const MAINNET={name:'BitcoinII Mainnet',chainId:'bip122:0000000028f062b221c1a8a5cf0244b1',genesisHash:'0000000028f062b221c1a8a5cf0244b1627315f7aa5b775b931cfec46dc17ceb',path:"m/84'/0'/0'/0/0",messagePrefix:'\x18Bitcoin Signed Message:\n',bech32:'bc',pubKeyHash:0,replayProtectionForkId:0x01324342};
export const MIN_FEE_SATS=1000;
const bytesToBase64=bytes=>typeof Buffer==='undefined'?btoa(String.fromCharCode(...bytes)):Buffer.from(bytes).toString('base64');
const base64ToBytes=value=>typeof Buffer==='undefined'?Uint8Array.from(atob(value),c=>c.charCodeAt(0)):Uint8Array.from(Buffer.from(value,'base64'));
const bytesToHex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
const hexToBytes=value=>{if(!/^(?:[0-9a-f]{2})+$/i.test(value))throw new Error('Invalid hexadecimal value.');return Uint8Array.from(value.match(/../g),byte=>parseInt(byte,16))};
const reverse=value=>Uint8Array.from(value).reverse();
const u32=value=>Uint8Array.of(value&255,value>>>8&255,value>>>16&255,value>>>24&255);
const u64=value=>{let n=BigInt(value);const out=new Uint8Array(8);for(let i=0;i<8;i++){out[i]=Number(n&255n);n>>=8n}return out};
const compactSize=value=>value<253?Uint8Array.of(value):value<=65535?Uint8Array.of(253,value&255,value>>>8):concat(Uint8Array.of(254),u32(value));
const cryptoApi=()=>globalThis.crypto?.subtle?globalThis.crypto:globalThis.require?.('node:crypto').webcrypto;
const p2pkhScript=hash=>concat(Uint8Array.of(0x76,0xa9,0x14),hash,Uint8Array.of(0x88,0xac));
const p2wpkhScript=hash=>concat(Uint8Array.of(0x00,0x14),hash);

export function createMnemonic(){return generateMnemonic(wordlist,128)}
export function validateMnemonic(value){return isMnemonic(String(value).trim().toLowerCase(),wordlist)}
export function deriveWallet(mnemonic){
  const normalized=String(mnemonic).trim().toLowerCase();if(!validateMnemonic(normalized))throw new Error('Invalid BIP39 recovery phrase.');
  const node=HDKey.fromMasterSeed(mnemonicToSeedSync(normalized)).derive(MAINNET.path);if(!node.privateKey)throw new Error('Private key derivation failed.');
  const publicKey=Uint8Array.from(node.publicKey),publicKeyHash=ripemd160(sha256(publicKey)),script=p2wpkhScript(publicKeyHash),address=bech32.encode(MAINNET.bech32,[0,...bech32.toWords(publicKeyHash)]);
  return{address,privateKey:Uint8Array.from(node.privateKey),publicKey,publicKeyHash,scriptHash:bytesToHex(sha256(script).reverse())};
}
export function parseBc2Amount(value){
  const text=String(value).trim();if(!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(text))throw new Error('Enter a valid BC2 amount with up to 8 decimals.');
  const [whole,fraction='']=text.split('.'),sats=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));if(sats<=0n||sats>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('BC2 amount is out of range.');return Number(sats);
}
export function addressScript(address){
  const text=String(address).trim();
  if(/^bc1/i.test(text)){try{const decoded=bech32.decode(text);if(decoded.prefix!==MAINNET.bech32||decoded.words[0]!==0)throw new Error();const program=Uint8Array.from(bech32.fromWords(decoded.words.slice(1)));if(program.length!==20)throw new Error();return p2wpkhScript(program)}catch{throw new Error('Recipient must be a valid BitcoinII Mainnet bc1q address.')}}
  let payload;try{payload=base58check.decode(text)}catch{throw new Error('Invalid BitcoinII Mainnet address.')}
  if(payload.length!==21||payload[0]!==MAINNET.pubKeyHash)throw new Error('Recipient must be a BitcoinII Mainnet P2PKH or bc1q address.');
  return p2pkhScript(payload.slice(1));
}
export function summarizeWalletTransaction({transaction,previousTransactions={},walletScriptHex,height=0,chainHeight=0}){
  const vin=Array.isArray(transaction?.vin)?transaction.vin:[],vout=Array.isArray(transaction?.vout)?transaction.vout:[],script=String(walletScriptHex).toLowerCase(),sats=value=>Math.round(Number(value||0)*1e8);
  const previousOutputs=vin.map(input=>input.coinbase?null:previousTransactions[input.txid]?.vout?.[Number(input.vout)]),complete=vin.every((input,index)=>input.coinbase||previousOutputs[index]);
  const ownOutput=vout.filter(output=>String(output.scriptPubKey?.hex||'').toLowerCase()===script).reduce((sum,output)=>sum+sats(output.value),0),confirmations=Number(height)>0?Math.max(0,Number(chainHeight)-Number(height)+1):0;
  if(!complete)return{txid:String(transaction?.txid||''),direction:'unknown',amount:0,fee:null,height:Number(height)||0,confirmations};
  const totalInput=previousOutputs.reduce((sum,output)=>sum+(output?sats(output.value):0),0),ownInput=previousOutputs.filter(output=>String(output?.scriptPubKey?.hex||'').toLowerCase()===script).reduce((sum,output)=>sum+sats(output.value),0),totalOutput=vout.reduce((sum,output)=>sum+sats(output.value),0),fee=vin.some(input=>input.coinbase)?0:Math.max(0,totalInput-totalOutput);
  return ownInput>0?{txid:String(transaction?.txid||''),direction:'sent',amount:Math.max(0,ownInput-ownOutput-fee),fee,height:Number(height)||0,confirmations}:{txid:String(transaction?.txid||''),direction:'received',amount:ownOutput,fee:0,height:Number(height)||0,confirmations};
}
const estimatedFee=(inputs,outputs)=>Math.max(MIN_FEE_SATS,11+68*inputs+31*outputs);
export function createTransactionPlan(amountValue,utxos){
  const amount=parseBc2Amount(amountValue),available=(Array.isArray(utxos)?utxos:[]).filter(item=>Number(item.height)>0&&Number.isSafeInteger(Number(item.value))&&Number(item.value)>0&&/^[0-9a-f]{64}$/i.test(String(item.tx_hash))&&Number.isInteger(Number(item.tx_pos))&&Number(item.tx_pos)>=0).sort((a,b)=>Number(b.value)-Number(a.value));
  const selected=[];let total=0;
  for(const item of available){selected.push(item);total+=Number(item.value);const twoOutputFee=estimatedFee(selected.length,2);if(total>=amount+twoOutputFee)return{amount,fee:twoOutputFee,change:total-amount-twoOutputFee,inputTotal:total,inputs:selected};const oneOutputFee=estimatedFee(selected.length,1);if(total>=amount+oneOutputFee&&total-amount-oneOutputFee<546)return{amount,fee:total-amount,change:0,inputTotal:total,inputs:selected}}
  throw new Error('Insufficient confirmed balance for the amount and network fee.');
}
const outpoint=input=>concat(reverse(hexToBytes(String(input.tx_hash))),u32(Number(input.tx_pos)));
const encodedOutputs=outputs=>outputs.map(output=>concat(u64(output.value),compactSize(output.script.length),output.script));
function serializeBaseTransaction(inputs,outputs){return concat(u32(2),compactSize(inputs.length),...inputs.map(input=>concat(outpoint(input),Uint8Array.of(0),u32(0xffffffff))),compactSize(outputs.length),...encodedOutputs(outputs),u32(0))}
function serializeWitnessTransaction(inputs,outputs,witnesses){return concat(u32(2),Uint8Array.of(0,1),compactSize(inputs.length),...inputs.map(input=>concat(outpoint(input),Uint8Array.of(0),u32(0xffffffff))),compactSize(outputs.length),...encodedOutputs(outputs),...witnesses.map(items=>concat(compactSize(items.length),...items.map(item=>concat(compactSize(item.length),item)))),u32(0))}
export function replayProtectedWitnessDigest({inputs,outputs,inputIndex,scriptCode,amount,forkId=MAINNET.replayProtectionForkId}){
  const hashPrevouts=hash256(concat(...inputs.map(outpoint))),hashSequence=hash256(concat(...inputs.map(()=>u32(0xffffffff)))),hashOutputs=hash256(concat(...encodedOutputs(outputs))),preimage=concat(u32(2),hashPrevouts,hashSequence,outpoint(inputs[inputIndex]),compactSize(scriptCode.length),scriptCode,u64(amount),u32(0xffffffff),hashOutputs,u32(0),u32(1),u32(forkId));
  return hash256(preimage);
}
export function buildSignedTransaction({mnemonic,recipient,amount,utxos}){
  const wallet=deriveWallet(mnemonic),recipientScript=addressScript(recipient),changeScript=p2wpkhScript(wallet.publicKeyHash),plan=createTransactionPlan(amount,utxos),outputs=[{value:plan.amount,script:recipientScript}];if(plan.change)outputs.push({value:plan.change,script:changeScript});
  const scriptCode=p2pkhScript(wallet.publicKeyHash),witnesses=plan.inputs.map((input,inputIndex)=>{const digest=replayProtectedWitnessDigest({inputs:plan.inputs,outputs,inputIndex,scriptCode,amount:Number(input.value)}),der=secp256k1.sign(digest,wallet.privateKey,{prehash:false,lowS:true,format:'der'});return[concat(der,Uint8Array.of(1)),wallet.publicKey]}),raw=serializeWitnessTransaction(plan.inputs,outputs,witnesses),txid=bytesToHex(reverse(hash256(serializeBaseTransaction(plan.inputs,outputs))));
  return{...plan,rawTransaction:bytesToHex(raw),txid,replayProtectionForkId:MAINNET.replayProtectionForkId};
}
export async function encryptMnemonic(mnemonic,password){
  if(String(password).length<12)throw new Error('Password must contain at least 12 characters.');
  const api=cryptoApi(),salt=api.getRandomValues(new Uint8Array(16)),iv=api.getRandomValues(new Uint8Array(12)),material=await api.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']),key=await api.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']),ciphertext=await api.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(String(mnemonic).trim().toLowerCase()));
  return{version:1,network:'bc2-mainnet',kdf:'PBKDF2-SHA256',iterations:310000,salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(ciphertext))};
}
export async function decryptMnemonic(vault,password){
  if(!vault||vault.version!==1||vault.network!=='bc2-mainnet')throw new Error('Unsupported or non-Mainnet vault.');
  try{const api=cryptoApi(),material=await api.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']),key=await api.subtle.deriveKey({name:'PBKDF2',salt:base64ToBytes(vault.salt),iterations:vault.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']),plaintext=await api.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(vault.iv)},key,base64ToBytes(vault.ciphertext));return new TextDecoder().decode(plaintext)}catch{throw new Error('Incorrect password or damaged vault.')}
}
export function signMessage(mnemonic,message){
  const text=String(message);if(!text||text.length>500)throw new Error('Message must contain 1 to 500 characters.');
  const wallet=deriveWallet(mnemonic),prefix=new TextEncoder().encode(MAINNET.messagePrefix),body=new TextEncoder().encode(text),compactSize=value=>value<253?Uint8Array.of(value):Uint8Array.of(253,value&255,value>>8),digest=hash256(concat(prefix,compactSize(body.length),body)),recovered=secp256k1.sign(digest,wallet.privateKey,{prehash:false,format:'recovered'}),signature=concat(Uint8Array.of(31+recovered[0]),recovered.slice(1));
  return bytesToBase64(signature);
}
