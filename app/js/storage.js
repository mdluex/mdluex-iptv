/* Persistent storage: playlists, settings, watch progress, favorites, history. */
var Store = (function () {
  var P = 'mdx_';

  function get(k, d) {
    try { var v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function set(k, v) {
    try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { console.warn('storage full', e); }
  }
  function del(k) { try { localStorage.removeItem(P + k); } catch (e) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var DEFAULT_SETTINGS = {
    pin: '0000',
    lockAdult: true,
    autoNext: true,
    clock24: true,
    liveFormat: typeof Platform !== 'undefined' ? Platform.defaultLiveFormat : 'ts',
    hideEmpty: true
  };

  /* ---- playlists ---- */
  function playlists() { return get('playlists', []); }
  function savePlaylist(pl) {
    var list = playlists();
    if (!pl.id) pl.id = uid();
    var i = list.findIndex(function (p) { return p.id === pl.id; });
    if (i >= 0) list[i] = pl; else list.push(pl);
    set('playlists', list);
    return pl;
  }
  function removePlaylist(id) {
    set('playlists', playlists().filter(function (p) { return p.id !== id; }));
    ['progress_', 'favs_', 'recent_', 'account_'].forEach(function (k) { del(k + id); });
    if (get('active') === id) del('active');
  }
  function active() {
    var list = playlists(), id = get('active');
    return list.find(function (p) { return p.id === id; }) || list[0] || null;
  }
  function setActive(id) { set('active', id); }

  /* ---- settings ---- */
  function settings() { return Object.assign({}, DEFAULT_SETTINGS, get('settings', {})); }
  function setSetting(k, v) { var s = settings(); s[k] = v; set('settings', s); return s; }

  /* ---- watch progress (resume) ---- */
  function pid() { var a = active(); return a ? a.id : 'none'; }
  function progressAll() { return get('progress_' + pid(), {}); }
  function progress(key) { return progressAll()[key] || null; }
  function saveProgress(key, data) {
    var all = progressAll();
    data.updated = Date.now();
    all[key] = Object.assign(all[key] || {}, data);
    var keys = Object.keys(all);
    if (keys.length > 400) {
      keys.sort(function (a, b) { return all[a].updated - all[b].updated; });
      keys.slice(0, keys.length - 400).forEach(function (k) { delete all[k]; });
    }
    set('progress_' + pid(), all);
  }
  function removeProgress(key) { var all = progressAll(); delete all[key]; set('progress_' + pid(), all); }
  function isWatched(p) { return !!(p && (p.done || (p.dur > 0 && p.pos / p.dur > 0.92))); }
  function inProgress(p) { return !!(p && !isWatched(p) && p.pos > 30000); }
  function continueWatching() {
    var all = progressAll();
    var list = Object.keys(all).map(function (k) { return Object.assign({ key: k }, all[k]); })
      .filter(inProgress)
      .sort(function (a, b) { return b.updated - a.updated; });
    // keep only the latest episode per series
    var seen = {};
    return list.filter(function (p) {
      if (!p.seriesId) return true;
      if (seen[p.seriesId]) return false;
      seen[p.seriesId] = 1; return true;
    }).slice(0, 30);
  }
  function lastEpisodeOf(seriesId) {
    var all = progressAll(), best = null;
    Object.keys(all).forEach(function (k) {
      var p = all[k];
      if (String(p.seriesId) === String(seriesId) && (!best || p.updated > best.updated)) best = Object.assign({ key: k }, p);
    });
    return best;
  }
  function clearProgress() { del('progress_' + pid()); }

  /* ---- favorites ---- */
  function favs() { return get('favs_' + pid(), { live: [], movie: [], series: [] }); }
  function isFav(type, id) { return favs()[type].some(function (f) { return String(f.id) === String(id); }); }
  function toggleFav(type, item) {
    var f = favs();
    var exists = f[type].some(function (x) { return String(x.id) === String(item.id); });
    if (exists) f[type] = f[type].filter(function (x) { return String(x.id) !== String(item.id); });
    else f[type].unshift(item);
    set('favs_' + pid(), f);
    return !exists;
  }

  /* ---- recently watched channels ---- */
  function recentChannels() { return get('recent_' + pid(), []); }
  function pushRecentChannel(ch) {
    var list = recentChannels().filter(function (c) { return String(c.id) !== String(ch.id); });
    list.unshift(ch);
    set('recent_' + pid(), list.slice(0, 30));
  }
  function clearRecent() { del('recent_' + pid()); }

  /* ---- account cache (last good server answer) ---- */
  function accountCache() { return get('account_' + pid(), null); }
  function saveAccountCache(info) { set('account_' + pid(), { info: info, checkedAt: Date.now() }); }

  return {
    playlists: playlists, savePlaylist: savePlaylist, removePlaylist: removePlaylist, active: active, setActive: setActive,
    settings: settings, setSetting: setSetting,
    progress: progress, saveProgress: saveProgress, removeProgress: removeProgress, continueWatching: continueWatching,
    lastEpisodeOf: lastEpisodeOf, isWatched: isWatched, inProgress: inProgress, clearProgress: clearProgress,
    favs: favs, isFav: isFav, toggleFav: toggleFav,
    recentChannels: recentChannels, pushRecentChannel: pushRecentChannel, clearRecent: clearRecent,
    accountCache: accountCache, saveAccountCache: saveAccountCache
  };
})();
