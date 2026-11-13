export const APPLICATION_ID='com.bc2market.wallet';
export const PRICE_MAX_AGE=30*60;

export function parseUsdQuote(data,now=Date.now()){
  if(data?.currency!=='USD'||data.coinId!=='bitcoinii'||data.source!=='CoinGecko'||typeof data.usd!=='number'||!Number.isFinite(data.usd)||data.usd<=0||!Number.isSafeInteger(data.updatedAt))throw new Error('USD price unavailable.');
  const age=now/1000-data.updatedAt;
  if(age>PRICE_MAX_AGE||age< -300)throw new Error('USD price is out of date.');
  return{usd:data.usd,updatedAt:data.updatedAt,source:data.source};
}

export function usdBalance(sats,quote,now=Date.now()){
  if(!Number.isSafeInteger(sats)||sats<0)throw new Error('Balance is not synchronized.');
  const checked=parseUsdQuote({currency:'USD',coinId:'bitcoinii',...quote},now),value=sats/1e8*checked.usd;
  if(!Number.isFinite(value))throw new Error('USD value unavailable.');
  return value>0&&value<.01?'≈ <$0.01 USD':`≈ ${value.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2})} USD`;
}

export function safeUpdateUrl(value,channel,version){
  if(typeof value!=='string'||!/^\d+\.\d+\.\d+$/.test(version))return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return null;
    if(channel==='bc2market'&&url.hostname==='bc2market.com'&&url.pathname===`/downloads/GoldWallet-v${version}-debug.apk`&&!url.search)return url.href;
    if(channel==='github'&&url.hostname==='github.com'&&url.pathname===`/auxl-all/GoldWallet/releases/tag/v${version}`&&!url.search)return url.href;
    if(channel==='googlePlay'&&url.hostname==='play.google.com'&&url.pathname==='/store/apps/details'&&url.searchParams.get('id')===APPLICATION_ID&&[...url.searchParams.keys()].every(key=>key==='id'))return url.href;
  }catch{}
  return null;
}

export function parseRelease(data,installedCode){
  if(data?.applicationId!==APPLICATION_ID||!/^\d+\.\d+\.\d+$/.test(data.versionName)||!Number.isSafeInteger(data.versionCode)||data.versionCode<1)throw new Error('Invalid update information.');
  const downloads={};
  for(const channel of ['bc2market','github','googlePlay']){
    const value=data.downloads?.[channel];
    if(value!=null){const url=safeUpdateUrl(value,channel,data.versionName);if(!url)throw new Error('Untrusted update link.');downloads[channel]=url}
  }
  if(!downloads.bc2market&&!downloads.github&&!downloads.googlePlay)throw new Error('No verified download link.');
  return{versionName:data.versionName,versionCode:data.versionCode,newer:data.versionCode>installedCode,releaseNotes:String(data.releaseNotes||'').slice(0,1000),downloads};
}
