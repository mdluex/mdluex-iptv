/* Xtream Codes API client with timeouts, retries and caching, plus an offline demo source. */
function ApiError(message, kind) { this.message = message; this.kind = kind; }
ApiError.prototype = Object.create(Error.prototype);

function normalizeServer(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/(player_api\.php|get\.php|panel_api\.php).*$/i, '');
  return s.replace(/\/+$/, '');
}

function b64(s) {
  if (!s) return '';
  try { return decodeURIComponent(escape(atob(s))); } catch (e) { return s; }
}

var Api = (function () {
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function getJSON(url, timeout) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeout);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new ApiError(T('Server answered with error {0}', r.status), 'http');
        return r.text();
      })
      .then(function (txt) {
        if (!txt || !txt.trim()) throw new ApiError(T('Server sent an empty reply'), 'empty');
        try { return JSON.parse(txt); } catch (e) { throw new ApiError(T('Server sent an unreadable reply'), 'parse'); }
      })
      .catch(function (e) {
        if (e instanceof ApiError) throw e;
        if (e && e.name === 'AbortError') throw new ApiError(T('Server took too long to answer'), 'timeout');
        throw new ApiError(T('Cannot reach the server'), 'network');
      })
      .then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }

  function Xtream(pl) {
    this.pl = pl;
    this.base = normalizeServer(pl.server);
    this.cache = {};
  }
  Xtream.prototype.url = function (params) {
    var q = 'username=' + encodeURIComponent(this.pl.username) + '&password=' + encodeURIComponent(this.pl.password);
    Object.keys(params || {}).forEach(function (k) { if (params[k] != null) q += '&' + k + '=' + encodeURIComponent(params[k]); });
    return this.base + '/player_api.php?' + q;
  };
  Xtream.prototype.call = function (params, opts) {
    opts = opts || {};
    var self = this, key = JSON.stringify(params || {}), ttl = opts.ttl == null ? 60 * 60 * 1000 : opts.ttl;
    var c = this.cache[key];
    if (c && Date.now() - c.t < ttl) return Promise.resolve(c.v);
    var retries = opts.retries == null ? 2 : opts.retries, timeout = opts.timeout || 15000;
    // a whole catalog (no category) can be many MB: give it time instead of aborting and starting over
    if (params && /^get_(vod_streams|series|live_streams)$/.test(params.action) && params.category_id == null) { timeout = Math.max(timeout, 90000); retries = Math.min(retries, 1); }
    var attempt = 0;
    function run() {
      return getJSON(self.url(params), timeout).catch(function (e) {
        if (attempt++ < retries) return sleep(800 * attempt).then(run);
        throw e;
      });
    }
    return run().then(function (v) { if (ttl > 0) self.cache[key] = { t: Date.now(), v: v }; return v; });
  };

  /* Account check: retries harder because this is what decides if the user gets in. */
  Xtream.prototype.account = function () {
    return this.call({}, { ttl: 0, retries: 3, timeout: 12000 }).then(function (d) {
      if (!d || typeof d !== 'object' || !d.user_info) throw new ApiError(T('Server reply had no account information'), 'noinfo');
      return d;
    });
  };
  function arr(v) { return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(function (k) { return v[k]; }) : []); }
  Xtream.prototype.liveCategories = function () { return this.call({ action: 'get_live_categories' }).then(arr); };
  Xtream.prototype.vodCategories = function () { return this.call({ action: 'get_vod_categories' }).then(arr); };
  Xtream.prototype.seriesCategories = function () { return this.call({ action: 'get_series_categories' }).then(arr); };
  Xtream.prototype.liveStreams = function (cat) { return this.call({ action: 'get_live_streams', category_id: cat }).then(arr); };
  Xtream.prototype.vodStreams = function (cat) { return this.call({ action: 'get_vod_streams', category_id: cat }).then(arr); };
  Xtream.prototype.series = function (cat) { return this.call({ action: 'get_series', category_id: cat }).then(arr); };
  Xtream.prototype.vodInfo = function (id) { return this.call({ action: 'get_vod_info', vod_id: id }, { ttl: 30 * 60 * 1000 }); };
  Xtream.prototype.seriesInfo = function (id) { return this.call({ action: 'get_series_info', series_id: id }, { ttl: 30 * 60 * 1000 }); };
  Xtream.prototype.shortEpg = function (id) {
    return this.call({ action: 'get_short_epg', stream_id: id, limit: 4 }, { ttl: 5 * 60 * 1000, retries: 0, timeout: 8000 })
      .then(function (d) {
        return arr(d && d.epg_listings).map(function (e) {
          return {
            title: b64(e.title), desc: b64(e.description),
            start: Number(e.start_timestamp) * 1000, end: Number(e.stop_timestamp) * 1000
          };
        });
      }).catch(function () { return []; });
  };
  Xtream.prototype.liveUrl = function (s, fmt) {
    return this.base + '/live/' + encodeURIComponent(this.pl.username) + '/' + encodeURIComponent(this.pl.password) + '/' + s.stream_id + '.' + (fmt || 'ts');
  };
  Xtream.prototype.movieUrl = function (id, ext) {
    return this.base + '/movie/' + encodeURIComponent(this.pl.username) + '/' + encodeURIComponent(this.pl.password) + '/' + id + '.' + (ext || 'mp4');
  };
  Xtream.prototype.episodeUrl = function (id, ext) {
    return this.base + '/series/' + encodeURIComponent(this.pl.username) + '/' + encodeURIComponent(this.pl.password) + '/' + id + '.' + (ext || 'mp4');
  };

  /* ------------------------------------------------------------------ */
  /* Demo source: same interface, generated content, no network needed. */
  /* ------------------------------------------------------------------ */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function art(title, w, h, sub) {
    var x = hash(title), h1 = x % 360, h2 = (h1 + 40 + (x >> 8) % 80) % 360;
    var words = title.split(' '), lines = [], line = '';
    words.forEach(function (wd) { if ((line + ' ' + wd).trim().length > (w > h ? 18 : 11)) { lines.push(line.trim()); line = wd; } else line += ' ' + wd; });
    lines.push(line.trim());
    // demo artwork: title painted near the top (the app shows its own name label at the bottom)
    var fs = w > h ? 34 : 30, y0 = (sub ? 80 : 50) + fs * 0.5;
    var txt = lines.map(function (l, i) {
      return '<text x="20" y="' + (y0 + i * (fs + 4)) + '" font-family="Arial" font-weight="900" font-size="' + fs + '" fill="#fff">' +
        l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>';
    }).join('');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h1 + ',70%,45%)"/>' +
      '<stop offset="1" stop-color="hsl(' + h2 + ',70%,12%)"/></linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      '<circle cx="' + (w * 0.75) + '" cy="' + (h * 0.3) + '" r="' + (Math.min(w, h) * 0.35) + '" fill="rgba(255,255,255,.08)"/>' +
      (sub ? '<text x="20" y="40" font-family="Arial" font-size="20" fill="rgba(255,255,255,.7)">' + sub + '</text>' : '') +
      txt + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  var A = ['Silent', 'Crimson', 'Last', 'Golden', 'Broken', 'Hidden', 'Midnight', 'Northern', 'Iron', 'Desert', 'Electric', 'Lost', 'Wild', 'Paper', 'Glass'];
  var B = ['Harbor', 'Empire', 'Signal', 'River', 'Kingdom', 'Protocol', 'Garden', 'Horizon', 'Code', 'Storm', 'Frontier', 'Letters', 'Orbit', 'Lanterns', 'Tide'];
  function title(seed) { return 'The ' + A[seed % A.length] + ' ' + B[(seed * 7 + 3) % B.length]; }
  var PLOT = 'When an unexpected discovery turns ordinary lives upside down, a small group must decide how far they will go to protect the people they love - and what they are willing to lose along the way.';

  function Demo() {
    var now = Date.now() / 1000;
    this.liveCats = ['News', 'Sports', 'Movies 24/7', 'Kids', 'Music', 'Documentary', 'Adult XXX'].map(function (n, i) { return { category_id: String(i + 1), category_name: n }; });
    this.vodCats = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Family', 'Thriller', 'Arabic Movies'].map(function (n, i) { return { category_id: String(i + 11), category_name: n }; });
    this.seriesCats = ['Drama Series', 'Comedy Series', 'Crime', 'Kids Series'].map(function (n, i) { return { category_id: String(i + 21), category_name: n }; });
    var live = [], num = 1;
    this.liveCats.forEach(function (c, ci) {
      for (var i = 0; i < 14; i++) {
        var name = c.category_name.replace(/ .*/, '') + ' ' + (['One', 'HD', 'Plus', 'Max', 'Prime', 'Live', 'World'][i % 7]) + ' ' + (i + 1);
        live.push({ num: num, stream_id: 1000 + num, name: name, category_id: c.category_id, stream_icon: art(name, 300, 180), epg_channel_id: 'x' });
        num++;
      }
    });
    this.live = live;
    var vod = [];
    this.vodCats.forEach(function (c, ci) {
      for (var i = 0; i < 18; i++) {
        var s = ci * 18 + i, t = title(s) + (i % 3 === 0 ? '' : ' ' + (i % 3 + 1));
        vod.push({ stream_id: 5000 + s, name: t, category_id: c.category_id, stream_icon: art(t, 460, 690),
          rating: (6 + (s % 30) / 10).toFixed(1), added: String(Math.floor(now - s * 86400)), container_extension: 'mp4', year: 2015 + s % 11 });
      }
    });
    this.vod = vod;
    var series = [];
    this.seriesCats.forEach(function (c, ci) {
      for (var i = 0; i < 12; i++) {
        var s = 100 + ci * 12 + i, t = title(s);
        series.push({ series_id: 8000 + s, name: t, category_id: c.category_id, cover: art(t, 460, 690),
          rating: (7 + (s % 25) / 10).toFixed(1), last_modified: String(Math.floor(now - s * 43200)), plot: PLOT, genre: c.category_name.replace(' Series', ''), releaseDate: String(2016 + s % 9) });
      }
    });
    this.seriesList = series;
  }
  // demo "trailers": the Mdluex Industries videos stand in for real trailers
  function demoTrailer(n) {
    var v = (typeof CHANNEL_SNAPSHOT !== 'undefined' && CHANNEL_SNAPSHOT.videos) || [];
    return v.length ? v[(n % (v.length - 1)) + 1].id : '';
  }
  function filt(list, cat) { return Promise.resolve(cat ? list.filter(function (x) { return x.category_id === String(cat); }) : list.slice()); }
  Demo.prototype.isDemo = true;
  Demo.prototype.account = function () {
    var exp = Math.floor(Date.now() / 1000) + 23 * 86400;
    return new Promise(function (res) {
      setTimeout(function () {
        res({ user_info: { username: 'demo', auth: 1, status: 'Active', exp_date: String(exp), is_trial: '0', active_cons: '0', max_connections: '2', created_at: String(exp - 340 * 86400) },
          server_info: { url: 'demo', timezone: 'Africa/Cairo' } });
      }, 400);
    });
  };
  Demo.prototype.liveCategories = function () { return Promise.resolve(this.liveCats); };
  Demo.prototype.vodCategories = function () { return Promise.resolve(this.vodCats); };
  Demo.prototype.seriesCategories = function () { return Promise.resolve(this.seriesCats); };
  Demo.prototype.liveStreams = function (c) { return filt(this.live, c); };
  Demo.prototype.vodStreams = function (c) { return filt(this.vod, c); };
  Demo.prototype.series = function (c) { return filt(this.seriesList, c); };
  Demo.prototype.vodInfo = function (id) {
    var v = this.vod.find(function (x) { return String(x.stream_id) === String(id); });
    return Promise.resolve({ info: { plot: PLOT, genre: 'Drama, Adventure', director: 'A. Director', cast: 'Actor One, Actor Two, Actor Three',
      releasedate: String(v.year), duration_secs: 5400 + (id % 40) * 60, rating: v.rating, backdrop_path: [art(v.name, 1920, 1080)], movie_image: v.stream_icon,
      youtube_trailer: demoTrailer(Number(id)) },
      movie_data: { stream_id: v.stream_id, name: v.name, container_extension: 'mp4' } });
  };
  Demo.prototype.seriesInfo = function (id) {
    var s = this.seriesList.find(function (x) { return String(x.series_id) === String(id); });
    var episodes = {}, seasons = [];
    for (var se = 1; se <= 3; se++) {
      seasons.push({ season_number: se, name: 'Season ' + se });
      episodes[se] = [];
      for (var e = 1; e <= 8; e++) {
        var eid = id * 100 + se * 10 + e;
        episodes[se].push({ id: String(eid), episode_num: e, season: se, title: 'Episode ' + e + ' - ' + title(eid % 97), container_extension: 'mp4',
          info: { duration_secs: 2400 + e * 60, plot: PLOT, movie_image: art(s.name + ' ' + se + 'x' + e, 480, 270, 'S' + se + ' E' + e) } });
      }
    }
    return Promise.resolve({ info: { name: s.name, cover: s.cover, plot: s.plot, genre: s.genre, releaseDate: s.releaseDate, rating: s.rating,
      cast: 'Actor One, Actor Two', backdrop_path: [art(s.name, 1920, 1080)], youtube_trailer: demoTrailer(Number(id)) }, seasons: seasons, episodes: episodes });
  };
  Demo.prototype.shortEpg = function (id) {
    var t = Date.now(), slot = 3600000, start = Math.floor(t / slot) * slot, list = [];
    for (var i = 0; i < 3; i++) list.push({ title: title(id + i), desc: PLOT, start: start + i * slot, end: start + (i + 1) * slot });
    return Promise.resolve(list);
  };
  Demo.prototype.liveUrl = function (s) { return 'demo://live/' + s.stream_id; };
  Demo.prototype.movieUrl = function (id) { return 'demo://movie/' + id; };
  Demo.prototype.episodeUrl = function (id) { return 'demo://episode/' + id; };

  function create(pl) { return pl && pl.demo ? new Demo() : new Xtream(pl); }

  return { create: create, ApiError: ApiError, normalizeServer: normalizeServer };
})();
