import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRelease,parseUsdQuote,usdBalance,safeUpdateUrl} from '../.test-build/wallet-services.mjs';
const now=1794554004000;
const quote={currency:'USD',coinId:'bitcoinii',source:'CoinGecko',usd:.08,updatedAt:now/1000};
const release={applicationId:'com.bc2market.wallet',versionName:'0.4.9',versionCode:19,downloads:{bc2market:'https://bc2market.com/downloads/GoldWallet-v0.4.9-debug.apk',github:'https://github.com/auxl-all/GoldWallet/releases/tag/v0.4.9',googlePlay:null}};

test('values only synchronized confirmed balances using fresh USD quotes',()=>{
  assert.equal(usdBalance(12345678900,parseUsdQuote(quote,now),now),'≈ $9.88 USD');
  assert.equal(usdBalance(0,quote,now),'≈ $0.00 USD');
  assert.equal(usdBalance(1,quote,now),'≈ <$0.01 USD');
  assert.throws(()=>parseUsdQuote({...quote,updatedAt:now/1000-1801},now),/out of date/);
  assert.throws(()=>parseUsdQuote({...quote,updatedAt:now/1000+301},now),/out of date/);
  for(const usd of [null,0,-1,NaN,Infinity])assert.throws(()=>parseUsdQuote({...quote,usd},now),/unavailable/);
  assert.throws(()=>usdBalance(NaN,quote,now));
});
test('uses monotonically increasing version codes and supports optional Google Play',()=>{
  assert.equal(parseRelease(release,18).newer,true);
  assert.equal(parseRelease(release,19).newer,false);
  assert.equal(parseRelease(release,20).newer,false);
  assert.equal(parseRelease(release,18).downloads.googlePlay,undefined);
  const play='https://play.google.com/store/apps/details?id=com.bc2market.wallet';
  assert.equal(parseRelease({...release,downloads:{...release.downloads,googlePlay:play}},18).downloads.googlePlay,play);
});
test('rejects wrong apps, malformed releases and untrusted download destinations',()=>{
  assert.throws(()=>parseRelease({...release,applicationId:'another.app'},18));
  assert.throws(()=>parseRelease({...release,versionCode:'19'},18));
  assert.throws(()=>parseRelease({...release,downloads:{}},18));
  for(const value of ['http://bc2market.com/downloads/GoldWallet-v0.4.9-debug.apk','https://bc2market.com.evil.test/downloads/GoldWallet-v0.4.9-debug.apk','https://user@bc2market.com/downloads/GoldWallet-v0.4.9-debug.apk','https://bc2market.com:444/downloads/GoldWallet-v0.4.9-debug.apk','https://bc2market.com/downloads/GoldWallet-v0.4.8-debug.apk'])assert.equal(safeUpdateUrl(value,'bc2market','0.4.9'),null);
  assert.equal(safeUpdateUrl('https://github.com/another/repo/releases/tag/v0.4.9','github','0.4.9'),null);
  assert.equal(safeUpdateUrl('https://play.google.com/store/apps/details?id=another.app','googlePlay','0.4.9'),null);
  assert.throws(()=>parseRelease({...release,downloads:{github:'https://evil.test'}},18));
});
