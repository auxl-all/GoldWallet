export function encodeConnectProofQr(proof){
  if(!proof.origin||!proof.network||!proof.address||!proof.message||!proof.signature)throw new Error('Incomplete BC2 Connect proof.');
  return JSON.stringify(proof);
}

export function decodeConnectProofQr(payload){
  const proof=JSON.parse(payload);
  if(!proof.origin||!proof.network||!proof.address||!proof.message||!proof.signature)throw new Error('Invalid BC2 Connect proof.');
  return proof;
}
