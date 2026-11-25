/* Remote-control focus engine: spatial navigation with zones that remember their last item. */
var Focus = (function () {
  var current = null;
  var memory = new WeakMap();
  var layers = [];

  function baseRoot() { return document.getElementById('app-root'); }
  function root() { return layers.length ? layers[layers.length - 1] : baseRoot(); }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function candidates(scope) {
    return Array.prototype.filter.call((scope || root()).querySelectorAll('.focusable'), function (e) {
      return !e.classList.contains('disabled') && visible(e);
    });
  }
  function zoneOf(el) { return el ? el.closest('[data-zone]') : null; }

  function set(el, opts) {
    if (!el) return;
    if (current && current !== el) {
      current.classList.remove('focused');
      if (current._onBlur) current._onBlur(current);
    }
    current = el;
    el.classList.add('focused');
    var z = zoneOf(el);
    if (z) memory.set(z, el);
    if (!(opts && opts.noScroll) && !el.closest('#sidebar')) {
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
      // under a fixed banner: snap the focused row to the top of the scrolling area
      var rowsBox = el.closest('.billboard-layout > .rows'), rowEl = el.closest('.row');
      if (rowsBox && rowEl) rowsBox.scrollTop = Math.max(0, rowEl.offsetTop - 6);
    }
    if (el._onFocus) el._onFocus(el);
  }

  function pick(c, list, dir) {
    var cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, best = null, bestScore = Infinity;
    list.forEach(function (e) {
      var r = e.getBoundingClientRect(), ex = (r.left + r.right) / 2, ey = (r.top + r.bottom) / 2, main, cross, overlap;
      if (dir === 'right') { if (!(ex > cx + 4 && r.right > c.right)) return; main = Math.max(0, r.left - c.right); cross = Math.abs(ey - cy); overlap = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top); }
      else if (dir === 'left') { if (!(ex < cx - 4 && r.left < c.left)) return; main = Math.max(0, c.left - r.right); cross = Math.abs(ey - cy); overlap = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top); }
      else if (dir === 'down') { if (!(ey > cy + 4 && r.bottom > c.bottom)) return; main = Math.max(0, r.top - c.bottom); cross = Math.abs(ex - cx); overlap = Math.min(c.right, r.right) - Math.max(c.left, r.left); }
      else { if (!(ey < cy - 4 && r.top < c.top)) return; main = Math.max(0, c.top - r.bottom); cross = Math.abs(ex - cx); overlap = Math.min(c.right, r.right) - Math.max(c.left, r.left); }
      var score = main + (overlap > 0 ? cross * 0.3 : cross * 2 + 300);
      if (score < bestScore) { bestScore = score; best = e; }
    });
    return best;
  }

  function restoreZone(z, fallback) {
    var mem = z && memory.get(z);
    if (mem && mem.isConnected && visible(mem) && root().contains(mem)) return mem;
    if (z) { var act = z.querySelector('.focusable.active'); if (act && visible(act)) return act; }
    return fallback;
  }

  function move(dir) {
    var r = root();
    if (!current || !r.contains(current) || !visible(current)) { first(); return true; }
    var z = zoneOf(current);
    var hook = current['_' + dir];
    if (hook) { var res = hook(current); if (res === true) return true; if (res && res.nodeType) { set(res); return true; } }
    var cur = current.getBoundingClientRect();
    // look inside the current row/column first (cheap); only measure the rest of the screen if needed
    var best = z ? pick(cur, candidates(z).filter(function (e) { return e !== current && zoneOf(e) === z; }), dir) : null;
    if (!best) {
      best = pick(cur, candidates(r).filter(function (e) { return e !== current && zoneOf(e) !== z; }), dir);
      if (best) best = restoreZone(zoneOf(best), best);
    }
    if (best) { set(best); return true; }
    return false;
  }

  function first(scope) {
    var r = scope || root();
    var pref = r.querySelector('.focusable[data-autofocus]');
    var el = (pref && visible(pref)) ? pref : candidates(r)[0];
    if (el) set(el);
    return el;
  }

  function select() {
    if (!current || !root().contains(current)) return false;
    if (current._onSelect) { current._onSelect(current); return true; }
    if (current.tagName === 'INPUT') { current.focus(); return true; }
    return false;
  }

  function pushLayer(el) { layers.push(el); el._prevFocus = current; }
  function popLayer(el) {
    var i = layers.indexOf(el);
    if (i >= 0) layers.splice(i, 1);
    var prev = el._prevFocus;
    if (prev && prev.isConnected && visible(prev)) set(prev, { noScroll: true });
    else { current = null; first(); }
  }

  function make(el, onSelect, onFocus) {
    el.classList.add('focusable');
    if (onSelect) el._onSelect = onSelect;
    if (onFocus) el._onFocus = onFocus;
    return el;
  }

  return {
    set: set, move: move, first: first, select: select, make: make, restoreZone: restoreZone,
    pushLayer: pushLayer, popLayer: popLayer, root: root,
    get current() { return current; },
    hasLayer: function () { return layers.length > 0; }
  };
})();
