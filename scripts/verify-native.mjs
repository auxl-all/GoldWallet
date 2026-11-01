import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [manifest,activity,capture,bridge,wallet,html]=await Promise.all([
  readFile('app/src/main/AndroidManifest.xml','utf8'),
  readFile('app/src/main/java/com/bc2market/wallet/MainActivity.java','utf8'),
  readFile('app/src/main/java/com/bc2market/wallet/QrCaptureActivity.java','utf8'),
  readFile('app/src/main/java/com/bc2market/wallet/NativeBridge.java','utf8'),
  readFile('app/src/main/assets/wallet/app.js','utf8'),
  readFile('app/src/main/assets/wallet/index.html','utf8')
]);
assert.match(manifest,/allowBackup="false"/);
assert.match(manifest,/usesCleartextTraffic="false"/);
assert.match(manifest,/USE_BIOMETRIC/);
assert.match(manifest,/android.permission.CAMERA/);
assert.match(manifest,/hardwareAccelerated="true"/);
assert.match(manifest,/android:name="\.QrCaptureActivity"/);
assert.match(manifest,/screenOrientation="unspecified"/);
assert.match(manifest,/android:scheme="bc2connect"/);
assert.match(activity,/FLAG_SECURE/);
assert.match(activity,/appassets\.androidplatform\.net/);
assert.match(activity,/shouldOverrideUrlLoading/);
assert.match(activity,/IntentIntegrator/);
assert.match(activity,/setCaptureActivity\(QrCaptureActivity\.class\)/);
assert.match(capture,/extends CaptureActivity/);
assert.match(bridge,/AndroidKeyStore/);
assert.match(bridge,/setUserAuthenticationRequired\(true\)/);
assert.match(bridge,/setEndpointIdentificationAlgorithm\("HTTPS"\)/);
assert.match(bridge,/Mainnet Electrum TCP requires TLS/);
assert.match(bridge,/POST_NOTIFICATIONS/);
assert.match(bridge,/scanQr/);
assert.match(bridge,/consumeConnectRequest/);
assert.match(wallet,/0000000028f062b221c1a8a5cf0244b1627315f7aa5b775b931cfec46dc17ceb/);
assert.match(wallet,/BC2 Market login/);
assert.match(wallet,/api\/wallet-connect\/verify/);
assert.match(html,/id="scan-recipient"/);
assert.match(html,/id="bookmarks-dialog"/);
assert.match(html,/id="connect-bc2market"/);
console.log('BC2 native security checks passed');
