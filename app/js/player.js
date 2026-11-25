/* Video engine: Samsung AVPlay on the TV, HTML5 video in a browser, and a simulated player for demo mode. */
var Player = (function () {
  var cb = {};
  function emit(name, v) { if (cb[name]) cb[name](v); }
  function hasAV() { return typeof webapis !== 'undefined' && webapis.avplay; }

  /* ---------- Samsung AVPlay ---------- */
  var AV = {
    open: function (url, startMs) {
      var av = webapis.avplay;
      try { av.stop(); } catch (e) {} try { av.close(); } catch (e) {}
      document.getElementById('av-player').style.display = 'block';
      try {
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        av.setListener({
          onbufferingstart: function () { emit('buffering', true); },
          onbufferingprogress: function () {},
          onbufferingcomplete: function () { emit('buffering', false); },
          oncurrentplaytime: function (t) { emit('time', t); },
          onstreamcompleted: function () { emit('end'); },
          onerror: function (e) { emit('error', 'Playback error: ' + e); },
          onevent: function () {},
          onsubtitlechange: function (dur, text) { emit('subtitle', text); },
          ondrmevent: function () {}
        });
        try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 4); } catch (e) {}
        try { av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 6); } catch (e) {}
        emit('buffering', true);
        av.prepareAsync(function () {
          emit('buffering', false);
          var go = function () { try { av.play(); } catch (e) { emit('error', 'Could not start: ' + e.message); } emit('ready'); };
          if (startMs > 0) { try { av.seekTo(startMs, go, go); } catch (e) { go(); } } else go();
        }, function (e) { emit('buffering', false); emit('error', 'Could not open the stream (' + e + ')'); });
      } catch (e) { emit('error', 'Could not open the stream (' + e.message + ')'); }
    },
    paused: function () { try { return webapis.avplay.getState() === 'PAUSED'; } catch (e) { return false; } },
    play: function () { try { webapis.avplay.play(); } catch (e) {} },
    pause: function () { try { webapis.avplay.pause(); } catch (e) {} },
    seek: function (ms) { try { webapis.avplay.seekTo(Math.max(0, Math.floor(ms)), function () {}, function () {}); } catch (e) {} },
    time: function () { try { return webapis.avplay.getCurrentTime(); } catch (e) { return 0; } },
    duration: function () { try { return webapis.avplay.getDuration(); } catch (e) { return 0; } },
    stop: function () {
      try { webapis.avplay.stop(); } catch (e) {} try { webapis.avplay.close(); } catch (e) {}
      document.getElementById('av-player').style.display = 'none';
    },
    tracks: function () {
      var out = { audio: [], text: [] };
      try {
        webapis.avplay.getTotalTrackInfo().forEach(function (t) {
          var info = {}; try { info = JSON.parse(t.extra_info); } catch (e) {}
          var label = (info.language || info.track_lang || '').toUpperCase() || ('Track ' + (t.index + 1));
          if (t.type === 'AUDIO') out.audio.push({ index: t.index, label: label + (info.channels ? ' (' + info.channels + 'ch)' : '') });
          if (t.type === 'TEXT') out.text.push({ index: t.index, label: label });
        });
        var cur = webapis.avplay.getCurrentStreamInfo();
        cur.forEach(function (t) { if (t.type === 'AUDIO') out.audioCurrent = t.index; if (t.type === 'TEXT') out.textCurrent = t.index; });
      } catch (e) {}
      return out;
    },
    selectTrack: function (type, index) {
      try {
        if (type === 'TEXT' && index < 0) { webapis.avplay.setSilentSubtitle(true); emit('subtitle', ''); return; }
        if (type === 'TEXT') webapis.avplay.setSilentSubtitle(false);
        webapis.avplay.setSelectTrack(type, index);
      } catch (e) { emit('toast', 'Could not switch track'); }
    },
    setAspect: function (mode) {
      var m = { fit: 'PLAYER_DISPLAY_MODE_LETTER_BOX', fill: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', auto: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO' }[mode];
      try { webapis.avplay.setDisplayMethod(m); } catch (e) {}
    }
  };

  /* ---------- HTML5 video (browser preview with real MP4 links) ---------- */
  var video = null;
  var H5 = {
    open: function (url, startMs) {
      video = document.getElementById('html5-player');
      video.style.display = 'block';
      video.onwaiting = function () { emit('buffering', true); };
      video.onplaying = function () { emit('buffering', false); };
      video.ontimeupdate = function () { emit('time', video.currentTime * 1000); };
      video.onended = function () { emit('end'); };
      video.onerror = function () { emit('error', 'This browser cannot play this stream (TS/HLS streams play on the TV).'); };
      video.onloadedmetadata = function () { if (startMs > 0) video.currentTime = startMs / 1000; emit('ready'); };
      emit('buffering', true);
      video.src = url;
      video.play().catch(function () {});
    },
    paused: function () { return video && video.paused; },
    play: function () { if (video) video.play().catch(function () {}); },
    pause: function () { if (video) video.pause(); },
    seek: function (ms) { if (video) video.currentTime = Math.max(0, ms / 1000); },
    time: function () { return video ? video.currentTime * 1000 : 0; },
    duration: function () { return video && isFinite(video.duration) ? video.duration * 1000 : 0; },
    stop: function () { if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.style.display = 'none'; } },
    tracks: function () { return { audio: [], text: [] }; },
    selectTrack: function () {},
    setAspect: function (mode) { if (video) video.className = mode === 'fill' ? 'fill' : (mode === 'auto' ? 'cover' : ''); }
  };

  /* ---------- Simulated (demo) ---------- */
  var sim = { t: 0, dur: 0, paused: false, timer: null, live: false };
  var SIM = {
    open: function (url, startMs, opts) {
      var el = document.getElementById('sim-player');
      el.style.display = 'flex';
      el.querySelector('.sim-title').textContent = opts.title || '';
      sim.live = !!opts.live; sim.t = startMs || 0; sim.dur = sim.live ? 0 : (opts.durationHint || 5400000); sim.paused = false;
      emit('buffering', true);
      clearInterval(sim.timer);
      setTimeout(function () {
        emit('buffering', false); emit('ready');
        sim.timer = setInterval(function () {
          if (sim.paused) return;
          sim.t += 500;
          emit('time', sim.t);
          if (sim.dur && sim.t >= sim.dur) { clearInterval(sim.timer); emit('end'); }
        }, 500);
      }, 600);
    },
    paused: function () { return sim.paused; },
    play: function () { sim.paused = false; },
    pause: function () { sim.paused = true; },
    seek: function (ms) { sim.t = Math.max(0, Math.min(ms, sim.dur || ms)); emit('time', sim.t); },
    time: function () { return sim.t; },
    duration: function () { return sim.dur; },
    stop: function () { clearInterval(sim.timer); document.getElementById('sim-player').style.display = 'none'; },
    tracks: function () {
      return { audio: [{ index: 1, label: 'ENGLISH (2ch)' }, { index: 2, label: 'ARABIC (6ch)' }], text: [{ index: 3, label: 'ARABIC' }, { index: 4, label: 'ENGLISH' }], audioCurrent: 1 };
    },
    selectTrack: function () {},
    setAspect: function () {}
  };

  var impl = null;
  return {
    on: function (handlers) { cb = handlers || {}; },
    open: function (url, opts) {
      opts = opts || {};
      if (impl) impl.stop();
      impl = /^demo:/.test(url) ? SIM : (hasAV() ? AV : H5);
      impl.open(url, opts.startMs || 0, opts);
    },
    paused: function () { return impl ? impl.paused() : true; },
    toggle: function () { if (!impl) return; if (impl.paused()) impl.play(); else impl.pause(); },
    play: function () { if (impl) impl.play(); },
    pause: function () { if (impl) impl.pause(); },
    seek: function (ms) { if (impl) impl.seek(ms); },
    time: function () { return impl ? impl.time() : 0; },
    duration: function () { return impl ? impl.duration() : 0; },
    stop: function () { if (impl) impl.stop(); impl = null; },
    tracks: function () { return impl ? impl.tracks() : { audio: [], text: [] }; },
    selectTrack: function (t, i) { if (impl) impl.selectTrack(t, i); },
    setAspect: function (m) { if (impl) impl.setAspect(m); },
    isTV: hasAV
  };
})();
