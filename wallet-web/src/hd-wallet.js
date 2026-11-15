import {deriveAddress} from './wallet-core.js';
import {sha256} from '@noble/hashes/sha2.js';

const safeSum=values=>{const value=values.reduce((sum,n)=>sum+n,0);if(!Number.isSafeInteger(value))throw new Error('Wallet amounts exceed safe precision.');return value};
export const activityFingerprint=history=>history.length?Array.from(sha256(new TextEncoder().encode(history.map(item=>item.tx_hash).sort().join('|'))),byte=>byte.toString(16).padStart(2,'0')).join(''):'';

export async function discoverWallet(client,account,record,{signal,onProgress=()=>{}}={}){
  const check=()=>{if(signal?.aborted)throw new Error('Wallet synchronization cancelled.')};
  check();const header=await client.call('blockchain.headers.subscribe',[]),addresses=[],histories=new Map();
  let lastUsedReceive=-1,lastUsedChange=-1;
  for(const branch of [0,1]){
    let index=0,unused=0;const required=branch===0?record.receiveIndex:record.changeIndex;
    while(index<=required||unused<record.gapLimit){
      check();if(index>=2000)throw new Error('Address discovery reached the mobile limit. No partial balance is shown. Use a desktop wallet to inspect this account.');
      const batch=Array.from({length:Math.min(4,2000-index)},(_,offset)=>deriveAddress(account,branch,index+offset));
      const results=await Promise.all(batch.map(async address=>{const history=await client.call('blockchain.scripthash.get_history',[address.scriptHash]);if(!Array.isArray(history))throw new Error('Invalid Electrum address history.');return{...address,history}}));
      check();
      for(const address of results){
        addresses.push(address);index++;unused=address.history.length?0:unused+1;
        if(address.history.length){if(branch===0)lastUsedReceive=address.index;else lastUsedChange=address.index}
        for(const entry of address.history){
          if(!/^[0-9a-f]{64}$/i.test(entry.tx_hash)||!Number.isInteger(entry.height))throw new Error('Invalid Electrum history entry.');
          if(histories.has(entry.tx_hash)&&histories.get(entry.tx_hash)!==entry.height)throw new Error('Wallet activity changed while synchronizing. Try again.');
          histories.set(entry.tx_hash,entry.height);
        }
      }
      onProgress(branch,index);
    }
  }
  const used=addresses.filter(address=>address.history.length),balances=[],utxos=[];
  for(let start=0;start<used.length;start+=3){
    check();const results=await Promise.all(used.slice(start,start+3).map(async address=>{
      const [balance,unspent]=await Promise.all([client.call('blockchain.scripthash.get_balance',[address.scriptHash]),client.call('blockchain.scripthash.listunspent',[address.scriptHash])]);
      if(!Number.isSafeInteger(balance?.confirmed)||!Number.isSafeInteger(balance?.unconfirmed)||!Array.isArray(unspent))throw new Error('Invalid Electrum balance.');
      return{address,balance,unspent};
    }));
    for(const {address,balance,unspent} of results){balances.push(balance);for(const item of unspent){if(!Number.isSafeInteger(item.value)||item.value<0||!Number.isInteger(item.tx_pos)||item.tx_pos<0||!Number.isInteger(item.height)||!/^[0-9a-f]{64}$/i.test(item.tx_hash))throw new Error('Invalid unspent output.');utxos.push({...item,branch:address.branch,index:address.index,address:address.address,scriptHash:address.scriptHash})}}
  }
  check();const after=await client.call('blockchain.headers.subscribe',[]);
  if(header.height!==after.height||header.hex!==after.hex)throw new Error('A new block arrived during discovery. Synchronize again.');
  const history=[...histories].map(([tx_hash,height])=>({tx_hash,height})).sort((a,b)=>(a.height>0?a.height:Infinity)-(b.height>0?b.height:Infinity)||a.tx_hash.localeCompare(b.tx_hash));
  const outpoints=new Set();for(const item of utxos){const id=item.tx_hash+':'+item.tx_pos;if(outpoints.has(id))throw new Error('Duplicate unspent output.');outpoints.add(id)}
  const watchHashes=addresses.filter(a=>a.history.length||(a.branch===0&&a.index<=record.receiveIndex)||(a.branch===1&&a.index===Math.max(record.changeIndex,lastUsedChange+1))).map(a=>a.scriptHash);
  return{height:after.height,headerHex:after.hex||null,confirmed:safeSum(balances.map(value=>value.confirmed)),unconfirmed:safeSum(balances.map(value=>value.unconfirmed)),utxos,history,addresses,walletScriptHexes:addresses.map(a=>a.scriptHex),lastUsedReceive,lastUsedChange,watchHashes,activity:activityFingerprint(history),syncedAt:Date.now()};
}
