package com.bc2market.wallet;

import android.Manifest;
import android.hardware.biometrics.BiometricPrompt;
import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.fingerprint.FingerprintManager;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

public final class NativeBridge {
    private static final String PREFS = "bc2_native_security";
    private static final String KEY_ALIAS = "biometric_alias";
    private static final String CIPHERTEXT = "biometric_ciphertext";
    private static final String IV = "biometric_iv";
    private static final String NOTIFICATIONS = "notifications";
    private static final String CHANNEL = "bc2_transactions";
    private final MainActivity activity;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final ExecutorService network = Executors.newCachedThreadPool();
    private String notificationCallback;
    private String qrCallback;
    private String pendingConnectRequest;
    private String reportContent;
    private String reportCallback;

    NativeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "GoldWallet transactions", NotificationManager.IMPORTANCE_DEFAULT));
        BackgroundMonitorWorker.schedule(activity);
    }

    @JavascriptInterface public boolean biometricAvailable() {
        FingerprintManager fingerprints = activity.getSystemService(FingerprintManager.class);
        KeyguardManager lock = activity.getSystemService(KeyguardManager.class);
        return lock.isDeviceSecure() && fingerprints != null && fingerprints.isHardwareDetected() && fingerprints.hasEnrolledFingerprints();
    }

    @JavascriptInterface public boolean biometricEnabled() {
        String alias = prefs.getString(KEY_ALIAS, null);
        if (alias == null || !prefs.contains(CIPHERTEXT) || !prefs.contains(IV)) return false;
        try { KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); return store.containsAlias(alias); }
        catch (Exception error) { return false; }
    }

    @JavascriptInterface public void enableBiometric(String mnemonic, String callbackId) {
        activity.runOnUiThread(() -> {
            try {
                if (!biometricAvailable()) throw new IllegalStateException("Enroll a fingerprint in Android settings first.");
                String alias = "bc2_wallet_biometric_" + System.currentTimeMillis();
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
                if (Build.VERSION.SDK_INT >= 30) builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
                else builder.setUserAuthenticationValidityDurationSeconds(-1);
                generator.init(builder.build());
                SecretKey key = generator.generateKey();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key);
                authenticate(cipher, callbackId, result -> {
                    try {
                        byte[] encrypted = result.getCryptoObject().getCipher().doFinal(mnemonic.getBytes(StandardCharsets.UTF_8));
                        String oldAlias = prefs.getString(KEY_ALIAS, null);
                        prefs.edit().putString(KEY_ALIAS, alias).putString(CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP)).putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).apply();
                        if (oldAlias != null && !oldAlias.equals(alias)) deleteKey(oldAlias);
                        callback(callbackId, true, "enabled");
                    } catch (Exception error) { deleteKey(alias); callback(callbackId, false, error.getMessage()); }
                });
            } catch (Exception error) { callback(callbackId, false, error.getMessage()); }
        });
    }

    @JavascriptInterface public void unlockBiometric(String callbackId) {
        activity.runOnUiThread(() -> {
            try {
                String alias = prefs.getString(KEY_ALIAS, null);
                if (alias == null) throw new IllegalStateException("Biometric unlock is not enabled.");
                KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
                SecretKey key = (SecretKey) store.getKey(alias, null);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(prefs.getString(IV, ""), Base64.NO_WRAP)));
                authenticate(cipher, callbackId, result -> {
                    try {
                        byte[] plain = result.getCryptoObject().getCipher().doFinal(Base64.decode(prefs.getString(CIPHERTEXT, ""), Base64.NO_WRAP));
                        callback(callbackId, true, new String(plain, StandardCharsets.UTF_8));
                    } catch (Exception error) { callback(callbackId, false, "Unable to decrypt the biometric vault."); }
                });
            } catch (Exception error) { callback(callbackId, false, "Biometric key is unavailable. Use the wallet password."); }
        });
    }

    @JavascriptInterface public void disableBiometric() {
        String alias = prefs.getString(KEY_ALIAS, null);
        if (alias != null) deleteKey(alias);
        prefs.edit().remove(KEY_ALIAS).remove(CIPHERTEXT).remove(IV).apply();
    }

    @JavascriptInterface public boolean notificationsEnabled() {
        boolean allowed = Build.VERSION.SDK_INT < 33 || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        return allowed && prefs.getBoolean(NOTIFICATIONS, false);
    }

    @JavascriptInterface public void requestNotifications(String callbackId) {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) activity.requestNotificationPermission(callbackId);
            else { prefs.edit().putBoolean(NOTIFICATIONS, true).apply(); BackgroundMonitorWorker.schedule(activity); callback(callbackId, true, "enabled"); }
        });
    }

    void setNotificationCallback(String callbackId) { notificationCallback = callbackId; }
    void finishNotificationPermission(boolean granted) {
        if (granted) { prefs.edit().putBoolean(NOTIFICATIONS, true).apply(); BackgroundMonitorWorker.schedule(activity); }
        String id = notificationCallback; notificationCallback = null;
        if (id != null) callback(id, granted, granted ? "enabled" : "Notification permission was not granted.");
    }

    @JavascriptInterface public void notifyReceived(String title, String body) {
        if (!notificationsEnabled()) return;
        Intent launch = new Intent(activity, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(activity, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification notification = new android.app.Notification.Builder(activity, CHANNEL)
            .setSmallIcon(com.bc2market.wallet.R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(pending).setAutoCancel(true).build();
        activity.getSystemService(NotificationManager.class).notify((int) System.currentTimeMillis(), notification);
    }

    @JavascriptInterface public void configureBackgroundMonitor(String scriptHash, String balance, String txid) {
        if (scriptHash == null || !scriptHash.matches("[0-9a-fA-F]{64}")) return;
        if (txid == null || (!txid.isEmpty() && !txid.matches("[0-9a-fA-F]{64}"))) return;
        try {
            long sats = Long.parseLong(balance);
            prefs.edit().putString(BackgroundMonitorWorker.KEY_SCRIPT_HASH, scriptHash.toLowerCase())
                .putLong(BackgroundMonitorWorker.KEY_BALANCE, sats)
                .putString(BackgroundMonitorWorker.KEY_TXID, txid.toLowerCase()).apply();
            BackgroundMonitorWorker.schedule(activity);
        } catch (NumberFormatException ignored) {}
    }

    @JavascriptInterface public void disableBackgroundMonitor() { BackgroundMonitorWorker.disable(activity); }

    @JavascriptInterface public void scanQr(String callbackId) { activity.runOnUiThread(() -> activity.startQrScan(callbackId)); }
    @JavascriptInterface public void scanQrImage(String callbackId) { activity.runOnUiThread(() -> activity.startQrImageScan(callbackId)); }
    @JavascriptInterface public void openExternal(String value) {
        if (value == null) return;
        Uri uri = Uri.parse(value);
        if (!"https".equals(uri.getScheme()) || !"bc2market.com".equals(uri.getHost()) || !"/explorer".equals(uri.getPath())) return;
        activity.runOnUiThread(() -> activity.startActivity(new Intent(Intent.ACTION_VIEW, uri)));
    }
    void setQrCallback(String callbackId) { qrCallback = callbackId; }
    void finishQrScan(String contents) { String id = qrCallback; qrCallback = null; if (id != null) callback(id, contents != null, contents == null ? "QR scan cancelled." : contents); }
    void finishQrError(String message) { String id = qrCallback; qrCallback = null; if (id != null) callback(id, false, message); }

    @JavascriptInterface public void consumeConnectRequest(String callbackId) {
        String value = pendingConnectRequest; pendingConnectRequest = null; callback(callbackId, true, value == null ? "" : value);
    }
    void setPendingConnectRequest(String value) {
        if (value == null || value.length() > 5000) return;
        pendingConnectRequest = value;
        String script = "globalThis.__bc2ConnectRequest?.(" + JSONObject.quote(value) + ")";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    @JavascriptInterface public void saveReport(String filename, String content, String callbackId) {
        activity.runOnUiThread(() -> {
            if (reportCallback != null) { callback(callbackId, false, "Another export is already open."); return; }
            if (filename == null || !filename.matches("GoldWallet-[0-9-]+[.]csv") || content == null || content.length() > 2_000_000 || !content.startsWith("\ufeffDate (UTC+7),")) {
                callback(callbackId, false, "Invalid CSV report."); return;
            }
            reportContent = content; reportCallback = callbackId; activity.startReportSave(filename);
        });
    }

    void finishReportSave(Uri uri) {
        String id = reportCallback, content = reportContent;
        reportCallback = null; reportContent = null;
        if (id == null) return;
        if (uri == null) { callback(id, false, "CSV export cancelled."); return; }
        network.execute(() -> {
            try (java.io.OutputStream stream = activity.getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new java.io.IOException("No output stream");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                callback(id, true, "saved");
            } catch (Exception error) { callback(id, false, "Unable to save CSV report."); }
        });
    }

    @JavascriptInterface public void electrumRequest(String host, int port, boolean tls, String request, String callbackId) {
        if (!tls) { callback(callbackId, false, "Mainnet Electrum TCP requires TLS."); return; }
        if (host == null || !host.matches("[A-Za-z0-9.-]{1,253}") || port < 1 || port > 65535 || request.length() > 1_000_000) { callback(callbackId, false, "Invalid Electrum connection parameters."); return; }
        network.execute(() -> {
            try {
                new JSONObject(request);
                SSLSocket socket = (SSLSocket) SSLSocketFactory.getDefault().createSocket();
                socket.connect(new InetSocketAddress(host, port), 8000); socket.setSoTimeout(12000);
                SSLParameters parameters = socket.getSSLParameters(); parameters.setEndpointIdentificationAlgorithm("HTTPS"); socket.setSSLParameters(parameters); socket.startHandshake();
                BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
                writer.write(request); writer.write("\n"); writer.flush();
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                String response = readLimitedLine(reader, 8_000_000); socket.close();
                if (response == null) throw new IllegalStateException("Electrum closed without a response.");
                callback(callbackId, true, response);
            } catch (Exception error) { callback(callbackId, false, "Electrum TCP/TLS failed: " + error.getMessage()); }
        });
    }

    private String readLimitedLine(BufferedReader reader, int limit) throws Exception {
        StringBuilder value = new StringBuilder(); int character;
        while ((character = reader.read()) != -1 && character != '\n') { if (value.length() >= limit) throw new IllegalStateException("Electrum response is too large."); value.append((char) character); }
        return character == -1 && value.length() == 0 ? null : value.toString();
    }

    private interface AuthSuccess { void run(BiometricPrompt.AuthenticationResult result); }
    private void authenticate(Cipher cipher, String callbackId, AuthSuccess success) {
        CancellationSignal cancel = new CancellationSignal();
        BiometricPrompt prompt = new BiometricPrompt.Builder(activity).setTitle("GoldWallet security").setSubtitle("Confirm your fingerprint")
            .setNegativeButton("Cancel", activity.getMainExecutor(), (dialog, which) -> callback(callbackId, false, "Authentication cancelled."))
            .build();
        prompt.authenticate(new BiometricPrompt.CryptoObject(cipher), cancel, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { success.run(result); }
            @Override public void onAuthenticationError(int code, CharSequence message) { callback(callbackId, false, message.toString()); }
        });
    }

    private void deleteKey(String alias) { try { KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(alias); } catch (Exception ignored) {} }
    private void callback(String id, boolean ok, String payload) {
        String script = "window.__bc2NativeCallback(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(payload == null ? "Operation failed." : payload) + ")";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }
    void close() { network.shutdownNow(); }
}
