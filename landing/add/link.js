/* Mdluex IPTV - "Add a playlist from your phone" page.
   The address is https://iptv.mdluex.com/add/#<channel>.<key>, from the QR code on the TV. The part after '#'
   is never sent to any server. The login is encrypted here with ChaCha20 (RFC 8439) and posted through the
   public ntfy.sh relay to that channel; the TV decrypts it with the same key. */
(function () {
  'use strict';
  var RELAY = 'https://ntfy.sh/';
  var $ = function (id) { return document.getElementById(id); };

  var TXT = {
    en: {
      lang: 'العربية', 'nocode.h': 'Scan the code on your TV',
      'nocode.p': 'On your TV, open Mdluex IPTV and choose Add playlist. Scan the QR code it shows with your phone camera to open this page.',
      h: 'Add a playlist to your TV', lead: 'Type the login your IPTV provider gave you, then press Send. It appears on your TV by itself.',
      m3u: 'Have an M3U link? Paste it here', 'm3u.hint': 'We take the server, username and password from it.', or: 'or type them',
      name: 'Name (anything you like)', server: 'Server address', user: 'Username', pass: 'Password', show: 'Show', hide: 'Hide',
      send: 'Send to my TV', sending: 'Sending…',
      safe: '🔒 Encrypted on this phone with a key that only your TV has (it was inside the QR code). Nothing is stored.',
      'need': 'Server address and username are required.', 'm3u.bad': "This link doesn't contain a username and password.",
      'm3u.ok': '✓ Filled in from the link.', 'fail': "Couldn't send. Check your phone's internet and try again.",
      'done.h': 'Sent!', 'done.wait': "Look at your TV. If it doesn't show up within a few seconds, check that the TV is connected to the internet.",
      'done.got': 'Your TV received it', 'done.gotp': 'You can close this page now. Enjoy!'
    },
    ar: {
      lang: 'English', 'nocode.h': 'امسح الرمز الظاهر على التلفزيون',
      'nocode.p': 'افتح Mdluex IPTV على التلفزيون واختر إضافة قائمة، ثم امسح رمز QR الظاهر بكاميرا هاتفك لفتح هذه الصفحة.',
      h: 'أضف قائمة إلى التلفزيون', lead: 'اكتب بيانات الدخول التي أعطاك إياها مزوّد IPTV ثم اضغط إرسال. ستظهر على التلفزيون تلقائيًا.',
      m3u: 'لديك رابط M3U؟ الصقه هنا', 'm3u.hint': 'سنأخذ منه عنوان الخادم واسم المستخدم وكلمة المرور.', or: 'أو اكتبها',
      name: 'الاسم (أي اسم تريده)', server: 'عنوان الخادم', user: 'اسم المستخدم', pass: 'كلمة المرور', show: 'إظهار', hide: 'إخفاء',
      send: 'إرسال إلى التلفزيون', sending: 'جارٍ الإرسال…',
      safe: '🔒 تُشفَّر على هذا الهاتف بمفتاح لا يملكه إلا تلفزيونك (كان داخل رمز QR). لا يُحفظ أي شيء.',
      'need': 'عنوان الخادم واسم المستخدم مطلوبان.', 'm3u.bad': 'هذا الرابط لا يحتوي على اسم مستخدم وكلمة مرور.',
      'm3u.ok': '✓ تمت التعبئة من الرابط.', 'fail': 'تعذّر الإرسال. تحقّق من اتصال هاتفك بالإنترنت وحاول مرة أخرى.',
      'done.h': 'تم الإرسال!', 'done.wait': 'انظر إلى التلفزيون. إن لم تظهر خلال ثوانٍ، تأكّد أن التلفزيون متصل بالإنترنت.',
      'done.got': 'استلمها التلفزيون', 'done.gotp': 'يمكنك إغلاق هذه الصفحة الآن. استمتع!'
    }
  };
  var lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  function t(k) { return TXT[lang][k] || TXT.en[k] || k; }
  function paint() {
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    $('eye').textContent = t($('pass').type === 'password' ? 'show' : 'hide');
  }
  $('langBtn').onclick = function () {
    lang = lang === 'ar' ? 'en' : 'ar';
    document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('mdx-lang', lang); } catch (e) {}
    paint();
  };

  /* ---- ChaCha20 (RFC 8439). The same function is in app/js/phonelink.js ---- */
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
  function b64url(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var b = atob(s), o = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
    return o;
  }
  function utf8(s) { var b = unescape(encodeURIComponent(s)), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }

  /* the channel and key from the address; then wipe them from the address bar and history */
  var m = /^#(mdlx-[a-z2-7]{20})\.([A-Za-z0-9_-]{43})$/.exec(location.hash || ''), topic, key;
  if (m) {
    topic = m[1]; key = unb64(m[2]);
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    $('noCode').classList.add('hide'); $('form').classList.remove('hide');
  }
  paint();
  if (!m) return;

  $('eye').onclick = function () { var p = $('pass'); p.type = p.type === 'password' ? 'text' : 'password'; paint(); };

  /* M3U link like http://host:port/get.php?username=U&password=P&type=m3u_plus -> the three fields */
  $('m3u').addEventListener('input', function () {
    var v = this.value.trim(), msg = $('msg');
    if (!v) { msg.textContent = ''; return; }
    var a = document.createElement('a'); a.href = /^[a-z]+:\/\//i.test(v) ? v : 'http://' + v;
    var q = {}; (a.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    if (q.username && q.password) {
      $('server').value = a.protocol + '//' + a.host; $('user').value = q.username; $('pass').value = q.password;
      msg.className = 'msg ok'; msg.textContent = t('m3u.ok');
    } else { msg.className = 'msg bad'; msg.textContent = t('m3u.bad'); }
  });

  function waitForAck(since) {
    var until = Date.now() + 90000;
    (function poll() {
      if (Date.now() > until) return;
      fetch(RELAY + topic + '/json?poll=1&since=' + since).then(function (r) { return r.text(); }).then(function (txt) {
        var got = txt.split('\n').some(function (l) { try { return JSON.parse(l).message === 'ack'; } catch (e) { return false; } });
        if (got) { $('doneH').textContent = t('done.got'); $('doneP').textContent = t('done.gotp'); $('doneH').removeAttribute('data-t'); $('doneP').removeAttribute('data-t'); }
        else setTimeout(poll, 2500);
      }).catch(function () { setTimeout(poll, 4000); });
    })();
  }

  $('form').onsubmit = function (e) {
    e.preventDefault();
    var msg = $('msg'), btn = $('send');
    var server = $('server').value.trim(), user = $('user').value.trim();
    if (server && !/^[a-z]+:\/\//i.test(server)) server = 'http://' + server;
    server = server.replace(/\/+$/, '');
    if (!server || !user) { msg.className = 'msg bad'; msg.textContent = t('need'); return; }
    var data = JSON.stringify({ v: 1, t: topic, name: $('name').value.trim(), server: server, username: user, password: $('pass').value });
    var nonce = crypto.getRandomValues(new Uint8Array(12));
    var body = b64url(nonce) + '.' + b64url(chacha20(key, nonce, 1, utf8(data)));
    btn.disabled = true; btn.textContent = t('sending'); msg.className = 'msg'; msg.textContent = '';
    var since = Math.floor(Date.now() / 1000) - 5;
    fetch(RELAY + topic, { method: 'POST', body: body }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      $('form').classList.add('hide'); $('done').classList.remove('hide');
      waitForAck(since);
    }).catch(function () {
      btn.disabled = false; btn.textContent = t('send');
      msg.className = 'msg bad'; msg.textContent = t('fail');
    });
  };
})();
