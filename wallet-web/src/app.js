import {addressScript,buildSignedTransaction,createMnemonic,decryptMnemonic,deriveWallet,encryptMnemonic,MAINNET,signMessage,summarizeWalletTransaction,validateMnemonic} from './wallet-core.js';
import {DEFAULT_ELECTRUM_URL,ElectrumClient} from './electrum-client.js';
import {biometricAvailable,biometricEnabled,disableBiometric,enableBiometric,unlockBiometric} from './device-security.js';
import {nativeAvailable,nativeRequest} from './native-bridge.js';
import {normalizeRecipientQr,recipientAddressState,upsertBookmark} from './address-book.js';
import {parseConnectRequest} from './connect-request.js';
import {classifyWalletQr} from './wallet-qr.js';
import {balanceReport,reportAmount,reportCsv,reportDate} from './wallet-reports.js';
import {newTransactionNotifications} from './transaction-notifications.js';

if(nativeAvailable())globalThis.__bc2NativeElectrumRequest=(host,port,tls,request)=>nativeRequest('electrumRequest',host,port,tls,request);
if(nativeAvailable())document.querySelector('footer').textContent=`GoldWallet ${__GOLDWALLET_VERSION__} · BitcoinII Mainnet · Non-custodial hot wallet`;

const VAULT_KEY='bc2-mobile-mainnet-v1';
const NOTIFICATION_KEY='bc2-mobile-mainnet-notifications';
const BOOKMARK_KEY='bc2-mobile-mainnet-bookmarks';
const EXPLORER_BASE='https://bc2market.com/explorer';
let mnemonic='';
let electrum=null;
let snapshot=null;
let pendingTransaction=null;
let syncTimer=null;
let syncing=false;
let reportsLoading=false;
let currentReport=null;
let reportSession=0;
let securityAction='';
let recoveryTimer=null;
let pendingConnectRequest=null;
const $=selector=>document.querySelector(selector);
const status=(message,error=false)=>{const el=$('#status');el.textContent=message;el.className=error?'status error':'status';el.hidden=!message};
const show=id=>{document.querySelectorAll('[data-view]').forEach(el=>el.hidden=el.id!==id);if(id!=='wallet')$('#'+id).prepend($('#status'))};
const hideRecovery=()=>{clearTimeout(recoveryTimer);$('#recovery-phrase').textContent='';$('#recovery-panel').hidden=true;$('#show-recovery').hidden=false};
const showWalletPanel=id=>{if(id!=='wallet-settings')hideRecovery();document.querySelectorAll('[data-wallet-panel]').forEach(el=>el.hidden=el.id!==id);const panel=$('#'+id),el=$('#status');if(id==='wallet-home')panel.querySelector('.wallet-actions').after(el);else panel.prepend(el);window.scrollTo(0,0)};
const vault=()=>{try{return JSON.parse(localStorage.getItem(VAULT_KEY))}catch{return null}};
const samePassword=()=>{const password=$('#setup-password').value;if(password!==$('#setup-confirm').value)throw new Error('Passwords do not match.');return password};
const notificationEnabled=()=>nativeAvailable()?globalThis.BC2Native.notificationsEnabled():localStorage.getItem(NOTIFICATION_KEY)==='enabled'&&globalThis.Notification?.permission==='granted';
const knownKey=address=>`bc2-mainnet-known-${address}`;
const knownTransactions=address=>{try{return JSON.parse(localStorage.getItem(knownKey(address)))||[]}catch{return[]}};
const updateSecurityUi=()=>{const enabled=biometricEnabled();$('#unlock-biometric').hidden=!enabled;$('#biometric-state').textContent=enabled?'Enabled on this device':biometricAvailable()?'Available':'Not supported';$('#enable-biometric').textContent=enabled?'Replace biometric unlock':'Enable biometric unlock';$('#disable-biometric').hidden=!enabled;$('#notification-state').textContent=notificationEnabled()?'Enabled':!nativeAvailable()&&globalThis.Notification?.permission==='denied'?'Blocked by device':'Disabled';$('#electrum-transport-wrap').hidden=!nativeAvailable();$('#scan-recipient').hidden=!nativeAvailable();$('#scan-recipient-image').hidden=!nativeAvailable()};
const bookmarks=()=>{try{const value=JSON.parse(localStorage.getItem(BOOKMARK_KEY));return Array.isArray(value)?value:[]}catch{return[]}};
const saveBookmarks=value=>localStorage.setItem(BOOKMARK_KEY,JSON.stringify(value.slice(0,100)));
function openExplorer(value){const url=`${EXPLORER_BASE}?q=${encodeURIComponent(String(value||''))}`;if(nativeAvailable())globalThis.BC2Native.openExternal(url);else window.open(url,'_blank','noopener,noreferrer')}
function renderBookmarks(){const list=$('#bookmark-list');list.replaceChildren();const items=bookmarks();if(!items.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No saved recipients yet.';list.append(empty);return}for(const item of items){const row=document.createElement('div'),pick=document.createElement('button'),remove=document.createElement('button');pick.className='bookmark-pick';pick.textContent=`${item.label}\n${item.address}`;pick.addEventListener('click',()=>{$('#send-recipient').value=item.address;resetSendReview();updateRecipientValidity();$('#bookmarks-dialog').close()});remove.className='bookmark-delete';remove.textContent='Delete';remove.addEventListener('click',()=>{saveBookmarks(bookmarks().filter(value=>value.id!==item.id));renderBookmarks()});row.append(pick,remove);list.append(row)}}

async function loadAnnouncement(){const el=$('#admin-announcement');try{const response=await fetch('https://bc2market.com/api/wallet/announcement',{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json(),message=typeof data.message==='string'?data.message.trim():'';el.textContent=message;el.hidden=!data.active||!message}catch{el.textContent='';el.hidden=true}}

async function notifyNewTransactions(items,address){
  const previous=knownTransactions(address),ids=items.map(item=>item.txid).filter(Boolean);localStorage.setItem(knownKey(address),JSON.stringify(ids.slice(0,50)));
  if(!previous.length||!notificationEnabled())return;
  const registration=nativeAvailable()?null:await navigator.serviceWorker?.ready;
  for(const item of newTransactionNotifications(items,previous)){const received=item.direction==='received',title=received?'BC2 received':'BC2 sent',body=`${received?'+':'−'}${formatBc2(item.amount)} BC2 · ${item.confirmations?'confirmed':'pending'}`;if(nativeAvailable())globalThis.BC2Native.notifyReceived(title,body);else await registration?.showNotification(title,{body,icon:'icon-192.png',badge:'icon-192.png',tag:`bc2-${item.txid}`,data:{url:'./'}})}
}

function openWallet(phrase){mnemonic=phrase;const wallet=deriveWallet(phrase),electrumUrl=localStorage.getItem('bc2-electrum-mainnet-url')||DEFAULT_ELECTRUM_URL;$('#address').textContent=wallet.address;$('#receive-address').textContent=wallet.address;$('#network').textContent=MAINNET.name;$('#chain-id').textContent=MAINNET.chainId;$('#electrum-url').value=electrumUrl;$('#electrum-transport').value=electrumUrl.startsWith('electrum+ssl://')?'tcp':'wss';const qr=$('#receive-qr');qr.textContent='';new QRCode(qr,{text:`bitcoinII:${wallet.address}`,width:196,height:196,colorDark:'#050506',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});resetSnapshot();resetSend();show('wallet');showWalletPanel('wallet-home');updateSecurityUi();clearInterval(syncTimer);syncTimer=setInterval(()=>{if(!document.hidden)syncElectrum(true)},15000);status('Mainnet wallet unlocked. Synchronizing…');queueMicrotask(()=>{syncElectrum();if(pendingConnectRequest)openSecurityPrompt('connect')})}
const formatBc2=sats=>(Number(sats)/1e8).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:8});
function resetSnapshot(){clearReport();snapshot=null;$('#balance').textContent='— BC2';$('#pending-balance').textContent='Not synchronized';$('#electrum-state').textContent='DISCONNECTED';$('#electrum-state').className='pill';$('#block-height').textContent='—';$('#utxo-count').textContent='—';$('#history').innerHTML='<li>No synchronized transactions.</li>';resetSendReview()}
function renderHistory(items){
  const list=$('#history');list.replaceChildren();
  if(!items.length){const empty=document.createElement('li');empty.textContent='No transactions for this address.';list.append(empty);return}
  for(const item of items){const li=document.createElement('li'),label=document.createElement('strong'),amount=document.createElement('strong'),meta=document.createElement('span'),confirmations=document.createElement('small'),txid=document.createElement('a');label.textContent=item.direction==='sent'?'Sent':item.direction==='received'?'Received':'Transaction';label.className=item.direction;amount.className=item.direction;amount.textContent=item.direction==='unknown'?'Details unavailable':`${item.direction==='sent'?'−':'+'}${formatBc2(item.amount)} BC2`;meta.textContent=item.fee>0?`Fee ${formatBc2(item.fee)} BC2`:item.height>0?`Block ${item.height.toLocaleString()}`:'Pending';confirmations.textContent=item.confirmations?`${item.confirmations} confirmation${item.confirmations===1?'':'s'}`:'Unconfirmed';txid.className='explorer-txid';txid.href=`${EXPLORER_BASE}?q=${encodeURIComponent(item.txid)}`;txid.textContent=`${item.txid} ↗`;txid.addEventListener('click',event=>{event.preventDefault();openExplorer(item.txid)});li.append(label,amount,meta,confirmations,txid);list.append(li)}
}
function renderSnapshot(value,walletScriptHex){if(currentReport&&reportFingerprint(value)!==currentReport.fingerprint){currentReport=null;$('#report-result').hidden=true;$('#report-state').textContent='Wallet activity changed. Generate a fresh report.'}snapshot=value;$('#balance').textContent=`${formatBc2(value.confirmed)} BC2`;$('#pending-balance').textContent=`${formatBc2(value.unconfirmed)} BC2 pending`;$('#block-height').textContent=value.height.toLocaleString();$('#utxo-count').textContent=String(value.utxos.filter(item=>Number(item.height)>0).length);const items=(value.transactions||[]).map(item=>summarizeWalletTransaction({...item,walletScriptHex,chainHeight:value.height}));renderHistory(items);notifyNewTransactions(items,deriveWallet(mnemonic).address).catch(()=>{});if(nativeAvailable()){const latest=[...(value.history||[])].reverse().find(item=>item.tx_hash)?.tx_hash||'';globalThis.BC2Native.configureBackgroundMonitor(deriveWallet(mnemonic).scriptHash,String(Number(value.confirmed)+Number(value.unconfirmed)),latest)} }
function resetSendReview(){pendingTransaction=null;$('#send-review').hidden=true}
function updateRecipientValidity(){const field=$('#send-recipient'),message=$('#recipient-validity'),state=recipientAddressState(field.value,addressScript),hasValue=Boolean(field.value.trim());message.textContent=state.message;message.className=`address-validity ${hasValue?(state.valid?'valid':'invalid'):''}`.trim();field.setAttribute('aria-invalid',hasValue?String(!state.valid):'');$('#review-send').disabled=!state.valid;return state.valid}
function resetSend(){$('#send-recipient').value='';$('#send-amount').value='';resetSendReview();updateRecipientValidity()}
async function syncElectrum(silent=false){
  if(syncing||reportsLoading||!mnemonic)return;syncing=true;
  const button=$('#sync-electrum');button.disabled=true;if(!silent){$('#electrum-state').textContent='CONNECTING';$('#electrum-state').className='pill pending'}
  try{const url=$('#electrum-url').value.trim();localStorage.setItem('bc2-electrum-mainnet-url',url);if(!electrum||electrum.url!==url){electrum?.close();electrum=new ElectrumClient(url,{expectedGenesis:MAINNET.genesisHash})}await electrum.connect();const wallet=deriveWallet(mnemonic),nextSnapshot=await electrum.walletSnapshot(wallet.scriptHash);nextSnapshot.transactions=await electrum.transactionHistory(nextSnapshot.history);const walletScriptHex=Array.from(addressScript(wallet.address),value=>value.toString(16).padStart(2,'0')).join('');renderSnapshot(nextSnapshot,walletScriptHex);await electrum.subscribeScriptHash(wallet.scriptHash,()=>syncElectrum(true));$('#electrum-state').textContent='VERIFIED';$('#electrum-state').className='pill ok';if(!silent)status('BitcoinII Mainnet genesis verified. Wallet synchronized.')}catch(error){electrum?.close();electrum=null;if(!silent){resetSnapshot();$('#electrum-state').textContent='UNAVAILABLE';$('#electrum-state').className='pill error';status(error.message,true)}}finally{button.disabled=false;syncing=false}
}
async function saveWallet(phrase){
  if(!validateMnemonic(phrase))throw new Error('Enter a valid 12-word BIP39 recovery phrase.');
  const encrypted=await encryptMnemonic(phrase,samePassword());localStorage.setItem(VAULT_KEY,JSON.stringify(encrypted));openWallet(phrase);
}
function reviewSend(){
  if(!electrum||!snapshot)throw new Error('Connect and synchronize Electrum before sending.');
  if(!updateRecipientValidity())throw new Error($('#recipient-validity').textContent);
  const recipient=$('#send-recipient').value.trim(),transaction=buildSignedTransaction({mnemonic,recipient,amount:$('#send-amount').value,utxos:snapshot.utxos});pendingTransaction=transaction;$('#review-recipient').textContent=recipient;$('#review-amount').textContent=`${formatBc2(transaction.amount)} BC2`;$('#review-fee').textContent=`${formatBc2(transaction.fee)} BC2`;$('#review-change').textContent=`${formatBc2(transaction.change)} BC2`;$('#review-txid').textContent=transaction.txid;$('#send-password-wrap').hidden=biometricEnabled();$('#send-biometric-note').hidden=!biometricEnabled();$('#send-password').value='';$('#send-review').hidden=false;status('Review the recipient, amount and fee before broadcasting.');
}
async function authorizeSend(){
  const phrase=biometricEnabled()?await unlockBiometric():await decryptMnemonic(vault(),$('#send-password').value);
  if(phrase!==mnemonic)throw new Error('Wallet authorization failed.');$('#send-password').value='';
}
async function broadcastSend(){
  if(!electrum||!pendingTransaction)throw new Error('Review the transaction first.');
  const button=$('#broadcast-send');button.disabled=true;
  try{await authorizeSend();const expected=pendingTransaction.txid,actual=String(await electrum.broadcast(pendingTransaction.rawTransaction));if(actual!==expected)throw new Error('Electrum returned an unexpected transaction ID.');resetSend();await syncElectrum();showWalletPanel('wallet-home');status(`Transaction broadcast: ${actual}`)}finally{button.disabled=false}
}
function resetSetup(){
  $('#setup-password').value='';$('#setup-confirm').value='';$('#restore-phrase').value='';$('#restore-count').textContent='0 / 12 words';$('#backup').hidden=true;$('#backup-phrase').textContent='';selectSetupMode('create');
}
function route(){resetSetup();updateSecurityUi();if(vault())show('unlock');else show('setup')}

function selectSetupMode(mode){const restoring=mode==='restore';$('#setup-create-pane').hidden=restoring;$('#setup-restore-pane').hidden=!restoring;$('#create').hidden=restoring;$('#restore').hidden=!restoring;$('#setup-create-tab').classList.toggle('active',!restoring);$('#setup-restore-tab').classList.toggle('active',restoring);$('#setup-create-tab').setAttribute('aria-selected',String(!restoring));$('#setup-restore-tab').setAttribute('aria-selected',String(restoring))}

function openSecurityPrompt(action){
  securityAction=action;const removing=action==='remove',connecting=action==='connect';$('#security-title').textContent=removing?'Remove wallet from device':connecting?'Connect BC2Market':'Reveal recovery phrase';$('#security-description').textContent=removing?'Authenticate before permanently removing the encrypted wallet from this device.':connecting?'Authenticate before signing a connection message for bc2market.com.':'Authenticate to view the 12 words that control this wallet.';$('#security-password').value='';$('#security-biometric').hidden=!biometricEnabled();$('#security-password-divider').textContent=biometricEnabled()?'or use your wallet password':'Wallet password required';$('#security-dialog').showModal();
}
function removeWallet(phrase){
  if(!confirm('Remove the encrypted Mainnet wallet from this device? This cannot be undone without the recovery phrase.'))return;
  clearReport();try{localStorage.removeItem(knownKey(deriveWallet(phrase).address))}catch{}if(nativeAvailable())globalThis.BC2Native.disableBackgroundMonitor();localStorage.removeItem(VAULT_KEY);disableBiometric();hideRecovery();clearInterval(syncTimer);electrum?.close();electrum=null;mnemonic='';$('#security-dialog').close();route();status('Encrypted Mainnet wallet removed.');
}
async function completeSecurityAction(phrase){
  if(mnemonic&&phrase!==mnemonic)throw new Error('Authentication does not match the open wallet.');
  if(securityAction==='remove')return removeWallet(phrase);
  if(securityAction==='connect')return showConnectProof(phrase);
  if(securityAction==='reveal'){if(!mnemonic)throw new Error('Unlock the wallet before viewing the recovery phrase.');$('#security-dialog').close();$('#recovery-phrase').textContent=phrase;$('#recovery-panel').hidden=false;$('#show-recovery').hidden=true;clearTimeout(recoveryTimer);recoveryTimer=setTimeout(hideRecovery,60000);status('Recovery phrase revealed for 60 seconds. Keep it private.');}
}
function handleConnectRequest(value){pendingConnectRequest=parseConnectRequest(value);if(mnemonic)openSecurityPrompt('connect');else status('BC2Market request received. Unlock the wallet to approve it.')}
async function scanWalletQr(){
  if(!nativeAvailable())throw new Error('QR scanning requires the native Android app.');
  const value=await nativeRequest('scanQr'),action=classifyWalletQr(value,addressScript);
  if(action.kind==='connect')return handleConnectRequest(value);
  if(!mnemonic)throw new Error('Unlock the wallet before scanning a payment address.');
  $('#send-recipient').value=action.address;resetSendReview();showWalletPanel('wallet-send');status('Recipient address scanned and validated.');
}
async function showConnectProof(phrase){
  if(!pendingConnectRequest)throw new Error('Scan a current BC2Market connection request first.');
  const request=pendingConnectRequest,wallet=deriveWallet(phrase),proof={origin:request.origin,network:request.network,address:wallet.address,message:request.message,signature:signMessage(phrase,request.message)},controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  let response,data;try{response=await fetch(request.callback,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:request.id,address:proof.address,signature:proof.signature}),signal:controller.signal});data=await response.json().catch(()=>({}))}catch(error){throw new Error(error.name==='AbortError'?'BC2Market verification timed out.':`BC2Market connection failed: ${error.message}`)}finally{clearTimeout(timer)}
  if(!response.ok)throw new Error(data.error||'BC2Market rejected the connection proof.');
  pendingConnectRequest=null;$('#security-dialog').close();$('#connect-result').value=JSON.stringify(proof,null,2);const qr=$('#connect-qr');qr.replaceChildren();qr.textContent='✓';$('#connect-dialog').showModal();status(`BC2Market connected to ${proof.address}. No transaction was created.`);
}

function reportFingerprint(value){return JSON.stringify([value.confirmed,value.unconfirmed,[...value.history].map(item=>[item.tx_hash,item.height]).sort((a,b)=>a[0].localeCompare(b[0]))])}
function clearReport(){reportSession++;currentReport=null;$('#report-result').hidden=true;$('#report-rows').replaceChildren();$('#report-state').textContent='Generate a report to load the complete transaction history.'}
function selectReportPeriod(){
  const days=Number($('#report-period').value),today=reportDate();currentReport=null;$('#report-result').hidden=true;$('#report-start').max=today;$('#report-end').max=today;
  if(days){$('#report-end').value=today;$('#report-start').value=new Date(Date.parse(today)-(days-1)*86400000).toISOString().slice(0,10)}
}
function openReports(){showWalletPanel('wallet-reports');if(!$('#report-start').value)selectReportPeriod()}
function renderReport(report){
  for(const field of ['opening','closing','incoming','outgoing','fees','net'])$('#report-'+field).textContent=reportAmount(report[field])+' BC2';
  $('#report-asof').textContent='Verified '+new Date(report.asof).toLocaleString('en-GB',{timeZone:'Asia/Bangkok'})+' (UTC+7). Today is partial.';
  $('#report-pending').textContent=`Pending: ${reportAmount(report.unconfirmed)} BC2 (${report.pendingTransactions} transactions), excluded from daily balances.`;
  const body=$('#report-rows');body.replaceChildren();
  for(const row of report.rows){const tr=document.createElement('tr');for(const value of [row.date,...['incoming','outgoing','fees','net','balance'].map(field=>reportAmount(row[field]))]){const td=document.createElement('td');td.textContent=value;tr.append(td)}body.append(tr)}
  $('#report-result').hidden=false;
}
async function generateReport(){
  if(!mnemonic)return;
  if(syncing||reportsLoading){$('#report-state').textContent='Wallet synchronization is running. Try again when it finishes.';return}
  const start=$('#report-start').value,end=$('#report-end').value;
  if(!start||!end||start>end||end>reportDate()){$('#report-state').textContent='Choose valid dates ending today or earlier (UTC+7).';return}
  reportsLoading=true;currentReport=null;$('#report-result').hidden=true;$('#generate-report').disabled=true;
  const session=reportSession,wallet=deriveWallet(mnemonic),scriptHex=Array.from(addressScript(wallet.address),value=>value.toString(16).padStart(2,'0')).join('');
  $('#report-state').textContent='Connecting and loading complete history…';
  try{
    const url=$('#electrum-url').value.trim();if(!electrum||electrum.url!==url){electrum?.close();electrum=new ElectrumClient(url,{expectedGenesis:MAINNET.genesisHash})}
    const client=electrum;await client.connect();const before=await client.walletSnapshot(wallet.scriptHash);
    const transactions=await client.reportHistory(before.history,{onProgress:(done,total)=>{if(session===reportSession)$('#report-state').textContent=`Loading transaction ${done} of ${total}…`}});
    const after=await client.walletSnapshot(wallet.scriptHash);
    if(session!==reportSession||!mnemonic)return;
    if(reportFingerprint(before)!==reportFingerprint(after)||before.headerHex!==after.headerHex)throw new Error('Wallet activity changed during loading. Generate the report again.');
    const report=balanceReport({transactions,walletScriptHex:scriptHex,confirmed:after.confirmed,unconfirmed:after.unconfirmed,start,end});
    renderSnapshot(after,scriptHex);currentReport={...report,fingerprint:reportFingerprint(after)};renderReport(report);
    $('#report-state').textContent=`Complete history checked: ${transactions.length} transactions. Balance reconciled.`;
  }catch(error){if(session===reportSession){currentReport=null;$('#report-result').hidden=true;$('#report-state').textContent='Report unavailable: '+error.message}}
  finally{reportsLoading=false;$('#generate-report').disabled=false}
}
async function exportReport(){
  if(!currentReport||!mnemonic)return;
  const button=$('#export-report');button.disabled=true;
  try{
    const filename=`GoldWallet-${currentReport.start}-${currentReport.end}.csv`,content=reportCsv(currentReport);
    if(nativeAvailable())await nativeRequest('saveReport',filename,content);
    else{const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
    $('#report-state').textContent='CSV export completed.';
  }catch(error){$('#report-state').textContent=error.message}finally{button.disabled=false}
}
document.querySelectorAll('[data-open-reports]').forEach(button=>button.addEventListener('click',openReports));
$('#report-period').addEventListener('change',selectReportPeriod);
for(const id of ['report-start','report-end'])$('#'+id).addEventListener('change',()=>{$('#report-period').value='custom';currentReport=null;$('#report-result').hidden=true});
$('#generate-report').addEventListener('click',generateReport);
$('#export-report').addEventListener('click',exportReport);
document.querySelectorAll('.settings-group').forEach(group=>group.addEventListener('toggle',()=>{if(!group.open&&group.querySelector('#recovery-panel'))hideRecovery()}));

globalThis.__bc2ConnectRequest=value=>{try{handleConnectRequest(value)}catch(error){status(error.message,true)}};

$('#create').addEventListener('click',async()=>{try{const phrase=createMnemonic();await saveWallet(phrase);$('#backup-phrase').textContent=phrase;$('#backup').hidden=false;status('Write these 12 words on paper. Never share or photograph them.')}catch(error){status(error.message,true)}});
$('#restore').addEventListener('click',async()=>{try{await saveWallet($('#restore-phrase').value)}catch(error){status(error.message,true)}});
$('#setup-create-tab').addEventListener('click',()=>selectSetupMode('create'));
$('#setup-restore-tab').addEventListener('click',()=>selectSetupMode('restore'));
$('#restore-phrase').addEventListener('input',event=>{$('#restore-count').textContent=`${event.target.value.trim().split(/\s+/).filter(Boolean).length} / 12 words`});
$('#unlock-wallet').addEventListener('click',async()=>{try{openWallet(await decryptMnemonic(vault(),$('#unlock-password').value));$('#unlock-password').value=''}catch(error){status(error.message,true)}});
$('#unlock-biometric').addEventListener('click',async()=>{const button=$('#unlock-biometric');button.disabled=true;try{openWallet(await unlockBiometric());status('Wallet unlocked with device authentication.')}catch(error){status(error.message,true)}finally{button.disabled=false}});
$('#toggle-password').addEventListener('click',()=>{const input=$('#unlock-password'),showPassword=input.type==='password';input.type=showPassword?'text':'password';$('#toggle-password').setAttribute('aria-label',showPassword?'Hide password':'Show password')});
$('#lock').addEventListener('click',()=>{clearReport();hideRecovery();clearInterval(syncTimer);electrum?.close();electrum=null;mnemonic='';route();status('Wallet locked.');});
$('#sync-electrum').addEventListener('click',syncElectrum);
$('#quick-sync').addEventListener('click',()=>{if(!mnemonic)return status('Unlock the wallet before synchronizing.',true);syncElectrum()});
$('#refresh-history').addEventListener('click',syncElectrum);
$('#open-send').addEventListener('click',()=>showWalletPanel('wallet-send'));
$('#open-receive').addEventListener('click',()=>showWalletPanel('wallet-receive'));
$('#show-receive').addEventListener('click',()=>showWalletPanel('wallet-receive'));
$('#open-settings').addEventListener('click',()=>{if(mnemonic)showWalletPanel('wallet-settings')});
$('#scan-wallet-qr').addEventListener('click',async()=>{try{await scanWalletQr()}catch(error){status(error.message,true)}});
$('#home-wallet').addEventListener('click',()=>{if(mnemonic)showWalletPanel('wallet-home')});
$('#history-shortcut').addEventListener('click',()=>{if(!mnemonic)return;showWalletPanel('wallet-home');$('#history').scrollIntoView({behavior:'smooth',block:'start'})});
document.querySelectorAll('[data-home]').forEach(button=>button.addEventListener('click',()=>showWalletPanel('wallet-home')));
$('#review-send').addEventListener('click',()=>{try{reviewSend()}catch(error){resetSendReview();status(error.message,true)}});
$('#broadcast-send').addEventListener('click',async()=>{try{await broadcastSend()}catch(error){status(error.message,true)}});
$('#send-recipient').addEventListener('input',()=>{resetSendReview();updateRecipientValidity()});$('#send-amount').addEventListener('input',resetSendReview);
$('#scan-recipient').addEventListener('click',async()=>{try{$('#send-recipient').value=normalizeRecipientQr(await nativeRequest('scanQr'),addressScript);resetSendReview();updateRecipientValidity();status('Recipient address scanned and validated.')}catch(error){updateRecipientValidity();status(error.message,true)}});
$('#scan-recipient-image').addEventListener('click',async()=>{try{$('#send-recipient').value=normalizeRecipientQr(await nativeRequest('scanQrImage'),addressScript);resetSendReview();updateRecipientValidity();status('Recipient QR image scanned and validated.')}catch(error){updateRecipientValidity();status(error.message,true)}});
$('#open-bookmarks').addEventListener('click',()=>{$('#bookmark-address').value=$('#send-recipient').value.trim();$('#bookmark-label').value='';renderBookmarks();$('#bookmarks-dialog').showModal()});
$('#bookmark-save').addEventListener('click',()=>{try{saveBookmarks(upsertBookmark(bookmarks(),{id:crypto.randomUUID(),label:$('#bookmark-label').value,address:$('#bookmark-address').value},addressScript));renderBookmarks();$('#bookmark-label').value='';status('Recipient saved to the local address book.')}catch(error){status(error.message,true)}});
$('#bookmark-close').addEventListener('click',()=>$('#bookmarks-dialog').close());
$('#enable-biometric').addEventListener('click',async()=>{const button=$('#enable-biometric');button.disabled=true;try{await enableBiometric(mnemonic);updateSecurityUi();status('Biometric unlock and transaction approval enabled.')}catch(error){status(error.message,true)}finally{button.disabled=false}});
$('#disable-biometric').addEventListener('click',()=>{disableBiometric();updateSecurityUi();status('Biometric unlock disabled. Wallet password is now required.')});
$('#show-recovery').addEventListener('click',()=>openSecurityPrompt('reveal'));
$('#hide-recovery').addEventListener('click',hideRecovery);
$('#settings-remove').addEventListener('click',()=>openSecurityPrompt('remove'));
$('#security-cancel').addEventListener('click',()=>$('#security-dialog').close());
$('#security-biometric').addEventListener('click',async()=>{const button=$('#security-biometric');button.disabled=true;try{await completeSecurityAction(await unlockBiometric())}catch(error){status(error.message,true)}finally{button.disabled=false}});
$('#security-password-submit').addEventListener('click',async()=>{const button=$('#security-password-submit');button.disabled=true;try{const password=$('#security-password').value;if(!password)throw new Error('Enter the wallet password.');await completeSecurityAction(await decryptMnemonic(vault(),password));$('#security-password').value=''}catch(error){status(error.message,true)}finally{button.disabled=false}});
$('#enable-notifications').addEventListener('click',async()=>{try{if(nativeAvailable()){await nativeRequest('requestNotifications');await syncElectrum(true)}else{if(!('Notification'in globalThis))throw new Error('Notifications are not supported on this device.');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');localStorage.setItem(NOTIFICATION_KEY,'enabled')}updateSecurityUi();status(nativeAvailable()?'Incoming and outgoing BC2 notifications enabled, including periodic background checks.':'New BC2 notifications enabled while this wallet is open.')}catch(error){status(error.message,true)}});
$('#electrum-transport').addEventListener('change',event=>{$('#electrum-url').value=event.target.value==='tcp'?'electrum+ssl://bc2-electrum.tail2d6b98.ts.net:443':DEFAULT_ELECTRUM_URL});
$('#copy-connect-proof').addEventListener('click',async()=>{await navigator.clipboard.writeText($('#connect-result').value);status('Connection proof copied.')});
$('#connect-close').addEventListener('click',()=>$('#connect-dialog').close());
$('#copy-address').addEventListener('click',async()=>{await navigator.clipboard.writeText($('#address').textContent);status('Address copied.');});
$('#open-address-explorer').addEventListener('click',()=>openExplorer($('#address').textContent));
$('#copy-receive-address').addEventListener('click',async()=>{await navigator.clipboard.writeText($('#receive-address').textContent);status('Address copied.');});
$('#remove').addEventListener('click',()=>openSecurityPrompt('remove'));
window.addEventListener('pagehide',()=>{clearReport();hideRecovery();clearInterval(syncTimer);electrum?.close();mnemonic=''});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mnemonic)syncElectrum(true)});
window.addEventListener('focus',()=>{if(mnemonic)syncElectrum(true)});
if(nativeAvailable())nativeRequest('consumeConnectRequest').then(value=>{if(value)handleConnectRequest(value)}).catch(()=>{});
loadAnnouncement();setInterval(loadAnnouncement,300000);
if('serviceWorker'in navigator){let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true;location.reload()});window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(registration=>registration.update()).catch(()=>{}))}
route();
