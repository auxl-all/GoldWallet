import test from 'node:test';
import assert from 'node:assert/strict';
import {newTransactionNotifications} from '../src/transaction-notifications.js';

test('reports new incoming and outgoing transactions once',()=>{
  const items=[{txid:'received',direction:'received'},{txid:'sent',direction:'sent'},{txid:'known',direction:'received'},{txid:'unknown',direction:'unknown'}];
  assert.deepEqual(newTransactionNotifications(items,['known']).map(item=>item.txid),['received','sent']);
});
