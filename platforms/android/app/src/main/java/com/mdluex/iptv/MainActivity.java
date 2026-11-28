package com.mdluex.iptv;

import android.annotation.SuppressLint;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.Cue;
import androidx.media3.common.text.CueGroup;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Mdluex IPTV for Android TV: the shared TV app runs in a full-screen WebView; video plays in a native
 * ExoPlayer underneath it (the page turns see-through while a video plays).
 */
@OptIn(markerClass = UnstableApi.class)
public class MainActivity extends Activity {
    private WebView web;
    private SurfaceView surface;
    private FrameLayout root;
    private ExoPlayer player;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String aspect = "fit";
    private int videoW = 16, videoH = 9;
    // read from the page's JavaScript thread, updated on the main thread
    private volatile long curTime = 0, curDuration = 0;
    private volatile boolean paused = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(this);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true); // IPTV servers do not send CORS headers
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        // the app is laid out for 1920x1080: honour its viewport and fit it to the screen at any TV density
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        web.setInitialScale(0);
        s.setUserAgentString(s.getUserAgentString() + " MdluexAndroidTV/" + BuildConfigVersion.NAME);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "MdxNative");
        // web debugging only in debug builds (never in the published APK)
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        web.loadUrl("file:///android_asset/www/index.html");
        web.requestFocus();

        // Android 13+ (predictive back) hands Back to this callback instead of a key event:
        // send it to the app so Back closes the player / goes back instead of closing the app.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::sendBack);
        }
    }

    private long lastBack;
    /** Back can arrive both as a key event and as a back callback: send it to the app only once. */
    private void sendBack() {
        long now = SystemClock.uptimeMillis();
        if (now - lastBack < 250) return;
        lastBack = now;
        web.evaluateJavascript("window.App&&App.key(10009)", null);
    }

    /** A TV (or TV box): TV mode, the Android TV (leanback) feature, or no touchscreen at all. */
    private boolean isTV() {
        UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        PackageManager pm = getPackageManager();
        return (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                || !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
    }

    private boolean isFireTV() {
        return getPackageManager().hasSystemFeature("amazon.hardware.fire_tv")
                || (Build.MANUFACTURER.equalsIgnoreCase("Amazon") && Build.MODEL.startsWith("AFT"));
    }

    /* ------------------------------------------------------------------ remote keys -> app */

    /** Android key code -> the key code the shared app understands (Tizen/web numbering). */
    private static int mapKey(int k) {
        switch (k) {
            case KeyEvent.KEYCODE_BACK: return 10009;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return 10252;
            case KeyEvent.KEYCODE_MEDIA_PLAY: return 415;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return 19;
            case KeyEvent.KEYCODE_MEDIA_STOP: return 413;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return 417;
            case KeyEvent.KEYCODE_MEDIA_REWIND: return 412;
            case KeyEvent.KEYCODE_CHANNEL_UP: case KeyEvent.KEYCODE_PAGE_UP: return 427;
            case KeyEvent.KEYCODE_CHANNEL_DOWN: case KeyEvent.KEYCODE_PAGE_DOWN: return 428;
            case KeyEvent.KEYCODE_PROG_RED: return 403;
            case KeyEvent.KEYCODE_PROG_GREEN: return 404;
            case KeyEvent.KEYCODE_PROG_YELLOW: return 405;
            case KeyEvent.KEYCODE_PROG_BLUE: return 406;
            case KeyEvent.KEYCODE_INFO: case KeyEvent.KEYCODE_MENU: return 457;
            default:
                if (k >= KeyEvent.KEYCODE_0 && k <= KeyEvent.KEYCODE_9) return 48 + (k - KeyEvent.KEYCODE_0);
                return 0; // arrows and OK go to the page as normal key presses
        }
    }

    /* Android TV and Fire TV remotes have no colored buttons. Holding OK opens the app's options
       menu (the same as Info / the Fire TV ☰ button); a short press still selects. So OK is held back
       until it is released or held long enough. */
    private KeyEvent okDown;
    private boolean okLong;
    private static boolean isOk(int k) {
        return k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (isOk(e.getKeyCode())) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                if (e.getRepeatCount() == 0) { okDown = KeyEvent.changeAction(e, KeyEvent.ACTION_DOWN); okLong = false; }
                else if (!okLong && okDown != null && (e.isLongPress() || e.getEventTime() - okDown.getDownTime() >= 600)) {
                    okLong = true;
                    web.evaluateJavascript("window.App&&App.key(457)", null);
                }
                return true;
            }
            if (e.getAction() == KeyEvent.ACTION_UP) {
                KeyEvent down = okDown;
                okDown = null;
                if (okLong || down == null) return true;
                super.dispatchKeyEvent(down);   // a short press: deliver it now, as a normal OK
                return super.dispatchKeyEvent(e);
            }
        }
        int code = mapKey(e.getKeyCode());
        if (code != 0) {
            if (code == 10009) {
                if (e.getAction() == KeyEvent.ACTION_UP) sendBack();
            } else if (e.getAction() == KeyEvent.ACTION_DOWN) {
                web.evaluateJavascript("window.App&&App.key(" + code + ")", null);
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    /* ------------------------------------------------------------------ native player */

    private void js(String event, Object value) {
        String v = value instanceof String ? JSONObject.quote((String) value) : String.valueOf(value);
        main.post(() -> web.evaluateJavascript("window.__mdxNative&&__mdxNative('" + event + "'," + v + ")", null));
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            curTime = player.getCurrentPosition();
            long d = player.getDuration();
            curDuration = d == C.TIME_UNSET || d < 0 ? 0 : d;
            paused = !player.getPlayWhenReady();
            js("time", curTime);
            main.postDelayed(this, 500);
        }
    };

    private void layoutSurface() {
        int w = root.getWidth(), h = root.getHeight();
        if (w == 0 || h == 0) return;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.CENTER);
        if (!"fill".equals(aspect) && videoW > 0 && videoH > 0) {
            float vr = (float) videoW / videoH, sr = (float) w / h;
            if (vr > sr) lp.height = Math.round(w / vr); else lp.width = Math.round(h * vr);
        }
        surface.setLayoutParams(lp);
    }

    private void startPlayer(String url, long startMs, boolean live) {
        releasePlayer();
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("MdluexIPTV-AndroidTV/" + BuildConfigVersion.NAME)
                .setAllowCrossProtocolRedirects(true) // load-balancer redirects
                .setConnectTimeoutMs(15000).setReadTimeoutMs(30000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
                .build();
        player.setVideoSurfaceView(surface);
        MediaItem.Builder item = new MediaItem.Builder().setUri(Uri.parse(url));
        if (url.toLowerCase().contains(".m3u8")) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        player.addListener(new Player.Listener() {
            boolean readySent = false;
            @Override public void onPlaybackStateChanged(int st) {
                if (st == Player.STATE_BUFFERING) js("buffering", true);
                if (st == Player.STATE_READY) {
                    js("buffering", false);
                    if (!readySent) { readySent = true; js("ready", 0); }
                }
                if (st == Player.STATE_ENDED) js("end", 0);
            }
            @Override public void onPlayerError(PlaybackException err) {
                js("error", "Playback error: " + err.getErrorCodeName());
            }
            @Override public void onCues(CueGroup cues) {
                StringBuilder sb = new StringBuilder();
                for (Cue c : cues.cues) if (c.text != null) { if (sb.length() > 0) sb.append('\n'); sb.append(c.text); }
                js("subtitle", sb.toString());
            }
            @Override public void onVideoSizeChanged(VideoSize vs) {
                if (vs.width > 0 && vs.height > 0) {
                    videoW = Math.round(vs.width * vs.pixelWidthHeightRatio);
                    videoH = vs.height;
                    layoutSurface();
                }
            }
        });
        player.setMediaItem(item.build(), Math.max(0, startMs));
        player.prepare();
        player.setPlayWhenReady(true);
        paused = false;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        main.removeCallbacks(tick);
        main.postDelayed(tick, 500);
    }

    private void releasePlayer() {
        main.removeCallbacks(tick);
        if (player != null) { player.release(); player = null; }
        curTime = 0; curDuration = 0;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private String tracksJson() {
        JSONObject out = new JSONObject();
        JSONArray audio = new JSONArray(), text = new JSONArray();
        try {
            if (player != null) {
                int gi = 0;
                for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
                    for (int i = 0; i < g.length; i++) {
                        Format f = g.getTrackFormat(i);
                        String lang = f.language != null ? f.language.toUpperCase() : (f.label != null ? f.label : "Track " + (i + 1));
                        int index = gi * 100 + i;
                        if (g.getType() == C.TRACK_TYPE_AUDIO) {
                            audio.put(new JSONObject().put("index", index).put("label", lang + (f.channelCount > 0 ? " (" + f.channelCount + "ch)" : "")));
                            if (g.isTrackSelected(i)) out.put("audioCurrent", index);
                        } else if (g.getType() == C.TRACK_TYPE_TEXT) {
                            text.put(new JSONObject().put("index", index).put("label", lang));
                            if (g.isTrackSelected(i)) out.put("textCurrent", index);
                        }
                    }
                    gi++;
                }
            }
            out.put("audio", audio).put("text", text);
        } catch (Exception ignored) { }
        return out.toString();
    }

    private void selectTrack(String type, int index) {
        if (player == null) return;
        int ttype = "AUDIO".equals(type) ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT;
        if (index < 0) {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(ttype, true).build());
            return;
        }
        int gi = index / 100, ti = index % 100;
        java.util.List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
        if (gi >= groups.size()) return;
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(ttype, false)
                .setOverrideForType(new TrackSelectionOverride(groups.get(gi).getMediaTrackGroup(), ti))
                .build());
    }

    /** Called from the shared app's JavaScript as window.MdxNative.* */
    private class Bridge {
        @JavascriptInterface public void play(String url, double startMs, boolean live) { main.post(() -> startPlayer(url, (long) startMs, live)); }
        @JavascriptInterface public void pause() { main.post(() -> { if (player != null) player.setPlayWhenReady(false); paused = true; }); }
        @JavascriptInterface public void resume() { main.post(() -> { if (player != null) player.setPlayWhenReady(true); paused = false; }); }
        @JavascriptInterface public void seek(double ms) { main.post(() -> { if (player != null) player.seekTo((long) ms); }); curTime = (long) ms; }
        @JavascriptInterface public void stop() { main.post(MainActivity.this::releasePlayer); }
        @JavascriptInterface public double getTime() { return curTime; }
        @JavascriptInterface public double getDuration() { return curDuration; }
        @JavascriptInterface public boolean isPaused() { return paused; }
        @JavascriptInterface public String tracks() {
            final String[] r = {"{\"audio\":[],\"text\":[]}"};
            final Object lock = new Object();
            synchronized (lock) {
                main.post(() -> { synchronized (lock) { r[0] = tracksJson(); lock.notifyAll(); } });
                try { lock.wait(1000); } catch (InterruptedException ignored) { }
            }
            return r[0];
        }
        @JavascriptInterface public void selectTrack(String type, double index) { main.post(() -> MainActivity.this.selectTrack(type, (int) index)); }
        @JavascriptInterface public void setAspect(String mode) { main.post(() -> { aspect = mode; layoutSurface(); }); }
        @JavascriptInterface public void openUrl(String url) {
            main.post(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
            });
        }
        /** "firetv" on Amazon Fire TV devices, otherwise "androidtv" */
        /** "firetv", "androidtv", or "mobile" (a phone or tablet: the only kind that gets touch controls) */
        @JavascriptInterface public String device() { return isFireTV() ? "firetv" : (isTV() ? "androidtv" : "mobile"); }
        /* this device's home-network address (the app searches that network for a Mdluex IPTV Server) */
        @JavascriptInterface public String localIp() {
            try {
                for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                    if (!ni.isUp() || ni.isLoopback()) continue;
                    for (InetAddress a : Collections.list(ni.getInetAddresses()))
                        if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            } catch (Exception e) {}
            return "";
        }
        @JavascriptInterface public void exit() { main.post(MainActivity.this::finish); }
    }

    @Override protected void onPause() {
        super.onPause();
        if (player != null) { player.setPlayWhenReady(false); paused = true; }
        web.evaluateJavascript("window.App&&App.onHide&&App.onHide()", null);
    }

    @Override protected void onDestroy() {
        releasePlayer();
        web.destroy();
        super.onDestroy();
    }
}
