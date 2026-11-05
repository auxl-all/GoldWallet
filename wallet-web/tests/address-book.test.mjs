import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecipientQr,recipientAddressState,upsertBookmark} from '../.test-build/address-book.mjs';

const valid='bc1qr376r573797suy4un8qt2ee0xsjr580g4msjf2';
const validate=value=>{if(value!==valid)throw new Error('invalid')};
test('normalizes a BitcoinII payment QR into an address',()=>assert.equal(normalizeRecipientQr(`bitcoinII:${valid}?amount=1`,validate),valid));
test('updates a duplicate bookmark without duplicating the address',()=>{const result=upsertBookmark([{id:'old',label:'Old',address:valid}],{id:'new',label:'Treasury',address:valid},validate);assert.deepEqual(result,[{id:'new',label:'Treasury',address:valid}])});
test('reports recipient validity while typing',()=>{assert.deepEqual(recipientAddressState(valid,validate),{valid:true,message:'Valid BitcoinII Mainnet address.'});assert.deepEqual(recipientAddressState('',validate),{valid:false,message:'Enter a BitcoinII Mainnet address.'});assert.deepEqual(recipientAddressState('wrong',validate),{valid:false,message:'invalid'})});
