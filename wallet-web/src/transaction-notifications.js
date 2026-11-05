export const newTransactionNotifications=(items,knownIds)=>items.filter(item=>
  (item.direction==='received'||item.direction==='sent')&&item.txid&&!knownIds.includes(item.txid));
