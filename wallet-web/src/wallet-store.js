export const WALLET_STORE_KEY='bc2-mobile-mainnet-wallets-v2';
export const LEGACY_VAULT_KEY='bc2-mobile-mainnet-v1';
const validIndex=n=>Number.isInteger(n)&&n>=0&&n<2000;
function validate(store){
  if(store?.version!==2||!Array.isArray(store.wallets))throw new Error('Wallet storage is damaged. Existing data has been preserved.');
  const ids=new Set();
  for(const wallet of store.wallets){
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(wallet.id)||ids.has(wallet.id)||typeof wallet.name!=='string'||!wallet.name.trim()||wallet.name.length>40||wallet.vault?.version!==1||wallet.vault.network!=='bc2-mainnet'||!validIndex(wallet.receiveIndex)||!validIndex(wallet.changeIndex)||![20,50,100].includes(wallet.gapLimit))throw new Error('Wallet storage is damaged. Existing data has been preserved.');
    ids.add(wallet.id);
  }
  if(store.wallets.length&&!ids.has(store.activeId))throw new Error('Selected wallet is missing. Existing data has been preserved.');
  return store;
}

export class WalletStore{
  constructor(storage){
    this.storage=storage;
    if(storage.getItem(WALLET_STORE_KEY)===null){
      const legacy=storage.getItem(LEGACY_VAULT_KEY),wallets=legacy?[{id:'legacy',name:'Wallet 1',vault:JSON.parse(legacy),receiveIndex:0,changeIndex:0,gapLimit:20}]:[];
      this.save({version:2,activeId:wallets[0]?.id||null,wallets});
    }
    this.read();
  }
  read(){return validate(JSON.parse(this.storage.getItem(WALLET_STORE_KEY)))}
  save(store){validate(store);this.storage.setItem(WALLET_STORE_KEY,JSON.stringify(store));return store}
  active(){const store=this.read();return store.wallets.find(wallet=>wallet.id===store.activeId)||null}
  select(id){const store=this.read();if(!store.wallets.some(wallet=>wallet.id===id))throw new Error('Wallet not found.');store.activeId=id;this.save(store)}
  add({id,name,vault,identity}){
    const store=this.read();
    if(store.wallets.some(wallet=>wallet.identity===identity))throw new Error('This wallet is already on this device. Select it from the wallet list.');
    store.wallets.push({id,name:name.trim().slice(0,40),vault,identity,receiveIndex:0,changeIndex:0,gapLimit:20});store.activeId=id;this.save(store);return this.active();
  }
  update(id,values){
    const store=this.read(),wallet=store.wallets.find(wallet=>wallet.id===id);if(!wallet)throw new Error('Wallet not found.');
    for(const key of ['name','receiveIndex','changeIndex','gapLimit','identity'])if(Object.hasOwn(values,key))wallet[key]=values[key];
    this.save(store);return wallet;
  }
  remove(id){
    const store=this.read();store.wallets=store.wallets.filter(wallet=>wallet.id!==id);if(store.activeId===id)store.activeId=store.wallets[0]?.id||null;
    this.save(store);
    if(id==='legacy')this.storage.removeItem(LEGACY_VAULT_KEY);
  }
}

export function nextReceiveIndex(record,lastUsed){
  const next=Math.max(record.receiveIndex,lastUsed)+1;
  if(!validIndex(next)||next-lastUsed>record.gapLimit)throw new Error('The unused-address gap is full. Use an existing address and synchronize before creating more.');
  return next;
}
