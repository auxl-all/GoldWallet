import {mnemonicToSeedSync,validateMnemonic} from '@scure/bip39';
import {wordlist} from '@scure/bip39/wordlists/english.js';
import {HDKey} from '@scure/bip32';
import {keccak_256} from '@noble/hashes/sha3.js';
import {secp256k1} from '@noble/curves/secp256k1.js';

export const EVM_PATH="m/44'/60'/0'/0/0";
export const ORDER_TYPE='Order(address maker,address sellToken,address buyToken,uint256 sellAmount,uint256 buyAmount,uint256 nonce,uint256 expiry)';
const DOMAIN_TYPE='EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
const encoder=new TextEncoder();
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length}return out};
const hex=bytes=>'0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=value=>{const text=String(value).replace(/^0x/,'');if(!/^(?:[0-9a-f]{2})+$/i.test(text))throw new Error('Invalid hexadecimal value.');return Uint8Array.from(text.match(/../g),b=>parseInt(b,16))};
const word=value=>{let n=BigInt(value);if(n<0n||n>=(1n<<256n))throw new Error('Value is outside uint256 range.');const out=new Uint8Array(32);for(let i=31;i>=0;i--){out[i]=Number(n&255n);n>>=8n}return out};
const addressWord=value=>{const text=String(value);if(!/^0x[0-9a-f]{40}$/i.test(text))throw new Error('Invalid EVM address.');return concat(new Uint8Array(12),unhex(text))};
const hashText=value=>keccak_256(encoder.encode(value));

function deriveTradingKey(mnemonic){
  const normalized=String(mnemonic).trim().toLowerCase();
  if(!validateMnemonic(normalized,wordlist))throw new Error('Invalid BIP39 recovery phrase.');
  const node=HDKey.fromMasterSeed(mnemonicToSeedSync(normalized)).derive(EVM_PATH);
  if(!node.privateKey)throw new Error('Trading key derivation failed.');
  const publicKey=secp256k1.getPublicKey(node.privateKey,false);
  return{address:hex(keccak_256(publicKey.slice(1)).slice(-20)),privateKey:Uint8Array.from(node.privateKey)};
}

export function deriveTradingAccount(mnemonic){return{address:deriveTradingKey(mnemonic).address,path:EVM_PATH}}

export function tradingOrderDigest({chainId,verifyingContract,order}){
  if(!order||!/^0x[0-9a-f]{40}$/i.test(String(order.maker)))throw new Error('Order maker is invalid.');
  const domainHash=keccak_256(concat(
    hashText(DOMAIN_TYPE),hashText('BC2 Trading Vault'),hashText('1'),word(chainId),addressWord(verifyingContract)
  ));
  const orderHash=keccak_256(concat(
    hashText(ORDER_TYPE),addressWord(order.maker),addressWord(order.sellToken),addressWord(order.buyToken),
    word(order.sellAmount),word(order.buyAmount),word(order.nonce),word(order.expiry)
  ));
  return hex(keccak_256(concat(Uint8Array.of(0x19,0x01),domainHash,orderHash)));
}

export function signTradingOrder(mnemonic,typedOrder){
  const account=deriveTradingKey(mnemonic);
  if(account.address.toLowerCase()!==String(typedOrder?.order?.maker).toLowerCase())throw new Error('Order maker does not match this wallet.');
  const digest=tradingOrderDigest(typedOrder),recovered=secp256k1.sign(unhex(digest),account.privateKey,{prehash:false,lowS:true,format:'recovered'});
  return{address:account.address,digest,signature:hex(concat(recovered.slice(1),Uint8Array.of(27+recovered[0])))};
}
