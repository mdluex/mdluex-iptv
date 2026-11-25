/* App shell: keys, router, sidebar, modals, toasts, account status, helpers. */
var K = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BKSP: 8,
  PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, CHUP: 427, CHDN: 428,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457, DONE: 65376, CANCEL: 65385, PGUP: 33, PGDN: 34
};

/* ---------- small DOM helpers ---------- */
function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'data') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
    else el.setAttribute(k, v);
  });
  (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function fmtTime(ms) {
  ms = Math.max(0, Math.floor((ms || 0) / 1000));
  var hh = Math.floor(ms / 3600), mm = Math.floor(ms % 3600 / 60), ss = ms % 60;
  return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0');
}
function fmtClock(d) {
  d = d || new Date();
  if (Store.settings().clock24) return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  var hr = d.getHours() % 12 || 12;
  return hr + ':' + String(d.getMinutes()).padStart(2, '0') + (d.getHours() < 12 ? ' AM' : ' PM');
}
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(ms) { var d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtAgo(ms) {
  var s = Math.floor((Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' days ago';
}
var ICON = {
  home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-7.6l3.3-3.3-.7-.7L12 6 8 2l-.7.7L10.6 6H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 13H3V8h18z"/></svg>',
  movie: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4z"/></svg>',
  series: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14a2 2 0 0 0 2 2h14v-2H4zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-8 12.5v-9l6 4.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.3 7.3 0 0 0 1.7 1L11 21h4l.4-2.9a7.3 7.3 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
  yt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>'
};

var App = (function () {
  var api = null;
  var views = {};
  var stack = [];          // [{name, params}]
  var currentView = null;
  var keyHandlers = [];    // modal/player handlers, topmost last
  var unlocked = {};       // category ids unlocked with PIN this session
  var account = { loading: false, info: null, error: null, checkedAt: 0, fromCache: false };

  /* ---------- scaling for browser preview ---------- */
  function fit() {
    var st = document.getElementById('stage');
    // On the TV the screen is always 1920x1080; the on-screen keyboard shrinks the window height,
    // so never rescale there (otherwise the whole app shrinks while typing).
    if (typeof tizen !== 'undefined') { st.style.transform = 'none'; st.style.left = '0px'; st.style.top = '0px'; return; }
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    st.style.transform = 'scale(' + s + ')';
    st.style.left = ((window.innerWidth - 1920 * s) / 2) + 'px';
    st.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2800);
  }

  /* ---------- modal ---------- */
  function modal(build, opts) {
    opts = opts || {};
    var wrap = h('div', { class: 'modal-wrap' });
    var box = h('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : '') });
    wrap.appendChild(box);
    document.getElementById('modal-layer').appendChild(wrap);
    var m = {
      el: box,
      close: function (result) {
        if (m.closed) return; m.closed = true;
        removeKeyHandler(m.onKey);
        wrap.remove();
        Focus.popLayer(wrap);
        if (opts.onClose) opts.onClose(result);
      }
    };
    m.onKey = function (e) {
      if (opts.onKey && opts.onKey(e, m)) return true;
      if (isBack(e)) { m.close(null); return true; }
      // a pop-up owns the remote: arrows/OK never reach the screen (or video player) behind it
      switch (e.keyCode) {
        case K.LEFT: Focus.move('left'); return true;
        case K.RIGHT: Focus.move('right'); return true;
        case K.UP: Focus.move('up'); return true;
        case K.DOWN: Focus.move('down'); return true;
        case K.ENTER: Focus.select(); return true;
      }
      return true;
    };
    build(box, m);
    Focus.pushLayer(wrap);
    addKeyHandler(m.onKey);
    Focus.first(wrap);
    return m;
  }
  function confirm(title, text, okLabel, cancelLabel) {
    return new Promise(function (res) {
      modal(function (box, m) {
        box.appendChild(h('h2', { text: title, dir: 'auto' }));
        if (text) box.appendChild(h('p', { text: text, dir: 'auto' }));
        var row = h('div', { class: 'btn-row' });
        row.appendChild(Focus.make(h('div', { class: 'btn primary', text: okLabel || 'OK', 'data-autofocus': '1' }), function () { m.close(true); }));
        row.appendChild(Focus.make(h('div', { class: 'btn', text: cancelLabel || 'Cancel' }), function () { m.close(false); }));
        box.appendChild(row);
      }, { onClose: function (r) { res(!!r); } });
    });
  }
  function menu(title, items, opts) {
    // items: [{label, value, checked, head, onSelect}]
    return new Promise(function (res) {
      modal(function (box, m) {
        box.appendChild(h('h2', { text: title, dir: 'auto' }));
        var list = h('div', { class: 'menu', 'data-zone': 'menu' });
        var firstChecked = null;
        items.forEach(function (it) {
          if (it.head) { list.appendChild(h('div', { class: 'menu-head', text: it.head })); return; }
          var el = h('div', { class: 'menu-item' + (it.checked ? ' checked' : '') }, [h('span', { text: it.label, dir: 'auto' }), it.value ? h('span', { class: 'v', text: it.value, dir: 'auto' }) : null]);
          Focus.make(el, function () { m.close(it); if (it.onSelect) it.onSelect(it); });
          if (it.checked && !firstChecked) { firstChecked = el; el.setAttribute('data-autofocus', '1'); }
          list.appendChild(el);
        });
        box.appendChild(list);
      }, { onClose: res, cls: opts && opts.cls });
    });
  }
  function pinPrompt(title) {
    return new Promise(function (res) {
      var entered = '';
      modal(function (box, m) {
        box.appendChild(h('h2', { text: title || 'Enter PIN' }));
        box.appendChild(h('p', { text: 'Use the number buttons on your remote or the pad below.' }));
        var dots = h('div', { class: 'pin-dots' }, [h('i'), h('i'), h('i'), h('i')]);
        box.appendChild(dots);
        var pad = h('div', { class: 'pin-pad', 'data-zone': 'pad' });
        function upd() { Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i < entered.length); }); }
        function add(d) {
          entered += d; upd();
          if (entered.length === 4) setTimeout(function () { m.close(entered); }, 150);
        }
        m.add = add;
        m.del = function () { entered = entered.slice(0, -1); upd(); };
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach(function (d, i) {
          var b = h('div', { class: 'btn', text: d });
          if (i === 0) b.setAttribute('data-autofocus', '1');
          Focus.make(b, function () { if (d === '⌫') m.del(); else if (d === '✓') m.close(entered); else add(d); });
          pad.appendChild(b);
        });
        box.appendChild(pad);
      }, {
        onKey: function (e, m) {
          if (e.keyCode >= 48 && e.keyCode <= 57) { m.add(String(e.keyCode - 48)); return true; }
          return false;
        },
        onClose: function (r) { res(r); }
      });
    });
  }
  function checkPin(title) {
    return pinPrompt(title).then(function (p) {
      if (p == null) return false;
      if (p === Store.settings().pin) return true;
      toast('Wrong PIN'); return false;
    });
  }

  /* ---------- parental lock ---------- */
  var ADULT = /(adult|xxx|18\+|\+18|porn|sex|for adults|للكبار)/i;
  function isLocked(cat) {
    if (!cat) return false;
    var locked = Store.settings().lockAdult && ADULT.test(cat.category_name || '');
    return locked && !unlocked[cat.category_id];
  }
  function unlockCategory(cat) {
    return checkPin('Locked category').then(function (ok) { if (ok) unlocked[cat.category_id] = true; return ok; });
  }

  /* ---------- key handling ---------- */
  function addKeyHandler(fn) { keyHandlers.push(fn); }
  function removeKeyHandler(fn) { var i = keyHandlers.indexOf(fn); if (i >= 0) keyHandlers.splice(i, 1); }
  function isBack(e) { return e.keyCode === K.BACK || e.keyCode === K.ESC || (e.keyCode === K.BKSP && document.activeElement.tagName !== 'INPUT'); }

  function normalize(e) {
    // browser-preview shortcuts for TV-only keys
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return e.keyCode;
    var k = e.key;
    if (k === ' ') return K.PLAYPAUSE;
    if (k === 'r') return K.RED; if (k === 'g') return K.GREEN; if (k === 'y' || k === 'f') return K.YELLOW; if (k === 'b') return K.BLUE;
    if (k === 'i') return K.INFO;
    if (e.keyCode === K.PGUP) return K.CHUP; if (e.keyCode === K.PGDN) return K.CHDN;
    return e.keyCode;
  }

  function onKeyDown(e) {
    var code = normalize(e);
    var ev = { keyCode: code, repeat: e.repeat, raw: e };
    var ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT') {
      if (code === K.DONE || code === K.CANCEL || code === K.ENTER || code === K.ESC || code === K.UP || code === K.DOWN || code === K.BACK) {
        ae.blur();
        window.scrollTo(0, 0);   // the TV keyboard can scroll the page; put it back
        if (ae._onDone) ae._onDone(ae);
        e.preventDefault();
        if (code === K.UP || code === K.DOWN) Focus.move(code === K.UP ? 'up' : 'down');
      }
      return;
    }
    e.preventDefault();
    for (var i = keyHandlers.length - 1; i >= 0; i--) { if (keyHandlers[i](ev)) return; }
    if (currentView && currentView.onKey && currentView.onKey(ev)) return;
    switch (code) {
      case K.LEFT: if (!Focus.move('left')) openSidebar(); return;
      case K.RIGHT: Focus.move('right'); return;
      case K.UP: Focus.move('up'); return;
      case K.DOWN: Focus.move('down'); return;
      case K.ENTER: Focus.select(); return;
    }
    if (isBack(ev)) back();
  }

  function registerTVKeys() {
    try {
      var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
        'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      if (tizen.tvinputdevice.registerKeyBatch) tizen.tvinputdevice.registerKeyBatch(keys);
      else keys.forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} });
    } catch (e) { /* not on a TV */ }
  }

  /* ---------- sidebar ---------- */
  var NAV = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'live', label: 'Live TV', icon: 'live' },
    { id: 'movies', label: 'Movies', icon: 'movie' },
    { id: 'series', label: 'Series', icon: 'series' },
    { id: 'favorites', label: 'My List', icon: 'heart' },
    { id: 'channel', label: 'Mdluex Channel', icon: 'yt' },
    { spacer: true },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];
  function buildSidebar() {
    var sb = document.getElementById('sidebar');
    sb.innerHTML = '';
    sb.appendChild(h('div', { class: 'logo' }, [h('div', { class: 'mark' }), h('div', { class: 'word', text: 'Mdluex IPTV' })]));
    NAV.forEach(function (n) {
      if (n.spacer) { sb.appendChild(h('div', { class: 'nav-spacer' })); sb.appendChild(profileItem()); return; }
      var el = h('div', { class: 'nav-item', data: { nav: n.id } });
      el.innerHTML = ICON[n.icon];
      el.appendChild(h('span', { text: n.label }));
      Focus.make(el, function () { closeSidebar(); go(n.id, {}, { reset: true }); }, function () { openSidebar(); });
      el._right = function () { closeSidebar(); return focusView(); };
      el._onBlur = function () { setTimeout(function () { var c = Focus.current; if (!c || !c.closest('#sidebar')) closeSidebar(); }, 0); };
      sb.appendChild(el);
    });
    updateProfile();
  }
  /* Profile circle above Settings: initials of the playlist in use; OK = switch playlist quickly. */
  function initials(name) {
    var w = String(name || '?').trim().split(/\s+/);
    return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : (w[0] || '').charAt(1) || '')).toUpperCase();
  }
  function profileItem() {
    var el = h('div', { class: 'nav-item profile', data: { nav: 'profile' } }, [h('div', { class: 'avatar' }), h('span', { class: 'pname' })]);
    Focus.make(el, function () { closeSidebar(); switchPlaylist(); }, function () { openSidebar(); });
    el._right = function () { closeSidebar(); return focusView(); };
    el._onBlur = function () { setTimeout(function () { var c = Focus.current; if (!c || !c.closest('#sidebar')) closeSidebar(); }, 0); };
    return el;
  }
  function updateProfile() {
    var el = document.querySelector('#sidebar .profile');
    if (!el) return;
    var pl = Store.active();
    el.querySelector('.avatar').textContent = pl ? initials(pl.name) : '+';
    el.querySelector('.pname').textContent = pl ? pl.name : 'Add playlist';
  }
  function switchPlaylist() {
    var list = Store.playlists(), cur = Store.active();
    if (!list.length) { if (App.playlistForm) App.playlistForm(); return; }
    var items = list.map(function (p) { return { label: p.name + (p.demo ? ' (demo)' : ''), value: p.demo ? '' : Api.normalizeServer(p.server).replace(/^https?:\/\//, ''), pl: p, checked: cur && cur.id === p.id }; });
    items.push({ label: '+ Add playlist', a: 'add' });
    items.push({ label: 'Manage playlists', a: 'manage' });
    menu('Switch playlist', items).then(function (it) {
      if (!it) return;
      if (it.a === 'add') { if (App.playlistForm) App.playlistForm(); return; }
      if (it.a === 'manage') { go('settings', {}, { reset: true }); return; }
      if (cur && it.pl.id === cur.id) return;
      usePlaylist(it.pl);
      toast('Switched to ' + it.pl.name);
      go('home', {}, { reset: true });
    });
  }

  function openSidebar() {
    var sb = document.getElementById('sidebar');
    sb.classList.add('open');
    if (!Focus.current || !Focus.current.closest('#sidebar')) {
      var act = sb.querySelector('.nav-item.active') || sb.querySelector('.nav-item');
      Focus.set(act);
    }
  }
  function closeSidebar() {
    var sb = document.getElementById('sidebar');
    sb.classList.remove('open');
    Array.prototype.forEach.call(sb.querySelectorAll('.nav-item'), function (n) { n.scrollLeft = 0; });
  }
  function setActiveNav(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (n) { n.classList.toggle('active', n.dataset.nav === id); });
  }
  function focusView() {
    var v = document.getElementById('view');
    var mem = currentView && currentView._lastFocus;
    if (mem && mem.isConnected && v.contains(mem)) return mem;
    return v.querySelector('.focusable[data-autofocus]') || v.querySelector('.focusable');
  }

  /* ---------- router ---------- */
  function go(name, params, opts) {
    opts = opts || {};
    if (currentView && Focus.current && document.getElementById('view').contains(Focus.current)) currentView._lastFocus = Focus.current;
    if (opts.reset) stack = [];
    if (!opts.replace || !stack.length) stack.push({ name: name, params: params || {} });
    else stack[stack.length - 1] = { name: name, params: params || {} };
    render(stack[stack.length - 1], opts);
  }
  function render(entry, opts) {
    var v = views[entry.name];
    if (!v) return;
    if (currentView && currentView.leave) currentView.leave();
    if (window.Preview) Preview.destroy();   // stop any banner preview from the previous screen
    currentView = Object.create(v);
    currentView.params = entry.params;
    entry.view = currentView;
    var main = document.getElementById('view');
    main.innerHTML = '';
    document.getElementById('page-title').textContent = v.title || '';
    setHints([]);
    if (v.nav) setActiveNav(v.nav);
    var p = currentView.render(main, entry.params);
    var focusIt = function () {
      if (opts && opts.restoreKey) {
        var el = main.querySelector('[data-key="' + opts.restoreKey + '"]');
        if (el) { Focus.set(el); return; }
      }
      var f = main.querySelector('.focusable[data-autofocus]') || main.querySelector('.focusable');
      if (f) Focus.set(f); else openSidebar();
    };
    if (p && p.then) p.then(focusIt, function (e) { showError(main, e); openSidebar(); }); else focusIt();
  }
  function back() {
    if (stack.length > 1) {
      if (currentView && currentView.leave) currentView.leave();
      stack.pop();
      var prev = stack[stack.length - 1];
      render(prev, { restoreKey: prev.params._restoreKey });
      return;
    }
    if (stack.length && stack[0].name !== 'home' && Store.active()) { go('home', {}, { reset: true }); return; }
    confirm('Exit Mdluex IPTV?', null, 'Exit', 'Stay').then(function (ok) {
      if (!ok) return;
      try { tizen.application.getCurrentApplication().exit(); } catch (e) { toast('Exit works on the TV'); }
    });
  }
  /* Re-render the current screen (e.g. after playback) keeping focus on the same item. */
  function refresh() {
    if (!stack.length) return;
    var cur = Focus.current, key = cur && cur.dataset && cur.dataset.key;
    render(stack[stack.length - 1], { restoreKey: key });
  }
  /* Remember which item opened the next screen, so Back returns to it. */
  function remember(key) { if (stack.length) stack[stack.length - 1].params._restoreKey = key; }

  function showError(main, e) {
    main.innerHTML = '';
    var box = h('div', { class: 'welcome' }, [
      h('h1', { text: 'Something went wrong', style: { fontSize: '52px' } }),
      h('p', { text: (e && e.message) || String(e) })
    ]);
    var row = h('div', { class: 'btn-row' });
    row.appendChild(Focus.make(h('div', { class: 'btn primary', text: 'Try again', 'data-autofocus': '1' }), function () { if (api && api.cache) api.cache = {}; render(stack[stack.length - 1], {}); }));
    row.appendChild(Focus.make(h('div', { class: 'btn', text: 'Settings' }), function () { go('settings', {}, { reset: true }); }));
    box.appendChild(row);
    main.appendChild(box);
    Focus.first(main);
  }
  function setHints(list) {
    var bar = document.getElementById('hintbar');
    bar.innerHTML = '';
    list.forEach(function (hn) {
      bar.appendChild(h('div', { class: 'hint' }, [h('span', { class: 'key ' + (hn.cls || ''), text: hn.key }), h('span', { text: hn.label })]));
    });
  }

  /* ---------- account / expiry ---------- */
  function describeAccount() {
    var a = account, ui = a.info && a.info.user_info;
    if (!ui) {
      if (a.loading) return { level: '', short: 'Checking account…' };
      return { level: 'bad', short: 'Account not checked', detail: a.error || '' };
    }
    var auth = String(ui.auth) === '1' || ui.auth === true;
    var status = ui.status || (auth ? 'Active' : 'Unknown');
    var expMs = ui.exp_date && ui.exp_date !== 'null' ? Number(ui.exp_date) * 1000 : null;
    var days = expMs ? Math.ceil((expMs - Date.now()) / 86400000) : null;
    var level = 'ok', short;
    if (!auth) { level = 'bad'; short = 'Login rejected'; }
    else if (status !== 'Active') { level = 'bad'; short = status; }
    else if (expMs && days <= 0) { level = 'bad'; short = 'Expired ' + fmtDate(expMs); }
    else if (expMs) { level = days <= 3 ? 'bad' : (days <= 10 ? 'warn' : 'ok'); short = 'Expires ' + fmtDate(expMs) + ' · ' + days + (days === 1 ? ' day' : ' days'); }
    else short = 'No expiry date (unlimited)';
    var conns = ui.max_connections != null ? (Number(ui.active_cons || 0) + '/' + ui.max_connections) : '—';
    var full = ui.max_connections != null && Number(ui.active_cons || 0) >= Number(ui.max_connections);
    return {
      level: level, short: short, auth: auth, status: status, expMs: expMs, days: days, conns: conns, full: full,
      trial: String(ui.is_trial) === '1', created: ui.created_at ? Number(ui.created_at) * 1000 : null,
      stale: a.fromCache, checkedAt: a.checkedAt, error: a.error
    };
  }
  function renderAccountChip() {
    var d = describeAccount(), chip = document.getElementById('account-chip');
    chip.className = 'chip ' + d.level;
    chip.innerHTML = '';
    chip.appendChild(h('span', { class: 'dot' }));
    chip.appendChild(h('span', { text: d.short + (d.stale ? ' (saved)' : '') }));
    chip.style.display = Store.active() ? '' : 'none';
    document.dispatchEvent(new CustomEvent('account'));
  }
  function refreshAccount() {
    if (!api) return Promise.resolve();
    account.loading = true; renderAccountChip();
    return api.account().then(function (info) {
      account = { loading: false, info: info, error: null, checkedAt: Date.now(), fromCache: false };
      if (!api.isDemo) Store.saveAccountCache(info);
      var d = describeAccount();
      if (!d.auth) toast('The server rejected your username or password', 5000);
      else if (d.level === 'bad' && d.status !== 'Active') toast('Account status: ' + d.status, 5000);
      else if (d.days != null && d.days <= 5 && d.days > 0) toast('Your subscription ends in ' + d.days + (d.days === 1 ? ' day' : ' days'), 5000);
    }).catch(function (e) {
      var cached = Store.accountCache();
      account = { loading: false, info: cached ? cached.info : null, error: e.message, checkedAt: cached ? cached.checkedAt : 0, fromCache: !!cached };
      toast(e.message + (cached ? ' – showing your last saved account info' : ''), 5000);
    }).then(renderAccountChip);
  }

  /* ---------- playlists ---------- */
  function usePlaylist(pl) {
    Store.setActive(pl.id);
    api = Api.create(pl);
    account = { loading: false, info: null, error: null, checkedAt: 0, fromCache: false };
    var cached = Store.accountCache();
    if (cached && !pl.demo) account = { loading: false, info: cached.info, error: null, checkedAt: cached.checkedAt, fromCache: true };
    unlocked = {};
    renderAccountChip();
    updateProfile();
    refreshAccount();
  }

  /* ---------- start ---------- */
  /* Older TV engines (Tizen 6 = Chrome 76) don't support flex `gap`: switch on margin fallbacks. */
  function detectFlexGap() {
    var f = document.createElement('div');
    f.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    f.appendChild(document.createElement('div'));
    f.appendChild(document.createElement('div'));
    document.body.appendChild(f);
    var ok = f.scrollHeight === 1;
    f.parentNode.removeChild(f);
    if (!ok || /[?&]oldtv=1/.test(location.search)) document.documentElement.classList.add('no-flex-gap');
  }

  function start() {
    detectFlexGap();
    fit();
    window.addEventListener('resize', fit);
    registerTVKeys();
    buildSidebar();
    document.addEventListener('keydown', onKeyDown);
    // mouse / pointer support (PC preview, TV pointer remotes)
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('.focusable');
      if (!el || !Focus.root().contains(el)) return;
      Focus.set(el, { noScroll: true });
      Focus.select();
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && App.onHide) App.onHide(); });
    function tick() { document.getElementById('clock').textContent = fmtClock(); var oc = document.querySelector('.osd-top .clock'); if (oc) oc.textContent = fmtClock(); }
    tick(); setInterval(tick, 10000);
    setInterval(function () { if (api && !document.hidden) refreshAccount(); }, 30 * 60 * 1000);
    var pl = Store.active();
    if (pl) { usePlaylist(pl); go('home', {}, { reset: true }); }
    else { renderAccountChip(); go('welcome', {}, { reset: true }); }
  }

  return {
    start: start, go: go, back: back, views: views, toast: toast, modal: modal, confirm: confirm, menu: menu,
    pinPrompt: pinPrompt, checkPin: checkPin, isLocked: isLocked, unlockCategory: unlockCategory,
    addKeyHandler: addKeyHandler, removeKeyHandler: removeKeyHandler, isBack: isBack, setHints: setHints,
    openSidebar: openSidebar, closeSidebar: closeSidebar, focusView: focusView,
    usePlaylist: usePlaylist, refreshAccount: refreshAccount, describeAccount: describeAccount, renderAccountChip: renderAccountChip,
    showError: showError, refresh: refresh, remember: remember,
    get api() { return api; },
    get account() { return account; },
    get view() { return currentView; }
  };
})();
