package com.bc2market.wallet;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.math.BigDecimal;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public final class BackgroundMonitorWorker extends Worker {
    static final String PREFS = "bc2_native_security";
    static final String NOTIFICATIONS = "notifications";
    static final String KEY_SCRIPT_HASH = "monitor_script_hash";
    static final String KEY_BALANCE = "monitor_balance";
    static final String KEY_TXID = "monitor_txid";
    static final String CHANNEL = "bc2_transactions";
    private static final String WORK_NAME = "goldwallet_background_monitor";
    private static final String ELECTRUM_URL = "wss://electrum.bc2market.com";
    private static final String GENESIS = "0000000028f062b221c1a8a5cf0244b1627315f7aa5b775b931cfec46dc17ceb";

    public BackgroundMonitorWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    static void schedule(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(NOTIFICATIONS, false) || !prefs.contains(KEY_SCRIPT_HASH)) return;
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(BackgroundMonitorWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    static void disable(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(KEY_SCRIPT_HASH).remove(KEY_BALANCE).remove(KEY_TXID).apply();
    }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String scriptHash = prefs.getString(KEY_SCRIPT_HASH, "");
        if (!prefs.getBoolean(NOTIFICATIONS, false) || !scriptHash.matches("[0-9a-fA-F]{64}")) return Result.success();
        Snapshot snapshot = fetch(scriptHash.toLowerCase());
        if (snapshot == null) return Result.retry();

        long previousBalance = prefs.getLong(KEY_BALANCE, Long.MIN_VALUE);
        String previousTxid = prefs.getString(KEY_TXID, "");
        boolean changed = !snapshot.latestTxid.isEmpty() && !previousTxid.isEmpty() && !snapshot.latestTxid.equals(previousTxid);
        if (changed && previousBalance != Long.MIN_VALUE) {
            long delta = snapshot.balance - previousBalance;
            String amount = formatBc2(delta);
            if (delta > 0) notifyTransfer("BC2 received", "+" + amount + " BC2");
            else if (delta < 0) notifyTransfer("BC2 sent", "−" + amount + " BC2");
            else notifyTransfer("GoldWallet activity", "A new BC2 transaction was detected.");
        }
        // shortcut: periodic checks summarize multiple unseen transfers by their net balance change.
        prefs.edit().putLong(KEY_BALANCE, snapshot.balance).putString(KEY_TXID, snapshot.latestTxid).apply();
        return Result.success();
    }

    private Snapshot fetch(String scriptHash) {
        OkHttpClient client = new OkHttpClient.Builder().connectTimeout(12, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build();
        CountDownLatch responses = new CountDownLatch(4);
        AtomicReference<String> genesis = new AtomicReference<>();
        AtomicReference<Long> balance = new AtomicReference<>();
        AtomicReference<String> latestTxid = new AtomicReference<>("");
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Request request = new Request.Builder().url(ELECTRUM_URL).build();
        WebSocket socket = client.newWebSocket(request, new WebSocketListener() {
            @Override public void onOpen(@NonNull WebSocket webSocket, @NonNull Response response) {
                webSocket.send(call(1, "server.version", new JSONArray().put("GoldWallet Background " + BuildConfig.VERSION_NAME).put("1.4")));
            }

            @Override public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                try {
                    JSONObject message = new JSONObject(text);
                    if (!message.has("id")) return;
                    int id = message.optInt("id", -1);
                    if (message.has("error") && !message.isNull("error")) throw new IllegalStateException(message.get("error").toString());
                    if (id == 1) {
                        webSocket.send(call(2, "server.features", new JSONArray()));
                    } else if (id == 2) {
                        genesis.set(message.getJSONObject("result").getString("genesis_hash"));
                        webSocket.send(call(3, "blockchain.scripthash.get_balance", new JSONArray().put(scriptHash)));
                        webSocket.send(call(4, "blockchain.scripthash.get_history", new JSONArray().put(scriptHash)));
                    } else if (id == 3) {
                        JSONObject result = message.getJSONObject("result");
                        balance.set(result.getLong("confirmed") + result.getLong("unconfirmed"));
                    } else if (id == 4) {
                        JSONArray history = message.getJSONArray("result");
                        if (history.length() > 0) latestTxid.set(history.getJSONObject(history.length() - 1).getString("tx_hash"));
                    } else return;
                    responses.countDown();
                } catch (Exception error) {
                    failure.compareAndSet(null, error);
                    drain(responses);
                }
            }

            @Override public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable error, Response response) {
                failure.compareAndSet(null, error);
                drain(responses);
            }
        });
        try {
            boolean complete = responses.await(20, TimeUnit.SECONDS);
            if (!complete || failure.get() != null || !GENESIS.equals(genesis.get()) || balance.get() == null) return null;
            return new Snapshot(balance.get(), latestTxid.get());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return null;
        } finally {
            socket.close(1000, "done");
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
        }
    }

    private static String call(int id, String method, JSONArray params) {
        try { return new JSONObject().put("jsonrpc", "2.0").put("id", id).put("method", method).put("params", params).toString(); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }

    private static void drain(CountDownLatch latch) { while (latch.getCount() > 0) latch.countDown(); }

    private void notifyTransfer(String title, String body) {
        Context context = getApplicationContext();
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "GoldWallet transactions", NotificationManager.IMPORTANCE_DEFAULT));
        Intent launch = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification notification = new android.app.Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(pending).setAutoCancel(true).build();
        manager.notify((int) System.currentTimeMillis(), notification);
    }

    private static String formatBc2(long sats) {
        return BigDecimal.valueOf(sats).abs().movePointLeft(8).stripTrailingZeros().toPlainString();
    }

    private record Snapshot(long balance, String latestTxid) {}
}
