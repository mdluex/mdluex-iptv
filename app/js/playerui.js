/* Full-screen player: OSD, seeking, resume saving, live zapping, tracks, sleep timer, next episode, YouTube. */
var PlayerUI = (function () {
  var layer = null, osd = null, S = null;   // S = current session
  var hideTimer, saveTimer, seekTimer, zapTimer, sleepTimer, nextTimer;
  var lastSave = 0;

  function $(id) { return document.getElementById(id); }

  /* ---------- session lifecycle ---------- */
  function begin(session) {
    if (S) teardown(false);
    if (window.Preview) Preview.suspend(true);   // no banner preview may start behind the player
    S = session;
    S.seekPending = null; S.seekReps = 0; S.aspect = 'fit';
    layer = $('player-layer'); osd = $('osd');
    layer.classList.remove('hidden');
    $('subtitle-box').textContent = '';
    if (!Focus.hasLayer() || Focus.root() !== layer) Focus.pushLayer(layer);
    App.addKeyHandler(onKey);
    App.onHide = function () { save(true); if (S && S.kind !== 'yt') Player.pause(); };
  }
  function teardown(refresh) {
    if (!S) return;
    save(true);
    clearTimeout(hideTimer); clearTimeout(seekTimer); clearTimeout(zapTimer); clearInterval(nextTimer);
    if (S.kind === 'yt') stopYouTube(); else Player.stop();
    App.removeKeyHandler(onKey);
    S = null;
    osd.innerHTML = '';
    layer.classList.add('hidden');
    Focus.popLayer(layer);
    App.onHide = null;
    if (window.Preview) Preview.suspend(false);
    if (refresh) App.refresh();
  }
  function exit() { clearTimeout(sleepTimer); sleepTimer = null; teardown(true); }

  /* ---------- touch: on-screen buttons over the video (touchscreens only) ---------- */
  var TOUCH_ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial" font-weight="700">10</text></svg>',
    fwd10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.6"/><path d="M20 4v4.6h-4.6"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial" font-weight="700">10</text></svg>',
    playpause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4v16l8-8zM14 5h3v14h-3zm5 0h3v14h-3z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    chup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
    chdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    fav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>'
  };
  /* episode buttons and panel: drawn icons (the emoji look different on every TV) */
  var EP_ICON = {
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.4v14H6zM20 5v14L9.6 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 5H18v14h-2.4zM4 5l10.4 7L4 19z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function touchControls(list) {
    var box = h('div', { class: 'touch-ctl' });
    list.forEach(function (x) {
      var b = h('div', { class: 'tbtn t-' + x[0], html: TOUCH_ICON[x[0]] });
      Focus.make(b, function () { x[1](); if (S) showOsd(); });
      box.appendChild(b);
    });
    return box;
  }
  // a tap on the video (not on a button) shows or hides the controls
  if (Platform.touch) document.addEventListener('click', function (e) {
    if (!S || !layer || layer.classList.contains('hidden') || !layer.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.focusable, .osd-bar, .zap-list, .ep-panel')) return;
    if (S.epPanel) { closeEpPanel(); return; }   // a tap beside the episode list closes it
    if (osd.classList.contains('off')) showOsd(); else if (!S.paused()) osd.classList.add('off');
  });

  /* ---------- progress saving (resume) ---------- */
  function curTime() { return S.kind === 'yt' ? ytTime() : Player.time(); }
  function curDur() { return S.kind === 'yt' ? ytDuration() : (Player.duration() || S.durationHint || 0); }
  function save(force) {
    if (!S || !S.key || S.kind === 'live') return;
    var now = Date.now();
    if (!force && now - lastSave < 5000) return;
    var pos = curTime(), dur = curDur();
    if (!dur || pos < 1000) return;
    lastSave = now;
    var data = Object.assign({ pos: pos, dur: dur, done: pos / dur > 0.92 }, S.meta);
    Store.saveProgress(S.key, data);
  }
  function markDone() { if (S && S.key) Store.saveProgress(S.key, Object.assign({ pos: curDur(), dur: curDur(), done: true }, S.meta)); }

  /* ---------- OSD ---------- */
  function showOsd(ms) {
    if (!S) return;
    osd.classList.remove('off');
    clearTimeout(hideTimer);
    if (ms !== 0) hideTimer = setTimeout(function () {
      if (S && !S.paused() && S.seekPending == null && !S.blocking) osd.classList.add('off');
    }, ms || 4000);
  }
  function buildVodOsd() {
    osd.innerHTML = '';
    var top = h('div', { class: 'osd-top' }, [
      h('div', {}, [h('div', { class: 't', text: S.title, dir: 'auto' }), S.sub ? h('div', { class: 's', text: S.sub, dir: 'auto' }) : null]),
      h('div', { class: 'clock', text: fmtClock() })]);
    var fill = h('div', { class: 'fill' }), knob = h('div', { class: 'knob' }), tip = h('div', { class: 'seek-tip hidden' });
    var bar = h('div', { class: 'osd-bar' }, [fill, knob, tip]);
    var tCur = h('span'), tLeft = h('span');
    var hints = h('div', { class: 'osd-hints' });
    var list = [['OK', 'Play / Pause'], ['◀ ▶', 'Seek'], ['▲', 'Audio · Subtitles · More'], ['BACK', 'Exit']];
    if (S.kind === 'episode') { list.splice(3, 0, ['▼', 'Episodes']); if (Platform.colorKeys) list.splice(4, 0, ['CH ▲▼', 'Next / previous episode']); }
    list.forEach(function (x) { hints.appendChild(h('div', { class: 'hint' }, [h('span', { class: 'key', text: x[0] }), h('span', { text: T(x[1]) })])); });
    var bottom = h('div', { class: 'osd-bottom' }, [bar, h('div', { class: 'osd-times' }, [tCur, tLeft]), hints]);
    /* episodes: [Previous] [All episodes] [Next] (▼ to reach them). From Kerolosashraf7 (issue #3). */
    S.epBtns = null; S.epSel = null;
    if (S.kind === 'episode') {
      var epLabel = function (x) { return T('S{0}:E{1}', x.season, x.ep.episode_num || '') + (x.ep.title ? ' · ' + x.ep.title : ''); };
      var mk = function (which, x, action) {
        var b = h('div', { class: 'ep-btn ' + which + (x ? '' : ' disabled') }, [
          h('span', { class: 'ico', html: EP_ICON[which] }),
          h('span', { class: 'txt' }, [h('span', { class: 'lab', text: T(which === 'prev' ? 'Previous episode' : 'Next episode') }),
            h('span', { class: 'name', text: x ? epLabel(x) : T('None'), dir: 'auto' })])]);
        if (x) Focus.make(b, action);   // tappable on touchscreens
        return b;
      };
      var listBtn = Focus.make(h('div', { class: 'ep-btn list' }, [h('span', { class: 'ico', html: EP_ICON.list }),
        h('span', { class: 'txt' }, [h('span', { class: 'lab', text: T('All episodes') }), h('span', { class: 'name', text: T('Season {0}', (S.meta && S.meta.season) || '') })])]),
        function () { openEpPanel(); });
      S.epBtns = { prev: mk('prev', S.prevEp, function () { playPrev(); }), list: listBtn, next: mk('next', S.nextEp, function () { playNext(); }) };
      bottom.appendChild(h('div', { class: 'osd-eps' }, [S.epBtns.prev, S.epBtns.list, S.epBtns.next]));
    }
    var center = h('div', { class: 'osd-center hidden' });
    osd.appendChild(top); osd.appendChild(center); osd.appendChild(bottom);
    if (Platform.touch) {
      hints.style.display = 'none';
      osd.appendChild(touchControls([['close', exit], ['back10', function () { jump(-10000); }], ['playpause', togglePause], ['fwd10', function () { jump(10000); }], ['more', optionsMenu]]));
      bar.addEventListener('click', function (e) {   // tap the timeline to jump there
        var r = bar.getBoundingClientRect(), d = curDur();
        if (d && r.width) { seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d); showOsd(); }
      });
      /* drag along the timeline: the time follows the finger, the jump happens on release */
      var dragAt = function (e) {
        var t = e.touches[0] || e.changedTouches[0], r = bar.getBoundingClientRect(), d = curDur();
        if (!t || !d || !r.width) return;
        S.seekPending = Math.max(0, Math.min(1, (t.clientX - r.left) / r.width)) * d;
        updateBar(); showOsd(0);
      };
      bar.addEventListener('touchstart', dragAt, { passive: true });
      bar.addEventListener('touchmove', function (e) { e.preventDefault(); dragAt(e); }, { passive: false });
      bar.addEventListener('touchend', function (e) {
        if (S.seekPending == null) return;
        e.preventDefault();   // no extra click: this jump is the one
        var to = S.seekPending; S.seekPending = null; seekTo(to); showOsd();
      });
    }
    S.ui = { fill: fill, knob: knob, tip: tip, tCur: tCur, tLeft: tLeft, center: center };
    updateBar();
  }
  function updateBar() {
    if (!S || !S.ui || !S.ui.fill) return;
    var dur = curDur(), t = S.seekPending != null ? S.seekPending : curTime();
    var pct = dur ? Math.min(100, t / dur * 100) : 0;
    S.ui.fill.style.width = pct + '%'; S.ui.knob.style.left = pct + '%';
    S.ui.tCur.textContent = fmtTime(t);
    S.ui.tLeft.textContent = dur ? '-' + fmtTime(dur - t) : '';
    if (S.seekPending != null) { S.ui.tip.classList.remove('hidden'); S.ui.tip.style.left = pct + '%'; S.ui.tip.textContent = fmtTime(t); }
    else S.ui.tip.classList.add('hidden');
  }
  function flashCenter(icon) {
    if (!S.ui || !S.ui.center) return;
    S.ui.center.innerHTML = ICON[icon];
    S.ui.center.classList.remove('hidden');
    clearTimeout(S.ui.cTimer);
    S.ui.cTimer = setTimeout(function () { if (S && S.ui && !S.paused()) S.ui.center.classList.add('hidden'); }, 800);
  }

  function buildLiveOsd(epg) {
    osd.innerHTML = '';
    var ch = S.channel;
    var info = h('div', {}, [h('div', { class: 't', dir: 'auto' }, [ch.name, h('span', { class: 'live-badge', text: T('LIVE') })])]);
    var now = epg && epg[0], next = epg && epg[1];
    if (now) info.appendChild(h('div', { class: 'now', text: T('Now: {0}', now.title), dir: 'auto' }));
    if (next) info.appendChild(h('div', { class: 'next', text: T('{0}  Next: {1}', fmtClock(new Date(next.start)), next.title), dir: 'auto' }));
    var top = h('div', { class: 'osd-top' }, [h('div'), h('div', { class: 'clock', text: fmtClock() })]);
    var row = h('div', { class: 'osd-live' }, [
      h('div', { class: 'num', text: ch.num ? String(ch.num) : '' }),
      h('div', { class: 'logo', style: { backgroundImage: ch.icon ? 'url("' + ch.icon + '")' : 'none' } }), info]);
    var bottom = h('div', { class: 'osd-bottom' }, [row]);
    if (now && now.end > now.start) bottom.appendChild(h('div', { class: 'bar', style: { marginTop: '20px' } }, [h('i', { style: { width: Math.min(100, (Date.now() - now.start) / (now.end - now.start) * 100) + '%' } })]));
    var hints = h('div', { class: 'osd-hints' });
    [['▲ ▼', 'Change channel'], ['◀', 'Channel list'], ['OK', 'Info'], Platform.colorKeys ? ['Y', 'Favorite'] : [Platform.menuKey, 'Options'], ['BACK', 'Exit']].forEach(function (x) {
      hints.appendChild(h('div', { class: 'hint' }, [h('span', { class: 'key', text: x[0] }), h('span', { text: T(x[1]) })]));
    });
    bottom.appendChild(hints);
    osd.appendChild(top); osd.appendChild(bottom);
    if (Platform.touch) {
      hints.style.display = 'none';
      osd.appendChild(touchControls([['close', exit], ['chup', function () { zap(-1); }], ['playpause', function () { Player.toggle(); }], ['chdown', function () { zap(1); }], ['list', openZap], ['fav', toggleLiveFav]]));
    }
    S.ui = {};
  }

  /* ---------- player callbacks ---------- */
  function wire() {
    Player.on({
      buffering: function (on) { $('player-spinner').classList.toggle('hidden', !on); },
      ready: function () { $('player-spinner').classList.add('hidden'); if (S) { S.retried = false; applyPrefs(); } },
      time: function () { if (!S) return; updateBar(); save(false); maybeShowNextUp(); },
      end: function () { onEnded(); },
      error: function (msg) { onError(msg); },
      subtitle: function (t) { $('subtitle-box').textContent = t || ''; },
      toast: App.toast
    });
  }
  function onError(msg) {
    if (!S) return;
    $('player-spinner').classList.add('hidden');
    if (S.kind === 'live' && !S.retried) { S.retried = true; App.toast('Reconnecting…'); setTimeout(function () { if (S) startStream(); }, 1500); return; }
    S.blocking = true;
    var box = h('div', { class: 'err-box' }, [h('h2', { text: T('Playback problem') }), h('p', { text: msg })]);
    var row = h('div', { class: 'btn-row', style: { justifyContent: 'center' } });
    row.appendChild(Focus.make(h('div', { class: 'btn primary', text: T('Try again'), 'data-autofocus': '1' }), function () { box.remove(); S.blocking = false; S.retried = false; startStream(curTime()); }));
    if (S.kind === 'live') row.appendChild(Focus.make(h('div', { class: 'btn', text: T('Switch to {0}', Store.settings().liveFormat === 'ts' ? 'HLS' : 'TS') }), function () {
      Store.setSetting('liveFormat', Store.settings().liveFormat === 'ts' ? 'm3u8' : 'ts'); box.remove(); S.blocking = false; startStream();
    }));
    if (S.kind === 'yt') row.appendChild(Focus.make(h('div', { class: 'btn', text: T('Open in YouTube app') }), function () { var id = S.video.id; exit(); Channel.openInYouTubeApp(id); }));
    row.appendChild(Focus.make(h('div', { class: 'btn', text: T('Exit') }), exit));
    box.appendChild(row);
    osd.appendChild(box);
    showOsd(0);
    Focus.first(box);
  }
  function onEnded() {
    if (!S) return;
    if (S.kind === 'live') { onError('The channel stopped.'); return; }
    markDone();
    if (S.kind === 'episode' && S.nextEp && Store.settings().autoNext) { showNextUp(true); return; }
    exit();
  }

  /* ---------- next episode ---------- */
  function maybeShowNextUp() {
    if (!S || S.kind !== 'episode' || !S.nextEp || S.nextShown) return;
    var d = curDur(), t = curTime();
    if (d > 60000 && d - t < 25000) showNextUp(false);
  }
  function showNextUp(ended) {
    if (!S || S.nextShown === 'ended') return;
    S.nextShown = ended ? 'ended' : 'soon';
    var old = osd.querySelector('.next-up'); if (old) old.remove();
    var n = S.nextEp, left = 10;
    var lab = h('div', { class: 'l', text: ended ? T('Next episode in {0}s', left) : T('Up next') });
    var box = h('div', { class: 'next-up' }, [lab, h('div', { class: 't', text: T('S{0}:E{1}', n.season, n.ep.episode_num || '') + ' · ' + (n.ep.title || ''), dir: 'auto' })]);
    var row = h('div', { class: 'btn-row' });
    var playNow = Focus.make(h('div', { class: 'btn primary small', text: T('Play next') }), function () { playNext(); });
    row.appendChild(playNow);
    row.appendChild(Focus.make(h('div', { class: 'btn small', text: ended ? 'Exit' : 'Hide' }), function () { clearInterval(nextTimer); box.remove(); if (ended) exit(); }));
    box.appendChild(row);
    osd.appendChild(box);
    showOsd(0);
    Focus.set(playNow);
    clearInterval(nextTimer);
    if (ended) nextTimer = setInterval(function () {
      left--; lab.textContent = T('Next episode in {0}s', left);
      if (left <= 0) { clearInterval(nextTimer); playNext(); }
    }, 1000);
  }
  /* switching episodes resumes where you stopped (same rule as Resume / Continue Watching) */
  function resumeAt(ep) { var p = Store.progress('episode:' + ep.id); return Store.inProgress(p) ? p.pos : 0; }
  /* the season's episodes in a panel on the right, while the video keeps playing (Kerolosashraf7, issue #3) */
  function seasonsOf() { var eps = (S.ctx && S.ctx.info && S.ctx.info.episodes) || {}; return Object.keys(eps).sort(function (a, b) { return a - b; }); }
  function epDuration(e) {
    var i = e.info || {}, s = Number(i.duration_secs) || 0;
    if (!s && i.duration) { var p = String(i.duration).split(':').map(Number); s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0; }
    return s ? T('{0} min', Math.round(s / 60)) : '';
  }
  function renderEpPanel(season) {
    var box = S.epPanel, seasons = seasonsOf(), list = (S.ctx.info.episodes || {})[season] || [];
    box.season = season;
    box.innerHTML = '';
    var si = seasons.indexOf(String(season));
    box.appendChild(h('div', { class: 'ep-panel-head' }, [
      h('div', { class: 'series', text: S.title, dir: 'auto' }),
      h('div', { class: 'season' }, [seasonArrow(I18N.rtl ? 'right' : 'left', si - 1), h('span', { text: T('Season {0}', season) }), seasonArrow(I18N.rtl ? 'left' : 'right', si + 1)])]));
    function seasonArrow(txt, to) {   // tappable on touchscreens
      var a = h('span', { class: 'arr' + (to >= 0 && to < seasons.length ? '' : ' off'), html: EP_ICON[txt] });
      if (to >= 0 && to < seasons.length) a.addEventListener('click', function (ev) { ev.stopPropagation(); renderEpPanel(seasons[to]); });
      return a;
    }
    if (Platform.touch) box.appendChild(Focus.make(h('div', { class: 'ep-close', html: EP_ICON.close }), function () { closeEpPanel(); }));
    var inner = h('div', { class: 'inner', 'data-zone': 'eplist' }), curEl = null;
    list.forEach(function (e) {
      var p = Store.progress('episode:' + e.id), isCur = S.meta && String(S.meta.id) === String(e.id);
      var state = isCur ? h('span', { class: 'st now', text: '▶ ' + T('Playing') })
        : Store.isWatched(p) ? h('span', { class: 'st done', text: '✓' })
        : Store.inProgress(p) ? h('span', { class: 'st prog' }, [h('i', { style: { width: Math.round(p.pos / p.dur * 100) + '%' } })]) : null;
      var el = h('div', { class: 'ep-row' + (isCur ? ' current' : '') }, [
        h('span', { class: 'n', text: T('E{0}', e.episode_num || '') }),
        h('span', { class: 't', text: e.title || T('Episode {0}', e.episode_num || ''), dir: 'auto' }),
        h('span', { class: 'd', text: epDuration(e) }), state]);
      Focus.make(el, function () {
        if (isCur) { closeEpPanel(); return; }
        clearInterval(nextTimer); save(true);
        var ctx = S.ctx;
        playEpisode({ series: ctx.series, info: ctx.info, season: season, epId: e.id, backdrop: ctx.backdrop }, resumeAt(e));
      });
      if (isCur) curEl = el;
      inner.appendChild(el);
    });
    if (!list.length) inner.appendChild(h('div', { class: 'note', text: T('No episodes in this season.') }));
    box.appendChild(inner);
    box.appendChild(h('div', { class: 'ep-panel-hints', text: T('▲▼ Move   OK Play') + (seasons.length > 1 ? '   ' + T('◀▶ Season') : '') + '   ' + T('BACK Close') }));
    var first = inner.querySelector('.focusable');
    if (curEl || first) Focus.set(curEl || first);
  }
  function openEpPanel() {
    if (!S || S.kind !== 'episode' || !S.ctx || !S.ctx.info) return;
    closeEpPanel(true);
    S.epPanel = h('div', { class: 'ep-panel' });
    osd.appendChild(S.epPanel);
    showOsd(0);
    renderEpPanel(String((S.meta && S.meta.season) || seasonsOf()[0]));
  }
  function closeEpPanel(quiet) {
    if (!S || !S.epPanel) return;
    if (S.epPanel.parentNode) S.epPanel.parentNode.removeChild(S.epPanel);
    S.epPanel = null;
    if (!quiet) showOsd();
  }
  function epPanelKey(c) {
    if (c === K.UP || c === K.DOWN) { Focus.move(c === K.UP ? 'up' : 'down'); return true; }
    if (c === K.ENTER) { Focus.select(); return true; }
    if (c === K.LEFT || c === K.RIGHT) {
      var fwd = I18N.rtl ? K.LEFT : K.RIGHT;
      var ss = seasonsOf(), i = ss.indexOf(String(S.epPanel.season)) + (c === fwd ? 1 : -1);
      if (i >= 0 && i < ss.length) renderEpPanel(ss[i]);
      return true;
    }
    return true;
  }
  function playPrev() {
    if (!S || !S.prevEp) return;
    clearInterval(nextTimer);
    save(true);
    var ctx = S.ctx, p = S.prevEp;
    playEpisode({ series: ctx.series, info: ctx.info, season: p.season, epId: p.ep.id, backdrop: ctx.backdrop }, resumeAt(p.ep));
  }
  function epMode(sel) {
    if (!S || !S.epBtns) return;
    S.epSel = sel;
    ['prev', 'list', 'next'].forEach(function (w) { S.epBtns[w].classList.toggle('sel', sel === w); });
    if (sel) showOsd(0); else showOsd();
  }
  function epKey(c) {
    var order = ['prev', 'list', 'next'].filter(function (w) { return w === 'list' || (w === 'prev' ? S.prevEp : S.nextEp); });
    var at = order.indexOf(S.epSel);
    if (I18N.rtl && (c === K.LEFT || c === K.RIGHT)) c = c === K.LEFT ? K.RIGHT : K.LEFT;   // the row runs right-to-left in Arabic
    if (c === K.LEFT && at > 0) epMode(order[at - 1]);
    else if (c === K.RIGHT && at < order.length - 1) epMode(order[at + 1]);
    else if (c === K.ENTER) { var w = S.epSel; epMode(null); if (w === 'prev') playPrev(); else if (w === 'next') playNext(); else openEpPanel(); }
    else if (c === K.UP) epMode(null);
    return true;
  }
  function playNext() {
    if (!S || !S.nextEp) return;
    clearInterval(nextTimer);
    if (!S.nextShown || S.nextShown === 'soon') markDone();
    var ctx = S.ctx, n = S.nextEp;
    playEpisode({ series: ctx.series, info: ctx.info, season: n.season, epId: n.ep.id, backdrop: ctx.backdrop }, resumeAt(n.ep));
  }

  /* ---------- keys ---------- */
  function onKey(e) {
    if (!S) return false;
    var c = e.keyCode;
    // let buttons inside the player (error box, next-up) take OK / arrows
    var cur = Focus.current;
    var inBox = cur && layer.contains(cur) && (cur.closest('.err-box') || cur.closest('.next-up'));
    if (inBox && (c === K.ENTER || c === K.LEFT || c === K.RIGHT)) {
      if (c === K.ENTER) Focus.select(); else Focus.move(c === K.LEFT ? 'left' : 'right');
      showOsd(0);
      return true;
    }
    if (S.blocking && !App.isBack(e)) return true;
    if (S.epPanel && App.isBack(e)) { closeEpPanel(); return true; }
    if (S.epSel && App.isBack(e)) { epMode(null); return true; }
    if (App.isBack(e) || c === K.STOP) {
      if (S.zapOpen) { closeZap(); return true; }
      exit(); return true;
    }
    return S.kind === 'live' ? liveKey(e) : vodKey(e);
  }
  function vodKey(e) {
    var c = e.keyCode;
    if (S.epPanel) return epPanelKey(c);
    if (S.epSel) return epKey(c);
    switch (c) {
      case K.ENTER: case K.PLAYPAUSE: togglePause(); return true;
      case K.PLAY: if (S.paused()) togglePause(); return true;
      case K.PAUSE: if (!S.paused()) togglePause(); return true;
      case K.LEFT: case K.RIGHT: stepSeek(c === K.RIGHT ? 1 : -1, e.repeat); return true;
      case K.FF: case K.RW: jump(c === K.FF ? 30000 : -30000); return true;
      case K.UP: case K.INFO: optionsMenu(); return true;
      case K.DOWN: if (S.epBtns) epMode(S.nextEp ? 'next' : 'list'); else showOsd(); return true;
      case K.CHUP: if (S.nextEp) playNext(); return true;
      case K.CHDN: if (S.prevEp) playPrev(); return true;
      case K.GREEN: if (S.prevEp) playPrev(); return true;
      case K.RED: seekTo(0); App.toast('Restarted from the beginning'); return true;
      case K.BLUE: if (S.nextEp) playNext(); return true;
    }
    return true;
  }
  function togglePause() {
    if (S.kind === 'yt') ytToggle(); else Player.toggle();
    var paused = S.paused();
    if (S.ui && S.ui.center) { S.ui.center.innerHTML = ICON[paused ? 'pause' : 'play']; S.ui.center.classList.toggle('hidden', !paused); if (!paused) flashCenter('play'); }
    showOsd(paused ? 0 : 3000);
    save(true);
  }
  function stepSeek(dir, repeat) {
    if (S.seekPending == null) { S.seekPending = curTime(); S.seekReps = 0; }
    S.seekReps = repeat ? S.seekReps + 1 : Math.max(0, S.seekReps - 1) + 1;
    var step = S.seekReps > 12 ? 120000 : S.seekReps > 5 ? 30000 : 10000;
    var d = curDur();
    S.seekPending = Math.max(0, Math.min(d ? d - 3000 : Infinity, S.seekPending + dir * step));
    updateBar(); showOsd(0);
    clearTimeout(seekTimer);
    seekTimer = setTimeout(function () {
      if (!S) return;
      seekTo(S.seekPending); S.seekPending = null; S.seekReps = 0; updateBar(); showOsd();
    }, 800);
  }
  function jump(ms) { seekTo(Math.max(0, curTime() + ms)); flashCenter(ms > 0 ? 'play' : 'restart'); showOsd(); }
  function seekTo(ms) { if (S.kind === 'yt') ytSeek(ms); else Player.seek(ms); updateBar(); }

  /* audio / subtitle / picture choices, remembered per movie and per series (all its episodes) */
  function prefKey() { return !S ? null : S.meta && S.meta.seriesId ? 'series:' + S.meta.seriesId : S.key; }
  function loadPrefs() { var k = prefKey(); S.pref = (k && Store.trackPref(k)) || {}; if (S.pref.aspect) S.aspect = S.pref.aspect; }
  function savePref(name, v) { var k = prefKey(); S.pref[name] = v; if (k) Store.setTrackPref(k, S.pref); }
  // the stream's track list is often filled a moment after 'ready', so try a few times
  function applyPrefs() {
    var p = S.pref || {}, tries = 0, sess = S;
    if (p.aspect && p.aspect !== 'fit') Player.setAspect(p.aspect);
    if (p.audio == null && p.text == null) return;
    (function go() {
      if (S !== sess) return;
      var tr = Player.tracks(), done = true;
      if (p.audio != null) { var a = findTrack(tr.audio, p.audio); if (a) { if (tr.audioCurrent !== a.index) Player.selectTrack('AUDIO', a.index); } else done = false; }
      if (p.text != null) {
        if (p.text.off) Player.selectTrack('TEXT', -1);
        else { var t = findTrack(tr.text, p.text); if (t) { if (tr.textCurrent !== t.index) Player.selectTrack('TEXT', t.index); } else done = false; }
      }
      if (!done && ++tries < 6) setTimeout(go, 1500);
    })();
  }
  // match by label first (indexes can differ between episodes), then by index
  function findTrack(list, want) {
    return list.filter(function (x) { return x.label === want.label; })[0] || list.filter(function (x) { return x.index === want.index; })[0] || null;
  }
  function optionsMenu() {
    showOsd(0);
    if (S.kind === 'yt') { ytOptions(); return; }
    var items = [], tr = S.kind === 'yt' ? { audio: [], text: [] } : Player.tracks(), p = S.pref || {};
    // what the viewer picked wins over what the player reports (TVs often report the stream's default)
    var aCur = tr.audioCurrent, tCur = tr.textCurrent, tOff = tr.textCurrent == null;
    if (p.audio) { var pa = findTrack(tr.audio, p.audio); if (pa) aCur = pa.index; }
    if (p.text) { if (p.text.off) tOff = true; else { var pt = findTrack(tr.text, p.text); if (pt) { tCur = pt.index; tOff = false; } } }
    if (tr.audio.length > 1) {
      items.push({ head: 'Audio' });
      tr.audio.forEach(function (a) { items.push({ label: a.label, a: 'audio', index: a.index, checked: aCur === a.index }); });
    }
    if (tr.text.length) {
      items.push({ head: 'Subtitles' });
      items.push({ label: 'Off', a: 'text', index: -1, checked: tOff });
      tr.text.forEach(function (t) { items.push({ label: t.label, a: 'text', index: t.index, checked: !tOff && tCur === t.index }); });
    }
    if (S.kind !== 'yt') {
      items.push({ head: 'Picture' });
      [['fit', 'Fit to screen'], ['fill', 'Stretch'], ['auto', 'Original aspect']].forEach(function (x) { items.push({ label: x[1], a: 'aspect', mode: x[0], checked: S.aspect === x[0] }); });
    }
    items.push({ head: 'More' });
    items.push({ label: 'Sleep timer', value: sleepTimer ? 'On' : 'Off', a: 'sleep' });
    items.push({ label: 'Restart from beginning', a: 'restart' });
    if (S.kind === 'episode') items.push({ label: 'All episodes', a: 'eplist' });
    if (S.prevEp) items.push({ label: 'Previous episode', a: 'prev' });
    if (S.nextEp) items.push({ label: 'Next episode', a: 'next' });
    App.menu(S.title, items).then(function (it) {
      if (!S) return;
        if (!it) { showOsd(); return; }   // closed with Back: let the timeline hide again
      if (it.a === 'audio') { Player.selectTrack('AUDIO', it.index); savePref('audio', { index: it.index, label: it.label }); App.toast(T('Audio: {0}', it.label)); }
      if (it.a === 'text') { Player.selectTrack('TEXT', it.index); savePref('text', it.index < 0 ? { off: true } : { index: it.index, label: it.label }); App.toast(T('Subtitles: {0}', T(it.label))); }
      if (it.a === 'aspect') { S.aspect = it.mode; Player.setAspect(it.mode); savePref('aspect', it.mode); }
      if (it.a === 'sleep') sleepMenu();
      if (it.a === 'restart') seekTo(0);
      if (it.a === 'next') playNext();
      if (it.a === 'prev') playPrev();
      if (it.a === 'eplist') { openEpPanel(); return; }
      showOsd();
    });
  }
  function sleepMenu() {
    App.menu('Sleep timer', [{ label: 'Off', m: 0 }, { label: T('{0} minutes', 15), m: 15 }, { label: T('{0} minutes', 30), m: 30 }, { label: T('{0} minutes', 60), m: 60 }, { label: T('{0} minutes', 90), m: 90 }])
      .then(function (it) {
        if (S) showOsd();
        if (!it) return;
        clearTimeout(sleepTimer); sleepTimer = null;
        if (it.m) {
          sleepTimer = setTimeout(function () {
            sleepTimer = null;
            if (S) exit();
            App.toast('Sleep timer: playback stopped');
          }, it.m * 60000);
          App.toast(T('Playback will stop in {0}', it.label));
        } else App.toast('Sleep timer off');
      });
  }

  /* ---------- live ---------- */
  function liveKey(e) {
    var c = e.keyCode;
    if (S.zapOpen) {
      if (c === K.UP || c === K.DOWN) { Focus.move(c === K.UP ? 'up' : 'down'); return true; }
      if (c === K.ENTER) { Focus.select(); return true; }
      if (c === K.LEFT || c === K.RIGHT) { closeZap(); return true; }
      return true;
    }
    switch (c) {
      case K.UP: case K.CHUP: zap(-1); return true;      // up = previous in list (like a channel list)
      case K.DOWN: case K.CHDN: zap(1); return true;
      case K.LEFT: openZap(); return true;
      case K.ENTER: showOsd(6000); return true;
      case K.INFO: if (Platform.colorKeys) showOsd(6000); else liveOptions(); return true;
      case K.YELLOW: toggleLiveFav(); return true;
      case K.PLAYPAUSE: case K.PAUSE: case K.PLAY: Player.toggle(); return true;
    }
    if (c >= 48 && c <= 57) { digit(c - 48); return true; }
    return true;
  }
  function toggleLiveFav() {
    var on = Store.toggleFav('live', { id: S.channel.id, name: S.channel.name, icon: S.channel.icon, num: S.channel.num });
    App.toast(on ? 'Added to favorites' : 'Removed from favorites');
  }
  /* remotes without colored buttons: favorite and the channel list from one menu */
  function liveOptions() {
    showOsd(0);
    var fav = Store.isFav('live', S.channel.id);
    App.menu(S.channel.name, [{ label: fav ? 'Remove from favorites' : 'Add to favorites', a: 'fav' }, { label: 'Channel list', a: 'list' }])
      .then(function (it) {
        if (!S) return;
        if (!it) { showOsd(); return; }   // closed with Back: let the timeline hide again
        if (it.a === 'fav') toggleLiveFav();
        if (it.a === 'list') openZap();
        showOsd();
      });
  }
  function zap(dir) {
    var list = S.list;
    if (!list || list.length < 2) return;
    S.index = (S.index + dir + list.length) % list.length;
    S.channel = list[S.index];
    buildLiveOsd(null); showOsd(5000);
    clearTimeout(zapTimer);
    zapTimer = setTimeout(function () { if (S) startStream(); }, 500);
  }
  var digits = '', digitTimer;
  function digit(d) {
    digits += d;
    App.toast(T('Channel {0}', digits), 1500);
    clearTimeout(digitTimer);
    digitTimer = setTimeout(function () {
      var n = Number(digits); digits = '';
      var i = S.list.findIndex(function (c) { return Number(c.num) === n; });
      if (i < 0) { App.toast(T('Channel {0} is not in this list', n)); return; }
      S.index = i; S.channel = S.list[i]; buildLiveOsd(null); showOsd(5000); startStream();
    }, 1500);
  }
  function openZap() {
    var box = h('div', { class: 'zap-list' }, [h('h3', { text: T('Channels') })]);
    var inner = h('div', { class: 'inner', 'data-zone': 'zap' });
    var curEl = null;
    S.list.forEach(function (ch, i) {
      var el = h('div', { class: 'ch' + (i === S.index ? ' playing' : '') }, [
        h('div', { class: 'num', text: ch.num ? String(ch.num) : '' }),
        h('div', { class: 'logo', style: { backgroundImage: ch.icon ? 'url("' + ch.icon + '")' : 'none' } }),
        h('div', { class: 'name', text: ch.name, dir: 'auto' })]);
      Focus.make(el, function () { closeZap(); S.index = i; S.channel = ch; buildLiveOsd(null); showOsd(4000); startStream(); });
      if (i === S.index) curEl = el;
      inner.appendChild(el);
    });
    box.appendChild(inner);
    osd.appendChild(box);
    S.zapOpen = box;
    osd.classList.remove('off'); clearTimeout(hideTimer);
    Focus.set(curEl || inner.firstChild);
  }
  function closeZap() { if (S.zapOpen) { S.zapOpen.remove(); S.zapOpen = null; showOsd(); } }

  /* ---------- start a stream ---------- */
  function startStream(startMs) {
    if (!S) return;
    var api = App.api;
    if (S.kind === 'live') {
      var ch = S.channel;
      S.url = api.liveUrl({ stream_id: ch.id }, Store.settings().liveFormat);
      Store.pushRecentChannel({ id: ch.id, name: ch.name, icon: ch.icon, num: ch.num });
      buildLiveOsd(null); showOsd(5000);
      api.shortEpg(ch.id).then(function (epg) {
        if (!S || S.channel !== ch) return;
        var now = Date.now();
        buildLiveOsd(epg.filter(function (x) { return x.end > now; }));
        if (S.zapOpen) osd.appendChild(S.zapOpen);
      });
      Player.open(S.url, { live: true, title: ch.name });
      return;
    }
    Player.open(S.url, { startMs: startMs || 0, title: S.title, durationHint: S.durationHint });
    buildVodOsd(); showOsd();
    if (startMs > 0) App.toast(T('Resuming from {0}', fmtTime(startMs)));
  }

  function common(session) {
    wire();
    begin(session);
    S.paused = function () { return S.kind === 'yt' ? ytPaused() : Player.paused(); };
    loadPrefs();
  }

  /* ---------- public: live / movie / episode ---------- */
  function playLive(ch, list) {
    list = (list && list.length) ? list : [ch];
    var idx = list.findIndex(function (c) { return String(c.id) === String(ch.id); });
    common({ kind: 'live', channel: ch, list: list, index: idx < 0 ? 0 : idx });
    startStream();
  }
  function playMovie(m, startMs) {
    var api = App.api;
    common({ kind: 'movie', title: m.name, key: 'movie:' + m.id, url: api.movieUrl(m.id, m.ext), durationHint: m.dur || 0,
      meta: { type: 'movie', id: m.id, title: m.name, poster: m.icon, ext: m.ext } });
    startStream(startMs);
  }
  function findEpisode(info, epId) {
    var eps = info.episodes || {}, seasons = Object.keys(eps).sort(function (a, b) { return a - b; }), flat = [];
    seasons.forEach(function (se) { (eps[se] || []).forEach(function (e) { flat.push({ season: se, ep: e }); }); });
    var i = flat.findIndex(function (x) { return String(x.ep.id) === String(epId); });
    return { cur: flat[i], next: i >= 0 ? flat[i + 1] : null, prev: i > 0 ? flat[i - 1] : null };
  }
  function playEpisode(ctx, startMs) {
    var api = App.api, f = findEpisode(ctx.info, ctx.epId);
    if (!f.cur) { App.toast('Episode not found'); return; }
    var e = f.cur.ep, ei = e.info || {};
    var title = ctx.series.name;
    common({ kind: 'episode', ctx: ctx, title: title, sub: T('S{0}:E{1}', f.cur.season, e.episode_num || '') + ' · ' + (e.title || ''),
      key: 'episode:' + e.id, url: api.episodeUrl(e.id, e.container_extension), durationHint: ei.duration_secs ? ei.duration_secs * 1000 : 0,
      nextEp: f.next, prevEp: f.prev, nextShown: false,
      meta: { type: 'episode', id: e.id, title: e.title, seriesId: ctx.series.id, seriesName: title, season: f.cur.season, epNum: e.episode_num,
        poster: ctx.series.icon, thumb: ei.movie_image || ctx.series.icon, backdrop: ctx.backdrop, ext: e.container_extension } });
    startStream(startMs);
  }

  /* ---------- YouTube (played through the Mdluex TV Player page on GitHub Pages) ---------- */
  var yt = { frame: null, t: 0, d: 0, state: -1, timer: null, readyTimer: null };
  function ytSend(cmd) {
    try { if (yt.frame && yt.frame.contentWindow) yt.frame.contentWindow.postMessage(JSON.stringify(cmd), '*'); } catch (e) {}
  }
  function onYtMessage(e) {
    if (!yt.frame || e.source !== yt.frame.contentWindow) return;
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (!m || m.src !== 'mdx-yt' || !S || S.kind !== 'yt') return;
    if (m.ev === 'ready') clearTimeout(yt.readyTimer);
    if (m.ev === 'time') {
      var nt = (m.t || 0) * 1000;
      // the video is really moving: hide the spinner/cover right away (don't wait for the "playing" event)
      if (nt > yt.t + 100 && yt.state !== 2) {
        $('player-spinner').classList.add('hidden');
        $('yt-holder').classList.remove('covered');
        clearTimeout(yt.readyTimer);
      }
      yt.t = nt; yt.d = (m.d || 0) * 1000; updateBar(); save(false);
    }
    if (m.ev === 'state') {
      yt.state = m.state;
      $('yt-holder').classList.toggle('covered', m.state !== 1);
      $('player-spinner').classList.toggle('hidden', m.state !== 3 && m.state !== -1);
      if (m.state === 1) clearTimeout(yt.readyTimer);
    }
    if (m.ev === 'info') { var w = infoWaiters.splice(0); w.forEach(function (fn) { fn(m); }); }
    if (m.ev === 'ended') onEnded();
    if (m.ev === 'error') {
      clearTimeout(yt.readyTimer);
      var why = { 2: 'Invalid video', 5: 'The TV cannot play this video', 100: 'Video not found or private', 101: 'The owner does not allow playing this video in apps', 150: 'The owner does not allow playing this video in apps', 153: 'YouTube rejected the player', 'api-load': 'Could not load the YouTube player' }[m.code] || T('YouTube error {0}', m.code);
      onError(T('{0}. You can open it in the YouTube app instead.', T(why)));
    }
  }
  window.addEventListener('message', onYtMessage);

  function playYouTube(v, startMs) {
    common({ kind: 'yt', video: v, title: v.title, sub: v.ch || 'Mdluex Industries', key: 'yt:' + v.id,
      meta: { type: 'yt', id: v.id, title: v.title } });
    yt.t = startMs || 0; yt.d = 0; yt.state = -1;
    var holder = $('yt-holder');
    holder.style.display = 'block';
    holder.innerHTML = '';
    holder.classList.add('covered');   // hidden until YouTube actually plays
    $('player-spinner').classList.remove('hidden');
    buildVodOsd(); showOsd();
    yt.frame = document.createElement('iframe');
    yt.frame.setAttribute('allow', 'autoplay; encrypted-media');
    yt.frame.src = Channel.playerUrl(v.id, { mode: 'full', start: Math.floor((startMs || 0) / 1000),
      fit: v.short || Channel.isShort(v.id) });
    applyYtQuality(yt.frame);
    holder.appendChild(yt.frame);
    if (startMs > 0) App.toast(T('Resuming from {0}', fmtTime(startMs)));
    clearTimeout(yt.readyTimer);
    yt.readyTimer = setTimeout(function () {
      if (S && S.kind === 'yt' && yt.state !== 1) onError('YouTube did not start. Check the internet connection, or open it in the YouTube app.');
    }, 25000);
  }
  /* Quality: YouTube picks its resolution from the player's size, so we size the player accordingly
     and scale it to the screen. */
  var YT_SIZES = { '1080': [1920, 1080], '720': [1280, 720], '480': [854, 480], '360': [640, 360] };
  function ytQuality() { var q = Store.settings().ytQuality; return YT_SIZES[q] ? q : '720'; }
  function applyYtQuality(f) {
    var s = YT_SIZES[ytQuality()];
    f.style.width = s[0] + 'px'; f.style.height = s[1] + 'px';
    f.style.transform = 'scale(' + (1920 / s[0]) + ')';
  }
  var infoWaiters = [];
  function ytInfo() {
    return new Promise(function (res) {
      infoWaiters.push(res);
      ytSend({ cmd: 'info' });
      setTimeout(function () { var i = infoWaiters.indexOf(res); if (i >= 0) { infoWaiters.splice(i, 1); res(null); } }, 1200);
    });
  }
  function ytOptions() {
    ytInfo().then(function (info) {
      if (!S || S.kind !== 'yt') return;
      info = info || { rates: [1], rate: 1, tracks: [], captions: null };
      var q = ytQuality(), items = [{ head: 'Quality' }];
      [['1080', '1080p (Full HD)'], ['720', '720p (recommended)'], ['480', '480p'], ['360', '360p (slow internet)']].forEach(function (x) {
        items.push({ label: x[1], a: 'q', v: x[0], checked: q === x[0] });
      });
      if (info.rates && info.rates.length > 1) {
        items.push({ head: 'Speed' });
        info.rates.forEach(function (r) { items.push({ label: r === 1 ? 'Normal' : r + '×', a: 'rate', v: r, checked: r === info.rate }); });
      }
      items.push({ head: 'Subtitles' });
      items.push({ label: 'Off', a: 'cc', v: null, checked: !info.captions });
      (info.tracks || []).forEach(function (t) { items.push({ label: t.name, a: 'cc', v: t.code, checked: info.captions === t.code }); });
      if (!(info.tracks || []).length) items.push({ label: 'No subtitles for this video', a: 'none' });
      items.push({ head: 'More' });
      items.push({ label: 'Sleep timer', value: sleepTimer ? 'On' : 'Off', a: 'sleep' });
      items.push({ label: 'Restart from beginning', a: 'restart' });
      items.push({ label: 'Open in YouTube app', a: 'app' });
      App.menu(S.title, items).then(function (it) {
        if (!S) return;
        if (!it) { showOsd(); return; }   // closed with Back: let the timeline hide again
        if (it.a === 'q') { Store.setSetting('ytQuality', it.v); if (yt.frame) applyYtQuality(yt.frame); App.toast(T('Quality: {0}', T(it.label))); }
        if (it.a === 'rate') { ytSend({ cmd: 'rate', r: it.v }); App.toast(T('Speed: {0}', T(it.label))); }
        if (it.a === 'cc') { ytSend({ cmd: 'captions', lang: it.v }); App.toast(T('Subtitles: {0}', T(it.label))); }
        if (it.a === 'sleep') sleepMenu();
        if (it.a === 'restart') seekTo(0);
        if (it.a === 'app') { var id = S.video.id; exit(); Channel.openInYouTubeApp(id); }
        showOsd();
      });
    });
  }

  function ytTime() { return yt.t; }
  function ytDuration() { return yt.d; }
  function ytPaused() { return yt.state === 2; }
  function ytToggle() { ytSend({ cmd: 'toggle' }); yt.state = yt.state === 1 ? 2 : 1; }
  function ytSeek(ms) { yt.t = Math.max(0, ms); ytSend({ cmd: 'seek', t: yt.t / 1000 }); }
  function stopYouTube() {
    clearTimeout(yt.readyTimer);
    var holder = $('yt-holder');
    holder.innerHTML = ''; holder.style.display = 'none';
    yt.frame = null; yt.state = -1;
  }

  return { playLive: playLive, playMovie: playMovie, playEpisode: playEpisode, playYouTube: playYouTube, exit: exit };
})();
