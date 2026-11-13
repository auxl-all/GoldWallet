const DAY=86400000;
export const reportDate=(time=Date.now())=>new Date(time+7*3600000).toISOString().slice(0,10);
const sats=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Invalid transaction amount.');const n=Math.round(value*1e8);if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid transaction amount.');return n};
const sum=values=>{const n=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(n))throw new Error('Report amount exceeds safe precision.');return n};
export const reportAmount=value=>{if(!Number.isSafeInteger(value))throw new Error('Invalid report amount.');return `${value<0?'-':''}${Math.floor(Math.abs(value)/1e8)}.${String(Math.abs(value)%1e8).padStart(8,'0')}`};

export function reportMovement({transaction,previousTransactions,height,timestamp},walletScriptHex){
  if(!Array.isArray(transaction.vin)||!Array.isArray(transaction.vout))throw new Error('Transaction details are incomplete.');
  const own=output=>output?.scriptPubKey?.hex===walletScriptHex;
  const outputs=transaction.vout.map(output=>sats(output.value));
  const received=sum(transaction.vout.filter(own).map(output=>sats(output.value)));
  let spent=0,totalInputs=0,foreignInputs=false;
  for(const input of transaction.vin){
    if(input.coinbase!=null)continue;
    const previous=previousTransactions[input.txid]?.vout?.[input.vout];
    if(!previous)throw new Error('Previous transaction details are incomplete.');
    const value=sats(previous.value);totalInputs=sum([totalInputs,value]);
    if(own(previous))spent=sum([spent,value]);else foreignInputs=true;
  }
  if(spent&&foreignInputs)throw new Error('Mixed-input transaction: wallet cash flow cannot be attributed reliably.');
  const fee=spent?totalInputs-sum(outputs):0;
  if(fee<0)throw new Error('Invalid transaction fee.');
  const incoming=spent?0:received,outgoing=spent?sum(transaction.vout.filter(output=>!own(output)).map(output=>sats(output.value))):0;
  const net=received-spent;
  if(incoming-outgoing-fee!==net)throw new Error('Transaction amounts do not reconcile.');
  if(height>0&&(!Number.isSafeInteger(timestamp)||timestamp<=0))throw new Error('Confirmed block time is missing.');
  return{txid:transaction.txid,height,date:height>0?reportDate(timestamp*1000):null,incoming,outgoing,fee,net};
}

export function balanceReport({transactions,walletScriptHex,confirmed,unconfirmed,start,end,now=Date.now()}){
  const valid=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(Date.parse(date)).toISOString().slice(0,10)===date;
  if(!valid(start)||!valid(end)||start>end||end>reportDate(now))throw new Error('Choose a valid date range ending today or earlier (UTC+7).');
  const count=Math.round((Date.parse(end)-Date.parse(start))/DAY)+1;
  if(count>3660)throw new Error('Choose a period of 10 years or less.');
  if(!Number.isSafeInteger(confirmed)||!Number.isSafeInteger(unconfirmed))throw new Error('Invalid Electrum balance.');
  const seen=new Set(),events=transactions.map(item=>{if(seen.has(item.transaction.txid))throw new Error('Duplicate transaction in history.');seen.add(item.transaction.txid);return reportMovement(item,walletScriptHex)});
  const settled=events.filter(item=>item.height>0),pending=events.filter(item=>item.height<=0);
  if(sum(settled.map(item=>item.net))!==confirmed||sum(pending.map(item=>item.net))!==unconfirmed)throw new Error('History does not match the wallet balance. Refresh and try again.');
  let balance=sum(settled.filter(item=>item.date<start).map(item=>item.net));
  const opening=balance,rows=[];
  for(let index=0;index<count;index++){
    const date=new Date(Date.parse(start)+index*DAY).toISOString().slice(0,10),items=settled.filter(item=>item.date===date);
    const incoming=sum(items.map(item=>item.incoming)),outgoing=sum(items.map(item=>item.outgoing)),fees=sum(items.map(item=>item.fee)),net=sum(items.map(item=>item.net));
    balance=sum([balance,net]);rows.push({date,incoming,outgoing,fees,net,balance,transactions:items.length});
  }
  return{start,end,asof:now,opening,closing:balance,incoming:sum(rows.map(row=>row.incoming)),outgoing:sum(rows.map(row=>row.outgoing)),fees:sum(rows.map(row=>row.fees)),net:sum(rows.map(row=>row.net)),confirmed,unconfirmed,pendingTransactions:pending.length,rows};
}

export function reportCsv(report){
  const header='Date (UTC+7),Received BC2,Sent BC2,Fees BC2,Net BC2,Closing balance BC2,Transactions';
  return '\ufeff'+[header,...report.rows.map(row=>[row.date,...['incoming','outgoing','fees','net','balance'].map(key=>reportAmount(row[key])),row.transactions].join(','))].join('\r\n')+'\r\n';
}
