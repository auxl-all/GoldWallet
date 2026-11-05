import {normalizeRecipientQr} from './address-book.js';
import {parseConnectRequest} from './connect-request.js';

export function classifyWalletQr(value,validateAddress){
  try{parseConnectRequest(value);return{kind:'connect'}}catch{}
  try{return{kind:'send',address:normalizeRecipientQr(value,validateAddress)}}catch{throw new Error('QR code is not a valid BC2 address or BC2Market connection request.')}
}
