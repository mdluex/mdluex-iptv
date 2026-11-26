/* YouTube channels: Mdluex Industries (always on, with a built-in offline copy) plus channels the viewer adds.
   Each channel: latest uploads, Videos / Shorts / Playlists tabs and its featured video. */
var Channel = (function () {
  var CHANNEL_ID = 'UCPS4VJgphh0fNQAbhU6eY7w';   // Mdluex Industries

  /* Player page hosted on GitHub Pages (github.com/mdluex/mdluex-tv-player): YouTube needs a real web address. */
  var PLAYER_URL = 'https://mdluex.github.io/mdluex-tv-player/';
  function playerUrl(id, o) {
    o = o || {};
    return PLAYER_URL + '?v=' + encodeURIComponent(id) + '&mode=' + (o.mode || 'full') +
      (o.start ? '&start=' + o.start : '') + (o.random ? '&random=1' : '') +
      (o.fit ? '&fit=1' : '') + (o.q ? '&q=' + o.q : '');
  }

  function thumb(id, big) { return 'https://i.ytimg.com/vi/' + id + '/' + (big ? 'maxresdefault' : 'hqdefault') + '.jpg'; }

  function parseFeed(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var entries = doc.getElementsByTagName('entry');
    var name = (doc.getElementsByTagName('title')[0] || {}).textContent || '';
    var videos = Array.prototype.map.call(entries, function (e) {
      function tag(t) { var n = e.getElementsByTagName(t)[0]; return n ? n.textContent : ''; }
      return { id: tag('yt:videoId') || tag('videoId'), title: tag('title'), published: tag('published'), desc: tag('media:description').slice(0, 400), ch: tag('name') };
    });
    return { name: name, videos: videos };
  }

  function fetchText(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 10000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (x) { clearTimeout(t); return x; }, function (e) { clearTimeout(t); throw e; });
  }
  function feedOf(query) { return fetchText('https://www.youtube.com/feeds/videos.xml?' + query).then(parseFeed); }
  function unjson(s) { try { return JSON.parse('"' + s + '"'); } catch (e) { return s; } }
  function fixUrl(u) { return u && u.indexOf('//') === 0 ? 'https:' + u : u; }

  // Shorts are vertical: they must be shown uncropped
  var shortIds = {};
  (function () { var s = typeof CHANNEL_SNAPSHOT !== 'undefined' && CHANNEL_SNAPSHOT.shorts; (s || []).forEach(function (v) { shortIds[v.id] = 1; }); })();
  function isShort(id) { return !!shortIds[id]; }
  // Shorts: the HD frame has the vertical picture in the middle; the card crops to it
  function shortThumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hq720.jpg'; }

  /* One channel. Only Mdluex Industries has a built-in snapshot to fall back on when offline. */
  var channels = {};
  function of(id, knownName) {
    id = id || CHANNEL_ID;
    if (channels[id]) return channels[id];
    var isMdluex = id === CHANNEL_ID;
    var snap = isMdluex && typeof CHANNEL_SNAPSHOT !== 'undefined' ? CHANNEL_SNAPSHOT : {};
    var cache = null, tabsCache = null, featuredCache = null;

    function load() {
      if (cache) return Promise.resolve(cache);
      var fallback = { name: snap.name || knownName || '', videos: snap.videos || [] };
      return feedOf('channel_id=' + id)
        .then(function (d) { if (!d.videos.length && fallback.videos.length) throw new Error('empty'); return d; })
        .catch(function () { return fallback; })
        .then(function (d) {
          if (!d.name) d.name = knownName || 'YouTube';
          d.videos.forEach(function (v) { if (!v.ch) v.ch = d.name; });
          cache = d; return d;
        });
    }

    /* Channel tabs: Videos, Shorts, Playlists (like YouTube) */
    function tabs() {
      if (tabsCache) return tabsCache;
      var up = id.slice(2);
      var videos = feedOf('playlist_id=UULF' + up).then(function (d) { return d.videos; }).catch(function () { return snap.longVideos || null; });
      var shorts = feedOf('playlist_id=UUSH' + up).then(function (d) { return d.videos; }).catch(function () { return snap.shorts || []; });
      var playlists = fetchText('https://www.youtube.com/channel/' + id + '/playlists', 12000)
        .then(function (html) {
          var ids = [], re = /"playlistId":"(PL[\w-]+)"/g, m;
          while ((m = re.exec(html))) if (ids.indexOf(m[1]) < 0) ids.push(m[1]);
          if (!ids.length) throw new Error('no playlists');
          return Promise.all(ids.slice(0, 20).map(function (pid) {
            return feedOf('playlist_id=' + pid).then(function (d) { return { id: pid, title: d.name, videos: d.videos }; }, function () { return null; });
          }));
        })
        .then(function (list) { list = list.filter(function (p) { return p && p.videos.length; }); if (!list.length) throw new Error('empty'); return list; })
        .catch(function () { return snap.playlists || []; });
      tabsCache = Promise.all([videos, shorts, playlists, load()]).then(function (r) {
        r[1].forEach(function (v) { shortIds[v.id] = 1; });
        // channels without the "long videos" list: use the latest uploads that are not Shorts
        var vids = r[0] || r[3].videos.filter(function (v) { return !shortIds[v.id]; });
        [vids, r[1]].forEach(function (l) { l.forEach(function (v) { if (!v.ch) v.ch = r[3].name; }); });
        return { videos: vids, shorts: r[1], playlists: r[2] };
      });
      return tabsCache;
    }

    /* Featured video set on the channel page (changes on YouTube are picked up automatically).
       Order: live channel page -> last value seen on this TV -> built-in snapshot -> latest upload. */
    function featured() {
      if (featuredCache) return Promise.resolve(featuredCache);
      var key = isMdluex ? 'mdx_yt_featured' : 'mdx_yt_featured_' + id;
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
      return fetchText('https://www.youtube.com/channel/' + id, 10000)
        .then(function (html) {
          var m = /"channelVideoPlayerRenderer":\{"videoId":"([\w-]{11})","title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(html);
          if (!m) throw new Error('no featured video');
          var f = { id: m[1], title: unjson(m[2]) };
          var d = /"channelVideoPlayerRenderer":\{[\s\S]{0,4000}?"description":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(html);
          if (d) f.desc = unjson(d[1]).slice(0, 400);
          try { localStorage.setItem(key, JSON.stringify(f)); } catch (e) {}
          return f;
        })
        .catch(function () { return saved || snap.featured || null; })
        .then(function (f) {
          return load().then(function (ch) {
            if (!f) f = ch.videos[0] || null;
            // use the feed's description if this video is among the latest uploads
            var inFeed = f && ch.videos.find(function (v) { return v.id === f.id; });
            if (inFeed) f = Object.assign({}, inFeed, f, { desc: f.desc || inFeed.desc });
            if (f && !f.ch) f.ch = ch.name;
            featuredCache = f;
            return f;
          });
        });
    }
    channels[id] = { id: id, isMdluex: isMdluex, load: load, tabs: tabs, featured: featured };
    return channels[id];
  }

  /* ---------- channels the viewer added (saved on this TV) ---------- */
  function userChannels() { return (Store.settings().ytChannels || []).filter(function (c) { return c && c.id && c.id !== CHANNEL_ID; }); }
  function addChannel(c) {
    var list = userChannels().filter(function (x) { return x.id !== c.id; });
    list.push({ id: c.id, name: c.name, avatar: c.avatar || null });
    Store.setSetting('ytChannels', list);
  }
  function removeChannel(id) {
    if (id === CHANNEL_ID) return;   // Mdluex Industries is always on
    Store.setSetting('ytChannels', userChannels().filter(function (x) { return x.id !== id; }));
    delete channels[id];
  }
  /* The channel's real profile picture, read from its YouTube page (og:image) and remembered on this TV.
     Mdluex Industries also has a built-in copy for when YouTube can't be reached. */
  var MDLUEX_AVATAR = 'https://yt3.ggpht.com/jhtpG11x04FcwjDOaaZkRtdd1eMqvrNI2UvBPgv9ORHC7lXVHMgJHK-2Z8N3AzpykQprMkh6ww=s240-c-k-c0x00ffffff-no-rj-mo';
  var avatarJobs = {};
  function savedAvatar(id) {
    try { var a = JSON.parse(localStorage.getItem('mdx_yt_avatars') || '{}')[id]; if (a) return a; } catch (e) {}
    return id === CHANNEL_ID ? MDLUEX_AVATAR : null;
  }
  function avatar(id) {
    if (avatarJobs[id]) return avatarJobs[id];
    avatarJobs[id] = fetchText('https://www.youtube.com/channel/' + id, 12000).then(function (html) {
      var m = /<meta property="og:image" content="([^"]+)"/.exec(html) || /"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/.exec(html);
      if (!m) throw new Error('no picture');
      var url = fixUrl(m[1].replace(/&amp;/g, '&')).replace(/=s\d+-/, '=s240-');
      try { var all = JSON.parse(localStorage.getItem('mdx_yt_avatars') || '{}'); all[id] = url; localStorage.setItem('mdx_yt_avatars', JSON.stringify(all)); } catch (e) {}
      return url;
    }).catch(function () { return savedAvatar(id); });
    return avatarJobs[id];
  }
  /* every channel shown in the app: Mdluex Industries first, then the viewer's */
  function allChannels() {
    var snap = typeof CHANNEL_SNAPSHOT !== 'undefined' ? CHANNEL_SNAPSHOT : {};
    return [{ id: CHANNEL_ID, name: snap.name || 'Mdluex Industries', avatar: savedAvatar(CHANNEL_ID), fixed: true }]
      .concat(userChannels().map(function (c) { return Object.assign({}, c, { avatar: savedAvatar(c.id) || c.avatar }); }));
  }

  /* Find channels by name (YouTube's channel search). */
  function search(q) {
    return fetchText('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAg%253D%253D', 12000).then(function (html) {
      var out = [], seen = {}, re = /"channelRenderer":\{"channelId":"(UC[\w-]{22})"/g, m;
      while ((m = re.exec(html)) && out.length < 12) {
        if (seen[m[1]]) continue;
        seen[m[1]] = 1;
        var part = html.slice(m.index, m.index + 5000);
        var title = /"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/.exec(part);
        var img = /"thumbnails":\[\{"url":"((?:[^"\\]|\\.)*)"/.exec(part);
        var info = /"(?:videoCountText|subscriberCountText)":\{(?:"accessibility":\{[^}]*\}\},)?"simpleText":"((?:[^"\\]|\\.)*)"/.exec(part);
        out.push({ id: m[1], name: title ? unjson(title[1]) : m[1], avatar: img ? fixUrl(unjson(img[1])).replace(/=s\d+-/, '=s240-') : null, info: info ? unjson(info[1]) : '' });
      }
      return out;
    });
  }
  /* A channel from what the viewer typed: a channel link, an @handle, a channel ID, or a name to search for. */
  function resolve(text) {
    text = String(text || '').trim();
    var id = /(UC[\w-]{22})/.exec(text);
    var handle = /(?:youtube\.com\/)?(@[\w.\-]+)/.exec(text) || /youtube\.com\/((?:c|user)\/[\w.\-]+)/.exec(text);
    if (!id && !handle) return search(text);
    var url = id ? 'https://www.youtube.com/channel/' + id[1] : 'https://www.youtube.com/' + handle[1];
    return fetchText(url, 12000).then(function (html) {
      var cid = (/"externalId":"(UC[\w-]{22})"/.exec(html) || /<meta itemprop="identifier" content="(UC[\w-]{22})"/.exec(html) ||
        /"channelId":"(UC[\w-]{22})"/.exec(html) || [])[1];
      if (!cid) return [];
      var name = /<meta property="og:title" content="([^"]*)"/.exec(html);
      var img = /<meta property="og:image" content="([^"]*)"/.exec(html);
      var div = document.createElement('div');
      div.innerHTML = name ? name[1] : '';
      return [{ id: cid, name: div.textContent || cid, avatar: img ? img[1] : null, info: handle ? handle[1] : '' }];
    });
  }

  /* ---------- YouTube IFrame API ---------- */
  var apiPromise = null;
  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (res, rej) {
      var timer = setTimeout(function () { apiPromise = null; rej(new Error('Could not load the YouTube player')); }, 15000);
      window.onYouTubeIframeAPIReady = function () { clearTimeout(timer); res(); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { clearTimeout(timer); apiPromise = null; rej(new Error('Could not load the YouTube player')); };
      document.head.appendChild(s);
    });
    return apiPromise;
  }

  /* Launch the TV's own YouTube app on this video (fallback). */
  function openInYouTubeApp(id) {
    return Platform.openYouTube(id);   // Samsung, LG and Android each launch their own YouTube app
  }

  /* ---------- Banner preview: smooth slideshow of real frames from the video ----------
     YouTube refuses embedded playback inside TV apps (error 153: no web address), and a video
     iframe is too heavy for TV chips anyway. YouTube publishes HD frames from each video
     (maxres1-3), so we crossfade those with a slow zoom: GPU-only, smooth at 60 fps. */
  var pv = { host: null, timer: null, token: 0 };
  function frameSets(id) {
    return [1, 2, 3].map(function (n) {
      return ['maxres' + n, 'sd' + n, 'hq' + n].map(function (f) { return 'https://i.ytimg.com/vi/' + id + '/' + f + '.jpg'; });
    }).concat([[thumb(id, true), thumb(id)]]);
  }
  function firstGood(urls, cb) {
    var i = 0;
    (function next() {
      if (i >= urls.length) return cb(null);
      var im = new Image();
      im.onload = function () {
        if (im.naturalWidth < 200) { i++; next(); return; }   // YouTube's 120x90 "missing" placeholder
        if (im.decode) im.decode().then(function () { cb(urls[i]); }, function () { cb(urls[i]); }); else cb(urls[i]);
      };
      im.onerror = function () { i++; next(); };
      im.src = urls[i];
    })();
  }
  function pvStop() {
    pv.token++;
    if (pv.box) { pv.box.parentNode && pv.box.parentNode.removeChild(pv.box); pv.box = pv.frame = null; }
    clearInterval(pv.timer); pv.timer = null;
    if (pv.host) pv.host.classList.remove('on');
  }
  function pvDestroy() { pvStop(); if (pv.host) pv.host.innerHTML = ''; pv.host = null; pv.frame = pv.box = null; }
  // while the full-screen player is open, no preview may start (the TV can only decode one video)
  var suspended = false;
  function pvSuspend(on) { suspended = !!on; if (on) pvDestroy(); }
  function previewPlay(el, id, random) {
    if (suspended) return;
    // very old TV engines (Chrome < 50, e.g. LG webOS 3) can't run YouTube, and the slideshow costs too much there
    var cv = /Chrome\/(\d+)/.exec(navigator.userAgent); if (cv && +cv[1] < 50) return;
    pvDestroy();
    var token = pv.token;
    pv.host = el;
    el.innerHTML = '<div class="pv-frame"></div><div class="pv-frame"></div>';
    var layers = el.children, frames = [], idx = 0, front = 0;
    var sets = frameSets(id);
    if (random) sets.sort(function () { return Math.random() - 0.5; });
    function show() {
      if (pv.token !== token || !frames.length || !el.isConnected) return;
      if (el.classList.contains('video-on')) return;   // real video is showing: don't animate underneath
      var L = layers[front], other = layers[1 - front];
      L.style.backgroundImage = 'url("' + frames[idx % frames.length] + '")';
      L.classList.remove('zoom'); void L.offsetWidth; L.classList.add('zoom');   // restart the slow zoom
      L.classList.add('vis'); other.classList.remove('vis');
      front = 1 - front; idx++;
      el.classList.add('on');
    }
    sets.forEach(function (s) {
      firstGood(s, function (u) {
        if (pv.token !== token || !u || frames.indexOf(u) >= 0) return;
        frames.push(u);
        if (frames.length === 1) { show(); pv.timer = setInterval(show, 4000); }
      });
    });
    // the real (muted) video fades in over the slideshow once it is actually playing
    if (Store.settings().videoPreviews !== false) {
      setTimeout(function () {
        if (pv.token !== token || !el.isConnected) return;
        var box = document.createElement('div');
        box.className = 'pv-video';
        var f = document.createElement('iframe');
        f.setAttribute('allow', 'autoplay; encrypted-media');
        f.src = playerUrl(id, { mode: 'preview', random: random, q: 'small' });
        box.appendChild(f);
        el.appendChild(box);
        pv.frame = f; pv.box = box;
      }, 4000);   // only after you stay on one item: browsing stays smooth (slideshow only)
    }
  }
  // preview player reports "playing" -> show it
  window.addEventListener('message', function (e) {
    if (!pv.frame || e.source !== pv.frame.contentWindow) return;
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (!m || m.src !== 'mdx-yt') return;
    // only show the video while it is really playing: YouTube's loading/seek icons stay hidden
    if (m.ev === 'state' && pv.box) {
      pv.box.classList.toggle('on', m.state === 1);
      // while the video plays, the slideshow underneath stands still (less work for the TV)
      if (pv.host) pv.host.classList.toggle('video-on', m.state === 1);
    }
    if (m.ev === 'error' && pv.box) { pv.box.remove(); pv.box = pv.frame = null; }
  });

  var mdluex = of(CHANNEL_ID);
  return { load: mdluex.load, featured: mdluex.featured, tabs: mdluex.tabs, of: of, userChannels: userChannels, allChannels: allChannels,
    addChannel: addChannel, removeChannel: removeChannel, avatar: avatar, search: search, resolve: resolve, isShort: isShort, shortThumb: shortThumb, thumb: thumb, playerUrl: playerUrl, preview: { play: previewPlay, stop: pvStop, destroy: pvDestroy, suspend: pvSuspend }, loadApi: loadApi, openInYouTubeApp: openInYouTubeApp, CHANNEL_ID: CHANNEL_ID };
})();
var Preview = Channel.preview;
