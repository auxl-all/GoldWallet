let nextId=1;
const pending=new Map();

globalThis.__bc2NativeCallback=(id,ok,payload)=>{const item=pending.get(String(id));if(!item)return;pending.delete(String(id));ok?item.resolve(payload):item.reject(new Error(payload||'Native operation failed.'))};

export const nativeAvailable=()=>Boolean(globalThis.BC2Native);
export function nativeRequest(method,...args){
  if(!nativeAvailable()||typeof globalThis.BC2Native[method]!=='function')return Promise.reject(new Error('This feature requires the native BC2 Wallet app.'));
  const id=String(nextId++);return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{globalThis.BC2Native[method](...args,id)}catch(error){pending.delete(id);reject(error)}});
}
