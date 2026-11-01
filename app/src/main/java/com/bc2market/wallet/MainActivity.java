package com.bc2market.wallet;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowManager;
import java.io.InputStream;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

public final class MainActivity extends Activity {
    static final int NOTIFICATION_REQUEST = 1201;
    static final int CAMERA_REQUEST = 1202;
    private WebView webView;
    private NativeBridge bridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        webView = new WebView(this);
        bridge = new NativeBridge(this, webView);
        bridge.setPendingConnectRequest(connectPayload(getIntent()));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Wallet code is bundled locally; external navigation is blocked below.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        webView.addJavascriptInterface(bridge, "BC2Native");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new LocalWalletClient());
        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/wallet/index.html");
    }

    void requestNotificationPermission(String callbackId) {
        bridge.setNotificationCallback(callbackId);
        if (android.os.Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        else bridge.finishNotificationPermission(true);
    }

    void startQrScan(String callbackId) {
        bridge.setQrCallback(callbackId);
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            bridge.finishQrError("This device does not have a camera.");
            return;
        }
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
            return;
        }
        launchQrScanner();
    }

    private void launchQrScanner() {
        try {
            new IntentIntegrator(this).setCaptureActivity(QrCaptureActivity.class).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                .setPrompt("Scan a BC2 address or connection request").setBeepEnabled(false).setOrientationLocked(false).initiateScan();
        } catch (RuntimeException error) {
            bridge.finishQrError("Unable to open the QR scanner. Check the camera permission and try again.");
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bridge.setPendingConnectRequest(connectPayload(intent));
    }

    private String connectPayload(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        return uri != null && "bc2connect".equals(uri.getScheme()) && "connect".equals(uri.getHost()) ? uri.getQueryParameter("payload") : null;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (result != null) { bridge.finishQrScan(result.getContents()); return; }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATION_REQUEST) bridge.finishNotificationPermission(results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED);
        if (requestCode == CAMERA_REQUEST) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) launchQrScanner();
            else bridge.finishQrError("Camera permission was not granted. Enable it in Android Settings to scan QR codes.");
        }
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        bridge.close();
        webView.removeJavascriptInterface("BC2Native");
        webView.destroy();
        super.onDestroy();
    }

    private final class LocalWalletClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()));
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"appassets.androidplatform.net".equals(uri.getHost()) || uri.getPath() == null || !uri.getPath().startsWith("/wallet/")) return null;
            String asset = uri.getPath().substring(1);
            if (asset.contains("..")) return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", java.util.Map.of(), null);
            try {
                InputStream stream = getAssets().open(asset);
                String extension = MimeTypeMap.getFileExtensionFromUrl(asset), mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                if (mime == null) mime = asset.endsWith(".webmanifest") ? "application/manifest+json" : "application/octet-stream";
                return new WebResourceResponse(mime, "UTF-8", stream);
            } catch (Exception error) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", java.util.Map.of(), null);
            }
        }
    }
}
