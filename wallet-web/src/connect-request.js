const ORIGIN='https://bc2market.com',NETWORK='bip122:0000000028f062b221c1a8a5cf0244b1',CALLBACK=`${ORIGIN}/api/wallet-connect/verify`;

export function parseConnectRequest(value,now=Date.now()){
  let request;try{request=typeof value==='string'?JSON.parse(value):value}catch{throw new Error('Invalid BC2Market connection QR.')}
  if(request?.v!==1||request.type!=='bc2_connect'||request.origin!==ORIGIN||request.network!==NETWORK||request.callback!==CALLBACK||!/^[0-9a-f]{32}$/.test(request.id||''))throw new Error('Untrusted BC2Market connection request.');
  const expiry=Date.parse(request.expiresAt);if(!Number.isFinite(expiry)||expiry<=now||expiry>now+10*60*1000)throw new Error('BC2Market connection request is expired or has an invalid lifetime.');
  const expected=`BC2 Market login\nDomain: bc2market.com\nNetwork: ${NETWORK}\nChallenge: `;
  if(typeof request.message!=='string'||!request.message.startsWith(expected)||!new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[0-9a-f]{32}\\nExpires: ${request.expiresAt.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`).test(request.message))throw new Error('BC2Market challenge contents do not match the request.');
  return request;
}
