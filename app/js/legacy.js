/* Compatibility for older TV engines (LG webOS 3–5 = Chrome 38–68, Samsung Tizen 4 = Chrome 56).
   Each feature is added only when the engine lacks it, so newer TVs are untouched.
   Based on the old-LG fixes by Kerolosashraf7 (github.com/mdluex/mdluex-iptv/issues/1 and /3). */
(function () {
  function def(o, k, v) { if (o && !o[k]) Object.defineProperty(o, k, { value: v, writable: true, configurable: true }); }
  def(Array.prototype, 'find', function (fn, t) { for (var i = 0; i < this.length; i++) if (fn.call(t, this[i], i, this)) return this[i]; });
  def(Array.prototype, 'findIndex', function (fn, t) { for (var i = 0; i < this.length; i++) if (fn.call(t, this[i], i, this)) return i; return -1; });
  def(Array.prototype, 'includes', function (x) { return this.indexOf(x) !== -1; });
  def(Array, 'from', function (a) { return Array.prototype.slice.call(a); });
  def(String.prototype, 'includes', function (s, p) { return this.indexOf(s, p) !== -1; });
  def(String.prototype, 'startsWith', function (s, p) { p = p || 0; return this.substr(p, s.length) === s; });
  def(String.prototype, 'endsWith', function (s) { return this.slice(-s.length) === s; });
  function pad(str, len, fill, start) {
    str = String(str); fill = fill === undefined ? ' ' : String(fill);
    if (str.length >= len || !fill) return str;
    var p = ''; while (p.length < len - str.length) p += fill; p = p.slice(0, len - str.length);
    return start ? p + str : str + p;
  }
  def(String.prototype, 'padStart', function (l, f) { return pad(this, l, f, true); });
  def(String.prototype, 'padEnd', function (l, f) { return pad(this, l, f, false); });
  def(Object, 'assign', function (t) {
    for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s != null) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; }
    return t;
  });
  def(Object, 'values', function (o) { return Object.keys(o).map(function (k) { return o[k]; }); });
  if (window.NodeList) def(NodeList.prototype, 'forEach', Array.prototype.forEach);
  if (!('isConnected' in Node.prototype)) Object.defineProperty(Node.prototype, 'isConnected', { configurable: true, get: function () { return document.documentElement.contains(this); } });

  /* Chrome < 50: video.play() returns nothing; the app expects a Promise */
  var MP = window.HTMLMediaElement && HTMLMediaElement.prototype, origPlay = MP && MP.play;
  if (origPlay && !MP.__promisePlay) {
    MP.__promisePlay = true;
    MP.play = function () { var r = origPlay.apply(this, arguments); return (r && typeof r.then === 'function') ? r : Promise.resolve(); };
  }

  var EP = Element.prototype;
  def(EP, 'matches', EP.webkitMatchesSelector || EP.msMatchesSelector);
  def(EP, 'closest', function (sel) { var el = this; while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentNode; } return null; });
  def(EP, 'remove', function () { if (this.parentNode) this.parentNode.removeChild(this); });

  /* Chrome < 61 ignores scrollIntoView({block: 'nearest'}) and jumps the item to the top every time.
     Scroll each scrollable parent only as much as needed. Screen pixels and layout pixels differ because
     the stage is scaled, so convert with each container's own scale. */
  var cm = /Chrome\/(\d+)/.exec(navigator.userAgent);
  if (cm && +cm[1] < 61 && !EP.__nearestScroll) {
    var nativeSIV = EP.scrollIntoView;
    EP.__nearestScroll = true;
    EP.scrollIntoView = function (arg) {
      if (!arg || typeof arg !== 'object') return nativeSIV.apply(this, arguments);
      for (var p = this.parentNode; p && p.nodeType === 1 && p !== document.documentElement; p = p.parentNode) {
        var canY = p.scrollHeight > p.clientHeight + 1, canX = p.scrollWidth > p.clientWidth + 1;
        if (!canY && !canX) continue;
        var pr = p.getBoundingClientRect(), r = this.getBoundingClientRect();
        var ky = pr.height ? p.offsetHeight / pr.height : 1, kx = pr.width ? p.offsetWidth / pr.width : 1;
        if (canY) {
          if (r.top < pr.top) p.scrollTop -= (pr.top - r.top) * ky;
          else if (r.bottom > pr.bottom) p.scrollTop += Math.min(r.bottom - pr.bottom, r.top - pr.top) * ky;
        }
        if (canX) {
          r = this.getBoundingClientRect();
          if (r.left < pr.left) p.scrollLeft -= (pr.left - r.left) * kx;
          else if (r.right > pr.right) p.scrollLeft += Math.min(r.right - pr.right, r.left - pr.left) * kx;
        }
      }
    };
  }

  if (typeof AbortController === 'undefined') {
    var Signal = function () { this.aborted = false; this._l = []; this.onabort = null; };
    Signal.prototype.addEventListener = function (t, fn) { if (t === 'abort') this._l.push(fn); };
    Signal.prototype.removeEventListener = function (t, fn) { var i = this._l.indexOf(fn); if (i >= 0) this._l.splice(i, 1); };
    window.AbortController = function () { this.signal = new Signal(); };
    window.AbortController.prototype.abort = function () {
      var s = this.signal; if (s.aborted) return; s.aborted = true;
      var ev = { type: 'abort', target: s };
      s._l.slice().forEach(function (fn) { fn(ev); }); if (s.onabort) s.onabort(ev);
    };
  }

  /* Chrome < 42: no fetch(); an XMLHttpRequest version that honours AbortController */
  if (typeof window.fetch === 'undefined') {
    var abortErr = function () { var e = new Error('Aborted'); e.name = 'AbortError'; return e; };
    window.fetch = function (url, opts) {
      opts = opts || {};
      return new Promise(function (resolve, reject) {
        var sig = opts.signal;
        if (sig && sig.aborted) return reject(abortErr());
        var xhr = new XMLHttpRequest();
        xhr.open(opts.method || 'GET', String(url), true);
        if (opts.headers) for (var hd in opts.headers) xhr.setRequestHeader(hd, opts.headers[hd]);
        var onAbort = function () { xhr.abort(); reject(abortErr()); };
        if (sig) sig.addEventListener('abort', onAbort);
        var done = function () { if (sig) sig.removeEventListener('abort', onAbort); };
        xhr.onload = function () {
          done();
          var body = xhr.responseText, st = xhr.status || 200;   /* file:// replies report 0 */
          resolve({
            ok: st >= 200 && st < 300, status: st, statusText: xhr.statusText, url: xhr.responseURL || String(url),
            headers: { get: function (n) { return xhr.getResponseHeader(n); } },
            text: function () { return Promise.resolve(body); },
            json: function () { return Promise.resolve().then(function () { return JSON.parse(body); }); }
          });
        };
        xhr.onerror = function () { done(); reject(new TypeError('Network request failed')); };
        xhr.ontimeout = xhr.onerror;
        xhr.send(opts.body == null ? null : opts.body);
      });
    };
  }
})();
