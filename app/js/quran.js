/* Quran: surah list and a full-screen mushaf (two facing pages of the Madani mushaf, 15 lines each, laid out
   exactly as printed) that plays a recitation and highlights the verse and the word being recited, in real time.
   Text, page layout, recitations and word timings come from the free Quran.com API. */
var Quran = (function () {
  var API = 'https://api.quran.com/api/v4';
  /* reciters with word-by-word timings on Quran.com */
  var RECITERS = [
    { id: 7, ar: 'مشاري راشد العفاسي', en: 'Mishari Rashid Alafasy' },
    { id: 2, ar: 'عبد الباسط عبد الصمد (مرتل)', en: 'Abdul Basit (Murattal)' },
    { id: 1, ar: 'عبد الباسط عبد الصمد (مجود)', en: 'Abdul Basit (Mujawwad)' },
    { id: 6, ar: 'محمود خليل الحصري', en: 'Mahmoud Khalil Al-Husary' },
    { id: 12, ar: 'محمود خليل الحصري (المعلم)', en: 'Al-Husary (Teacher)' },
    { id: 9, ar: 'محمد صديق المنشاوي', en: 'Muhammad Siddiq Al-Minshawi' },
    { id: 3, ar: 'عبد الرحمن السديس', en: 'Abdur-Rahman As-Sudais' },
    { id: 10, ar: 'سعود الشريم', en: 'Saud Ash-Shuraym' },
    { id: 4, ar: 'أبو بكر الشاطري', en: 'Abu Bakr Al-Shatri' },
    { id: 5, ar: 'هاني الرفاعي', en: 'Hani Ar-Rifai' },
    { id: 97, ar: 'ياسر الدوسري', en: 'Yasser Al-Dosari' },
    { id: 161, ar: 'خليفة الطنيجي', en: 'Khalifa Al-Tunaiji' }
  ];
  var BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function arNum(n) { return String(n).replace(/\d/g, function (d) { return AR_DIGITS[+d]; }); }

  function getJSON(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 15000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (x) { clearTimeout(t); return x; }, function () { clearTimeout(t); throw new Error(T('Could not load the Quran. Check the internet connection.')); });
  }

  /* ---------- saved settings: reciter, last position, repeat ---------- */
  function prefs() { return Object.assign({ reciter: 7, qsize: 64, autoNext: true, repeat: false, last: null }, Store.settings().quran || {}); }
  function setPref(k, v) { var p = prefs(); p[k] = v; Store.setSetting('quran', p); return p; }
  function reciter(id) { id = id || prefs().reciter; return RECITERS.filter(function (r) { return r.id === id; })[0] || RECITERS[0]; }
  function reciterName(r) { return I18N.rtl ? r.ar : r.en; }

  /* ---------- data ---------- */
  var chaptersCache = null;
  function chapters() {
    if (chaptersCache) return chaptersCache;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('mdx_quran_chapters2') || 'null'); } catch (e) {}
    chaptersCache = getJSON(API + '/chapters?language=ar').then(function (d) {
      var list = d.chapters.map(function (c) {
        return { id: c.id, ar: c.name_arabic, en: c.name_simple, verses: c.verses_count, place: c.revelation_place, basmala: c.bismillah_pre, pages: c.pages };
      });
      try { localStorage.setItem('mdx_quran_chapters2', JSON.stringify(list)); } catch (e) {}
      return list;
    }).catch(function (e) { chaptersCache = null; if (saved) return saved; throw e; });
    return chaptersCache;
  }
  /* Every verse of a surah, word by word. Two light requests: the mushaf glyphs (with each verse's page; every
     Madinah mushaf page ends at the end of a verse) and the Uthmani text. The juz comes from the table below. */
  var JUZ_START = [[1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
    [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
    [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1]];
  function juzOf(ch, n) {
    var j = 1;
    for (var i = 0; i < JUZ_START.length; i++) {
      var c = JUZ_START[i][0], v = JUZ_START[i][1];
      if (ch > c || (ch === c && n >= v)) j = i + 1; else break;
    }
    return j;
  }
  var ONLY_MARKS = /^[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DD\u06DF-\u06ED\u0640]+$/;   // pause marks (not ۞)
  /* One verse from the light data. Quran.com numbers words with a pause mark (ۖ ۗ ۚ …) belonging to the word before
     it; here a mark that is a glyph of its own is joined to that word, so the numbers match the recitation timings.
     Returns null when the text and glyphs can't be lined up (then the verse's exact word list is fetched). */
  function buildVerse(ch, n, page, glyphs, tokens) {
    if (tokens.length !== glyphs.length - 1) return null;
    var words = [], pos = 0, lead = null;
    tokens.forEach(function (t, i) {
      if (t === '\u06DE') { lead = { t: t, g: glyphs[i] }; return; }   // ۞ (quarter hizb) belongs to the word after it
      if (ONLY_MARKS.test(t) && words.length) { var w = words[words.length - 1]; w.t += ' ' + t; w.g += glyphs[i]; return; }
      words.push({ p: ++pos, g: lead ? lead.g + ' ' + glyphs[i] : glyphs[i], gp: page, t: lead ? lead.t + ' ' + t : t });
      lead = null;
    });
    words.push({ p: pos + 1, g: glyphs[glyphs.length - 1], gp: page, end: true, t: arNum(n) });
    return { n: n, page: page, juz: juzOf(ch, n), words: words };
  }
  function exactVerse(ch, n) {
    return getJSON(API + '/verses/by_key/' + ch + ':' + n + '?words=true&word_fields=text_uthmani,code_v2,v2_page').then(function (d) {
      var v = d.verse;
      return { n: n, page: v.words[0].v2_page, juz: juzOf(ch, n),
        words: v.words.map(function (w) { return { p: w.position, t: w.char_type_name === 'end' ? arNum(n) : w.text_uthmani, g: w.code_v2, gp: w.v2_page, end: w.char_type_name === 'end' }; }) };
    });
  }
  var textCache = {};
  function verses(ch) {
    if (textCache[ch]) return textCache[ch];
    textCache[ch] = Promise.all([
      getJSON(API + '/quran/verses/code_v2?chapter_number=' + ch),
      getJSON(API + '/quran/verses/uthmani?chapter_number=' + ch)
    ]).then(function (r) {
      var text = {};
      r[1].verses.forEach(function (v) { text[v.verse_key] = String(v.text_uthmani || '').trim().split(/\s+/).filter(Boolean); });
      return Promise.all(r[0].verses.map(function (v) {
        var n = +String(v.verse_key).split(':')[1];
        return buildVerse(ch, n, v.v2_page, String(v.code_v2 || '').trim().split(/\s+/), text[v.verse_key] || []) || exactVerse(ch, n);
      }));
    }).catch(function (e) { delete textCache[ch]; throw e; });
    return textCache[ch];
  }

  /* ---------- the mushaf font from Quran.com: the King Fahd Complex lettering, one font per mushaf page,
     each word one glyph. The plain (black) version; the name of Allah is coloured by the app. ---------- */
  var FONT_BASE = 'https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p';
  var fontJobs = {}, fontAdded = {};
  /* The font file is downloaded first and handed over as bytes: on a TV, a font loaded from its address blocks the
     app for ~2 s while it is decoded, from bytes it takes a few milliseconds. fontFace() only gets it ready;
     pageFont() also adds it to the page. */
  function fontFace(page) {
    if (fontJobs[page]) return fontJobs[page];
    fontJobs[page] = typeof FontFace === 'undefined' ? Promise.reject(new Error('no FontFace')) :
      fetch(FONT_BASE + page + '.woff2').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) { return new FontFace('qpcv2p' + page, buf).load(); })
        .catch(function (e) { delete fontJobs[page]; throw e; });
    return fontJobs[page];
  }
  function addFont(page, f) { if (!fontAdded[page]) { document.fonts.add(f); fontAdded[page] = true; } }
  function pageFont(page) { return fontFace(page).then(function (f) { addFont(page, f); return 'qpcv2p' + page; }); }
  /* the page's decorations, decoded once and kept, so the page appears complete instead of piece by piece */
  var ART = ['q-frame', 'q-cart', 'q-medal', 'q-end', 'q-rope', 'q-bar'];
  var artJob = null;
  function decorations() {
    if (artJob) return artJob;
    artJob = Promise.all(ART.map(function (n) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { if (im.decode) im.decode().then(res, res); else res(); };
        im.onerror = res;
        im.src = 'images/' + n + '.svg';
        decorations.keep.push(im);   // keep them alive: the CSS backgrounds then reuse the decoded images
      });
    }));
    return artJob;
  }
  decorations.keep = [];
  /* the fonts for every page of a surah; resolves to 'v2', or null (then the bundled font is used) */
  /* Fonts for the pages around where reading starts (and page 1, which draws the basmala). Resolves to
     { ver: 'v2', loaded: {page: true}, rest: [pages to load later, nearest first] }, or { ver: null } if they fail. */
  /* Fonts for the pages around where reading starts (and page 1, which draws the basmala), added before the text is
     built. The other pages' fonts are downloaded in the background but NOT added yet: adding a font while a long
     surah is on screen re-lays all of it (~2 s on a TV), so the reader adds them all together, once.
     Resolves to { ver: 'v2', loaded: {page: true}, rest: [pages], ready: Promise of the rest }, or { ver: null }. */
  function mushafFonts(verses, startN) {
    var pages = {}, startPage = null;
    verses.forEach(function (v) {
      v.words.forEach(function (w) { if (w.gp) pages[w.gp] = 1; });
      if (v.n === (startN || 1) && v.words[0]) startPage = v.words[0].gp;
    });
    var all = Object.keys(pages).map(Number);
    if (!all.length) return Promise.resolve({ ver: null });
    if (startPage == null) startPage = all[0];
    var first = all.filter(function (p) { return p >= startPage - 1 && p <= startPage + 2; });
    var rest = all.filter(function (p) { return first.indexOf(p) < 0; })
      .sort(function (a, b) { return Math.abs(a - startPage) - Math.abs(b - startPage); });
    var wait = first.concat([1]);
    return Promise.all(wait.map(pageFont)).then(function () {
      var loaded = {}; wait.forEach(function (p) { loaded[p] = true; });
      // the rest: four downloads at a time; resolves when every one has finished (or failed)
      var ready = new Promise(function (resolve) {
        var queue = rest.slice(), left = queue.length;
        if (!left) { resolve(); return; }
        function next() {
          var p = queue.shift();
          if (p == null) return;
          fontFace(p).then(null, function () {}).then(function () { if (--left === 0) resolve(); next(); });
        }
        for (var i = 0; i < 4; i++) next();
      });
      // if they all come within 2.5 s (fast internet, or already saved from an earlier visit), add them now: free
      var waited = new Promise(function (r) { setTimeout(function () { r(false); }, 2500); });
      return Promise.race([ready.then(function () { return true; }), waited]).then(function (all) {
        if (!all) return { ver: 'v2', loaded: loaded, rest: rest, ready: ready };
        return Promise.all(rest.map(function (p) { return fontFace(p).then(function (f) { addFont(p, f); loaded[p] = true; }, function () {}); }))
          .then(function () { return { ver: 'v2', loaded: loaded, rest: [], ready: null }; });
      });
    }).catch(function () { return { ver: null }; });
  }

  var audioCache = {};
  function recitation(rid, ch) {
    var k = rid + ':' + ch;
    if (audioCache[k]) return audioCache[k];
    audioCache[k] = getJSON(API + '/chapter_recitations/' + rid + '/' + ch + '?segments=true').then(function (d) {
      var a = d.audio_file;
      return {
        url: a.audio_url,
        verses: (a.timestamps || []).map(function (t) {
          return { n: +String(t.verse_key).split(':')[1], from: t.timestamp_from, to: t.timestamp_to,
            words: (t.segments || []).filter(function (s) { return s.length >= 3; }).map(function (s) { return { p: s[0], from: s[1], to: s[2] }; }) };
        })
      };
    }).catch(function (e) { delete audioCache[k]; throw e; });
    return audioCache[k];
  }

  /* ---------- audio: one <audio> element, polled ~12 times a second to follow the recitation ---------- */
  var audio = null, tick = null, listener = null;
  function el() {
    if (!audio) {
      audio = document.createElement('audio');
      audio.preload = 'auto';
      document.body.appendChild(audio);
      audio.addEventListener('ended', function () { if (listener && listener.ended) listener.ended(); });
      audio.addEventListener('playing', function () { if (listener && listener.state) listener.state('playing'); });
      audio.addEventListener('pause', function () { if (listener && listener.state) listener.state('paused'); });
      audio.addEventListener('waiting', function () { if (listener && listener.state) listener.state('loading'); });
      audio.addEventListener('error', function () { if (listener && listener.error) listener.error(); });
    }
    return audio;
  }
  function play(url, startMs, l) {
    var a = el();
    listener = l;
    if (a.getAttribute('src') !== url) { a.setAttribute('src', url); a.load(); }
    var go = function () {
      try { a.currentTime = (startMs || 0) / 1000; } catch (e) {}
      var p = a.play();
      // a TV may refuse to start sound before a remote key was pressed: show ▶ so one OK starts it
      if (p && p.catch) p.catch(function () { if (listener && listener.state) listener.state('paused'); });
    };
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', function once() { a.removeEventListener('loadedmetadata', once); go(); });
    clearInterval(tick);
    tick = setInterval(function () { if (listener && listener.time && !a.paused) listener.time(a.currentTime * 1000); }, 80);
  }
  function stop() {
    clearInterval(tick); tick = null; listener = null;
    if (audio) { try { audio.pause(); } catch (e) {} audio.removeAttribute('src'); try { audio.load(); } catch (e) {} }
  }
  function toggle() { if (!audio) return; if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } else audio.pause(); }
  function seek(ms) { if (audio) try { audio.currentTime = ms / 1000; } catch (e) {} }
  function paused() { return !audio || audio.paused; }
  function duration() { return audio && isFinite(audio.duration) ? audio.duration * 1000 : 0; }

  return { RECITERS: RECITERS, BASMALA: BASMALA, arNum: arNum, prefs: prefs, setPref: setPref, reciter: reciter, reciterName: reciterName,
    chapters: chapters, verses: verses, mushafFonts: mushafFonts, pageFont: pageFont, fontFace: fontFace, addFont: addFont, decorations: decorations, recitation: recitation, play: play, stop: stop, toggle: toggle, seek: seek,
    paused: paused, duration: duration };
})();

/* ================= Screens ================= */
(function () {
  var V = App.views;
  var BOOK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 6.5C10.3 5 7.9 4.5 4 4.5v13c3.9 0 6.3.5 8 2 1.7-1.5 4.1-2 8-2v-13c-3.9 0-6.3.5-8 2zm-1 10.6c-1.5-.8-3.4-1.2-5.5-1.3V6.6c2.3.1 4.1.6 5.5 1.6zm7.5-1.3c-2.1.1-4 .5-5.5 1.3V8.2c1.4-1 3.2-1.5 5.5-1.6z"/></svg>';
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';

  function placeName(p) { return p === 'makkah' ? T('Makki') : T('Madani'); }
  function num(n) { return I18N.rtl ? Quran.arNum(n) : String(n); }
  /* "7 verses"; Arabic counts take آيات from 3 to 10 and آية otherwise */
  function verseCount(n) { return I18N.rtl ? Quran.arNum(n) + (n >= 3 && n <= 10 ? ' آيات' : ' آية') : T('{0} verses', n); }
  function suraLabel(c) { return I18N.rtl ? 'سورة ' + c.ar : c.en; }

  function suraTile(c) {
    var el = h('div', { class: 'sura', data: { key: 'sura:' + c.id } }, [
      h('div', { class: 'no', text: num(c.id) }),
      h('div', { class: 'tx' }, [
        h('div', { class: 'ar', text: c.ar }),
        h('div', { class: 'en', text: (I18N.rtl ? '' : c.en + ' · ') + verseCount(c.verses) + ' · ' + placeName(c.place) })
      ])
    ]);
    return Focus.make(el, function () { App.remember('sura:' + c.id); App.go('quranRead', { ch: c.id }); });
  }

  /* ---------- surah list ---------- */
  V.quran = {
    title: '', nav: 'quran',
    render: function (main) {
      var wrap = h('div', { class: 'scroll-y quran-list' });
      main.appendChild(h('div', { class: 'quran-bg' }));
      main.appendChild(wrap);
      wrap.appendChild(h('div', { class: 'spinner center-spin' }));
      Quran.decorations();   // decorations load while the list is open
      return Quran.chapters().then(function (list) {
        wrap.innerHTML = '';
        var p = Quran.prefs(), last = p.last && list[p.last.ch - 1];
        var top = h('div', { class: 'btn-row', 'data-zone': 'qtop' });
        if (last) {
          var cont = Focus.make(h('div', { class: 'btn primary', 'data-autofocus': '1' }), function () { App.go('quranRead', { ch: last.id, ayah: p.last.ayah }); });
          cont.innerHTML = PLAY;
          cont.appendChild(h('span', { text: T('Continue: {0}, verse {1}', suraLabel(last), num(p.last.ayah)) }));
          top.appendChild(cont);
        }
        var rb = Focus.make(h('div', { class: 'btn' }), function () { pickReciter().then(function () { App.refresh(); }); });
        rb.appendChild(h('span', { text: T('Reciter: {0}', Quran.reciterName(Quran.reciter())) }));
        top.appendChild(rb);
        // banner: the title in Quran script over a geometric pattern
        wrap.appendChild(h('div', { class: 'quran-banner' }, [
          h('div', { class: 'qb-title', text: 'القرآن الكريم' }),
          h('div', { class: 'qb-sub', text: T('Listen and read along: the verse and the word being recited light up as you listen.') }),
          top
        ]));
        var g = h('div', { class: 'grid sura-grid', 'data-zone': 'grid' });
        list.forEach(function (c) { g.appendChild(suraTile(c)); });
        // back on the first row of surahs: show the page from the very top again (title and buttons)
        var firstTile = g.firstChild;
        Array.prototype.forEach.call(g.children, function (t) {
          var prev = t._onFocus;
          t._onFocus = function (e) { if (prev) prev(e); if (t.offsetTop === firstTile.offsetTop) wrap.scrollTop = 0; };
        });
        wrap.appendChild(g);
        App.setHints([{ key: 'OK', label: 'Listen & read' }]);
      }).catch(function (e) { App.showError(main, e); });
    }
  };

  function pickReciter() {
    var cur = Quran.prefs().reciter;
    return App.menu('Reciter', Quran.RECITERS.map(function (r) { return { label: Quran.reciterName(r), id: r.id, checked: r.id === cur }; }))
      .then(function (it) { if (it) Quran.setPref('reciter', it.id); return it; });
  }

  /* ---------- the reader: the whole surah as large, justified text filling the screen ---------- */
  function medal(label, n) { return h('div', { class: 'medal' }, [h('small', { text: label }), h('b', { text: Quran.arNum(n) })]); }
  function suraFrame(c) {
    return h('div', { class: 'm-sura' }, [
      h('i', { class: 'arab' }), medal('ترتيبها', c.id),
      h('div', { class: 'cart' }, [h('span', { text: 'سُورَةُ ' + c.ar })]),
      medal('آياتها', c.verses), h('i', { class: 'arab' })
    ]);
  }
  var JUZ = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون',
    'الحادي والعشرون', 'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون', 'الخامس والعشرون', 'السادس والعشرون', 'السابع والعشرون',
    'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون'];
  /* the name of Allah is printed in red, as in many mushafs */
  var MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
  function isAllah(word) { return /^(و|ف)?(ب|ت|ل)?(ٱ|ا)?لله(م)?$/.test(word.replace(MARKS, '')); }

  V.quranRead = {
    title: '', nav: 'quran',
    leave: function () {
      Quran.stop();
      document.getElementById('app-root').classList.remove('immersive');
      if (window.Preview) Preview.suspend(false);
      if (this._cleanup) this._cleanup();
    },
    render: function (main, params) {
      var self = this;
      if (window.Preview) Preview.suspend(true);   // nothing else may play while the Quran is recited
      document.getElementById('app-root').classList.add('immersive');
      var root = h('div', { class: 'mushaf' });
      // the page: a floral border band around cream paper, the surah and juz at the top, the page number at the foot
      var paper = h('div', { class: 'mpaper' });
      var inner = h('div', { class: 'minner' });
      paper.appendChild(inner);
      var topSura = h('span'), topJuz = h('span');
      paper.appendChild(h('div', { class: 'mtopbar' }, [h('div', { class: 'tcart' }, [topSura]), h('div', { class: 'tcart' }, [topJuz])]));   // in the top band of the border
      var scroller = h('div', { class: 'mscroll' });
      inner.appendChild(scroller);
      var pageNo = h('div', { class: 'mnum' }, [h('b')]);
      paper.appendChild(pageNo);
      root.appendChild(paper);
      main.appendChild(root);
      scroller.appendChild(h('div', { class: 'spinner center-spin' }));
      var ch = params.ch, prefs = Quran.prefs(), rec = Quran.reciter();

      root.classList.add('preparing');   // hidden until text, fonts and decorations are all ready
      return Promise.all([Quran.chapters(), Quran.verses(ch).then(function (vs) { return Quran.mushafFonts(vs, params.ayah).then(function (f) { return [vs, f]; }); }), Quran.decorations()]).then(function (r) {
        var info = r[0][ch - 1], verses = r[1][0], fonts = r[1][1], fontVer = fonts.ver, pending = {};
        root.classList.toggle('qpc', !!fontVer);
        scroller.innerHTML = '';
        topSura.textContent = 'سورة ' + info.ar;
        scroller.style.fontSize = prefs.qsize + 'px';

        // surah title frame, basmala, then every verse with its ornate number
        scroller.appendChild(suraFrame(info));
        var basmala = null;
        if (info.basmala) basmala = fontVer ? h('div', { class: 'mbasm g', text: '\uFC41 \uFC42 \uFC43 \uFC44', style: { fontFamily: 'qpcv2p1' } })
          : h('div', { class: 'mbasm', text: Quran.BASMALA });
        var text = h('div', { class: 'mflow', dir: 'rtl', lang: 'ar' });
        var ayahEls = {}, wordEls = {}, pageOf = {}, chunks = [], chunk = null;
        verses.forEach(function (v, vi) {
          // verses go in inline groups (no effect on the lines): only the groups near the screen are drawn
          if (vi % 8 === 0) { chunk = h('span', { class: 'mchunk' }); chunks.push(chunk); text.appendChild(chunk); }
          var a = h('span', { class: 'ayah' });
          wordEls[v.n] = {};
          pageOf[v.n] = v;
          v.words.forEach(function (w) {
            var glyph = fontVer && w.g && w.gp && fonts.loaded[w.gp];
            var later = fontVer && w.g && w.gp && !glyph;   // its page font is still on the way
            if (w.end) {
              // the verse number never starts a line on its own: it stays joined to the verse's last word
              if (a.lastChild && a.lastChild.nodeType === 3) a.lastChild.nodeValue = ' ';
              // the mushaf font has its own verse-end ornament; otherwise our rosette with the number
              var ee = glyph ? h('span', { class: 'end g', text: w.g, style: { fontFamily: 'qpc' + fontVer + 'p' + w.gp } })
                : h('span', { class: 'end' }, [h('b', { text: w.t })]);
              if (later) (pending[w.gp] = pending[w.gp] || []).push({ el: ee, w: w });
              a.appendChild(ee);
              return;
            }
            var we = glyph ? h('span', { class: 'w' + (isAllah(w.t) ? ' allah' : ''), text: w.g, style: { fontFamily: 'qpc' + fontVer + 'p' + w.gp } })
              : h('span', { class: 'w' + (isAllah(w.t) ? ' allah' : ''), text: w.t });
            if (later) (pending[w.gp] = pending[w.gp] || []).push({ el: we, w: w });
            wordEls[v.n][w.p] = we;
            a.appendChild(we);
            a.appendChild(document.createTextNode(' '));
          });
          ayahEls[v.n] = a;
          chunk.appendChild(a);
          chunk.appendChild(document.createTextNode(' '));
        });
        scroller.appendChild(h('div', { class: 'mbody' }, [basmala, text]));   // basmala + verses (centred in the free space when the surah is short)
        // everything that moves sits on one layer that slides with a GPU transform (no re-drawing of the page)
        var track = h('div', { class: 'mtrack' }), curSt = 0;
        while (scroller.firstChild) track.appendChild(scroller.firstChild);
        /* The highlights (verse band and recited word) are drawn on their own layers that slide with the text:
           changing anything inside the text makes the TV re-draw all of it (2 s for Al-Baqarah), these don't. */
        var hlBack = h('div', { class: 'mhl' }), hlFront = h('div', { class: 'mhl' });
        scroller.appendChild(hlBack); scroller.appendChild(track); scroller.appendChild(hlFront);
        var hlWord = h('span', { class: 'hlw' });
        hlWord.style.display = 'none';
        hlFront.appendChild(hlWord);
        var hlAyahEl = null, hlWordEl = null;
        function relRects(el) {
          // measured from the highlight layer itself (the text's first margin can push the track a little lower)
          var tb = hlBack.getBoundingClientRect(), sc = track.getBoundingClientRect().width / (track.offsetWidth || 1) || 1;
          return Array.prototype.map.call(el.getClientRects(), function (r) {
            return { x: (r.left - tb.left) / sc, y: (r.top - tb.top) / sc, w: r.width / sc, h: r.height / sc };
          });
        }
        function drawAyahHL(el) {
          hlAyahEl = el;
          while (hlBack.firstChild) hlBack.removeChild(hlBack.firstChild);
          if (!el) return;
          relRects(el).forEach(function (r) {
            if (r.w < 1) return;
            hlBack.appendChild(h('div', { class: 'hla', style: { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' } }));
          });
        }
        function drawWordHL(we) {
          hlWordEl = we;
          var r = we && relRects(we)[0];
          if (!r) { hlWord.style.display = 'none'; return; }
          hlWord.textContent = we.textContent;
          hlWord.style.fontFamily = we.style.fontFamily || '';
          hlWord.style.left = r.x + 'px'; hlWord.style.top = r.y + 'px'; hlWord.style.width = r.w + 'px';
          hlWord.style.height = r.h + 'px'; hlWord.style.lineHeight = r.h + 'px'; hlWord.style.display = 'block';
        }
        function redrawHL() { drawAyahHL(hlAyahEl); drawWordHL(hlWordEl); }
        /* draw only the verse groups from a screen above to two screens below what is shown */
        var chunkPos = null;
        function measureChunks() { chunkPos = chunks.map(function (c) { var t = c.offsetTop; return [t, t + c.offsetHeight]; }); }
        function showWindow(st) {
          if (!chunkPos) measureChunks();
          var room = scroller.clientHeight || 900, lo = st - room, hi = st + room * 2;
          chunks.forEach(function (c, i) {
            var on = chunkPos[i][1] >= lo && chunkPos[i][0] <= hi;
            if (c._on !== on) { c._on = on; c.style.visibility = on ? '' : 'hidden'; }
          });
        }
        // a short surah that doesn't fill the page sits in the middle of it, top to bottom
        function centerIfShort() {
          scroller.classList.remove('fits');
          var pad = parseFloat(getComputedStyle(text).paddingBottom) || 0;
          if (text.offsetTop + text.offsetHeight - pad <= scroller.clientHeight) scroller.classList.add('fits');
        }
        centerIfShort();
        showFrom(0);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!root.isConnected) return; centerIfShort(); chunkPos = null; showFrom(curSt); redrawHL(); });

        // player bar (hides itself after a few seconds, like the video player)
        var btn = h('div', { class: 'qbtn', 'data-autofocus': '1' });
        Focus.make(btn, function () { Quran.toggle(); });   // the screen's one focusable item
        btn.innerHTML = PAUSE;
        var where = h('div', { class: 'where' }), who = h('div', { class: 'who' });
        var prog = h('div', { class: 'qprog' }, [h('i')]), tm = h('div', { class: 'qtime' });
        var hints = h('div', { class: 'qhints' });
        [['OK', T('Play / Pause')], ['▲ ▼', T('Previous · next verse')], ['◀ ▶', T('Next · previous surah')], [Platform.colorKeys ? 'INFO' : T(Platform.menuKey), T('Options')]]
          .forEach(function (x) { hints.appendChild(h('div', { class: 'hint' }, [h('span', { class: 'key', text: x[0] }), h('span', { text: x[1] })])); });
        var barEl = h('div', { class: 'quran-bar' }, [btn, h('div', { class: 'meta' }, [where, who]), prog, tm, hints]);
        if (Platform.touch) {   // on a touchscreen the key hints become buttons
          hints.innerHTML = '';
          [['▲', function () { self._goAyah(-1); }], ['▼', function () { self._goAyah(1); }], ['◀', function () { self._turn(1); }], ['▶', function () { self._turn(-1); }], ['☰', function () { self._options(); }]].forEach(function (x) {
            var b = h('div', { class: 'qtbtn', text: x[0] });
            Focus.make(b, function () { x[1](); self._showBar(); });
            hints.appendChild(b);
          });
          root.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('.focusable'))) showBar(); });
          /* swipes: right / left = next / previous surah (pages turn right-to-left, as in a printed mushaf),
             up / down = next / previous verse */
          var sx = 0, sy = 0, st0 = 0;
          root.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; st0 = Date.now(); } }, { passive: true });
          root.addEventListener('touchend', function (e) {
            var t = e.changedTouches[0]; if (!t || Date.now() - st0 > 800) return;
            if (e.target.closest && e.target.closest('.quran-bar')) return;
            var dx = t.clientX - sx, dy = t.clientY - sy, ax = Math.abs(dx), ay = Math.abs(dy);
            if (Math.max(ax, ay) < 50) return;
            if (ax > ay * 1.3) self._turn(dx > 0 ? 1 : -1);
            else if (ay > ax * 1.3) self._goAyah(dy < 0 ? 1 : -1);
            else return;
            self._showBar();
          }, { passive: true });
        }
        root.appendChild(barEl);
        var hideT;
        function showBar(ms) { barEl.classList.remove('off'); clearTimeout(hideT); hideT = setTimeout(function () { if (!Quran.paused()) barEl.classList.add('off'); }, ms || 4000); }
        self._showBar = showBar;

        var curAyah = 0, curWord = null, timing = null, endTimer = null;
        function setWhere() {
          var v = pageOf[Math.max(1, curAyah)] || {};
          where.textContent = suraLabel(info) + ' · ' + T('Verse {0} of {1}', num(Math.max(1, curAyah)), num(info.verses));
          who.textContent = Quran.reciterName(rec) + (v.page ? ' · ' + T('Page {0} · Juz {1}', num(v.page), num(v.juz)) : '');
          if (v.page) pageNo.firstChild.textContent = Quran.arNum(v.page);
          if (v.juz) topJuz.textContent = 'الجزء ' + JUZ[v.juz - 1];
        }
        /* like turning a page: when the verse reaches the lower part of the screen, the text moves up so it sits near the top */
        /* The text moves a screen at a time, always by whole lines, and the visible area ends on a whole line:
           no line is ever cut in half at the edge of the page. */
        function lineH() { return parseFloat(getComputedStyle(text).lineHeight) || 130; }
        /* Lines are found from where the words really sit: a line that mixes page fonts can be a little taller than
           the line height, and counting fixed-height lines drifted until lines were cut at the page edges. */
        var flat = null;
        function words() { if (!flat) flat = [].slice.call(text.querySelectorAll('.w, .end')); return flat; }
        function lineTopAt(i) {   // the top of the highest word on word i's line
          var w = words(), t = w[i].offsetTop, half = lineH() / 2, m = t, k;
          for (k = i - 1; k >= 0 && Math.abs(w[k].offsetTop - t) < half; k--) m = Math.min(m, w[k].offsetTop);
          for (k = i + 1; k < w.length && Math.abs(w[k].offsetTop - t) < half; k++) m = Math.min(m, w[k].offsetTop);
          return m;
        }
        function firstBelow(y) {   // the first word that doesn't end above y
          var w = words(), lo = 0, hi = w.length;
          while (lo < hi) { var mid = (lo + hi) >> 1; if (w[mid].offsetTop + w[mid].offsetHeight > y) hi = mid; else lo = mid + 1; }
          return lo;
        }
        function showFrom(st) {
          scroller.style.height = '';
          var room = scroller.clientHeight;
          curSt = st;
          showWindow(st);
          track.style.transform = hlBack.style.transform = hlFront.style.transform = st ? 'translateY(' + (-st) + 'px)' : '';
          if (scroller.classList.contains('fits')) return;
          // the page ends just above the first line that doesn't fit completely
          var j = firstBelow(st + room);
          if (j < words().length) scroller.style.height = Math.max(lineH(), lineTopAt(j) - st - 2) + 'px';
        }
        function keepVisible(el, force) {
          var w = el.classList.contains('ayah') ? el.querySelector('.w, .end') : el;
          if (!w) return;
          var top = w.offsetTop, bot = top + w.offsetHeight, st = curSt, hgt = scroller.clientHeight;
          if (!force && top >= st && bot <= st + hgt) return;   // already in view
          var lt = lineTopAt(Math.max(0, words().indexOf(w)));
          showFrom(lt - text.offsetTop < lineH() / 2 ? 0 : lt - 6);   // the first line: from the very top (title, basmala)
        }
        function markAyah(n, noSave) {
          if (n === curAyah) return;
          curAyah = n;
          if (pageOf[n] && self._needPage) self._needPage(pageOf[n].page);
          if (ayahEls[n]) { keepVisible(ayahEls[n]); drawAyahHL(ayahEls[n]); }
          else if (n === 0) { showFrom(0); drawAyahHL(basmala); }
          else drawAyahHL(null);
          setWhere();
          if (n > 0 && !noSave) Quran.setPref('last', { ch: ch, ayah: n });
        }
        function markWord(p) {
          var we = (wordEls[curAyah] || {})[p] || null;
          if (we === curWord) return;
          curWord = we;
          // a verse that runs past the bottom line: turn the page when the recitation reaches the hidden part
          if (we) keepVisible(we);
          drawWordHL(we);
        }
        function verseAt(ms) {
          var vs = timing.verses;
          for (var i = 0; i < vs.length; i++) if (ms < vs[i].to) return ms >= vs[i].from ? vs[i] : (i === 0 ? null : vs[i - 1]);
          return vs[vs.length - 1];
        }
        function onTime(ms) {
          if (!timing) return;
          var v = verseAt(ms);
          if (!v) { markAyah(0); markWord(null); }
          else {
            if (prefs.repeat && curAyah > 0 && v.n !== curAyah) { goAyah(curAyah); return; }   // repeat one verse
            markAyah(v.n);
            var w = null;
            for (var i = 0; i < v.words.length; i++) if (ms >= v.words[i].from && ms < v.words[i].to) { w = v.words[i]; break; }
            markWord(w ? w.p : null);
          }
          var d = Quran.duration();
          prog.firstChild.style.transform = 'scaleX(' + (d ? Math.min(1, ms / d) : 0) + ')';
          var label = fmtTime(ms) + (d ? ' / ' + fmtTime(d) : '');
          if (label !== tm.textContent) tm.textContent = label;
        }
        function goAyah(n) {
          if (!timing) return;
          var v = timing.verses.filter(function (x) { return x.n === n; })[0];
          if (!v) return;
          Quran.seek(v.from);
          onTime(v.from + 1);
          if (Quran.paused()) Quran.toggle();
        }
        function nextSura(dir) {
          var n = ch + dir;
          if (n >= 1 && n <= 114) App.go('quranRead', { ch: n }, { replace: true });
        }
        self._goAyah = function (d) { goAyah(Math.max(1, Math.min(info.verses, (curAyah > 0 ? curAyah : 0) + d))); };
        self._turn = nextSura;
        self._toggle = function () { Quran.toggle(); };
        self._options = function () { options(info, self); };
        self._cleanup = function () { clearTimeout(endTimer); clearTimeout(hideT); };

        if (params.ayah) markAyah(params.ayah, true); else setWhere();
        requestAnimationFrame(function () { root.classList.remove('preparing'); });
        /* the other pages' fonts, all added in one go once downloaded (one re-layout instead of one per page);
           sooner if the recitation reaches a page that is still waiting */
        function addReadyFonts() {
          var pages = Object.keys(pending), jobs = pages.map(function (p) { return Quran.fontFace(+p).then(function (f) { return [+p, f]; }, function () { return null; }); });
          return Promise.all(jobs).then(function (got) {
            if (!root.isConnected) return;
            var any = false;
            got.forEach(function (x) {
              if (!x || !pending[x[0]]) return;
              Quran.addFont(x[0], x[1]); any = true;
              pending[x[0]].forEach(function (it) {
                it.el.style.fontFamily = 'qpc' + fontVer + 'p' + x[0];
                if (it.w.end) { it.el.className = 'end g'; it.el.textContent = it.w.g; } else it.el.textContent = it.w.g;
              });
              delete pending[x[0]];
            });
            if (!any) return;
            centerIfShort();
            chunkPos = null;
            if (curAyah > 0 && ayahEls[curAyah]) keepVisible(ayahEls[curAyah], true); else showFrom(curSt);
            redrawHL();
          });
        }
        var fontsDone = !fontVer || !fonts.ready;
        if (!fontsDone) fonts.ready.then(function () { fontsDone = true; addReadyFonts(); });
        self._needPage = function (page) { if (!fontsDone && pending[page]) Quran.fontFace(page).then(addReadyFonts, function () {}); };
        showBar(6000);
        Quran.recitation(rec.id, ch).then(function (t) {
          timing = t;
          var sv = params.ayah && t.verses.filter(function (x) { return x.n === params.ayah; })[0];
          Quran.play(t.url, sv ? sv.from : 0, {
            time: onTime,
            state: function (s) {
              btn.innerHTML = s === 'paused' ? PLAY : PAUSE;
              root.classList.toggle('loading', s === 'loading');
              if (s === 'paused') { barEl.classList.remove('off'); clearTimeout(hideT); }
            },
            ended: function () {
              markWord(null);
              if (prefs.autoNext && ch < 114) endTimer = setTimeout(function () { nextSura(1); }, 1500);
              else btn.innerHTML = PLAY;
            },
            error: function () { App.toast('Could not play this recitation'); btn.innerHTML = PLAY; }
          });
        }).catch(function (e) { App.toast(e.message); });
      }).catch(function (e) {
        scroller.innerHTML = '';
        scroller.appendChild(h('div', { class: 'quran-error' }, [h('p', { text: e.message })]));
        root.classList.remove('preparing');   // show the message (the page is hidden until it is ready)
      });
    },
    onKey: function (e) {
      var c = e.keyCode;
      if (!this._toggle) return false;
      if (App.isBack(e)) return false;
      this._showBar();
      if (c === K.ENTER || c === K.PLAYPAUSE || c === K.PLAY || c === K.PAUSE) { this._toggle(); return true; }
      if (c === K.UP || c === K.DOWN) { this._goAyah(c === K.DOWN ? 1 : -1); return true; }
      // Arabic reads right to left: ◀ goes on to the next surah, ▶ back
      if (c === K.LEFT || c === K.RIGHT || c === K.FF || c === K.RW) { this._turn(c === K.LEFT || c === K.FF ? 1 : -1); return true; }
      if (c === K.INFO || c === K.YELLOW || c === K.BLUE) { this._options(); return true; }
      return true;
    }
  };

  function options(info, view) {
    var p = Quran.prefs();
    // redraw at the verse being recited, not from the start
    function redraw() { var l = Quran.prefs().last; view.params.ayah = l && l.ch === info.id ? l.ayah : null; App.refresh(); }
    App.menu('سورة ' + info.ar, [
      { label: 'Reciter', value: Quran.reciterName(Quran.reciter()), a: 'rec' },
      { label: 'Text size', value: String(p.qsize), a: 'size' },
      { label: 'Repeat the current verse', value: p.repeat ? 'On' : 'Off', a: 'repeat' },
      { label: 'Continue to the next surah', value: p.autoNext ? 'On' : 'Off', a: 'next' },
      { label: 'All surahs', a: 'list' }
    ]).then(function (it) {
      if (!it) return;
      if (it.a === 'rec') pickReciter().then(function (r) { if (r) redraw(); });
      if (it.a === 'size') App.menu('Text size', [[52, 'Small'], [64, 'Large'], [76, 'Larger'], [88, 'Largest']].map(function (s) {
        return { label: s[1], value: String(s[0]), s: s[0], checked: s[0] === p.qsize };
      })).then(function (x) { if (x) { Quran.setPref('qsize', x.s); redraw(); } });
      if (it.a === 'repeat') { Quran.setPref('repeat', !p.repeat); App.toast(!p.repeat ? 'Repeating this verse' : 'Repeat off'); redraw(); }
      if (it.a === 'next') { Quran.setPref('autoNext', !p.autoNext); redraw(); }
      if (it.a === 'list') App.go('quran', {}, { reset: true });
    });
  }
})();
