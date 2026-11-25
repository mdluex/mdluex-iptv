/* Mdluex IPTV Server - admin panel */
(function () {
'use strict';
// private helpers: nothing outside this file (browser tools, extensions) can override them
var $ = function (s, r) { return (r || document).querySelector(s); };
function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function api(method, url, body) {
  return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { showLogin(); throw new Error('Please sign in'); }
      return r.text().then(function (t) {
        var data; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
        if (!r.ok) throw new Error(typeof data === 'string' ? data : 'Request failed');
        return data;
      });
    });
}
var toastT;
function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2800); }
function fail(e) { toast(e.message || String(e)); }
function fmtDate(ts) { if (!ts) return 'Never'; var d = new Date(ts * 1000); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtBytes(b) { if (!b) return '0 B'; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(b) / Math.log(1024)); return (b / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + u[i]; }
function fmtDur(s) { s = Math.max(0, s | 0); var d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + 'd ' : '') + (hh ? hh + 'h ' : '') + m + 'm'; }
function img(src) { if (!src) return ''; return src.indexOf('file:') === 0 ? '' : src; }
function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copied'); }, function () { prompt('Copy this:', text); }); }

var ICON = {
  dash: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-7.6l3.3-3.3-.7-.7L12 6 8 2l-.7.7L10.6 6H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 13H3V8h18z"/></svg>',
  movie: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4z"/></svg>',
  series: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14a2 2 0 0 0 2 2h14v-2H4zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-8 12.5v-9l6 4.5z"/></svg>',
  cats: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h7v7H3zm11 0h7v7h-7zM3 13h7v7H3zm11 0h7v7h-7z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z"/></svg>',
  epg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zM7 11h5v5H7z"/></svg>',
  conn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c5-5 13-5 18 0l2-2C17 3 7 3 1 9zm8 8l3 3 3-3a4.2 4.2 0 0 0-6 0zm-4-4l2 2a7 7 0 0 1 10 0l2-2a10 10 0 0 0-14 0z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.3 7.3 0 0 0 1.7 1L11 21h4l.4-2.9a7.3 7.3 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 17l1.4-1.4-2.6-2.6H20v-2H8.8l2.6-2.6L10 7l-5 5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z"/></svg>'
};
ICON.coin = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15.9V19h-2v-1.1c-1.6-.3-2.9-1.3-3-3h1.9c.1.9.8 1.6 2.1 1.6 1.5 0 1.8-.7 1.8-1.2 0-.6-.3-1.2-2.1-1.6-2-.5-3.3-1.3-3.3-3 0-1.4 1.1-2.3 2.6-2.6V5h2v1.1c1.5.4 2.3 1.5 2.3 2.9h-1.9c0-.9-.5-1.5-1.8-1.5-1.2 0-1.6.5-1.6 1.1 0 .6.6 1 2.1 1.4 2.1.5 3.3 1.4 3.3 3.1 0 1.4-1 2.4-2.6 2.8z"/></svg>';
ICON.reseller = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h9.6a6 6 0 0 1-.6-2.6c0-1.3.4-2.4 1-3.4H12zm6.5 0-.6 1.5-1.6.2 1.2 1.1-.3 1.6 1.3-.8 1.4.8-.3-1.6 1.2-1.1-1.6-.2z"/></svg>';
ICON.pkg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-3V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM9 4h6v2H9zm11 15H4v-5h16zm0-7H4V8h16z"/></svg>';
ICON.srv = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 10h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zm3-6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';
ICON.tune = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2zM3 5v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z"/></svg>';
var PAGES = [
  ['dashboard', 'Dashboard', 'dash'], ['lines', 'Accounts', 'users'], ['connections', 'Watching now', 'conn'],
  ['live', 'Live TV', 'live'], ['movies', 'Movies', 'movie'], ['series', 'Series', 'series'], ['categories', 'Categories', 'cats'],
  ['library', 'Media folders', 'folder'], ['epg', 'TV guide', 'epg'],
  ['resellers', 'Resellers', 'reseller'], ['packages', 'Packages', 'pkg'], ['credits', 'Credit history', 'coin'],
  ['servers', 'Servers', 'srv'], ['profiles', 'Transcoding', 'tune'], ['settings', 'Settings', 'settings']
];
var RESELLER_PAGES = ['dashboard', 'lines', 'connections', 'credits'];
var me = { role: 'admin' };
function isReseller() { return me.role === 'reseller'; }
var cats = { live: [], movie: [], series: [] };
var pollTimer = null;

/* ------------------------------------------------------------------ shell */
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
$('#login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var f = e.target;
  api('POST', '/api/login', { username: f.username.value, password: f.password.value })
    .then(function () { $('#login').classList.add('hidden'); start(); })
    .catch(function (er) { $('#login-msg').textContent = er.message; $('#login-msg').className = 'note bad'; });
});
function buildSide(active) {
  var s = $('#side'); s.innerHTML = '';
  s.appendChild(h('div', { class: 'brand' }, [h('img', { src: 'logo.svg', alt: '' }), h('b', {}, ['Mdluex IPTV',
    h('small', { text: isReseller() ? 'Reseller · ' + me.username : 'Server' })])]));
  if (isReseller()) s.appendChild(h('div', { class: 'credits-box' }, [h('span', { text: 'Credits' }), h('b', { id: 'my-credits', text: String(me.credits) })]));
  PAGES.filter(function (p) { return !isReseller() || RESELLER_PAGES.indexOf(p[0]) >= 0; }).forEach(function (p) {
    var n = h('div', { class: 'nav' + (p[0] === active ? ' active' : ''), onclick: function () { location.hash = p[0]; } });
    n.innerHTML = ICON[p[2]]; n.appendChild(h('span', { text: p[1] }));
    if (p[0] === 'connections') n.appendChild(h('span', { class: 'count hidden', id: 'conn-count' }));
    s.appendChild(n);
  });
  s.appendChild(h('div', { class: 'grow' }));
  var out = h('div', { class: 'nav', onclick: function () { api('POST', '/api/logout').then(showLogin); } });
  out.innerHTML = ICON.out; out.appendChild(h('span', { text: 'Sign out' }));
  s.appendChild(out);
}
function loadCats() {
  return api('GET', '/api/categories').then(function (list) {
    cats = { live: [], movie: [], series: [] };
    list.forEach(function (c) { (cats[c.kind] = cats[c.kind] || []).push(c); });
  });
}
function catSelect(kind, value) {
  var s = h('select', { class: 'input', name: 'category_id' }, [h('option', { value: '', text: '— none —' })]);
  (cats[kind] || []).forEach(function (c) { s.appendChild(h('option', { value: c.id, text: c.name, selected: String(c.id) === String(value) })); });
  return s;
}
function route() {
  clearInterval(pollTimer);
  var page = (location.hash || '#dashboard').slice(1);
  if (!PAGES.some(function (p) { return p[0] === page; })) page = 'dashboard';
  if (isReseller() && RESELLER_PAGES.indexOf(page) < 0) page = 'dashboard';
  var main = $('#main'); main.innerHTML = '';
  api('GET', '/api/me').then(function (m) { me = m; buildSide(page); })
    .then(function () { return isReseller() ? null : loadCats(); })
    .then(function () { VIEWS[page](main); }).catch(fail);
}
function start() {
  api('GET', '/api/me').then(function (m) {
    me = m;
    $('#app').classList.remove('hidden');
    window.onhashchange = route;
    route();
    setInterval(function () {
      api('GET', '/api/connections').then(function (l) { var c = $('#conn-count'); if (c) { c.textContent = l.length; c.classList.toggle('hidden', !l.length); } }).catch(function () {});
    }, 5000);
  }).catch(function () {});
}
function top(title, tools) {
  return h('div', { class: 'top' }, [h('h1', { text: title }), h('div', { class: 'tools' }, tools || [])]);
}
function btn(label, onclick, cls, icon) {
  var b = h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: onclick });
  if (icon) b.innerHTML = ICON[icon];
  b.appendChild(document.createTextNode(label));
  return b;
}
function modal(title, body, buttons, wide) {
  var m = $('#modal'); m.innerHTML = '';
  var box = h('div', { class: 'modal' + (wide ? ' wide' : '') }, [h('h2', { text: title, dir: 'auto' }), body, h('div', { class: 'btns' }, buttons)]);
  m.appendChild(box); m.classList.remove('hidden');
  m.onclick = function (e) { if (e.target === m) closeModal(); };
  var f = box.querySelector('input,select,textarea'); if (f) f.focus();
  return box;
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
function field(label, input) { return h('label', { class: 'f' }, [h('span', { text: label }), input]); }
function inp(name, value, attrs) { return h('input', Object.assign({ class: 'input', name: name, value: value == null ? '' : value, dir: 'auto' }, attrs || {})); }
function formData(box) {
  var o = {};
  box.querySelectorAll('[name]').forEach(function (el) {
    var v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    if (el.dataset.num !== undefined) v = v === '' ? null : Number(v);
    if (el.name === 'category_id') v = v === '' ? null : Number(v);
    o[el.name] = v;
  });
  return o;
}
function chk(name, label, on) {
  return h('label', { class: 'check' }, [h('input', { type: 'checkbox', name: name, checked: !!on }), h('span', { text: label })]);
}
function confirmDo(msg, fn) { if (confirm(msg)) fn(); }

/* ------------------------------------------------------------------ views */
var VIEWS = {};

VIEWS.dashboard = function (main) {
  main.appendChild(top('Dashboard'));
  api('GET', '/api/dashboard').then(function (d) {
    if (d.reseller) {
      main.appendChild(h('div', { class: 'hero' }, [h('h2', { text: 'Welcome, ' + me.username }),
        h('p', { text: 'Create and extend your customers\' accounts from Accounts. Each package costs credits; ask the server owner to top up.' })]));
      var rs = h('div', { class: 'stats' });
      [['Credits', d.credits, 'available'], ['Your accounts', d.lines, d.lines_active + ' active'], ['Expiring this week', d.lines_expiring, 'remind them to renew'], ['Watching now', d.connections, 'of your customers']]
        .forEach(function (x) { rs.appendChild(h('div', { class: 'stat' }, [h('div', { class: 'l', text: x[0] }), h('div', { class: 'v', text: String(x[1]) }), h('div', { class: 's', text: x[2] })])); });
      main.appendChild(rs);
      main.appendChild(h('div', { class: 'btns' }, [btn('New account', function () { lineForm(); }, 'primary', 'plus')]));
      return;
    }
    var hero = h('div', { class: 'hero' }, [
      h('h2', { text: 'Your IPTV server is running' }),
      h('p', { text: 'In Mdluex IPTV (or any Xtream Codes app) add a playlist with this server address and one of your accounts:' })
    ]);
    d.server_urls.forEach(function (u) { hero.appendChild(h('span', { class: 'code', text: u, title: 'Click to copy', onclick: function () { copy(u); } })); });
    main.appendChild(hero);
    var st = h('div', { class: 'stats' });
    [['Accounts', d.lines, d.lines_active + ' active' + (d.lines_expiring ? ' · ' + d.lines_expiring + ' expiring this week' : '')],
     ['Watching now', d.connections, 'live connections'], ['Live channels', d.live, d.epg_programs + ' guide entries'],
     ['Movies', d.movies, ''], ['Series', d.series, d.episodes + ' episodes'], ['Uptime', fmtDur(d.uptime), '']]
      .forEach(function (x) { st.appendChild(h('div', { class: 'stat' }, [h('div', { class: 'l', text: x[0] }), h('div', { class: 'v', text: String(x[1]) }), h('div', { class: 's', text: x[2] })])); });
    main.appendChild(st);
    if (d.scan && (d.scan.running || d.scan.message)) {
      main.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Media scan' }), h('div', { text: d.scan.message }), d.scan.running ? h('div', { class: 'progress' }, [h('i')]) : null]));
    }
    if (d.recent_movies.length) {
      var g = h('div', { class: 'grid' });
      d.recent_movies.forEach(function (m) { g.appendChild(poster(m.title, img(m.poster) || (m.poster ? '/img/movie/' + m.id + '.jpg' : ''), m.year)); });
      main.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Recently added movies' }), g]));
    } else if (!d.movies && !d.series && !d.live) {
      main.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Get started' }),
        h('p', { text: '1. Media folders: add the folders with your movies and series, then Scan.' }),
        h('p', { text: '2. Live TV: add channels or import an M3U playlist.' }),
        h('p', { text: '3. Accounts: create an account for each viewer / TV.' }),
        h('p', { text: '4. Settings: add a free TMDB key to get posters, plots and trailers automatically.' })]));
    }
  }).catch(fail);
};

function poster(title, src, sub, onclick, off) {
  var p = h('div', { class: 'poster', onclick: onclick }, [h('div', { class: 'ph', text: title, dir: 'auto' })]);
  if (src) { var i = h('img', { src: src, loading: 'lazy', alt: '' }); i.onerror = function () { i.remove(); }; p.appendChild(i); }
  p.appendChild(h('div', { class: 'cap', dir: 'auto' }, [title, sub ? h('small', { text: String(sub) }) : null]));
  if (off) p.appendChild(h('span', { class: 'badge bad off', text: 'Hidden' }));
  return p;
}

/* accounts (lines) */
function lineStatus(l) {
  if (!l.enabled) return ['Disabled', 'muted'];
  if (l.exp_date && l.exp_date * 1000 < Date.now()) return ['Expired', 'bad'];
  if (l.exp_date && l.exp_date * 1000 - Date.now() < 7 * 864e5) return ['Expiring', 'warn'];
  return ['Active', 'ok'];
}
VIEWS.lines = function (main) {
  main.appendChild(top('Accounts', [btn('New account', function () { lineForm(); }, 'primary', 'plus')]));
  var box = h('div'); main.appendChild(box);
  api('GET', '/api/lines').then(function (list) {
    if (!list.length) { box.appendChild(h('div', { class: 'empty', text: 'No accounts yet. Create one for each viewer or TV.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['Account', 'Status', 'Expires', 'Connections', isReseller() ? 'Package' : 'Package / owner', 'Notes', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (l) {
      var s = lineStatus(l);
      var days = l.exp_date ? Math.ceil((l.exp_date * 1000 - Date.now()) / 864e5) : null;
      t.appendChild(h('tr', {}, [
        h('td', {}, [h('b', { text: l.username }), h('div', { class: 'sub mono', text: 'password: ' + l.password })]),
        h('td', {}, [h('span', { class: 'badge ' + s[1], text: s[0] }), l.is_trial ? h('span', { class: 'badge muted', text: 'Trial', style: 'margin-left:6px' }) : null]),
        h('td', {}, [fmtDate(l.exp_date), days != null && days >= 0 ? h('div', { class: 'sub', text: days + ' days left' }) : null]),
        h('td', { text: l.active_cons + ' / ' + l.max_connections }),
        h('td', {}, [l.package || '—', !isReseller() && l.owner && l.owner !== 'admin' ? h('div', { class: 'sub', text: 'by ' + l.owner }) : null]),
        h('td', { class: 'trunc', text: l.notes || '', dir: 'auto' }),
        h('td', { class: 'actions' }, [
          btn('Extend', function () { extendForm(l); }, 'small ghost'),
          btn('M3U', function () { copy(location.origin + '/get.php?username=' + encodeURIComponent(l.username) + '&password=' + encodeURIComponent(l.password) + '&type=m3u_plus&output=ts'); }, 'small ghost'),
          btn('Edit', function () { lineForm(l); }, 'small'),
          btn('Delete', function () { confirmDo('Delete account "' + l.username + '"?', function () { api('DELETE', '/api/lines/' + l.id).then(route).catch(fail); }); }, 'small danger')
        ])
      ]));
    });
    box.appendChild(t);
  }).catch(fail);
};
function packageSelect(pkgs, required) {
  var s = h('select', { class: 'input', name: 'package_id' }, required ? [] : [h('option', { value: '', text: '— set manually below —' })]);
  pkgs.forEach(function (p) {
    var label = p.name + ' · ' + (p.is_trial ? p.trial_hours + ' h trial' : p.months + (p.months === 1 ? ' month' : ' months')) + ' · ' + p.max_connections + (p.max_connections === 1 ? ' screen' : ' screens') + ' · ' + p.credits + ' credits';
    s.appendChild(h('option', { value: p.id, text: label }));
  });
  return s;
}
function extendForm(l) {
  api('GET', '/api/packages').then(function (pkgs) {
    if (!pkgs.length) { toast('Create a package first (Packages)'); return; }
    var sel = packageSelect(pkgs, true);
    var body = h('div', {}, [h('p', { text: 'Extend "' + l.username + '" (now ' + (l.exp_date ? 'until ' + fmtDate(l.exp_date) : 'no expiry') + '):' }), field('Package', sel),
      isReseller() ? h('div', { class: 'note', text: 'The package price is taken from your credits.' }) : null]);
    modal('Extend account', body, [btn('Cancel', closeModal, 'ghost'), btn('Extend', function () {
      api('POST', '/api/lines/' + l.id + '/extend', { package_id: Number(sel.value) }).then(function (r) { closeModal(); toast('Extended until ' + fmtDate(r.exp_date)); route(); }).catch(fail);
    }, 'primary')]);
  }).catch(fail);
}
function lineForm(l) {
  if (isReseller()) { resellerLineForm(l); return; }
  l = l || { max_connections: 1, enabled: 1 };
  var expVal = l.exp_date ? new Date(l.exp_date * 1000).toISOString().slice(0, 10) : '';
  var exp = h('input', { class: 'input', type: 'date', id: 'exp', value: expVal });
  var quick = h('div', { class: 'tools', style: 'display:flex;gap:8px;margin:-6px 0 14px;flex-wrap:wrap' });
  [['+1 month', 30], ['+3 months', 91], ['+6 months', 182], ['+1 year', 365], ['Never', 0]].forEach(function (q) {
    quick.appendChild(btn(q[0], function () {
      if (!q[1]) { exp.value = ''; return; }
      var base = exp.value ? new Date(exp.value) : new Date(); if (base < new Date()) base = new Date();
      base.setDate(base.getDate() + q[1]); exp.value = base.toISOString().slice(0, 10);
    }, 'small ghost'));
  });
  var body = h('div', {}, [
    h('div', { class: 'row2' }, [field('Username', inp('username', l.username, { placeholder: 'leave empty = random' })), field('Password', inp('password', l.password, { placeholder: 'leave empty = random' }))]),
    field('Expires on', exp), quick,
    field('Max connections (screens at the same time)', inp('max_connections', l.max_connections, { type: 'number', min: 1, 'data-num': '' })),
    field('Notes', inp('notes', l.notes, { placeholder: 'e.g. living room TV' })),
    chk('enabled', 'Enabled', l.enabled), chk('is_trial', 'Trial account', l.is_trial)
  ]);
  var box = modal(l.id ? 'Edit account' : 'New account', body, [
    btn('Cancel', closeModal, 'ghost'),
    btn('Save', function () {
      var d = formData(body);
      d.exp_date = exp.value ? Math.floor(new Date(exp.value + 'T23:59:59').getTime() / 1000) : null;
      delete d.undefined;
      (l.id ? api('PUT', '/api/lines/' + l.id, d) : api('POST', '/api/lines', d)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail);
    }, 'primary')
  ]);
  return box;
}

/* resellers create accounts only through packages (credits are charged) */
function resellerLineForm(l) {
  if (l && l.id) {
    var body = h('div', {}, [field('Password', inp('password', l.password)), field('Notes', inp('notes', l.notes)), chk('enabled', 'Enabled', l.enabled)]);
    modal('Edit ' + l.username, body, [btn('Cancel', closeModal, 'ghost'), btn('Save', function () {
      api('PUT', '/api/lines/' + l.id, formData(body)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail);
    }, 'primary')]);
    return;
  }
  api('GET', '/api/packages').then(function (pkgs) {
    if (!pkgs.length) { toast('No packages yet - ask the server owner'); return; }
    var body = h('div', {}, [
      h('div', { class: 'row2' }, [field('Username', inp('username', '', { placeholder: 'leave empty = random' })), field('Password', inp('password', '', { placeholder: 'leave empty = random' }))]),
      field('Package', packageSelect(pkgs, true)), field('Notes', inp('notes', '', { placeholder: 'customer name / phone' })),
      h('div', { class: 'note', text: 'You have ' + me.credits + ' credits. The package price is taken when you create the account.' })]);
    modal('New account', body, [btn('Cancel', closeModal, 'ghost'), btn('Create', function () {
      var d = formData(body); d.package_id = Number(d.package_id);
      api('POST', '/api/lines', d).then(function () { closeModal(); toast('Account created'); route(); }).catch(fail);
    }, 'primary')]);
  }).catch(fail);
}

/* connections */
VIEWS.connections = function (main) {
  main.appendChild(top('Watching now'));
  var box = h('div'); main.appendChild(box);
  function load() {
    api('GET', '/api/connections').then(function (list) {
      box.innerHTML = '';
      if (!list.length) { box.appendChild(h('div', { class: 'empty', text: 'Nobody is watching right now.' })); return; }
      var t = h('table', {}, [h('tr', {}, ['Account', 'Watching', 'Device', 'Since', 'Data', ''].map(function (x) { return h('th', { text: x }); }))]);
      list.forEach(function (c) {
        t.appendChild(h('tr', {}, [
          h('td', {}, [h('b', { text: c.username }), h('div', { class: 'sub', text: 'via ' + (c.server || 'main') })]),
          h('td', {}, [h('span', { class: 'badge muted', text: c.kind }), ' ', h('span', { text: c.title, dir: 'auto' })]),
          h('td', {}, [h('div', { class: 'mono', text: c.ip }), h('div', { class: 'sub trunc', text: c.user_agent })]),
          h('td', { text: fmtDur(Date.now() / 1000 - c.started) }),
          h('td', { text: fmtBytes(c.bytes) }),
          h('td', { class: 'actions' }, [btn('Disconnect', function () { api('DELETE', '/api/connections/' + c.id).then(load).catch(fail); }, 'small danger')])
        ]));
      });
      box.appendChild(t);
    }).catch(fail);
  }
  load(); pollTimer = setInterval(load, 3000);
};

/* live tv */
VIEWS.live = function (main) {
  main.appendChild(top('Live TV', [btn('Import M3U', importM3u, 'ghost'), btn('New channel', function () { liveForm(); }, 'primary', 'plus')]));
  var box = h('div'); main.appendChild(box);
  api('GET', '/api/live').then(function (list) {
    if (!list.length) { box.appendChild(h('div', { class: 'empty', text: 'No channels yet. Add one or import an M3U playlist.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['', 'Channel', 'Category', 'Source', 'Guide ID', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (c) {
      t.appendChild(h('tr', {}, [
        h('td', { class: 'logo-cell' }, [c.logo ? h('img', { src: c.logo, alt: '' }) : null]),
        h('td', {}, [h('b', { text: c.name, dir: 'auto' }), c.enabled ? null : h('div', { class: 'badge bad', text: 'Hidden' }),
          c.profile ? h('div', { class: 'sub', text: 'Transcoding: ' + c.profile }) : null,
          c.archive ? h('div', {}, [h('span', { class: 'badge ' + (c.recording === 'Recording' ? 'ok' : 'warn'), text: 'Catch-up ' + c.archive_days + 'd · ' + (c.recording || 'starting…') })]) : null]),
        h('td', { text: c.category || '—', dir: 'auto' }),
        h('td', { class: 'trunc mono', text: c.source_url }),
        h('td', { class: 'mono', text: c.epg_channel_id || '—' }),
        h('td', { class: 'actions' }, [btn('Edit', function () { liveForm(c); }, 'small'),
          btn('Delete', function () { confirmDo('Delete "' + c.name + '"?', function () { api('DELETE', '/api/live/' + c.id).then(route).catch(fail); }); }, 'small danger')])
      ]));
    });
    box.appendChild(t);
  }).catch(fail);
};
function liveForm(c) {
  c = c || { enabled: 1, archive_days: 3 };
  api('GET', '/api/profiles').then(function (profiles) {
    var prof = h('select', { class: 'input', name: 'profile_id' }, [h('option', { value: '', text: 'Original (no transcoding)' })]);
    profiles.forEach(function (p) { prof.appendChild(h('option', { value: p.id, text: p.name, selected: String(p.id) === String(c.profile_id) })); });
    var body = h('div', {}, [
      field('Name', inp('name', c.name)),
      field('Stream source URL (TS or HLS .m3u8)', inp('source_url', c.source_url, { placeholder: 'http://…' })),
      h('div', { class: 'row2' }, [field('Category', catSelect('live', c.category_id)), field('TV guide channel ID', inp('epg_channel_id', c.epg_channel_id, { placeholder: 'from your XMLTV guide' }))]),
      h('div', { class: 'row2' }, [field('Logo URL', inp('logo', c.logo)), field('Order', inp('sort', c.sort || 0, { type: 'number', 'data-num': '' }))]),
      field('Transcoding profile', prof),
      h('div', { class: 'row2' }, [chk('archive', 'Record for catch-up (replay past programmes)', c.archive), field('Keep recordings (days)', inp('archive_days', c.archive_days || 3, { type: 'number', min: 1, 'data-num': '' }))]),
      h('div', { class: 'note', text: 'Catch-up records the channel all the time in 5-minute pieces (needs ffmpeg and disk space: about 1-3 GB per channel per day).' }),
      chk('enabled', 'Show to viewers', c.enabled)
    ]);
    modal(c.id ? 'Edit channel' : 'New channel', body, [btn('Cancel', closeModal, 'ghost'), btn('Save', function () {
      var d = formData(body);
      d.profile_id = d.profile_id === '' ? null : Number(d.profile_id);
      (c.id ? api('PUT', '/api/live/' + c.id, d) : api('POST', '/api/live', d)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail);
    }, 'primary')]);
  }).catch(fail);
}
function importM3u() {
  var body = h('div', {}, [field('Playlist URL', inp('url', '', { placeholder: 'http://…/playlist.m3u' })), h('div', { class: 'note', text: '…or paste the playlist text:' }),
    h('textarea', { class: 'input', name: 'text', placeholder: '#EXTM3U …' }),
    h('div', { class: 'note', text: 'Channels are grouped by their group-title; tvg-id and tvg-logo are kept.' })]);
  modal('Import M3U playlist', body, [btn('Cancel', closeModal, 'ghost'), btn('Import', function () {
    api('POST', '/api/live/import', formData(body)).then(function (r) { closeModal(); toast(r.added + ' channels imported'); route(); }).catch(fail);
  }, 'primary')]);
}

/* movies */
VIEWS.movies = function (main) {
  var q = h('input', { class: 'input search', placeholder: 'Search movies…' });
  main.appendChild(top('Movies', [q, btn('Scan folders', startScan, 'primary')]));
  var box = h('div'); main.appendChild(box);
  function load() {
    api('GET', '/api/movies?q=' + encodeURIComponent(q.value)).then(function (list) {
      box.innerHTML = '';
      if (!list.length) { box.appendChild(h('div', { class: 'empty', text: q.value ? 'No movies match.' : 'No movies yet. Add a movies folder under Media folders, then scan.' })); return; }
      var g = h('div', { class: 'grid' });
      list.forEach(function (m) { g.appendChild(poster(m.title, img(m.poster) || (m.poster ? '/img/movie/' + m.id + '.jpg' : ''), [m.year, m.category].filter(Boolean).join(' · '), function () { movieForm(m); }, !m.enabled)); });
      box.appendChild(g);
    }).catch(fail);
  }
  var t; q.oninput = function () { clearTimeout(t); t = setTimeout(load, 300); };
  load();
};
function mediaFields(m, kind) {
  return [
    h('div', { class: 'row2' }, [field('Title', inp('title', m.title)), field('Year', inp('year', m.year, { type: 'number', 'data-num': '' }))]),
    h('div', { class: 'row2' }, [field('Category', catSelect(kind, m.category_id)), field('Rating (0-10)', inp('rating', m.rating, { type: 'number', step: '0.1', 'data-num': '' }))]),
    field('Plot', h('textarea', { class: 'input', name: 'plot', dir: 'auto' }, [m.plot || ''])),
    h('div', { class: 'row2' }, [field('Poster URL', inp('poster', m.poster)), field('Backdrop URL', inp('backdrop', m.backdrop))]),
    h('div', { class: 'row2' }, [field('Genre', inp('genre', m.genre)), field('YouTube trailer (video ID)', inp('trailer', m.trailer))]),
    field('Cast', inp('cast_list', m.cast_list)),
    chk('enabled', 'Show to viewers', m.enabled)
  ];
}
function movieForm(m) {
  var body = h('div', {}, [h('div', { class: 'media-head' }, [h('img', { src: img(m.poster) || (m.poster ? '/img/movie/' + m.id + '.jpg' : ''), alt: '' }),
    h('div', {}, [h('div', { class: 'mono sub', text: m.path }), h('div', { class: 'sub', text: (m.ext || '').toUpperCase() + ' · ' + fmtBytes(m.size) }),
      m.tmdb_id ? h('div', { class: 'note ok', text: 'Details from TMDB (#' + m.tmdb_id + ')' }) : h('div', { class: 'note', text: 'No TMDB details yet' })])])]
    .concat(mediaFields(m, 'movie'), [field('Director', inp('director', m.director))]));
  modal('Edit movie', body, [
    btn('Delete', function () { confirmDo('Remove "' + m.title + '" from the server? (the file stays on disk; a new scan adds it back)', function () { api('DELETE', '/api/movies/' + m.id).then(function () { closeModal(); route(); }).catch(fail); }); }, 'ghost danger left'),
    btn('Look up on TMDB again', function () { api('PUT', '/api/movies/' + m.id, formData(body)).then(function () { return api('POST', '/api/movies/' + m.id + '/refresh'); }).then(function () { closeModal(); toast('Looking up… refresh in a moment'); }).catch(fail); }, 'ghost'),
    btn('Cancel', closeModal, 'ghost'),
    btn('Save', function () { api('PUT', '/api/movies/' + m.id, formData(body)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail); }, 'primary')
  ], true);
}

/* series */
VIEWS.series = function (main) {
  var q = h('input', { class: 'input search', placeholder: 'Search series…' });
  main.appendChild(top('Series', [q, btn('Scan folders', startScan, 'primary')]));
  var box = h('div'); main.appendChild(box);
  function load() {
    api('GET', '/api/series?q=' + encodeURIComponent(q.value)).then(function (list) {
      box.innerHTML = '';
      if (!list.length) { box.appendChild(h('div', { class: 'empty', text: q.value ? 'No series match.' : 'No series yet. Add a series folder under Media folders, then scan.' })); return; }
      var g = h('div', { class: 'grid' });
      list.forEach(function (s) { g.appendChild(poster(s.title, img(s.poster) || (s.poster ? '/img/series/' + s.id + '.jpg' : ''), s.seasons + (s.seasons === 1 ? ' season · ' : ' seasons · ') + s.episodes + ' ep', function () { seriesForm(s); }, !s.enabled)); });
      box.appendChild(g);
    }).catch(fail);
  }
  var t; q.oninput = function () { clearTimeout(t); t = setTimeout(load, 300); };
  load();
};
function seriesForm(s) {
  var eps = h('div', { class: 'card', style: 'margin-top:10px' }, [h('h2', { text: 'Episodes' })]);
  var body = h('div', {}, [h('div', { class: 'media-head' }, [h('img', { src: img(s.poster) || (s.poster ? '/img/series/' + s.id + '.jpg' : ''), alt: '' }),
    h('div', {}, [h('div', { class: 'mono sub', text: s.folder }), h('div', { class: 'sub', text: s.seasons + ' seasons · ' + s.episodes + ' episodes' })])])]
    .concat(mediaFields(s, 'series'), [eps]));
  api('GET', '/api/series/' + s.id + '/episodes').then(function (list) {
    var t = h('table', {}, [h('tr', {}, ['S', 'E', 'Title', 'File'].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (e) { t.appendChild(h('tr', {}, [h('td', { text: e.season }), h('td', { text: e.episode }), h('td', { text: e.title || '—', dir: 'auto' }), h('td', { class: 'trunc mono sub', text: e.path.split(/[\\/]/).pop() })])); });
    eps.appendChild(t);
  });
  modal('Edit series', body, [
    btn('Delete', function () { confirmDo('Remove "' + s.title + '" from the server?', function () { api('DELETE', '/api/series/' + s.id).then(function () { closeModal(); route(); }).catch(fail); }); }, 'ghost danger left'),
    btn('Look up on TMDB again', function () { api('PUT', '/api/series/' + s.id, formData(body)).then(function () { return api('POST', '/api/series/' + s.id + '/refresh'); }).then(function () { closeModal(); toast('Looking up… refresh in a moment'); }).catch(fail); }, 'ghost'),
    btn('Cancel', closeModal, 'ghost'),
    btn('Save', function () { api('PUT', '/api/series/' + s.id, formData(body)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail); }, 'primary')
  ], true);
}

/* categories */
VIEWS.categories = function (main) {
  var kind = sessionStorage.getItem('catKind') || 'movie';
  main.appendChild(top('Categories', [btn('New category', function () {
    var name = prompt('Category name'); if (name) api('POST', '/api/categories', { kind: kind, name: name }).then(route).catch(fail);
  }, 'primary', 'plus')]));
  var tabs = h('div', { class: 'tabs' });
  [['live', 'Live TV'], ['movie', 'Movies'], ['series', 'Series']].forEach(function (k) {
    tabs.appendChild(h('div', { class: 'tab' + (k[0] === kind ? ' active' : ''), text: k[1], onclick: function () { sessionStorage.setItem('catKind', k[0]); route(); } }));
  });
  main.appendChild(tabs);
  var list = cats[kind] || [];
  if (!list.length) { main.appendChild(h('div', { class: 'empty', text: 'No categories yet.' })); return; }
  var t = h('table', {}, [h('tr', {}, ['Name', 'Items', 'Order', ''].map(function (x) { return h('th', { text: x }); }))]);
  list.forEach(function (c) {
    t.appendChild(h('tr', {}, [h('td', { text: c.name, dir: 'auto' }), h('td', { text: c.items }), h('td', { text: c.sort }),
      h('td', { class: 'actions' }, [
        btn('Rename', function () { var n = prompt('New name', c.name); if (n) api('PUT', '/api/categories/' + c.id, { name: n }).then(route).catch(fail); }, 'small'),
        btn('Order', function () { var n = prompt('Order number (lower shows first)', c.sort); if (n !== null) api('PUT', '/api/categories/' + c.id, { sort: Number(n) || 0 }).then(route).catch(fail); }, 'small ghost'),
        btn('Delete', function () { confirmDo('Delete category "' + c.name + '"? Its items stay, without a category.', function () { api('DELETE', '/api/categories/' + c.id).then(route).catch(fail); }); }, 'small danger')])]));
  });
  main.appendChild(t);
};

/* media folders + scan */
function startScan() { api('POST', '/api/scan').then(function (r) { toast(r.started ? 'Scan started' : 'A scan is already running'); location.hash = 'library'; route(); }).catch(fail); }
VIEWS.library = function (main) {
  main.appendChild(top('Media folders', [btn('Add folder', folderPicker, 'ghost', 'plus'), btn('Scan now', startScan, 'primary')]));
  var status = h('div', { class: 'card' }); main.appendChild(status);
  var box = h('div'); main.appendChild(box);
  function poll() {
    api('GET', '/api/scan').then(function (s) {
      status.innerHTML = '';
      status.appendChild(h('h2', { text: s.running ? 'Scanning…' : 'Library' }));
      status.appendChild(h('div', { text: s.message || 'Put movies in one folder and series in another (each series in its own folder, e.g. "Show Name/Season 1/Show.S01E01.mkv"), add them here, then press Scan now.' }));
      if (s.running) status.appendChild(h('div', { class: 'progress' }, [h('i')]));
      if (!s.running) clearInterval(pollTimer);
    }).catch(fail);
  }
  poll(); pollTimer = setInterval(poll, 1500);
  api('GET', '/api/library').then(function (list) {
    if (!list.length) { box.appendChild(h('div', { class: 'empty', text: 'No folders yet.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['Folder', 'Contains', 'Category', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (f) {
      t.appendChild(h('tr', {}, [h('td', {}, [h('div', { class: 'mono', text: f.path }), f.exists ? null : h('span', { class: 'badge bad', text: 'Folder not found' })]),
        h('td', { text: f.kind === 'movie' ? 'Movies' : 'Series' }), h('td', { text: f.category || 'Automatic' }),
        h('td', { class: 'actions' }, [btn('Remove', function () { api('DELETE', '/api/library/' + f.id).then(route).catch(fail); }, 'small danger')])]));
    });
    box.appendChild(t);
  }).catch(fail);
};
function folderPicker() {
  var kind = h('select', { class: 'input', name: 'kind' }, [h('option', { value: 'movie', text: 'Movies' }), h('option', { value: 'series', text: 'Series (one folder per show)' })]);
  var cat = h('div');
  var pathIn = inp('path', '', { placeholder: 'D:\\Movies' });
  var list = h('div', { class: 'folder-list' });
  function setCat() { cat.innerHTML = ''; cat.appendChild(field('Category for these items', catSelect(kind.value, ''))); }
  kind.onchange = setCat; setCat();
  function browse(p) {
    api('GET', '/api/browse?path=' + encodeURIComponent(p || '')).then(function (r) {
      list.innerHTML = '';
      if (r.path) pathIn.value = r.path;
      if (r.parent != null) list.appendChild(h('div', { text: '⬆  ..', onclick: function () { browse(r.parent); } }));
      r.dirs.forEach(function (d) {
        var full = r.path ? (r.path.replace(/[\\/]$/, '') + (r.path.indexOf('/') === 0 ? '/' : '\\') + d) : d;
        list.appendChild(h('div', { text: '📁  ' + d, dir: 'auto', onclick: function () { browse(full); } }));
      });
    }).catch(fail);
  }
  browse('');
  var body = h('div', {}, [field('This folder contains', kind), cat, field('Folder on the server', pathIn), list]);
  modal('Add media folder', body, [btn('Cancel', closeModal, 'ghost'), btn('Add folder', function () {
    var d = formData(body);
    api('POST', '/api/library', { path: d.path, kind: d.kind, category_id: d.category_id }).then(function () { closeModal(); toast('Folder added - press Scan now'); route(); }).catch(fail);
  }, 'primary')], true);
}

/* tv guide */
VIEWS.epg = function (main) {
  main.appendChild(top('TV guide', [btn('Update now', function () { toast('Updating guide…'); api('POST', '/api/epg/import').then(function () { toast('Guide updated'); route(); }).catch(fail); }, 'ghost'),
    btn('Add guide', function () {
      var body = h('div', {}, [field('XMLTV guide URL (.xml or .xml.gz)', inp('url', '', { placeholder: 'http://…/guide.xml.gz' })),
        h('div', { class: 'note', text: 'Then set each channel\'s "TV guide channel ID" to the matching channel id from this guide.' })]);
      modal('Add TV guide', body, [btn('Cancel', closeModal, 'ghost'), btn('Add', function () { api('POST', '/api/epg', formData(body)).then(function () { closeModal(); toast('Importing guide…'); setTimeout(route, 3000); }).catch(fail); }, 'primary')]);
    }, 'primary', 'plus')]));
  api('GET', '/api/epg').then(function (list) {
    if (!list.length) { main.appendChild(h('div', { class: 'empty', text: 'No TV guide yet. Add an XMLTV guide URL; it updates every 12 hours.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['Guide', 'Last update', 'Result', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (e) {
      t.appendChild(h('tr', {}, [h('td', { class: 'mono trunc', text: e.url }), h('td', { text: e.last_import ? new Date(e.last_import * 1000).toLocaleString() : '—' }),
        h('td', { text: e.status || '…' }), h('td', { class: 'actions' }, [btn('Remove', function () { api('DELETE', '/api/epg/' + e.id).then(route).catch(fail); }, 'small danger')])]));
    });
    main.appendChild(t);
  }).catch(fail);
};

/* packages */
VIEWS.packages = function (main) {
  main.appendChild(top('Packages', [btn('New package', function () { pkgForm(); }, 'primary', 'plus')]));
  main.appendChild(h('p', { class: 'note', text: 'Packages are the subscriptions resellers (and you) sell: duration, screens and the credit price.', style: 'margin:-10px 0 16px' }));
  api('GET', '/api/packages').then(function (list) {
    if (!list.length) { main.appendChild(h('div', { class: 'empty', text: 'No packages yet. Example: "1 Month" · 1 month · 1 screen · 1 credit.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['Package', 'Duration', 'Screens', 'Price', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (p) {
      t.appendChild(h('tr', {}, [h('td', {}, [h('b', { text: p.name }), p.enabled ? null : h('span', { class: 'badge muted', text: 'Hidden', style: 'margin-left:6px' })]),
        h('td', { text: p.is_trial ? p.trial_hours + ' hours (trial)' : p.months + (p.months === 1 ? ' month' : ' months') }),
        h('td', { text: p.max_connections }), h('td', { text: p.credits + ' credits' }),
        h('td', { class: 'actions' }, [btn('Edit', function () { pkgForm(p); }, 'small'),
          btn('Delete', function () { confirmDo('Delete package "' + p.name + '"?', function () { api('DELETE', '/api/packages/' + p.id).then(route).catch(fail); }); }, 'small danger')])]));
    });
    main.appendChild(t);
  }).catch(fail);
};
function pkgForm(p) {
  p = p || { months: 1, max_connections: 1, credits: 1, trial_hours: 24, enabled: 1 };
  var body = h('div', {}, [field('Name', inp('name', p.name, { placeholder: 'e.g. 3 Months - 2 screens' })),
    h('div', { class: 'row2' }, [field('Months', inp('months', p.months, { type: 'number', min: 0, 'data-num': '' })), field('Screens (max connections)', inp('max_connections', p.max_connections, { type: 'number', min: 1, 'data-num': '' }))]),
    h('div', { class: 'row2' }, [field('Price in credits', inp('credits', p.credits, { type: 'number', step: '0.5', min: 0, 'data-num': '' })), field('Trial length (hours)', inp('trial_hours', p.trial_hours, { type: 'number', min: 1, 'data-num': '' }))]),
    chk('is_trial', 'Trial package (uses the trial hours instead of months)', p.is_trial), chk('enabled', 'Available to resellers', p.enabled)]);
  modal(p.id ? 'Edit package' : 'New package', body, [btn('Cancel', closeModal, 'ghost'), btn('Save', function () {
    var d = formData(body);
    (p.id ? api('PUT', '/api/packages/' + p.id, d) : api('POST', '/api/packages', d)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail);
  }, 'primary')]);
}

/* resellers */
VIEWS.resellers = function (main) {
  main.appendChild(top('Resellers', [btn('New reseller', function () {
    var body = h('div', {}, [h('div', { class: 'row2' }, [field('Username', inp('username', '')), field('Password (min. 6)', inp('password', ''))]),
      field('Starting credits', inp('credits', 10, { type: 'number', 'data-num': '' })), field('Notes', inp('notes', ''))]);
    modal('New reseller', body, [btn('Cancel', closeModal, 'ghost'), btn('Create', function () {
      api('POST', '/api/resellers', formData(body)).then(function () { closeModal(); toast('Reseller created - they sign in at this same page'); route(); }).catch(fail);
    }, 'primary')]);
  }, 'primary', 'plus')]));
  main.appendChild(h('p', { class: 'note', text: 'Resellers sign in to this panel with their own login and only see their own customers. Creating or extending an account costs the package price in credits.', style: 'margin:-10px 0 16px' }));
  api('GET', '/api/resellers').then(function (list) {
    if (!list.length) { main.appendChild(h('div', { class: 'empty', text: 'No resellers yet.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['Reseller', 'Credits', 'Customers', 'Notes', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (r) {
      t.appendChild(h('tr', {}, [h('td', {}, [h('b', { text: r.username }), r.enabled ? null : h('span', { class: 'badge bad', text: 'Disabled', style: 'margin-left:6px' })]),
        h('td', {}, [h('b', { text: String(r.credits), style: 'color:var(--accent2);font-size:18px' })]),
        h('td', { text: r.accounts + ' (' + r.active + ' active)' }), h('td', { class: 'trunc', text: r.notes || '' }),
        h('td', { class: 'actions' }, [
          btn('Credits', function () {
            var body = h('div', {}, [field('Amount (use a minus sign to remove)', inp('amount', 10, { type: 'number', step: '0.5', 'data-num': '' })), field('Reason', inp('reason', '', { placeholder: 'e.g. paid 50 EGP' }))]);
            modal('Credits for ' + r.username + ' (now ' + r.credits + ')', body, [btn('Cancel', closeModal, 'ghost'), btn('Apply', function () {
              api('POST', '/api/resellers/' + r.id + '/credits', formData(body)).then(function (x) { closeModal(); toast('Balance: ' + x.credits); route(); }).catch(fail);
            }, 'primary')]);
          }, 'small ghost'),
          btn('History', function () { sessionStorage.setItem('creditsFor', r.id); location.hash = 'credits'; }, 'small ghost'),
          btn(r.enabled ? 'Disable' : 'Enable', function () { api('PUT', '/api/resellers/' + r.id, { enabled: r.enabled ? 0 : 1 }).then(route).catch(fail); }, 'small'),
          btn('Password', function () { var pw = prompt('New password for ' + r.username + ' (min. 6)'); if (pw) api('PUT', '/api/resellers/' + r.id, { password: pw }).then(function () { toast('Password changed'); }).catch(fail); }, 'small'),
          btn('Delete', function () { confirmDo('Delete reseller "' + r.username + '"? Their customers stay (owned by you).', function () { api('DELETE', '/api/resellers/' + r.id).then(route).catch(fail); }); }, 'small danger')])]));
    });
    main.appendChild(t);
  }).catch(fail);
};

/* credit history */
VIEWS.credits = function (main) {
  main.appendChild(top('Credit history'));
  var who = isReseller() ? '' : (sessionStorage.getItem('creditsFor') || '');
  sessionStorage.removeItem('creditsFor');
  api('GET', '/api/credits' + (who ? '?reseller=' + who : '')).then(function (list) {
    if (!list.length) { main.appendChild(h('div', { class: 'empty', text: 'No credit movements yet.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['When', 'Reseller', 'Change', 'Balance', 'Reason'].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (c) {
      t.appendChild(h('tr', {}, [h('td', { text: new Date(c.created * 1000).toLocaleString() }), h('td', { text: c.username }),
        h('td', {}, [h('span', { class: 'badge ' + (c.amount >= 0 ? 'ok' : 'warn'), text: (c.amount >= 0 ? '+' : '') + c.amount })]),
        h('td', { text: c.balance }), h('td', { text: c.reason, dir: 'auto' })]));
    });
    main.appendChild(t);
  }).catch(fail);
};

/* load balancer servers */
VIEWS.servers = function (main) {
  main.appendChild(top('Servers', [btn('Add server', function () {
    var body = h('div', {}, [field('Name', inp('name', '', { placeholder: 'e.g. Edge 1 - Frankfurt' })),
      field('Public address of that server (how viewers reach it)', inp('url', '', { placeholder: 'http://203.0.113.5:8080' })),
      field('Max viewers on it', inp('max_clients', 500, { type: 'number', min: 1, 'data-num': '' }))]);
    modal('Add load-balancer server', body, [btn('Cancel', closeModal, 'ghost'), btn('Add', function () {
      api('POST', '/api/servers', formData(body)).then(function () { closeModal(); route(); }).catch(fail);
    }, 'primary')]);
  }, 'primary', 'plus')]));
  main.appendChild(h('p', { class: 'note', style: 'margin:-10px 0 16px', text: 'Edge servers relay the streams so this main server does not carry all the traffic. Viewers are sent to the least-busy online edge; when none is online, this server streams itself. Movies/series files stay here and edges fetch them as needed.' }));
  function load() {
    api('GET', '/api/servers').then(function (list) {
      var box = $('#srv-box') || main.appendChild(h('div', { id: 'srv-box' }));
      box.innerHTML = '';
      if (!list.length) { box.appendChild(h('div', { class: 'empty', text: 'No edge servers. Everything streams from this server.' })); return; }
      var t = h('table', {}, [h('tr', {}, ['Server', 'Status', 'Viewers', 'Start command on that machine', ''].map(function (x) { return h('th', { text: x }); }))]);
      list.forEach(function (s) {
        var port = (s.url.match(/:(\d+)\/?$/) || [0, '8080'])[1];
        var cmd = 'mdluex-server --edge --main ' + mainAddr + ' --secret ' + s.secret + ' --port ' + port;
        t.appendChild(h('tr', {}, [h('td', {}, [h('b', { text: s.name }), h('div', { class: 'sub mono', text: s.url })]),
          h('td', {}, [h('span', { class: 'badge ' + (!s.enabled ? 'muted' : s.online ? 'ok' : 'bad'), text: !s.enabled ? 'Disabled' : s.online ? 'Online' : 'Offline' }),
            s.version ? h('div', { class: 'sub', text: 'v' + s.version }) : null]),
          h('td', { text: s.active + ' / ' + s.max_clients }),
          h('td', {}, [h('span', { class: 'code', style: 'font-size:12px;margin:0', text: cmd, title: 'Click to copy', onclick: function () { copy(cmd); } })]),
          h('td', { class: 'actions' }, [btn(s.enabled ? 'Disable' : 'Enable', function () { api('PUT', '/api/servers/' + s.id, { enabled: s.enabled ? 0 : 1 }).then(load).catch(fail); }, 'small'),
            btn('Delete', function () { confirmDo('Remove server "' + s.name + '"?', function () { api('DELETE', '/api/servers/' + s.id).then(load).catch(fail); }); }, 'small danger')])]));
      });
      box.appendChild(t);
    }).catch(fail);
  }
  // edges must reach this server by its network address, not "localhost"
  var mainAddr = location.origin;
  api('GET', '/api/dashboard').then(function (d) {
    if (/localhost|127\.0\.0\.1/.test(location.hostname) && d.server_urls && d.server_urls[0]) mainAddr = d.server_urls[0];
  }).catch(function () {}).then(function () { load(); pollTimer = setInterval(load, 5000); });
};

/* transcoding profiles */
VIEWS.profiles = function (main) {
  main.appendChild(top('Transcoding', [btn('New profile', function () { profileForm(); }, 'primary', 'plus')]));
  main.appendChild(h('p', { class: 'note', style: 'margin:-10px 0 16px', text: 'Profiles re-encode a channel with ffmpeg, e.g. a 720p low-bandwidth version. Choose a profile in the channel editor. Transcoding uses a lot of CPU per channel being watched.' }));
  api('GET', '/api/profiles').then(function (list) {
    if (!list.length) { main.appendChild(h('div', { class: 'empty', text: 'No profiles yet. Example: "720p 2.5 Mbps" · H.264 · 720 · 2500k · AAC 128k.' })); return; }
    var t = h('table', {}, [h('tr', {}, ['Profile', 'Video', 'Audio', 'Channels', ''].map(function (x) { return h('th', { text: x }); }))]);
    list.forEach(function (p) {
      t.appendChild(h('tr', {}, [h('td', {}, [h('b', { text: p.name })]),
        h('td', { text: p.video === 'copy' ? 'Original' : 'H.264 ' + (p.resolution || '') + ' ' + (p.video_bitrate || '') + ' (' + p.preset + ')' }),
        h('td', { text: p.audio === 'copy' ? 'Original' : 'AAC ' + p.audio_bitrate }), h('td', { text: p.channels }),
        h('td', { class: 'actions' }, [btn('Edit', function () { profileForm(p); }, 'small'),
          btn('Delete', function () { confirmDo('Delete profile "' + p.name + '"?', function () { api('DELETE', '/api/profiles/' + p.id).then(route).catch(fail); }); }, 'small danger')])]));
    });
    main.appendChild(t);
  }).catch(fail);
};
function profileForm(p) {
  p = p || { video: 'h264', resolution: '720', video_bitrate: '2500k', preset: 'veryfast', audio: 'aac', audio_bitrate: '128k', extra: '' };
  function sel(name, opts, v) { var s = h('select', { class: 'input', name: name }); opts.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === v })); }); return s; }
  var body = h('div', {}, [field('Name', inp('name', p.name, { placeholder: 'e.g. 720p 2.5 Mbps' })),
    h('div', { class: 'row2' }, [field('Video', sel('video', [['h264', 'Re-encode to H.264'], ['copy', 'Keep original']], p.video)),
      field('Speed / quality', sel('preset', [['ultrafast', 'Ultrafast (least CPU)'], ['veryfast', 'Very fast'], ['fast', 'Fast'], ['medium', 'Medium (best quality)']], p.preset))]),
    h('div', { class: 'row2' }, [field('Resolution (height like 720, or 1280x720)', inp('resolution', p.resolution)), field('Video bitrate', inp('video_bitrate', p.video_bitrate, { placeholder: '2500k' }))]),
    h('div', { class: 'row2' }, [field('Audio', sel('audio', [['aac', 'Re-encode to AAC'], ['copy', 'Keep original']], p.audio)), field('Audio bitrate', inp('audio_bitrate', p.audio_bitrate))]),
    field('Extra ffmpeg options (advanced)', inp('extra', p.extra, { placeholder: 'e.g. -r 25' }))]);
  modal(p.id ? 'Edit profile' : 'New transcoding profile', body, [btn('Cancel', closeModal, 'ghost'), btn('Save', function () {
    var d = formData(body);
    (p.id ? api('PUT', '/api/profiles/' + p.id, d) : api('POST', '/api/profiles', d)).then(function () { closeModal(); toast('Saved'); route(); }).catch(fail);
  }, 'primary')]);
}

/* settings */
VIEWS.settings = function (main) {
  main.appendChild(top('Settings'));
  api('GET', '/api/settings').then(function (s) {
    var body = h('div', {}, [
      h('div', { class: 'row2' }, [field('Server name', inp('server_name', s.server_name)), field('Port (restart the server after changing)', inp('port', s.port))]),
      field('Message shown to viewers (optional)', inp('welcome', s.welcome)),
      h('div', { class: 'row2' }, [field('TMDB API key (free at themoviedb.org) - posters, plots, trailers', inp('tmdb_key', s.tmdb_key, { placeholder: 'v3 API key' })),
        field('TMDB language', inp('tmdb_lang', s.tmdb_lang, { placeholder: 'en-US, ar-EG, …' }))]),
      h('div', { class: 'note', text: 'Data folder: ' + s.data_dir }),
      h('div', { class: 'note ' + (s.ffmpeg ? 'ok' : 'bad'), text: s.ffmpeg ? 'ffmpeg found - HLS channels can be served as TS.' : 'ffmpeg not found - install it to relay HLS channels as TS.' })
    ]);
    main.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Server' }), body, h('div', { class: 'btns', style: 'margin-top:8px' }, [btn('Save settings', function () {
      api('PUT', '/api/settings', formData(body)).then(function () { toast('Saved'); }).catch(fail);
    }, 'primary')])]));
    var pw = h('div', {}, [h('div', { class: 'row2' }, [field('Current password', inp('old', '', { type: 'password' })), field('New password', inp('new', '', { type: 'password' }))])]);
    main.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Admin password' }), pw, btn('Change password', function () {
      api('POST', '/api/password', formData(pw)).then(function () { toast('Password changed'); route(); }).catch(fail);
    }, 'primary')]));
  }).catch(fail);
};

start();
})();
