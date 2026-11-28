/* All screens of Mdluex IPTV. */
(function () {
  var V = App.views;

  /* ================= shared helpers ================= */
  function hashStr(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); }
  /* Placeholder art for titles without a picture: a gradient in shades of the Mdluex red (from crimson to deep
     wine, fading into the app's near-black), picked from the name so the same title always looks the same. */
  function grad(t) {
    var x = hashStr(t || '?'), hue = (350 + x % 18) % 360, sat = 62 + (x >> 5) % 22, lit = 24 + (x >> 9) % 14, ang = 120 + (x >> 13) % 50;
    return 'linear-gradient(' + ang + 'deg, hsl(' + hue + ',' + sat + '%,' + lit + '%), hsl(' + ((hue + 8) % 360) + ',' + (sat - 20) + '%,' + Math.round(lit / 3) + '%) 70%, #0a0a0c)';
  }
  /* "AR | The Dark Knight (2008)" -> "DK"; Arabic names give two separate letters */
  var INI_SKIP = /^(the|a|an|of|and|al|el|ال|s\d+|e\d+|s\d+e\d+|hd|fhd|uhd|sd|4k|8k|hevc|h26[45]|vip|multi|sub|dub)$/i;
  function initials(t) {
    var s = String(t || '').replace(/^\s*[\[(][^\])]*[\])]\s*/, '').replace(/^\s*[A-Za-z0-9+]{1,5}\s*[|:\-–]\s+/, '')
      .replace(/[\[(][^\])]*[\])]/g, ' ').replace(/(19|20)\d\d/g, ' ');
    var words = s.split(/[\s\-_.:|,/]+/).filter(function (w) { return /[0-9A-Za-zÀ-ɏ؀-ۿ]/.test(w); });
    if (!words.length) words = String(t || '').split(/\s+/).filter(Boolean);   // e.g. a film called "1917"
    var main = words.filter(function (w) { return !INI_SKIP.test(w); });
    if (!main.length) main = words;
    var out = main.slice(0, 2).map(function (w) { if (/^ال[\u0600-\u06FF]{2}/.test(w)) w = w.slice(2); var m2 = /[0-9A-Za-z\u00C0-\u024F\u0600-\u06FF]/.exec(w); return m2 ? m2[0].toUpperCase() : ''; });
    return out.join(/[؀-ۿ]/.test(out.join('')) ? '‌' : '');   // keep Arabic letters apart, not joined
  }
  // the initials, laid over the gradient
  function placeholder(t) { return h('span', { class: 'ini', text: initials(t), dir: 'auto' }); }
  function spinner() { return h('div', { class: 'spinner center-spin' }); }
  function empty(text) { return h('div', { class: 'empty', text: T(text) }); }

  function normMovie(x) { return { id: x.stream_id, name: x.name, icon: x.stream_icon || x.cover, ext: x.container_extension, rating: x.rating, added: Number(x.added || 0), year: x.year || x.releaseDate }; }
  function normSeries(x) {
    var bd = Array.isArray(x.backdrop_path) ? x.backdrop_path[0] : x.backdrop_path;
    return { id: x.series_id, name: x.name, icon: x.cover, rating: x.rating, added: Number(x.last_modified || 0), plot: x.plot, genre: x.genre, year: x.releaseDate,
      backdrop: bd || null, trailer: ytId(x.youtube_trailer) };
  }
  function normLive(x) { return { id: x.stream_id, name: x.name, icon: x.stream_icon, num: x.num, cat: x.category_id }; }
  function short(item) { return { id: item.id, name: item.name, icon: item.icon, ext: item.ext, num: item.num }; }

  /* A colored-button hint on Samsung/LG; on remotes without colored buttons (Android TV, Fire TV)
     the same action is in the options menu instead. */
  function colorHint(key, cls, label) {
    return Platform.colorKeys ? { key: key, cls: cls, label: label } : { key: T(Platform.menuKey), label: 'Options' };
  }
  function favHow() { return Platform.colorKeys ? 'Press the yellow button' : (Platform.fireTV ? 'Press ☰' : 'Hold OK'); }

  function card(o) {
    var c = h('div', { class: 'card ' + (o.kind || 'poster') + (o.progress != null ? ' has-prog' : ''), data: { key: o.key || '' } });
    var showsCaption = o.kind !== 'poster' || o.caption;
    c.appendChild(h('div', { class: 'ph', style: { background: grad(o.title) }, dir: 'auto' }, [placeholder(o.title), showsCaption ? null : h('span', { class: 'pht', text: o.title || '' })]));
    if (o.img) {
      var im = h('img', { src: o.img, loading: 'lazy', alt: '' });
      im.onerror = function () { im.remove(); };
      c.appendChild(im);
    }
    if (showsCaption) c.appendChild(h('div', { class: 'cap', dir: 'auto' }, [o.title || '', o.sub ? h('small', { text: o.sub }) : null]));
    if (o.badge) c.appendChild(h('div', { class: 'badge', text: o.badge }));
    if (o.fav) c.appendChild(h('div', { class: 'fav', text: '♥' }));
    if (o.progress != null) c.appendChild(h('div', { class: 'prog' }, [h('i', { style: { width: Math.round(o.progress * 100) + '%' } })]));
    Focus.make(c, function () { if (o.key) App.remember(o.key); o.onSelect && o.onSelect(); }, o.onFocus);
    return c;
  }
  function row(title, cards, sub) {
    if (!cards.length) return null;
    var r = h('div', { class: 'row' }, [h('h2', {}, [h('span', { text: T(title), dir: 'auto' }), sub ? h('small', { text: T(sub) }) : null])]);
    var tr = h('div', { class: 'row-track', 'data-zone': 'row' });
    cards.forEach(function (c) { tr.appendChild(c); });
    r.appendChild(tr);
    return r;
  }
  /* Render big lists in batches as the user scrolls. */
  function fillIncremental(container, items, make, batch) {
    batch = batch || 48;
    var n = 0;
    function more() {
      var end = Math.min(items.length, n + batch);
      for (; n < end; n++) (function (i) {
        var el = make(items[i], i);
        var prev = el._onFocus;
        el._onFocus = function (e) { if (prev) prev(e); if (i > n - 16 && n < items.length) more(); };
        container.appendChild(el);
      })(n);
    }
    more();
    // touch: swiping a list near its end adds the next batch (the remote does it on focus, above)
    container.setAttribute('data-more', '1');
    container._more = function () { if (n < items.length) more(); };
  }
  if (Platform.touch) document.addEventListener('scroll', function (e) {
    var t = e.target;
    if (!t || !t.querySelectorAll || t.scrollTop + t.clientHeight < t.scrollHeight - 1200) return;
    Array.prototype.forEach.call(t.querySelectorAll('[data-more]'), function (c) { if (c._more) c._more(); });
  }, true);
  function needPlaylist(main) {
    if (App.api) return false;
    var box = h('div', { class: 'welcome' }, [h('div', { class: 'mark' }), h('h1', { text: T('Add your IPTV account'), style: { fontSize: '54px' } }),
      h('p', { text: T('Live TV, movies and series need an IPTV playlist. Mdluex Channel works without one.') })]);
    var r = h('div', { class: 'btn-row' });
    r.appendChild(Focus.make(h('div', { class: 'btn primary', text: T('Add playlist'), 'data-autofocus': '1' }), function () { playlistForm(); }));
    r.appendChild(Focus.make(h('div', { class: 'btn', text: T('Watch Mdluex Channel') }), function () { App.go('channel', {}, { reset: true }); }));
    box.appendChild(r);
    main.appendChild(box);
    return true;
  }
  function progressOf(key) { var p = Store.progress(key); return Store.inProgress(p) ? p.pos / p.dur : null; }
  function sortRecent(list) { return list.slice().sort(function (a, b) { return b.added - a.added; }); }

  function openMovie(m) { App.go('movieDetail', { item: m }); }
  function openSeries(s) { App.go('seriesDetail', { item: s }); }

  /* Resume prompt: resolves to start position (ms), or null if cancelled. */
  function askResume(key) {
    var p = Store.progress(key);
    if (!Store.inProgress(p)) return Promise.resolve(0);
    return App.menu('Continue watching?', [
      { label: T('Resume from {0}', fmtTime(p.pos)), value: T('{0} left', fmtTime(p.dur - p.pos)), start: p.pos, checked: true },
      { label: 'Start from the beginning', start: 0 }
    ]).then(function (it) { return it ? it.start : null; });
  }
  function playMovie(m, forceStart) {
    var key = 'movie:' + m.id;
    var go = function (start) { if (start != null) PlayerUI.playMovie(m, start); };
    if (forceStart != null) go(forceStart); else askResume(key).then(go);
  }
  function playEntry(p) {
    if (p.type === 'movie') return PlayerUI.playMovie({ id: p.id, name: p.title, icon: p.poster, ext: p.ext }, p.pos);
    if (p.type === 'yt') return PlayerUI.playYouTube({ id: p.id, title: p.title }, p.pos);
    if (p.type === 'episode') {
      App.toast(T('Loading {0}…', p.title));
      return App.api.seriesInfo(p.seriesId).then(function (info) {
        PlayerUI.playEpisode({ series: { id: p.seriesId, name: p.seriesName, icon: p.poster }, info: info, season: p.season, epId: p.id }, p.pos);
      }).catch(function (e) { App.toast(e.message); });
    }
  }
  function continueCards(filter, follow) {
    return Store.continueWatching().filter(filter || function () { return true; }).map(function (p) {
      var img = p.type === 'yt' ? Channel.thumb(p.id) : (p.thumb || p.poster);
      return card({ kind: 'wide', key: 'cw:' + p.key, title: p.type === 'episode' ? p.seriesName : p.title,
        sub: (p.type === 'episode' ? T('S{0}:E{1}', p.season, p.epNum) + ' · ' : '') + T('{0} left', fmtTime(p.dur - p.pos)),
        img: img, progress: p.pos / p.dur, onSelect: function () { playEntry(p); },
        onFocus: typeof follow === 'function' ? function () { follow(function () { return heroForCw(p); }); } : null });
    });
  }
  function ytCard(v, follow) {
    return card({ kind: 'wide', key: 'yt:' + v.id, title: v.title, sub: v.published ? fmtDate(Date.parse(v.published)) : '', img: Channel.thumb(v.id),
      progress: progressOf('yt:' + v.id), onSelect: function () { askResume('yt:' + v.id).then(function (s) { if (s != null) PlayerUI.playYouTube(v, s); }); },
      onFocus: typeof follow === 'function' ? function () { follow(function () { return heroForYt(v); }); } : null });
  }
  function channelCard(ch, list) {
    return card({ kind: 'logo-card', key: 'ch:' + ch.id, title: ch.name, img: ch.icon, onSelect: function () { PlayerUI.playLive(ch, list || [ch]); } });
  }
  function movieCard(m, follow) {
    return card({ kind: 'poster', key: 'mv:' + m.id, title: m.name, img: m.icon, fav: Store.isFav('movie', m.id), progress: progressOf('movie:' + m.id),
      caption: true, sub: m.year ? String(m.year).slice(0, 4) : null, onSelect: function () { openMovie(m); },
      onFocus: typeof follow === 'function' ? function () { follow(function () { return heroForMovie(m); }); } : null });
  }
  function seriesCard(s, follow) {
    return card({ kind: 'poster', key: 'sr:' + s.id, title: s.name, img: s.icon, fav: Store.isFav('series', s.id), caption: true, sub: s.year ? String(s.year).slice(0, 4) : null, onSelect: function () { openSeries(s); },
      onFocus: typeof follow === 'function' ? function () { follow(function () { return heroForSeries(s); }); } : null });
  }
  var RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  /* Featured banner. hero.update(opts) swaps it to another title (used when browsing rows). */
  function heroBlock(o) {
    var hero = h('div', { class: 'hero' });
    var bd = h('div', { class: 'backdrop' });
    var pv = h('div', { class: 'preview-video' });
    var c = h('div', { class: 'content' });
    hero.appendChild(bd); hero.appendChild(pv); hero.appendChild(h('div', { class: 'shade' })); hero.appendChild(c);
    hero.previewEl = pv;
    // decode big images off-screen first, then swap: avoids a frozen frame on the TV
    var bgToken = 0;
    function setBg(css, url) {
      var my = ++bgToken;
      if (!url) { bd.style.backgroundImage = css; return; }
      var im = new Image();
      im.src = url;
      var done = function () { if (my === bgToken) bd.style.backgroundImage = css; };
      if (im.decode) im.decode().then(done, done); else { im.onload = done; im.onerror = done; }
    }
    hero.update = function (opts) {
      o = opts;
      var rtl = RTL_RE.test((o.title || '') + (o.plot || '').slice(0, 80));
      hero.classList.toggle('rtl', rtl);
      c.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      bd.classList.toggle('portrait', !!o.portrait);
      setBg(o.img ? 'url("' + o.img + '")' : grad(o.title), o.img);
      c.innerHTML = '';
      if (o.kicker) c.appendChild(h('div', { class: 'kicker', text: T(o.kicker) }));
      c.appendChild(h('h1', { text: o.title, dir: 'auto' }));
      var meta = h('div', { class: 'meta' });
      (o.meta || []).forEach(function (m) { if (m) meta.appendChild(typeof m === 'string' ? h('span', { text: T(m) }) : m); });
      c.appendChild(meta);
      if (o.plot) c.appendChild(h('div', { class: 'plot', text: o.plot, dir: 'auto' }));
      var btns = h('div', { class: 'btn-row', 'data-zone': 'hero' });
      (o.buttons || []).forEach(function (b, i) {
        var el = h('div', { class: 'btn' + (i === 0 ? ' primary' : ''), data: { key: b.key || ('btn' + i) } });
        if (b.icon) el.innerHTML = ICON[b.icon];
        el.appendChild(h('span', { text: T(b.label) }));
        if (i === 0) el.setAttribute('data-autofocus', '1');
        Focus.make(el, b.onSelect, o.onButtonFocus);
        btns.appendChild(el);
      });
      c.appendChild(btns);
      hero.content = c; hero.btns = btns; hero.meta = meta; hero.opts = o;
    };
    hero.setBackdrop = function (url) { if (url) { bd.classList.remove('portrait'); setBg('url("' + url + '")', url); } };
    hero.update(o);
    if (o.preview) setTimeout(function () { if (hero.isConnected && hero.opts === o) Preview.play(pv, o.preview.id, o.preview.random); }, 2000);
    return hero;
  }

  /* Make the banner follow the focused card: switch cover/info, then start a muted preview. */
  function billboard(getHero) {
    var timer, pvTimer, token = 0;
    return function (makeOpts) {
      clearTimeout(timer); clearTimeout(pvTimer);
      var my = ++token;
      timer = setTimeout(function () {
        var hero = getHero();
        if (!hero || !hero.isConnected) return;
        var o = makeOpts();
        if (!o) return;
        Preview.stop();
        if (!o.onButtonFocus && hero.opts) o.onButtonFocus = hero.opts.onButtonFocus;
        hero.update(o);
        var startPreview = function (p) {
          clearTimeout(pvTimer);
          if (p) pvTimer = setTimeout(function () { if (my === token) Preview.play(hero.previewEl, p.id, p.random); }, 1200);
        };
        startPreview(o.preview);
        if (o.more) o.more.then(function (extra) {
          if (my !== token || !extra) return;
          hero.update(Object.assign({}, o, extra));
          if (extra.preview && !o.preview) startPreview(extra.preview);
        }).catch(function () {});
      }, 450);
    };
  }
  function ytId(s) {
    if (!s) return null;
    s = String(s).trim();
    var m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(s);
    if (m) return m[1];
    return /^[\w-]{11}$/.test(s) ? s : null;
  }

  /* Banner contents for each kind of card. */
  var ytCtx = null;   // the YouTube channel whose page is open ({ id, name }); null = Mdluex Industries
  function heroForYt(v) {
    var chan = ytCtx || (!v.ch || v.ch === 'Mdluex Industries' ? { id: Channel.CHANNEL_ID, name: 'Mdluex Industries' } : null);
    var buttons = [{ label: 'Play', icon: 'play', onSelect: function () { askResume('yt:' + v.id).then(function (s) { if (s != null) PlayerUI.playYouTube(v, s); }); } },
      { label: 'Open in YouTube app', icon: 'yt', onSelect: function () { Channel.openInYouTubeApp(v.id); } }];
    if (chan) buttons.push({ label: 'Subscribe', icon: 'bell', onSelect: function () { subscribe(chan, v.id); } });
    return { kicker: (v.ch || 'Mdluex Industries') + ' · ' + T('YouTube'), title: v.title, img: Channel.thumb(v.id, true), plot: v.desc,
      meta: [v.published ? fmtDate(Date.parse(v.published)) : null], buttons: buttons, preview: { id: v.id, random: true } };
  }

  /* ---- links the viewer opens on a phone: a QR code to scan (TVs), or the link itself (phones) ---- */
  function openUrl(url) {
    if (Platform.name === 'android') { try { MdxNative.openUrl(url); return; } catch (e) {} }
    window.open(url, '_blank');
  }
  function qrWindow(title, text, codes, buttons) {
    App.modal(function (box, m) {
      box.classList.add('qr-modal');
      box.appendChild(h('h2', { text: title, dir: 'auto' }));
      if (text) box.appendChild(h('p', { class: 'qr-text', text: text, dir: 'auto' }));
      var row = h('div', { class: 'qr-row' });
      codes.forEach(function (c) {
        var cell = h('div', { class: 'qr-cell' }, [h('div', { class: 'qr-box' }, [PhoneLink.qr(c.url, 320)]),
          h('div', { class: 'qr-label', text: c.label }), h('div', { class: 'qr-url', text: c.url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''), dir: 'ltr' })]);
        if (Platform.touch) Focus.make(cell, function () { openUrl(c.url); });   // phones: tap the code to open it
        row.appendChild(cell);
      });
      box.appendChild(row);
      var br = h('div', { class: 'btn-row' });
      (buttons || []).concat([{ label: 'Close' }]).forEach(function (b, i) {
        br.appendChild(Focus.make(h('div', { class: 'btn' + (i === 0 ? ' primary' : ''), text: T(b.label), 'data-autofocus': i === 0 ? '1' : null }), function () { m.close(); if (b.fn) b.fn(); }));
      });
      box.appendChild(br);
    });
  }
  /* Subscribe: YouTube's own subscribe link (it asks "Subscribe?" in one tap) as a QR code, plus the TV's YouTube
     app. The TV apps can't be sent to a channel page, so they open the video: Subscribe is right under it. */
  function subscribe(chan, videoId) {
    var url = 'https://www.youtube.com/channel/' + chan.id + '?sub_confirmation=1';
    if (Platform.phone) { openUrl(url); return; }
    qrWindow(T('Subscribe to {0}', chan.name), T('Scan with your phone camera: YouTube opens and asks you to subscribe in one tap.'),
      [{ url: url, label: 'YouTube' }],
      [{ label: 'Open in YouTube app', fn: function () {
        if (Platform.name === 'android') { openUrl(url); return; }
        Channel.openInYouTubeApp(videoId);
        App.toast('Press Subscribe under the video');
      } }]);
  }
  var DONATE = [{ url: 'https://patreon.com/mdluex', label: 'Patreon' }, { url: 'https://buymeacoffee.com/mdluex', label: 'Buy Me a Coffee' }];
  function donate() {
    qrWindow(T('Support Mdluex IPTV'), T('Mdluex IPTV is free. If you enjoy it, you can support it: scan a code with your phone camera.'), DONATE, []);
  }
  App.donate = donate;
  function heroForMovie(m) {
    return { kicker: 'Movie', title: m.name, img: m.icon, portrait: true, meta: [rating(m.rating), m.year ? String(m.year).slice(0, 4) : null],
      buttons: [{ label: 'Play', icon: 'play', onSelect: function () { playMovie(m); } }, { label: 'More info', icon: 'info', onSelect: function () { openMovie(m); } }],
      more: App.api ? App.api.vodInfo(m.id).then(function (r) {
        var info = (r && r.info) || {};
        var bd = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
        var tr = ytId(info.youtube_trailer || info.trailer);
        return { img: bd || m.icon, portrait: !bd, plot: info.plot || info.description || '',
          meta: [rating(info.rating || m.rating), info.releasedate ? String(info.releasedate).slice(0, 4) : (m.year ? String(m.year) : null), info.genre || null],
          preview: tr ? { id: tr, random: true } : null };
      }) : null };
  }
  function heroForSeries(s) {
    return { kicker: 'Series', title: s.name, img: s.backdrop || s.icon, portrait: !s.backdrop, plot: s.plot,
      meta: [rating(s.rating), s.year ? String(s.year).slice(0, 4) : null, s.genre || null],
      buttons: [{ label: 'Episodes', icon: 'play', onSelect: function () { openSeries(s); } }],
      preview: s.trailer ? { id: s.trailer, random: true } : null,
      // series lists often lack the trailer/backdrop: look them up in the series details
      more: (!s.trailer || !s.backdrop) && App.api ? App.api.seriesInfo(s.id).then(function (d) {
        var info = (d && d.info) || {};
        var bd = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
        var tr = ytId(info.youtube_trailer);
        var extra = {};
        if (bd && !s.backdrop) { extra.img = bd; extra.portrait = false; }
        if (info.plot && !s.plot) extra.plot = info.plot;
        if (tr && !s.trailer) extra.preview = { id: tr, random: true };
        return extra;
      }) : null };
  }
  function heroForCw(p) {
    return { kicker: 'Continue watching', title: p.type === 'episode' ? p.seriesName : p.title,
      img: p.type === 'yt' ? Channel.thumb(p.id, true) : (p.backdrop || p.poster), portrait: p.type === 'movie' && !p.backdrop,
      meta: [p.type === 'episode' ? T('Season {0} · Episode {1}', p.season, p.epNum) : null, T('{0} left', fmtTime(p.dur - p.pos))],
      buttons: [{ label: 'Resume', icon: 'play', onSelect: function () { playEntry(p); } },
        { label: 'Start over', icon: 'restart', onSelect: function () { p.pos = 0; playEntry(p); } }],
      preview: p.type === 'yt' ? { id: p.id, random: true } : null };
  }
  function rating(r) { r = parseFloat(r); return r ? h('span', { class: 'match', text: '★ ' + r.toFixed(1) }) : null; }

  /* ================= Welcome ================= */
  V.welcome = {
    render: function (main) {
      var box = h('div', { class: 'welcome' }, [h('div', { class: 'mark' }), h('h1', { text: 'Mdluex IPTV' }),
        h('p', { text: T('Live TV, movies and series from your IPTV account – plus the Mdluex Industries channel.') })]);
      var r = h('div', { class: 'btn-row', style: { justifyContent: 'center' } });
      r.appendChild(Focus.make(h('div', { class: 'btn primary', text: T('Add IPTV playlist'), 'data-autofocus': '1' }), function () { playlistForm(); }));
      r.appendChild(Focus.make(h('div', { class: 'btn', text: T('Watch Mdluex Channel') }), function () { App.go('channel', {}, { reset: true }); }));
      // the sample playlist is only for development on a PC (?demo=1), not in the released app
      if (Platform.name === 'browser' && /[?&]demo=1/.test(location.search)) r.appendChild(Focus.make(h('div', { class: 'btn', text: T('Try demo') }), function () {
        var pl = Store.savePlaylist({ name: 'Demo', demo: true, server: 'demo', username: 'demo', password: 'demo' });
        App.usePlaylist(pl); App.go('home', {}, { reset: true });
      }));
      box.appendChild(r);
      main.appendChild(box);
    }
  };

  /* ================= Home ================= */
  V.home = {
    title: '', nav: 'home',
    render: function (main) {
      var api = App.api;
      var wrap = h('div', { class: 'scroll-y' });
      main.appendChild(wrap);
      var cw = Store.continueWatching();
      var heroSlot = h('div', { class: 'hero-slot' });
      var rows = h('div', { class: 'rows' });
      wrap.appendChild(heroSlot); wrap.appendChild(rows);
      var follow = billboard(function () { return heroSlot.querySelector('.hero'); });

      function setHero(o) {
        heroSlot.innerHTML = '';
        heroSlot.appendChild(heroBlock(o));
        rows.classList.remove('no-hero');
        wrap.classList.add('billboard-layout');
      }
      // banner: what you were watching, otherwise the channel's featured video, otherwise the newest movie
      if (cw.length) setHero(heroForCw(cw[0]));

      var slots = {};
      ['cw', 'yt', 'ytu', 'favch', 'recent', 'favmv', 'newmv', 'newsr', 'favsr'].forEach(function (k) { slots[k] = h('div'); rows.appendChild(slots[k]); });
      function put(k, r) { if (r) slots[k].appendChild(r); }

      if (cw.length) put('cw', row('Continue Watching', continueCards(null, follow)));

      var tasks = [];
      tasks.push(Promise.all([Channel.load(), Channel.featured()]).then(function (r) {
        var d = r[0], v = r[1];
        put('yt', row(d.name || 'Mdluex Industries', d.videos.map(function (x) { return ytCard(x, follow); }), 'YouTube'));
        if (!cw.length && v) {
          var o = heroForYt(v);
          o.kicker = 'Featured on Mdluex Industries';
          if (!api) o.buttons[1] = { label: 'Add IPTV playlist', icon: 'plus', onSelect: function () { playlistForm(); } };
          setHero(o);
        }
      }));

      // the viewer's own YouTube channels, each as a row (in the order they were added)
      Channel.userChannels().forEach(function (c) {
        var holder = h('div');
        slots.ytu.appendChild(holder);
        Channel.of(c.id, c.name).load().then(function (d) {
          var r = row(d.name || c.name, d.videos.slice(0, 15).map(function (x) { return ytCard(x, follow); }), 'YouTube');
          if (r) holder.appendChild(r);
        }).catch(function () {});
      });

      if (api) {
        var favs = Store.favs();
        put('favch', row('Favorite Channels', favs.live.map(function (c) { return channelCard(c, favs.live); })));
        var rc = Store.recentChannels();
        put('recent', row('Recently Watched Channels', rc.map(function (c) { return channelCard(c, rc); })));
        put('favmv', row('My List · Movies', favs.movie.map(function (m) { return movieCard(m, follow); })));
        put('favsr', row('My List · Series', favs.series.map(function (s) { return seriesCard(s, follow); })));
        tasks.push(grouped('vod').then(function (g) {
          var m = sortRecent(g.all.map(normMovie)).slice(0, 30);
          put('newmv', row('Recently Added Movies', m.map(function (x) { return movieCard(x, follow); })));
          if (!heroSlot.firstChild && m[0]) {
            var o = heroForMovie(m[0]);
            o.kicker = 'Recently added';
            setHero(o);
            if (o.more) o.more.then(function (extra) { var hero = heroSlot.querySelector('.hero'); if (hero && hero.opts === o) hero.update(Object.assign({}, o, extra)); });
          }
        }).catch(function () {}));
        tasks.push(grouped('series').then(function (g) {
          put('newsr', row('Recently Updated Series', sortRecent(g.all.map(normSeries)).slice(0, 30).map(function (s) { return seriesCard(s, follow); })));
        }).catch(function () {}));
      }
      App.setHints([{ key: I18N.rtl ? '▶' : '◀', label: 'Menu' }, { key: 'OK', label: 'Open' }, colorHint('R', 'red', 'Remove from Continue Watching')]);
      // first paint as soon as there is something to focus
      return Promise.race([Promise.all(tasks), new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
        if (!heroSlot.firstChild) rows.classList.add('no-hero');
      });
    },
    onKey: function (e) {
      if (e.keyCode === K.RED) { removeContinueFocused(); return true; }
      if (e.keyCode === K.INFO) { itemOptions(); return true; }
      return false;
    }
  };

  /* ================= Category browser (Movies / Series) ================= */
  function catColumn(cats, onPick, initialId) {
    var col = h('div', { class: 'cat-col' });
    var list = h('div', { class: 'cat-list', 'data-zone': 'cats' });
    var timer, items = [];
    cats.forEach(function (c) {
      var locked = App.isLocked(c);
      var count = h('small', { text: c.count != null ? String(c.count) : '' });
      var el = h('div', { class: 'cat', data: { key: 'cat:' + c.category_id } }, [h('span', { text: (locked ? '🔒 ' : '') + c.category_name, dir: 'auto' }), count]);
      el._cat = c; el._count = count;
      Focus.make(el, function () {
        if (App.isLocked(c)) App.unlockCategory(c).then(function (ok) { if (ok) { el.firstChild.textContent = c.category_name; pick(el); } });
        else { pick(el); var g = App.view && App.view._grid && App.view._grid.querySelector('.focusable'); if (g) Focus.set(g); }
      }, function () {
        clearTimeout(timer);
        timer = setTimeout(function () { pick(el); }, 350);
      });
      items.push(el);
      list.appendChild(el);
    });
    function pick(el) {
      items.forEach(function (i) { i.classList.toggle('active', i === el); });
      onPick(el._cat);
    }
    var init = items.find(function (i) { return i._cat.category_id === initialId; }) || items[0];
    if (init) { init.classList.add('active'); init.setAttribute('data-autofocus', '1'); }
    col.appendChild(list);
    col.pick = pick; col.initial = init;
    // fill the number shown beside each category: countOf(category_id) -> number or null
    col.setCounts = function (countOf) {
      items.forEach(function (i) { var n = countOf(i._cat.category_id); i._count.textContent = n == null ? '' : String(n); });
    };
    return col;
  }

  /* Whole list of a kind (vod / series / live), fetched once and grouped by category.
     Used for category counts and to open categories instantly without another server request. */
  function grouped(kind) {
    var api = App.api;
    api._grp = api._grp || {}; api._grpReady = api._grpReady || {};
    if (!api._grp[kind]) {
      var req = kind === 'vod' ? api.vodStreams() : kind === 'series' ? api.series() : api.liveStreams();
      api._grp[kind] = req.then(function (list) {
        var by = {};
        list.forEach(function (x) { var c = String(x.category_id); (by[c] = by[c] || []).push(x); });
        var g = { all: list, by: by };
        api._grpReady[kind] = g;
        return g;
      });
      api._grp[kind].catch(function () { delete api._grp[kind]; });
    }
    return api._grp[kind];
  }
  function groupedNow(kind) { var api = App.api; return api && api._grpReady ? api._grpReady[kind] : null; }

  function makeBrowse(type) {
    var isMovie = type === 'movie', kind = isMovie ? 'vod' : 'series';
    return {
      title: isMovie ? 'Movies' : 'Series', nav: isMovie ? 'movies' : 'series',
      render: function (main, params) {
        if (needPlaylist(main)) return;
        var self = this, api = App.api;
        var lay = h('div', { class: 'browse' });
        var gridCol = h('div', { class: 'grid-col' });
        var grid = h('div', { class: 'grid', 'data-zone': 'grid' });
        gridCol.appendChild(grid);
        self._grid = grid;
        main.appendChild(lay);
        App.setHints([{ key: 'OK', label: 'Open' }, colorHint('Y', 'yellow', 'Add to My List')]);
        var token = 0;
        function loadCat(cat) {
          params.cat = cat.category_id;
          var my = ++token;
          grid.innerHTML = '';
          if (App.isLocked(cat)) { grid.appendChild(empty('🔒 This category is locked. Press OK on it and enter your PIN.')); return Promise.resolve(); }
          grid.appendChild(spinner());
          var p;
          if (cat.category_id === '_cont') {
            p = Promise.resolve(Store.continueWatching().filter(function (x) { return isMovie ? x.type === 'movie' : x.type === 'episode'; }));
          } else if (cat.category_id === '_fav') p = Promise.resolve(Store.favs()[type]);
          else if (cat.category_id === '_new') p = grouped(kind).then(function (g) { return sortRecent(g.all.map(isMovie ? normMovie : normSeries)).slice(0, 150); });
          else if (cat.category_id === '_all') p = grouped(kind).then(function (g) { return g.all.map(isMovie ? normMovie : normSeries); });
          else {
            var ready = groupedNow(kind);   // whole list already here: open the category instantly
            p = ready ? Promise.resolve(ready.by[String(cat.category_id)] || [])
              : (isMovie ? api.vodStreams(cat.category_id) : api.series(cat.category_id));
            p = p.then(function (l) { return l.map(isMovie ? normMovie : normSeries); });
          }
          return p.then(function (items) {
            if (my !== token) return;
            grid.innerHTML = '';
            if (!items.length) { grid.appendChild(empty('Nothing here yet.')); return; }
            if (cat.category_id === '_cont') { continueCards(function (x) { return items.indexOf(x) >= 0 || items.some(function (i) { return i.key === x.key; }); }).forEach(function (c) { grid.appendChild(c); }); return; }
            fillIncremental(grid, items, isMovie ? movieCard : seriesCard);
          }).catch(function (e) { if (my === token) { grid.innerHTML = ''; grid.appendChild(empty(e.message)); } });
        }
        return (isMovie ? api.vodCategories() : api.seriesCategories()).then(function (cats) {
          var specials = [
            { category_id: '_cont', category_name: T('Continue Watching') }, { category_id: '_fav', category_name: T('My List') },
            { category_id: '_new', category_name: T('Recently Added') }, { category_id: '_all', category_name: T(isMovie ? 'All Movies' : 'All Series') }];
          var hasCont = Store.continueWatching().some(function (x) { return isMovie ? x.type === 'movie' : x.type === 'episode'; });
          // "Recently Added" needs the whole catalog: only open on it when that is already downloaded
          var col = catColumn(specials.concat(cats), loadCat, params.cat || (hasCont ? '_cont' : (groupedNow(kind) || !cats.length ? '_new' : cats[0].category_id)));
          lay.appendChild(col); lay.appendChild(gridCol);
          var contN = Store.continueWatching().filter(function (x) { return isMovie ? x.type === 'movie' : x.type === 'episode'; }).length;
          var favN = Store.favs()[type].length;
          col.setCounts(function (id) { return id === '_cont' ? contN : id === '_fav' ? favN : null; });
          // category counts come from the whole catalog: show them only when it is already downloaded (it can be 10 MB)
          (groupedNow(kind) ? Promise.resolve(groupedNow(kind)) : Promise.reject()).then(function (g) {
            col.setCounts(function (id) {
              if (id === '_cont') return contN;
              if (id === '_fav') return favN;
              if (id === '_new') return Math.min(150, g.all.length);
              if (id === '_all') return g.all.length;
              return (g.by[String(id)] || []).length;
            });
          }).catch(function () {});
          var initCat = col.initial && col.initial._cat;
          if (initCat) return loadCat(initCat);
        });
      },
      onKey: function (e) {
        if (e.keyCode === K.YELLOW) { toggleFavFocused(); return true; }
        if (e.keyCode === K.INFO) { itemOptions(); return true; }
        return false;
      }
    };
  }
  function removeContinueFocused() {
    var c = Focus.current, key = c && c.dataset.key;
    if (key && key.indexOf('cw:') === 0) { Store.removeProgress(key.slice(3)); App.toast('Removed from Continue Watching'); App.refresh(); }
  }
  /* Options for the focused card or channel: what the colored buttons do on Samsung/LG remotes.
     Opened with INFO (Fire TV ☰, Android "hold OK", Samsung/LG Info). */
  function itemOptions(after) {
    var c = Focus.current, key = c && c.dataset.key;
    if (!key) return;
    var items = [], m = /^(mv|sr|ch):(.+)$/.exec(key);
    if (m) {
      var on = Store.isFav({ mv: 'movie', sr: 'series', ch: 'live' }[m[1]], m[2]);
      items.push({ label: on ? 'Remove from My List' : 'Add to My List', a: 'fav' });
    }
    if (key.indexOf('cw:') === 0) items.push({ label: 'Remove from Continue Watching', a: 'cw' });
    if (!items.length) return;
    var title = c.querySelector('.cap') ? c.querySelector('.cap').firstChild.textContent : (c.querySelector('.name') || c.querySelector('.ph .pht') || {}).textContent;
    App.menu(title || 'Options', items).then(function (it) {
      if (!it) return;
      if (it.a === 'fav') { toggleFavFocused(); if (after) after(); }
      if (it.a === 'cw') removeContinueFocused();
    });
  }
  function toggleFavFocused() {
    var c = Focus.current, key = c && c.dataset.key;
    if (!key) return;
    var m = /^(mv|sr|ch):(.+)$/.exec(key);
    if (!m) return;
    var type = { mv: 'movie', sr: 'series', ch: 'live' }[m[1]];
    var name = c.querySelector('.cap') ? c.querySelector('.cap').firstChild.textContent : (c.querySelector('.ph .pht') || c.querySelector('.name') || {}).textContent;
    var img = c.querySelector('img');
    var item = c._item || { id: m[2], name: name, icon: img ? img.src : null };
    var added = Store.toggleFav(type, short(item));
    App.toast(added ? 'Added to My List' : 'Removed from My List');
    var mark = c.querySelector('.fav, .star');
    if (c.classList.contains('ch')) { var st = c.querySelector('.star'); if (st) st.textContent = added ? '★' : ''; }
    else if (added && !mark) c.appendChild(h('div', { class: 'fav', text: '♥' }));
    else if (!added && mark) mark.remove();
  }
  V.movies = makeBrowse('movie');
  V.series = makeBrowse('series');

  /* ================= Live TV ================= */
  V.live = {
    title: 'Live TV', nav: 'live',
    leave: function () { if (this.__pvStop) this.__pvStop(); },   // stop the channel preview when leaving
    render: function (main, params) {
      if (needPlaylist(main)) return;
      var api = App.api, self = this;
      var lay = h('div', { class: 'live' });
      var chCol = h('div', { class: 'ch-col', 'data-zone': 'channels' });
      var prevCol = h('div', { class: 'preview-col' });
      var preview = h('div', { class: 'preview-card' });
      prevCol.appendChild(preview);
      self._grid = chCol;
      main.appendChild(lay);
      App.setHints([{ key: 'OK', label: 'Watch' }, colorHint('Y', 'yellow', 'Favorite'), { key: Platform.colorKeys ? 'CH ▲▼' : '▲▼', label: 'Zap while watching' }]);
      var token = 0, current = [], epgTimer;
      /* The focused channel plays inside the preview card once the focus rests on it for a moment. It is fully
         stopped before full screen, because many subscriptions allow only one stream at a time.
         Samsung: the TV's own player (AVPlay) is shown in the card's area. LG, Android and browsers: a small
         <video> (HLS, which they can all play). First done for LG by Kerolosashraf7 (issue #1). */
      var pvVideo = null, pvTimer = null, pvBox = null, pvTok = 0;
      var pvAV = Platform.name === 'tizen' && typeof webapis !== 'undefined' && !!webapis.avplay;
      var pvOn = !Platform.phone && (pvAV || typeof HTMLVideoElement !== 'undefined');
      function pvStop() {
        clearTimeout(pvTimer); pvTok++;
        if (pvBox) { pvBox.classList.remove('pv-playing'); pvBox.classList.remove('pv-loading'); }
        if (pvAV) {
          if (pvBox) { try { webapis.avplay.stop(); } catch (e) {} try { webapis.avplay.close(); } catch (e) {} }
          // the full-screen player goes back to its normal (hidden) state
          var layer = document.getElementById('player-layer'), hole = document.getElementById('av-player');
          if (layer && layer.classList.contains('pv-window')) {
            layer.classList.remove('pv-window'); layer.classList.remove('pv-on'); layer.classList.add('hidden'); layer.style.cssText = '';
            if (hole) hole.style.display = 'none';
          }
        } else if (pvVideo) {
          try { pvVideo.pause(); } catch (e) {}
          pvVideo.onplaying = pvVideo.onerror = null;
          pvVideo.removeAttribute('src'); try { pvVideo.load(); } catch (e) {}
          if (pvVideo.parentNode) pvVideo.parentNode.removeChild(pvVideo);
        }
        pvBox = null;
      }
      // the card's place on the TV screen, in the 1920x1080 picture AVPlay uses
      function screenRect(el) {
        var r = el.getBoundingClientRect(), k = 1920 / (window.innerWidth || 1920);
        return [Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k)];
      }
      /* The TV shows video only through the full-screen player's window, so for the preview that player is shrunk
         to the card's exact place (see-through, no controls) and the picture is drawn there. */
      function pvStartAV(ch, box, my) {
        var av = webapis.avplay, layer = document.getElementById('player-layer'), hole = document.getElementById('av-player');
        var stage = document.getElementById('stage'), sr = stage.getBoundingClientRect(), br = box.getBoundingClientRect();
        var sc = sr.width / (stage.offsetWidth || 1) || 1;
        layer.style.cssText = 'left:' + (br.left - sr.left) / sc + 'px;top:' + (br.top - sr.top) / sc + 'px;width:' + br.width / sc + 'px;height:' + br.height / sc + 'px;right:auto;bottom:auto';
        layer.classList.add('pv-window'); layer.classList.remove('hidden');
        hole.style.display = 'block';
        try { av.stop(); } catch (e) {} try { av.close(); } catch (e) {}
        setTimeout(function () { if (my === pvTok && box.isConnected) pvOpenAV(ch, box, my); }, 150);
      }
      function pvOpenAV(ch, box, my) {
        var av = webapis.avplay;
        try {
          av.open(api.liveUrl({ stream_id: ch.id }, Store.settings().liveFormat));
          var rc = screenRect(box);
          av.setDisplayRect(rc[0], rc[1], rc[2], rc[3]);   // the box is 16:9, like the channels
          try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 2); } catch (e) {}
          av.setListener({ onerror: function () { if (my === pvTok) box.classList.remove('pv-loading'); } });
          av.prepareAsync(function () {
            if (my !== pvTok) return;
            try { av.play(); } catch (e) { box.classList.remove('pv-loading'); return; }
            box.classList.remove('pv-loading'); box.classList.add('pv-playing');
            document.getElementById('player-layer').classList.add('pv-on');
          }, function () { if (my === pvTok) box.classList.remove('pv-loading'); });
        } catch (e) { box.classList.remove('pv-loading'); }
      }
      function pvStart(ch, box) {
        pvStop();
        if (!pvOn) return;
        var my = pvTok;
        pvTimer = setTimeout(function () {
          if (!box.isConnected || my !== pvTok) return;
          pvBox = box;
          box.classList.add('pv-loading');
          if (pvAV) { pvStartAV(ch, box, my); return; }
          if (!pvVideo) { pvVideo = document.createElement('video'); pvVideo.className = 'live-pv'; pvVideo.setAttribute('playsinline', ''); }
          pvVideo.onplaying = function () { box.classList.remove('pv-loading'); box.classList.add('pv-playing'); };
          pvVideo.onerror = function () { box.classList.remove('pv-loading'); box.classList.remove('pv-playing'); };
          box.appendChild(pvVideo);
          pvVideo.src = api.liveUrl({ stream_id: ch.id }, Platform.name === 'webos' ? Store.settings().liveFormat : 'm3u8');
          var pr = pvVideo.play();
          // a browser that refuses sound before a key press still plays it muted
          if (pr && pr.catch) pr.catch(function () { if (my !== pvTok || !pvVideo) return; pvVideo.muted = true; var p2 = pvVideo.play(); if (p2 && p2.catch) p2.catch(function () {}); });
        }, 900);
      }
      self.__pvStop = pvStop;

      function showPreview(ch) {
        pvStop();   // first: the card may be holding the TV's video window, which must not be thrown away with it
        preview.innerHTML = '';
        var logoBox = h('div', { class: 'big-logo' + (pvOn ? ' pv16' : ''), style: { backgroundImage: ch.icon ? 'url("' + ch.icon + '")' : grad(ch.name) } }, ch.icon ? null : [placeholder(ch.name)]);
        preview.appendChild(logoBox);
        pvStart(ch, logoBox);
        preview.appendChild(h('h3', { text: (ch.num ? ch.num + '  ' : '') + ch.name, dir: 'auto' }));
        var epg = h('div');
        preview.appendChild(epg);
        clearTimeout(epgTimer);
        epgTimer = setTimeout(function () {
          api.shortEpg(ch.id).then(function (list) {
            if (!preview.contains(epg)) return;
            var now = Date.now();
            list = list.filter(function (e) { return e.end > now; }).slice(0, 3);
            if (!list.length) { epg.appendChild(h('div', { class: 'note', text: T('No TV guide for this channel.') })); return; }
            list.forEach(function (e, i) {
              var it = h('div', { class: 'epg-item' }, [
                h('div', { class: 'when', text: (i === 0 && e.start <= now ? 'NOW · ' : '') + fmtClock(new Date(e.start)) + ' – ' + fmtClock(new Date(e.end)) }),
                h('div', { class: 'what', text: e.title, dir: 'auto' })]);
              if (i === 0 && e.start <= now) it.appendChild(h('div', { class: 'bar' }, [h('i', { style: { width: Math.min(100, (now - e.start) / (e.end - e.start) * 100) + '%' } })]));
              if (i === 0 && e.desc) it.appendChild(h('div', { class: 'desc', text: e.desc, dir: 'auto' }));
              epg.appendChild(it);
            });
          });
        }, 300);
      }
      function chRow(ch) {
        var el = h('div', { class: 'ch', data: { key: 'ch:' + ch.id } }, [
          h('div', { class: 'num', text: ch.num ? String(ch.num) : '' }),
          h('div', { class: 'logo', style: { backgroundImage: ch.icon ? 'url("' + ch.icon + '")' : grad(ch.name) } }, ch.icon ? null : [placeholder(ch.name)]),
          h('div', { class: 'name', text: ch.name, dir: 'auto' }),
          h('div', { class: 'star', text: Store.isFav('live', ch.id) ? '★' : '' })]);
        el._item = ch;
        if (Platform.touch) el.setAttribute('data-tap2', '1');   // phone: first tap previews, second tap plays
        return Focus.make(el, function () { pvStop(); App.remember('ch:' + ch.id); PlayerUI.playLive(ch, current); }, function () { showPreview(ch); });
      }
      function loadCat(cat) {
        params.cat = cat.category_id;
        var my = ++token;
        chCol.innerHTML = '';
        if (App.isLocked(cat)) { chCol.appendChild(empty('🔒 Locked. Press OK on the category and enter your PIN.')); return Promise.resolve(); }
        chCol.appendChild(spinner());
        var p;
        if (cat.category_id === '_fav') p = Promise.resolve(Store.favs().live);
        else if (cat.category_id === '_recent') p = Promise.resolve(Store.recentChannels());
        else if (cat.category_id === '_all') p = grouped('live').then(function (g) {
          var lockedIds = {};
          (self._cats || []).forEach(function (c) { if (App.isLocked(c)) lockedIds[c.category_id] = 1; });
          return g.all.filter(function (x) { return !lockedIds[x.category_id]; }).map(normLive);
        });
        else {
          var ready = groupedNow('live');
          p = (ready ? Promise.resolve(ready.by[String(cat.category_id)] || []) : api.liveStreams(cat.category_id))
            .then(function (l) { return l.map(normLive); });
        }
        return p.then(function (items) {
          if (my !== token) return;
          chCol.innerHTML = '';
          current = items;
          if (!items.length) { chCol.appendChild(empty(cat.category_id === '_fav' ? T('{0} on a channel to add it here.', T(favHow())) : 'No channels here.')); return; }
          fillIncremental(chCol, items, chRow, 40);
          showPreview(items[0]);
        }).catch(function (e) { if (my === token) { chCol.innerHTML = ''; chCol.appendChild(empty(e.message)); } });
      }
      return api.liveCategories().then(function (cats) {
        self._cats = cats;
        var specials = [{ category_id: '_fav', category_name: '★ ' + T('Favorites') }, { category_id: '_recent', category_name: T('Recently Watched') }, { category_id: '_all', category_name: T('All Channels') }];
        var def = params.cat || (Store.favs().live.length ? '_fav' : (cats[0] ? cats[0].category_id : '_all'));
        var col = catColumn(specials.concat(cats), loadCat, def);
        lay.appendChild(col); lay.appendChild(chCol); lay.appendChild(prevCol);
        var favN = Store.favs().live.length, recN = Store.recentChannels().length;
        col.setCounts(function (id) { return id === '_fav' ? favN : id === '_recent' ? recN : null; });
        (groupedNow('live') ? Promise.resolve(groupedNow('live')) : Promise.reject()).then(function (g) {
          var locked = 0;
          cats.forEach(function (c) { if (App.isLocked(c)) locked += (g.by[String(c.category_id)] || []).length; });
          col.setCounts(function (id) {
            if (id === '_fav') return favN;
            if (id === '_recent') return recN;
            if (id === '_all') return g.all.length - locked;
            return (g.by[String(id)] || []).length;
          });
        }).catch(function () {});
        if (col.initial) return loadCat(col.initial._cat).then(function () {
          // when coming back from the player, land on the channel you watched
          if (params._restoreKey) { var el = chCol.querySelector('[data-key="' + params._restoreKey + '"]'); if (el) el.setAttribute('data-autofocus', '1'); }
        });
      });
    },
    onKey: function (e) {
      if (e.keyCode === K.YELLOW) { toggleFavFocused(); return true; }
      if (e.keyCode === K.INFO) { itemOptions(); return true; }
      return false;
    }
  };

  /* ================= Movie details ================= */
  V.movieDetail = {
    render: function (main, params) {
      var m = params.item, api = App.api, key = 'movie:' + m.id;
      var d = h('div', { class: 'detail' });
      main.appendChild(d);
      function build(info) {
        d.innerHTML = '';
        var p = Store.progress(key), inprog = Store.inProgress(p);
        var dur = info && info.duration_secs ? info.duration_secs * 1000 : 0;
        var fav = Store.isFav('movie', m.id);
        var buttons = inprog ? [
          { label: T('Resume {0}', fmtTime(p.pos)), icon: 'play', onSelect: function () { playMovie(m, p.pos); } },
          { label: 'Play from start', icon: 'restart', onSelect: function () { playMovie(m, 0); } }
        ] : [{ label: Store.isWatched(p) ? 'Watch again' : 'Play', icon: 'play', onSelect: function () { playMovie(m, 0); } }];
        buttons.push({ label: fav ? 'In My List' : 'My List', icon: fav ? 'check' : 'plus', onSelect: function () {
          Store.toggleFav('movie', short(m)); build(info); Focus.set(d.querySelector('[data-key="fav"]'));
        }, key: 'fav' });
        var hero = heroBlock({ title: m.name, img: (info && info.backdrop_path && info.backdrop_path[0]) || m.icon,
          meta: [rating((info && info.rating) || m.rating), info && info.releasedate ? String(info.releasedate).slice(0, 4) : (m.year ? String(m.year) : null),
            dur ? fmtTime(dur).replace(/:\d\d$/, '').replace(':', 'h ') + 'm' : null, info && info.genre ? info.genre : null,
            Store.isWatched(p) ? '✓ Watched' : null],
          plot: info ? info.plot : 'Loading details…', buttons: buttons,
          preview: info && ytId(info.youtube_trailer || info.trailer) ? { id: ytId(info.youtube_trailer || info.trailer), random: false } : null });
        if (inprog) hero.content.insertBefore(h('div', { class: 'bar', style: { width: '600px', marginBottom: '26px' } }, [h('i', { style: { width: (p.pos / p.dur * 100) + '%' } })]), hero.btns);
        if (info) {
          var facts = h('div', { class: 'facts' });
          if (info.cast) facts.appendChild(h('div', {}, [h('b', { text: T('Cast: ') }), String(info.cast).slice(0, 200)]));
          if (info.director) facts.appendChild(h('div', {}, [h('b', { text: T('Director: ') }), info.director]));
          hero.content.appendChild(facts);
        }
        d.appendChild(hero);
        m.dur = dur;
      }
      build(null);
      return api.vodInfo(m.id).then(function (r) {
        var info = (r && r.info) || {};
        if (r && r.movie_data && r.movie_data.container_extension) m.ext = r.movie_data.container_extension;
        if (Array.isArray(info) || typeof info !== 'object') info = {};
        if (typeof info.backdrop_path === 'string') info.backdrop_path = [info.backdrop_path];
        build(info);
      }).catch(function () { build({ plot: '' }); });
    }
  };

  /* ================= Series details ================= */
  V.seriesDetail = {
    render: function (main, params) {
      var s = params.item, api = App.api;
      var wrap = h('div', { class: 'scroll-y' });
      main.appendChild(wrap);
      wrap.appendChild(spinner());
      return api.seriesInfo(s.id).then(function (data) {
        wrap.innerHTML = '';
        var info = (data && data.info) || {};
        var eps = (data && data.episodes) || {};
        var seasons = Object.keys(eps).sort(function (a, b) { return a - b; });
        if (!seasons.length) { wrap.appendChild(empty('This series has no episodes yet.')); return; }
        var last = Store.lastEpisodeOf(s.id);
        var curSeason = String(params.season || (last && last.season) || seasons[0]);

        function findNextUnwatched() {
          if (!last) return { season: seasons[0], ep: eps[seasons[0]][0], start: 0 };
          var lp = Store.progress(last.key);
          if (Store.inProgress(lp)) {
            var e1 = (eps[last.season] || []).find(function (e) { return String(e.id) === String(last.id); });
            if (e1) return { season: String(last.season), ep: e1, start: lp.pos };
          }
          var flat = [];
          seasons.forEach(function (se) { (eps[se] || []).forEach(function (e) { flat.push({ season: se, ep: e }); }); });
          var i = flat.findIndex(function (x) { return String(x.ep.id) === String(last.id); });
          var n = flat[i + 1] || flat[0];
          return { season: n.season, ep: n.ep, start: 0 };
        }
        var nxt = findNextUnwatched();
        var fav = Store.isFav('series', s.id);
        var item = { id: s.id, name: info.name || s.name, icon: info.cover || s.icon };
        function play(season, ep, start) {
          PlayerUI.playEpisode({ series: item, info: data, season: season, epId: ep.id, backdrop: bd }, start);
        }
        var bd = (Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path) || info.cover || s.icon;
        var hero = heroBlock({ title: item.name, img: bd,
          meta: [rating(info.rating || s.rating), info.releaseDate ? String(info.releaseDate).slice(0, 4) : null, seasons.length + (seasons.length === 1 ? ' Season' : ' Seasons'), info.genre || null],
          plot: info.plot, onButtonFocus: function () { wrap.scrollTop = 0; },
          preview: ytId(info.youtube_trailer) ? { id: ytId(info.youtube_trailer), random: false } : null,
          buttons: [
            { label: (nxt.start ? 'Resume ' : (last ? 'Play ' : 'Play ')) + 'S' + nxt.season + ':E' + (nxt.ep.episode_num || ''), icon: 'play', onSelect: function () { play(nxt.season, nxt.ep, nxt.start); } },
            { label: fav ? 'In My List' : 'My List', icon: fav ? 'check' : 'plus', key: 'fav', onSelect: function () {
              var on = Store.toggleFav('series', short(item));
              var b = hero.btns.querySelector('[data-key="fav"]'); b.innerHTML = ICON[on ? 'check' : 'plus']; b.appendChild(h('span', { text: on ? 'In My List' : 'My List' }));
            } }
          ] });
        hero.style.height = '760px';
        wrap.appendChild(hero);

        var tabs = h('div', { class: 'seasons', 'data-zone': 'seasons' });
        var list = h('div', { class: 'episodes', 'data-zone': 'eps' });
        wrap.appendChild(tabs); wrap.appendChild(list);
        function showSeason(se) {
          curSeason = String(se); params.season = curSeason;
          Array.prototype.forEach.call(tabs.children, function (t) { t.classList.toggle('active', t.dataset.season === curSeason); });
          list.innerHTML = '';
          (eps[se] || []).forEach(function (e) {
            var key = 'episode:' + e.id, p = Store.progress(key), ei = e.info || {};
            var dur = ei.duration_secs ? ei.duration_secs * 1000 : 0;
            // series artwork underneath; the episode's own picture on top when it exists and loads
            var art = bd || info.cover || s.icon;
            var thumb = h('div', { class: 'thumb fallback', style: { backgroundImage: art ? 'url("' + art + '")' : grad(item.name) } });
            thumb.appendChild(h('div', { class: 'ep-badge', text: T('E{0}', e.episode_num || '') }));
            if (ei.movie_image) {
              var eimg = h('img', { src: ei.movie_image, alt: '', loading: 'lazy' });
              eimg.onload = function () { if (this.naturalWidth > 60) this.parentNode.classList.remove('fallback'); else this.remove(); };
              eimg.onerror = function () { this.remove(); };
              thumb.appendChild(eimg);
            }
            if (Store.inProgress(p)) thumb.appendChild(h('div', { class: 'prog' }, [h('i', { style: { width: (p.pos / p.dur * 100) + '%' } })]));
            var body = h('div', { class: 'body' }, [
              h('div', { class: 't' }, [h('span', { text: e.title || T('Episode {0}', e.episode_num), dir: 'auto' }), dur ? h('small', { text: T('{0} min', Math.round(dur / 60000)) }) : null]),
              ei.plot ? h('div', { class: 'd', text: ei.plot, dir: 'auto' }) : null,
              Store.isWatched(p) ? h('div', { class: 'watched', text: T('✓ Watched') }) : (Store.inProgress(p) ? h('div', { class: 'watched', style: { color: 'var(--accent2)' }, text: T('{0} left', fmtTime(p.dur - p.pos)) }) : null)]);
            var el = h('div', { class: 'ep', data: { key: 'ep:' + e.id } }, [h('div', { class: 'n', text: String(e.episode_num || '') }), thumb, body]);
            Focus.make(el, function () {
              App.remember('ep:' + e.id);
              askResume(key).then(function (st) { if (st != null) play(se, e, st); });
            });
            list.appendChild(el);
          });
        }
        seasons.forEach(function (se) {
          var t = h('div', { class: 'season-tab', text: T('Season {0}', se), data: { season: String(se), key: 'season:' + se } });
          Focus.make(t, function () { var f = list.querySelector('.focusable'); if (f) Focus.set(f); }, function () { if (curSeason !== String(se)) showSeason(se); });
          tabs.appendChild(t);
        });
        showSeason(curSeason);
        App.setHints([{ key: 'OK', label: 'Play' }, { key: 'BACK', label: 'Return' }]);
      });
    }
  };

  /* ================= Search ================= */
  V.search = {
    title: '', nav: 'search',
    render: function (main, params) {
      var api = App.api;
      var wrap = h('div', { class: 'scroll-y' });
      var box = h('div', { class: 'search-box', 'data-zone': 'search' });
      var input = h('input', { class: 'input', type: 'text', placeholder: T('Search channels, movies, series and Mdluex videos…'), value: params.q || '', 'data-autofocus': '1', dir: 'auto' });
      Focus.make(input);
      box.appendChild(input);
      var results = h('div', { class: 'rows no-hero', style: { paddingTop: '10px' } });
      wrap.appendChild(box); wrap.appendChild(results);
      main.appendChild(wrap);
      var all = null, timer;
      function loadAll() {
        if (all) return Promise.resolve(all);
        var none = Promise.resolve([]);
        return Promise.all([
          api ? api.liveStreams().catch(function () { return []; }) : none,
          api ? api.vodStreams().catch(function () { return []; }) : none,
          api ? api.series().catch(function () { return []; }) : none,
          Promise.all(Channel.allChannels().map(function (c) { return Channel.of(c.id, c.name).load().then(function (d) { return d.videos; }, function () { return []; }); }))
            .then(function (lists) { return [].concat.apply([], lists); })
        ]).then(function (r) { all = { live: r[0].map(normLive), vod: r[1].map(normMovie), series: r[2].map(normSeries), yt: r[3] }; return all; });
      }
      function run() {
        var q = input.value.trim().toLowerCase();
        params.q = input.value;
        results.innerHTML = '';
        if (q.length < 2) { results.appendChild(empty('Type at least 2 letters. Press OK on the box to open the keyboard.')); return; }
        results.appendChild(spinner());
        loadAll().then(function (a) {
          results.innerHTML = '';
          function m(x) { return (x.name || x.title || '').toLowerCase().indexOf(q) >= 0; }
          var lockedCats = {};
          var ch = a.live.filter(m).slice(0, 40), mv = a.vod.filter(m).slice(0, 40), sr = a.series.filter(m).slice(0, 40), yt = a.yt.filter(m);
          var r1 = row('YouTube', yt.map(ytCard)), r2 = row('Channels', ch.map(function (c) { return channelCard(c, ch); }), T('{0} found', ch.length)),
            r3 = row('Movies', mv.map(movieCard), T('{0} found', mv.length)), r4 = row('Series', sr.map(seriesCard), T('{0} found', sr.length));
          [r1, r2, r3, r4].forEach(function (r) { if (r) results.appendChild(r); });
          if (!results.children.length) results.appendChild(empty(T('No results for "{0}".', input.value)));
        });
      }
      input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 400); });
      input._onDone = run;
      run();
      App.setHints([{ key: 'OK', label: 'Type' }, { key: '▼', label: 'Results' }]);
    }
  };

  /* ================= My List ================= */
  V.favorites = {
    title: 'My List', nav: 'favorites',
    render: function (main) {
      if (needPlaylist(main)) return;
      var wrap = h('div', { class: 'scroll-y' });
      var rows = h('div', { class: 'rows no-hero' });
      var f = Store.favs();
      [row('Channels', f.live.map(function (c) { return channelCard(c, f.live); })), row('Movies', f.movie.map(movieCard)), row('Series', f.series.map(seriesCard)),
        row('Continue Watching', continueCards())].forEach(function (r) { if (r) rows.appendChild(r); });
      if (!rows.children.length) rows.appendChild(empty(T('Your list is empty. {0} on any channel, movie or series to add it.', T(favHow()))));
      wrap.appendChild(rows);
      main.appendChild(wrap);
      App.setHints([colorHint('Y', 'yellow', 'Remove from My List')]);
    },
    onKey: function (e) {
      if (e.keyCode === K.YELLOW) { toggleFavFocused(); App.refresh(); return true; }
      if (e.keyCode === K.INFO) { itemOptions(App.refresh); return true; }
      return false;
    }
  };

  /* ================= Mdluex Channel (YouTube) ================= */
  function playYt(v) { askResume('yt:' + v.id).then(function (s) { if (s != null) PlayerUI.playYouTube(v, s); }); }
  function shortCard(v, follow) {
    return card({ kind: 'short', key: 'yt:' + v.id, title: v.title, img: Channel.shortThumb(v.id), progress: progressOf('yt:' + v.id),
      onSelect: function () { playYt(v); },
      onFocus: typeof follow === 'function' ? function () { follow(function () { return heroForYt(v); }); } : null });
  }
  function playlistCard(p, follow) {
    var first = p.videos[0] || {};
    return card({ kind: 'wide', key: 'pl:' + p.id, title: p.title, sub: p.videos.length === 1 ? T('1 video') : T('{0} videos', p.videos.length),
      img: first.id ? Channel.thumb(first.id) : null, badge: '▶ ' + p.videos.length,
      onSelect: function () { App.go('ytPlaylist', { pl: p, fromUser: p.fromUser }); },
      onFocus: typeof follow === 'function' && first.id ? function () {
        follow(function () { var o = heroForYt(first); o.kicker = T('Playlist · {0}', p.title); return o; });
      } : null });
  }
  /* a titled grid that can be taller than the screen (scrolls item by item, not row-snapped) */
  function gridBlock(title, cards, cls) {
    var g = h('div', { class: 'grid' + (cls ? ' ' + cls : ''), 'data-zone': 'grid', style: { padding: '16px 60px 80px' } });
    cards.forEach(function (c) { g.appendChild(c); });
    return h('div', { class: 'grid-block' }, [h('h2', { class: 'block-title', text: T(title) }), g]);
  }


  /* ================= YouTube channels (Mdluex Industries + the viewer's own) ================= */
  function channelTile(c, onSelect) {
    var av = h('div', { class: 'av' + (c.fixed && !c.avatar ? ' mdx' : '') });
    if (c.avatar) av.style.backgroundImage = 'url("' + c.avatar + '")';
    // the real, current profile picture from YouTube (replaces the saved one when it changed)
    if (c.id && !c.add) Channel.avatar(c.id).then(function (url) {
      if (!url || url === c.avatar) return;
      var img = new Image();
      img.onload = function () { av.classList.remove('mdx'); av.style.backgroundImage = 'url("' + url + '")'; };
      img.src = url;
    });
    var el = h('div', { class: 'yt-ch' + (c.add ? ' add' : ''), data: { key: 'ych:' + (c.id || 'add') } }, [
      av, h('div', { class: 'nm', text: c.name, dir: 'auto' }), c.info ? h('small', { text: c.info, dir: 'auto' }) : null]);
    if (c.add) av.textContent = '+';
    el._ch = c;
    return Focus.make(el, onSelect);
  }
  function openChannel(c) { App.remember('ych:' + c.id); App.go('channel', { id: c.id, name: c.name }); }
  function channelOptions() {
    var el = Focus.current, c = el && el._ch;
    if (!c || c.add) return;
    if (c.fixed) { App.toast('Mdluex Industries is always on'); return; }
    App.menu(c.name, [{ label: 'Open channel', a: 'open' }, { label: 'Remove channel', a: 'del' }]).then(function (it) {
      if (!it) return;
      if (it.a === 'open') openChannel(c);
      if (it.a === 'del') App.confirm(T('Remove {0}?', c.name), 'Its videos will no longer show in the app.', 'Remove').then(function (ok) {
        if (!ok) return;
        Channel.removeChannel(c.id);
        App.toast(T('Removed {0}', c.name));
        App.refresh();
      });
    });
  }
  V.ytChannels = {
    title: 'YouTube Channels', nav: 'ytchannels',
    render: function (main) {
      var wrap = h('div', { class: 'scroll-y pad-top' });
      var g = h('div', { class: 'grid yt-grid', 'data-zone': 'grid' });
      Channel.allChannels().forEach(function (c) {
        if (c.fixed) c = Object.assign({}, c, { info: T('Always on') });
        g.appendChild(channelTile(c, function () { openChannel(c); }));
      });
      g.appendChild(channelTile({ add: true, name: T('Add channel') }, function () { App.remember('ych:add'); App.go('ytAdd'); }));
      wrap.appendChild(g);
      wrap.appendChild(h('div', { class: 'note', style: { margin: '10px 60px' }, text: T('Videos from your channels also show on Home.') }));
      main.appendChild(wrap);
      App.setHints([{ key: 'OK', label: 'Open' }, colorHint('R', 'red', 'Remove channel')]);
    },
    onKey: function (e) {
      if (e.keyCode === K.RED || e.keyCode === K.INFO) { channelOptions(); return true; }
      return false;
    }
  };
  /* Add a channel: search by name, or type a channel link / @handle */
  V.ytAdd = {
    title: 'Add channel', nav: 'ytchannels',
    render: function (main, params) {
      var wrap = h('div', { class: 'scroll-y' });
      var box = h('div', { class: 'search-box', 'data-zone': 'search' });
      var input = h('input', { class: 'input', type: 'text', placeholder: T('Channel name, @handle or link…'), value: params.q || '', 'data-autofocus': '1', dir: 'auto' });
      Focus.make(input);
      box.appendChild(input);
      var results = h('div', { style: { padding: '0 0 40px' } });
      wrap.appendChild(box); wrap.appendChild(results);
      main.appendChild(wrap);
      var token = 0;
      function run() {
        var q = input.value.trim();
        params.q = input.value;
        results.innerHTML = '';
        if (q.length < 2) { results.appendChild(empty('Type a channel name, an @handle or a channel link. Press OK on the box to open the keyboard.')); return; }
        var my = ++token;
        results.appendChild(spinner());
        Channel.resolve(q).then(function (list) {
          if (my !== token) return;
          results.innerHTML = '';
          if (!list.length) { results.appendChild(empty(T('No channels found for "{0}".', q))); return; }
          var have = {};
          Channel.allChannels().forEach(function (c) { have[c.id] = 1; });
          var g = h('div', { class: 'grid yt-grid', 'data-zone': 'grid' });
          list.forEach(function (c) {
            var shown = Object.assign({}, c, { info: have[c.id] ? T('Added') : c.info });
            g.appendChild(channelTile(shown, function () {
              if (have[c.id]) { App.toast('This channel is already in your list'); return; }
              Channel.addChannel(c);
              App.toast(T('Added {0}', c.name));
              App.go('ytChannels', {}, { reset: true });
            }));
          });
          results.appendChild(g);
        }).catch(function () {
          if (my !== token) return;
          results.innerHTML = '';
          results.appendChild(empty('Could not reach YouTube. Check the internet connection and try again.'));
        });
      }
      input._onDone = run;
      if (params.q) run(); else results.appendChild(empty('Type a channel name, an @handle or a channel link. Press OK on the box to open the keyboard.'));
      App.setHints([{ key: 'OK', label: 'Type' }, { key: '▼', label: 'Results' }]);
    }
  };

  V.channel = {
    title: '', nav: function (p) { return p && p.id && p.id !== Channel.CHANNEL_ID ? 'ytchannels' : 'channel'; },
    leave: function () { ytCtx = null; },
    render: function (main, params) {
      var wrap = h('div', { class: 'scroll-y' });
      main.appendChild(wrap);
      wrap.appendChild(spinner());
      var chan = Channel.of(params.id, params.name);
      return Promise.all([chan.load(), chan.featured(), chan.tabs()]).then(function (r) {
        var d = r[0], v = r[1], t = r[2];
        ytCtx = { id: chan.id, name: d.name || params.name || 'YouTube' };
        wrap.innerHTML = '';
        var hero = null;
        var follow = billboard(function () { return hero; });
        if (v) {
          var o = heroForYt(v);   // includes the muted preview, which starts by itself
          o.kicker = d.name + ' · ' + T('YouTube');
          o.meta = ['Featured video', v.published ? fmtDate(Date.parse(v.published)) : null];
          hero = heroBlock(o);
          wrap.appendChild(h('div', { class: 'hero-slot' }, [hero]));
          wrap.classList.add('billboard-layout');
        }
        var rows = h('div', { class: 'rows' });
        wrap.appendChild(rows);

        // tab bar, like YouTube: Home · Videos · Shorts · Playlists
        var TABS = [['home', T('Home')], ['videos', T('Videos ({0})', t.videos.length)], ['shorts', T('Shorts ({0})', t.shorts.length)], ['playlists', T('Playlists ({0})', t.playlists.length)]];
        var bar = h('div', { class: 'seasons yt-tabs', 'data-zone': 'ytTabs' });
        rows.appendChild(h('div', { class: 'row tabs-row' }, [bar]));
        var content = h('div');
        rows.appendChild(content);
        var cur = params.tab || 'home', timer;
        function show(tab) {
          cur = tab; params.tab = tab;
          Array.prototype.forEach.call(bar.children, function (c) { c.classList.toggle('active', c.dataset.tab === tab); });
          content.innerHTML = '';
          if (tab === 'home') {
            [row('Continue Watching', continueCards(function (p) { return p.type === 'yt'; }, follow)),
              row('Videos', t.videos.map(function (x) { return ytCard(x, follow); })),
              row('Shorts', t.shorts.map(function (x) { return shortCard(x, follow); }))]
              .concat(t.playlists.map(function (p) { return row(p.title, p.videos.map(function (x) { return ytCard(x, follow); }), 'Playlist'); }))
              .forEach(function (r) { if (r) content.appendChild(r); });
          } else if (tab === 'videos') content.appendChild(gridBlock('Videos', t.videos.map(function (x) { return ytCard(x, follow); })));
          else if (tab === 'shorts') content.appendChild(gridBlock('Shorts', t.shorts.map(function (x) { return shortCard(x, follow); }), 'shorts-grid'));
          else content.appendChild(gridBlock('Playlists', t.playlists.map(function (p) { p.fromUser = !chan.isMdluex; return playlistCard(p, follow); })));
          if (!content.querySelector('.focusable')) content.appendChild(empty('Nothing here yet.'));
        }
        TABS.forEach(function (tb) {
          var chip = h('div', { class: 'season-tab', text: tb[1], data: { tab: tb[0], key: 'tab:' + tb[0] } });
          Focus.make(chip, function () { var f = content.querySelector('.focusable'); if (f) Focus.set(f); },
            function () { clearTimeout(timer); timer = setTimeout(function () { if (cur !== tb[0]) show(tb[0]); }, 250); });
          bar.appendChild(chip);
        });
        show(cur);
        App.setHints([{ key: 'OK', label: 'Play' }, { key: '▲▼', label: 'Tabs · Videos' }]);
      });
    }
  };

  /* one playlist of the channel */
  V.ytPlaylist = {
    title: '', nav: function (p) { return p && p.fromUser ? 'ytchannels' : 'channel'; },
    render: function (main, params) {
      var p = params.pl, wrap = h('div', { class: 'scroll-y billboard-layout' });
      main.appendChild(wrap);
      var hero = null, follow = billboard(function () { return hero; });
      var first = p.videos[0];
      if (first) {
        var o = heroForYt(first);
        o.kicker = T('Playlist · {0}', p.title);
        o.meta = [T('{0} videos', p.videos.length)];
        hero = heroBlock(o);
        wrap.appendChild(h('div', { class: 'hero-slot' }, [hero]));
      }
      var rows = h('div', { class: 'rows' });
      rows.appendChild(gridBlock(p.title, p.videos.map(function (x) { return ytCard(x, follow); })));
      wrap.appendChild(rows);
      App.setHints([{ key: 'OK', label: 'Play' }, { key: 'BACK', label: 'Channel' }]);
    }
  };

  /* ================= Settings ================= */
  function playlistForm(existing) {
    var pl = Object.assign({ name: '', server: '', username: '', password: '' }, existing || {});
    App.modal(function (outer, m) {
      var box = outer, qrSide = null;
      if (!existing && !Platform.phone && window.PhoneLink && window.crypto && window.crypto.getRandomValues) {
        /* new playlist: the QR code on the right lets the user type it on their phone instead */
        outer.style.width = '1560px'; outer.style.maxWidth = '1560px';
        box = h('div', { class: 'pl-form' }); qrSide = h('div', { class: 'pl-qr' });
        outer.appendChild(h('div', { class: 'pl-cols' }, [box, qrSide]));
      } else outer.style.width = '1100px';
      box.appendChild(h('h2', { text: T(existing ? 'Edit playlist' : 'Add IPTV playlist') }));
      box.appendChild(h('p', { text: T('Enter the Xtream login your IPTV provider gave you. Press OK on a box to type.') }));
      var fields = {};
      [['name', 'Name (anything you like)', 'My IPTV'], ['server', 'Server address', 'http://example.com:8080'], ['username', 'Username', ''], ['password', 'Password', '']].forEach(function (f) {
        var inp = h('input', { class: 'input', type: f[0] === 'password' ? 'password' : 'text', placeholder: f[2], value: pl[f[0]] || '' });
        Focus.make(inp);
        fields[f[0]] = inp;
        if (f[0] === 'password') {
          // "Show" button next to the password: OK toggles between hidden and visible
          var eye = h('div', { class: 'btn small pw-toggle', text: T('Show') });
          Focus.make(eye, function () {
            var show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            eye.textContent = T(show ? 'Hide' : 'Show');
          });
          box.appendChild(h('div', { class: 'field' }, [h('label', { text: T(f[1]) }), h('div', { class: 'pw-row' }, [inp, eye])]));
        } else box.appendChild(h('div', { class: 'field' }, [h('label', { text: T(f[1]) }), inp]));
      });
      fields.name.setAttribute('data-autofocus', '1');
      var note = h('div', { class: 'note' });
      box.appendChild(note);
      function read() {
        return { id: pl.id, name: fields.name.value.trim() || 'My IPTV', server: Api.normalizeServer(fields.server.value), username: fields.username.value.trim(), password: fields.password.value };
      }
      function test(d) {
        note.className = 'note'; note.textContent = T('Connecting…');
        return Api.create(d).account().then(function (r) {
          var ui = r.user_info;
          if (String(ui.auth) !== '1') throw new Api.ApiError(T('The server rejected this username or password.'));
          var exp = ui.exp_date && ui.exp_date !== 'null' ? T('expires {0}', fmtDate(ui.exp_date * 1000)) : T('no expiry date');
          note.className = 'note'; note.style.color = 'var(--ok)';
          note.textContent = T('✓ Connected – account {0}, {1}, connections {2}', T(ui.status || 'Active'), exp, (ui.active_cons || 0) + '/' + (ui.max_connections || '?'));
          return true;
        }).catch(function (e) { note.style.color = ''; note.className = 'note bad'; note.textContent = '✗ ' + e.message; return false; });
      }
      var rowEl = h('div', { class: 'btn-row' });
      var saveBtn = Focus.make(h('div', { class: 'btn primary', text: T('Save') }), function () {
        var d = read();
        if (!d.server || !d.username) { note.className = 'note bad'; note.textContent = T('Server address and username are required.'); return; }
        test(d).then(function (ok) {
          if (!ok && !window.__saveAnyway) { note.textContent += '  ' + T('Press Save again to keep it anyway.'); window.__saveAnyway = true; return; }
          window.__saveAnyway = false;
          var saved = Store.savePlaylist(d);
          m.close(); App.usePlaylist(saved); App.go('home', {}, { reset: true });
        });
      });
      rowEl.appendChild(saveBtn);
      rowEl.appendChild(Focus.make(h('div', { class: 'btn', text: T('Test connection') }), function () { var d = read(); if (d.server) test(d); }));
      rowEl.appendChild(Focus.make(h('div', { class: 'btn', text: T('Cancel') }), function () { m.close(); }));
      box.appendChild(rowEl);
      if (qrSide) {
        var qrStatus = h('div', { class: 'qr-status', text: T('Waiting for your phone…') });
        var link = PhoneLink.start(function (d) {
          fields.name.value = d.name; fields.server.value = d.server; fields.username.value = d.username; fields.password.value = d.password;
          qrStatus.className = 'qr-status ok'; qrStatus.textContent = T('✓ Received from your phone');
          Focus.set(saveBtn);
          var dd = read();
          if (dd.server && dd.username) test(dd).then(function (ok) {   // it works: save it straight away
            if (ok && outer.isConnected) { var saved = Store.savePlaylist(dd); m.close(); App.usePlaylist(saved); App.go('home', {}, { reset: true }); }
          });
        }, function () { return outer.isConnected; }, function () {
          qrStatus.className = 'qr-status bad'; qrStatus.textContent = T('This code has expired. Close this window and open it again for a new one.');
        });
        qrSide.appendChild(h('h3', { text: T('Easier: use your phone') }));
        qrSide.appendChild(h('p', { text: T('Scan this code with your phone camera, type the login there and press Send. It appears here by itself.') }));
        qrSide.appendChild(h('div', { class: 'qr-box' }, [link.canvas(420)]));
        qrSide.appendChild(qrStatus);
        qrSide.appendChild(h('div', { class: 'qr-safe', text: T('🔒 Sent encrypted. Only this TV can read it.') }));
      }
    });
  }
  App.playlistForm = playlistForm;

  V.settings = {
    title: 'Settings', nav: 'settings',
    render: function (main) {
      var wrap = h('div', { class: 'scroll-y' });
      var s = h('div', { class: 'settings', 'data-zone': 'settings' });
      wrap.appendChild(s); main.appendChild(wrap);
      var set = Store.settings(), active = Store.active();
      function setRow(label, value, onSelect, cls, key) {
        var r = h('div', { class: 'set-row', data: { key: key || ('set:' + label) } }, [h('span', { text: T(label), dir: 'auto' }), h('span', { class: 'v ' + (cls || ''), text: T(value || ''), dir: 'auto' })]);
        return Focus.make(r, onSelect);
      }
      function redraw() { App.refresh(); }

      if (active) {
        s.appendChild(h('h2', { text: T('Account') + ' · ' + active.name, dir: 'auto' }));
        var d = App.describeAccount();
        var grid = h('div', { class: 'account-card' }, [
          h('div', { class: 'stat' }, [h('div', { class: 'l', text: T('Status') }), h('div', { class: 'v ' + (d.auth === false ? 'bad' : (d.status === 'Active' ? 'ok' : 'bad')), text: d.status ? T(d.status) : '…' })]),
          h('div', { class: 'stat' }, [h('div', { class: 'l', text: T('Expires') }), h('div', { class: 'v ' + d.level, text: d.expMs ? fmtDate(d.expMs) : (d.auth ? T('Never') : '—') })]),
          h('div', { class: 'stat' }, [h('div', { class: 'l', text: T('Days left') }), h('div', { class: 'v ' + d.level, text: d.days != null ? String(Math.max(0, d.days)) : (d.auth ? '∞' : '—') })]),
          h('div', { class: 'stat' }, [h('div', { class: 'l', text: T('Connections') }), h('div', { class: 'v ' + (d.full ? 'warn' : ''), text: d.conns || '—' })])]);
        s.appendChild(grid);
        if (d.stale) s.appendChild(h('div', { class: 'note warn', text: T('Could not reach the server ({0}). Showing account info saved {1}.', d.error || T('unknown error'), fmtAgo(d.checkedAt)) }));
        else if (d.checkedAt) s.appendChild(h('div', { class: 'note', text: T('Checked {0}.', fmtAgo(d.checkedAt)) }));
        else if (d.error) s.appendChild(h('div', { class: 'note bad', text: d.error }));
        if (d.full) s.appendChild(h('div', { class: 'note warn', text: T('All your connections are in use. If streams fail, close the app on your other devices.') }));
        s.appendChild(setRow('Refresh account info', '', function () { App.refreshAccount().then(redraw); }));
      }

      s.appendChild(h('h2', { text: T('Playlists') }));
      Store.playlists().forEach(function (pl) {
        s.appendChild(setRow(pl.name + (pl.demo ? ' (demo)' : ''), active && active.id === pl.id ? '✓ In use' : (pl.demo ? '' : Api.normalizeServer(pl.server)), function () {
          App.menu(pl.name, [{ label: 'Use this playlist', a: 'use' }, pl.demo ? null : { label: 'Edit', a: 'edit' }, { label: 'Delete', a: 'del' }].filter(Boolean)).then(function (it) {
            if (!it) return;
            if (it.a === 'use') { App.usePlaylist(pl); App.go('home', {}, { reset: true }); }
            if (it.a === 'edit') playlistForm(pl);
            if (it.a === 'del') App.confirm(T('Delete "{0}"?', pl.name), 'Its favorites and watch history will be removed too.', 'Delete').then(function (ok) {
              if (!ok) return;
              Store.removePlaylist(pl.id);
              var next = Store.active();
              if (next) App.usePlaylist(next); else { App.toast('Playlist deleted'); location.reload(); return; }
              redraw();
            });
          });
        }, active && active.id === pl.id ? 'on' : '', 'pl:' + pl.id));
      });
      s.appendChild(setRow('+ Add playlist', '', function () { playlistForm(); }));

      s.appendChild(h('h2', { text: T('Playback') }));
      s.appendChild(setRow('Auto-play next episode', set.autoNext ? 'On' : 'Off', function () { Store.setSetting('autoNext', !set.autoNext); redraw(); }, set.autoNext ? 'on' : ''));
      s.appendChild(setRow('Video previews in the banner', set.videoPreviews === false ? 'Off (pictures only)' : 'On', function () {
        Store.setSetting('videoPreviews', set.videoPreviews === false); redraw();
      }, set.videoPreviews === false ? '' : 'on'));
      s.appendChild(setRow('Live TV stream type', set.liveFormat === 'm3u8' ? 'HLS (m3u8)' : 'MPEG-TS (ts)', function () {
        Store.setSetting('liveFormat', set.liveFormat === 'm3u8' ? 'ts' : 'm3u8'); App.toast('Try HLS if channels freeze or fail'); redraw();
      }));

      s.appendChild(h('h2', { text: T('Parental control') }));
      s.appendChild(setRow('Lock adult categories', set.lockAdult ? 'On' : 'Off', function () {
        App.checkPin('Enter PIN to change').then(function (ok) { if (ok) { Store.setSetting('lockAdult', !set.lockAdult); redraw(); } });
      }, set.lockAdult ? 'on' : ''));
      s.appendChild(setRow('Change PIN', set.pin === '0000' ? 'Default is 0000' : '••••', function () {
        App.checkPin('Current PIN').then(function (ok) {
          if (!ok) return;
          App.pinPrompt('New PIN').then(function (p1) {
            if (!p1 || p1.length !== 4) return;
            App.pinPrompt('Repeat new PIN').then(function (p2) {
              if (p1 === p2) { Store.setSetting('pin', p1); App.toast('PIN changed'); redraw(); } else App.toast('PINs did not match');
            });
          });
        });
      }));

      s.appendChild(h('h2', { text: T('General') }));
      s.appendChild(setRow('Clock format', set.clock24 ? '24-hour (17:30)' : '12-hour (5:30 PM)', function () {
        App.menu('Clock format', [
          { label: '24-hour', value: '17:30', v: true, checked: set.clock24 },
          { label: '12-hour', value: '5:30 PM', v: false, checked: !set.clock24 }
        ]).then(function (it) {
          if (!it) return;
          Store.setSetting('clock24', it.v);
          document.getElementById('clock').textContent = fmtClock();   // update the clock right away
          redraw();
        });
      }));
      s.appendChild(setRow('Clear watch history', '', function () {
        App.confirm('Clear watch history?', 'Continue Watching and resume points will be removed for this playlist.', 'Clear').then(function (ok) { if (ok) { Store.clearProgress(); App.toast('History cleared'); } });
      }));
      s.appendChild(setRow('Clear recently watched channels', '', function () { Store.clearRecent(); App.toast('Cleared'); }));
      s.appendChild(setRow('Language', I18N.pref === 'ar' ? 'العربية' : (I18N.pref === 'en' ? 'English' : T('Automatic (TV language)')), function () {
        App.menu('Language', [
          { label: 'Automatic (TV language)', v: 'auto', checked: I18N.pref === 'auto' },
          { label: 'English', v: 'en', checked: I18N.pref === 'en' },
          { label: 'العربية', v: 'ar', checked: I18N.pref === 'ar' }
        ]).then(function (it) {
          if (!it || it.v === I18N.pref) return;
          Store.setSetting('lang', it.v);
          location.reload();   // every screen is drawn again in the new language and direction
        });
      }));
      s.appendChild(h('h2', { text: T('Support Mdluex IPTV') }));
      s.appendChild(setRow('Donate', 'Patreon · Buy Me a Coffee', donate, 'on'));
      s.appendChild(setRow('Subscribe to Mdluex Industries on YouTube', '', function () { subscribe({ id: Channel.CHANNEL_ID, name: 'Mdluex Industries' }, null); }));
      s.appendChild(setRow('About', T('Mdluex IPTV {0} · by Mdluex Industries', Platform.version), function () {}));
      s.appendChild(setRow('Website', 'www.mdluex.com', function () {}));
      s.appendChild(setRow('Support & commercial use', 'hello@mdluex.com', function () {}));
      App.setHints([{ key: 'OK', label: 'Change' }]);
    }
  };
})();
