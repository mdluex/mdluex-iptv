/* Mdluex IPTV - add a playlist from your phone by scanning a QR code.
   The TV makes a random channel name and a random 256-bit key and shows them in a QR code that opens
   https://iptv.mdluex.com/add/ on the phone. The phone encrypts the login with ChaCha20 (RFC 8439) and posts it
   through the public ntfy.sh relay; the TV picks it up, decrypts it and fills in the form.
   The key never leaves the QR code (it is in the part of the address after '#', which browsers don't send),
   so the relay only ever sees scrambled bytes. Plain ES5 so it runs on 2018 Samsung and older LG TVs. */
var PhoneLink = (function () {
  'use strict';
  var RELAY = 'https://ntfy.sh/', PAGE = 'https://iptv.mdluex.com/add/';

  /* ---- ChaCha20 (RFC 8439). The same function is in landing/add/link.js ---- */
  function chacha20(key, nonce, counter, data) {
    function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
    function rotl(v, n) { return ((v << n) | (v >>> (32 - n))) >>> 0; }
    var st = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574], i;
    for (i = 0; i < 8; i++) st.push(u32(key, i * 4));
    st.push(counter >>> 0);
    for (i = 0; i < 3; i++) st.push(u32(nonce, i * 4));
    var out = new Uint8Array(data.length), x = new Array(16), pos = 0;
    function qr(a, b, c, d) {
      x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 16);
      x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 12);
      x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 8);
      x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 7);
    }
    while (pos < data.length) {
      for (i = 0; i < 16; i++) x[i] = st[i];
      for (i = 0; i < 10; i++) {
        qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
        qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
      }
      for (i = 0; i < 64 && pos < data.length; i++, pos++) {
        var w = (x[i >> 2] + st[i >> 2]) >>> 0;
        out[pos] = data[pos] ^ ((w >>> ((i & 3) * 8)) & 255);
      }
      st[12] = (st[12] + 1) >>> 0;
    }
    return out;
  }
  function rand(n) { var b = new Uint8Array(n); window.crypto.getRandomValues(b); return b; }
  function b64url(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var t = atob(s), b = new Uint8Array(t.length);
    for (var i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
    return b;
  }
  function utf8dec(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return decodeURIComponent(escape(s)); }

  /* draw the QR code on a canvas (white border included so phones read it on dark screens) */
  function qrCanvas(text, px) {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), quiet = 3, cell = Math.floor(px / (n + quiet * 2)), size = cell * (n + quiet * 2);
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
    return c;
  }

  function xhr(method, url, body, done) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    x.timeout = 15000;
    x.onload = function () { done(x.status >= 200 && x.status < 300 ? x.responseText : null); };
    x.onerror = x.ontimeout = function () { done(null); };
    x.send(body || null);
  }

  /* start(onData, isAlive) -> { url, canvas(px) }. Polls the relay every 3 s for 15 minutes, while isAlive() is true.
     onData gets { name, server, username, password }. */
  function start(onData, isAlive, onExpire) {
    var abc = 'abcdefghijklmnopqrstuvwxyz234567', rb = rand(20), topic = 'mdlx-';
    for (var i = 0; i < 20; i++) topic += abc[rb[i] & 31];
    var key = rand(32), url = PAGE + '#' + topic + '.' + b64url(key);
    var since = Math.floor(Date.now() / 1000) - 10, until = Date.now() + 15 * 60000, seen = {}, done = false;
    function handle(text) {
      (text || '').split('\n').forEach(function (line) {
        if (done || !line) return;
        var ev; try { ev = JSON.parse(line); } catch (e) { return; }
        if (ev.event !== 'message' || seen[ev.id]) return;
        seen[ev.id] = 1;
        var parts = String(ev.message || '').split('.');
        if (parts.length !== 2) return;
        try {
          var d = JSON.parse(utf8dec(chacha20(key, unb64(parts[0]), 1, unb64(parts[1]))));
          if (d.t !== topic || !d.server) return;   // anything not sealed with our key fails here
          done = true;
          xhr('POST', RELAY + topic, 'ack');   // lets the phone say "received"
          onData({ name: d.name || '', server: d.server, username: d.username || '', password: d.password || '' });
        } catch (e) { /* not for us */ }
      });
    }
    (function poll() {
      if (done || !isAlive()) return;
      if (Date.now() > until) { if (onExpire) onExpire(); return; }
      xhr('GET', RELAY + topic + '/json?poll=1&since=' + since, null, function (t) {
        if (t) handle(t);
        setTimeout(poll, 3000);
      });
    })();
    return { url: url, canvas: function (px) { return qrCanvas(url, px); } };
  }

  return { start: start, chacha20: chacha20 };
})();
