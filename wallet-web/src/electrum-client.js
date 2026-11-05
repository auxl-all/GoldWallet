const DEFAULT_TIMEOUT=8000;
export const DEFAULT_ELECTRUM_URL='wss://electrum.bc2market.com';

export class ElectrumClient{
  constructor(url,{expectedGenesis,timeout=DEFAULT_TIMEOUT,webSocketFactory=value=>new WebSocket(value),nativeRequest=globalThis.__bc2NativeElectrumRequest}={}){
    if(!/^(wss|electrum\+ssl):\/\//i.test(url))throw new Error('Electrum requires WSS or native TCP/TLS.');
    if(/^electrum\+ssl:/i.test(url)&&!nativeRequest)throw new Error('TCP/TLS requires the native BC2 Wallet app.');
    if(!expectedGenesis)throw new Error('Expected genesis hash is required.');
    this.url=url;this.expectedGenesis=expectedGenesis.toLowerCase();this.timeout=timeout;this.webSocketFactory=webSocketFactory;this.nativeRequest=nativeRequest;this.native=/^electrum\+ssl:/i.test(url);this.nextId=1;this.pending=new Map();this.scriptSubscriptions=new Map();
  }
  async connect(){
    if(this.native){const endpoint=new URL(this.url);this.nativeHost=endpoint.hostname;this.nativePort=Number(endpoint.port||50002);const features=await this.call('server.features',[]),actual=String(features?.genesis_hash||'').toLowerCase();if(actual!==this.expectedGenesis)throw new Error(`Network mismatch. Expected ${this.expectedGenesis.slice(0,12)}…, received ${actual.slice(0,12)||'unknown'}….`);return features}
    if(this.socket?.readyState===1)return;
    const socket=this.webSocketFactory(this.url);this.socket=socket;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Electrum connection timed out.')),this.timeout);socket.onopen=()=>{clearTimeout(timer);resolve()};socket.onerror=()=>{clearTimeout(timer);reject(new Error('Electrum connection failed.'))}});
    socket.onmessage=event=>this.receive(event.data);socket.onclose=()=>this.failPending('Electrum disconnected.');
    await this.call('server.version',['BC2 Wallet Mobile 0.6.0','1.4']);
    const features=await this.call('server.features',[]),actual=String(features?.genesis_hash||'').toLowerCase();
    if(actual!==this.expectedGenesis){this.close();throw new Error(`Network mismatch. Expected ${this.expectedGenesis.slice(0,12)}…, received ${actual.slice(0,12)||'unknown'}….`)}
    return features;
  }
  call(method,params=[]){
    if(this.native){const id=this.nextId++,request=JSON.stringify({jsonrpc:'2.0',id,method,params});return this.nativeRequest(this.nativeHost,this.nativePort,true,request).then(raw=>{const message=JSON.parse(raw);if(message.error)throw new Error(message.error.message||'Electrum request failed.');return message.result})}
    if(this.socket?.readyState!==1)return Promise.reject(new Error('Electrum is not connected.'));
    const id=this.nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out.`))},this.timeout);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({jsonrpc:'2.0',id,method,params}))});
  }
  receive(raw){let message;try{message=JSON.parse(raw)}catch{return}if(message.id==null){if(message.method==='blockchain.scripthash.subscribe'){const[scriptHash,state]=message.params||[];this.scriptSubscriptions.get(scriptHash)?.(state)}return}const pending=this.pending.get(message.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(message.id);if(message.error)pending.reject(new Error(message.error.message||'Electrum request failed.'));else pending.resolve(message.result)}
  failPending(message){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error(message))}this.pending.clear()}
  close(){this.failPending('Electrum connection closed.');try{this.socket?.close()}catch{}this.socket=null}
  async walletSnapshot(scriptHash){
    const [header,balance,utxos,history]=await Promise.all([this.call('blockchain.headers.subscribe',[]),this.call('blockchain.scripthash.get_balance',[scriptHash]),this.call('blockchain.scripthash.listunspent',[scriptHash]),this.call('blockchain.scripthash.get_history',[scriptHash])]);
    return{height:Number(header?.height||0),confirmed:Number(balance?.confirmed||0),unconfirmed:Number(balance?.unconfirmed||0),utxos:Array.isArray(utxos)?utxos:[],history:Array.isArray(history)?history:[]};
  }
  subscribeScriptHash(scriptHash,onChange){if(this.native)return Promise.resolve(null);this.scriptSubscriptions.set(scriptHash,onChange);return this.call('blockchain.scripthash.subscribe',[scriptHash])}
  transaction(txid){return this.call('blockchain.transaction.get',[txid,true])}
  async transactionHistory(history){
    const selected=(Array.isArray(history)?history:[]).slice(-8).reverse(),cache=new Map(),load=txid=>{if(!cache.has(txid))cache.set(txid,this.transaction(txid));return cache.get(txid)};
    return Promise.all(selected.map(async entry=>{try{const transaction=await load(entry.tx_hash),previousTransactions={};await Promise.all((transaction.vin||[]).filter(input=>input.txid).map(async input=>{try{previousTransactions[input.txid]=await load(input.txid)}catch{}}));return{height:Number(entry.height)||0,transaction,previousTransactions}}catch{return{height:Number(entry.height)||0,transaction:{txid:String(entry.tx_hash||'')},previousTransactions:{}}}}));
  }
  broadcast(rawTransaction){return this.call('blockchain.transaction.broadcast',[rawTransaction])}
}
