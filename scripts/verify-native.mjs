import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [manifest,activity,bridge,worker,wallet,html]=await Promise.all([
  readFile('app/src/main/AndroidManifest.xml','utf8'),
  readFile('app/src/main/java/com/bc2market/wallet/MainActivity.java','utf8'),
  readFile('app/src/main/java/com/bc2market/wallet/NativeBridge.java','utf8'),
  readFile('app/src/main/java/com/bc2market/wallet/BackgroundMonitorWorker.java','utf8'),
  readFile('app/src/main/assets/wallet/app.js','utf8'),
  readFile('app/src/main/assets/wallet/index.html','utf8')
]);
assert.match(manifest,/allowBackup="false"/);
assert.match(manifest,/usesCleartextTraffic="false"/);
assert.match(manifest,/USE_BIOMETRIC/);
assert.match(manifest,/hardwareAccelerated="true"/);
assert.match(manifest,/com\.google\.mlkit\.vision\.DEPENDENCIES/);
assert.match(manifest,/android:value="barcode_ui,barcode"/);
assert.match(manifest,/android:scheme="bc2connect"/);
assert.match(manifest,/android:label="GoldWallet"/);
assert.match(manifest,/android:icon="@drawable\/goldwallet_icon"/);
assert.match(activity,/FLAG_SECURE/);
assert.match(activity,/appassets\.androidplatform\.net/);
assert.match(activity,/shouldOverrideUrlLoading/);
assert.match(activity,/GmsBarcodeScanning\.getClient/);
assert.match(activity,/Barcode\.FORMAT_QR_CODE/);
assert.match(activity,/enableAutoZoom/);
assert.match(activity,/ACTION_OPEN_DOCUMENT/);
assert.match(activity,/InputImage\.fromFilePath/);
assert.match(activity,/BarcodeScanning\.getClient/);
assert.match(bridge,/AndroidKeyStore/);
assert.match(bridge,/setUserAuthenticationRequired\(true\)/);
assert.match(bridge,/setEndpointIdentificationAlgorithm\("HTTPS"\)/);
assert.match(bridge,/Mainnet Electrum TCP requires TLS/);
assert.match(bridge,/POST_NOTIFICATIONS/);
assert.match(bridge,/scanQr/);
assert.match(bridge,/scanQrImage/);
assert.match(bridge,/openExternal/);
assert.match(bridge,/"bc2market\.com"\.equals\(uri\.getHost\(\)\)/);
assert.match(bridge,/consumeConnectRequest/);
assert.match(bridge,/configureBackgroundMonitor/);
assert.match(bridge,/disableBackgroundMonitor/);
assert.match(worker,/PeriodicWorkRequest\.Builder/);
assert.match(worker,/15, TimeUnit\.MINUTES/);
assert.match(worker,/server\.version/);
assert.ok(worker.indexOf('server.version') < worker.indexOf('server.features'));
assert.match(worker,/0000000028f062b221c1a8a5cf0244b1627315f7aa5b775b931cfec46dc17ceb/);
assert.match(worker,/blockchain\.scripthash\.get_history/);
assert.match(worker,/blockchain\.scripthash\.get_balance/);
assert.match(wallet,/0000000028f062b221c1a8a5cf0244b1627315f7aa5b775b931cfec46dc17ceb/);
assert.match(wallet,/configureBackgroundMonitor/);
assert.match(wallet,/disableBackgroundMonitor/);
assert.match(html,/GoldWallet/);
assert.match(wallet,/BC2 Market login/);
assert.match(wallet,/api\/wallet-connect\/verify/);
assert.match(html,/id="scan-recipient"/);
assert.match(html,/id="scan-recipient-image"/);
assert.match(html,/id="bookmarks-dialog"/);
assert.match(html,/id="scan-wallet-qr"/);
assert.match(html,/id="open-address-explorer"/);
assert.doesNotMatch(html,/id="connect-bc2market"/);
assert.ok(html.indexOf('id="scan-wallet-qr"') < html.indexOf('id="home-wallet"'));
assert.match(html,/id="admin-announcement"[^>]*hidden/);
assert.ok(html.indexOf('class="wallet-actions"') < html.indexOf('id="status"'));
assert.doesNotMatch(html,/BitcoinII Mainnet hot wallet/);
console.log('BC2 native security checks passed');
