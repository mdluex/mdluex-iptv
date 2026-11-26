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
  /* every verse of a surah, word by word, with its mushaf page and juz (the API returns 50 verses per request) */
  var textCache = {};
  function verses(ch) {
    if (textCache[ch]) return textCache[ch];
    var url = API + '/verses/by_chapter/' + ch + '?words=true&word_fields=text_uthmani,code_v2,v2_page&fields=page_number,juz_number&per_page=50&page=';
    textCache[ch] = getJSON(url + 1).then(function (first) {
      var all = [Promise.resolve(first)];
      for (var p = 2; p <= first.pagination.total_pages; p++) all.push(getJSON(url + p));
      return Promise.all(all);
    }).then(function (all) {
      var out = [];
      all.forEach(function (pg) {
        pg.verses.forEach(function (v) {
          out.push({ n: v.verse_number, page: v.page_number, juz: v.juz_number,
            words: v.words.map(function (w) { return { p: w.position, t: w.text_uthmani, g: w.code_v2, gp: w.v2_page, end: w.char_type_name === 'end' }; }) });
        });
      });
      return out;
    }).catch(function (e) { delete textCache[ch]; throw e; });
    return textCache[ch];
  }
  /* ---------- the mushaf font from Quran.com: the King Fahd Complex lettering, one font per mushaf page,
     each word one glyph. The plain (black) version; the name of Allah is coloured by the app. ---------- */
  var FONT_BASE = 'https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p';
  var fontJobs = {};
  function pageFont(page) {
    if (fontJobs[page]) return fontJobs[page];
    var name = 'qpcv2p' + page;
    fontJobs[page] = typeof FontFace === 'undefined' ? Promise.reject(new Error('no FontFace')) :
      new FontFace(name, 'url(' + FONT_BASE + page + '.woff2)', { display: 'block' }).load().then(function (f) { document.fonts.add(f); return name; })
        .catch(function (e) { delete fontJobs[page]; throw e; });
    return fontJobs[page];
  }
  /* the fonts for every page of a surah; resolves to 'v2', or null (then the bundled font is used) */
  function mushafFonts(verses) {
    var pages = {};
    verses.forEach(function (v) { v.words.forEach(function (w) { if (w.gp) pages[w.gp] = 1; }); });
    var list = Object.keys(pages);
    if (!list.length) return Promise.resolve(null);
    if (list.indexOf('1') < 0) list.push('1');   // page 1 also draws the basmala
    return Promise.all(list.map(pageFont)).then(function () { return 'v2'; }).catch(function () { return null; });
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
    chapters: chapters, verses: verses, mushafFonts: mushafFonts, recitation: recitation, play: play, stop: stop, toggle: toggle, seek: seek,
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
      main.appendChild(wrap);
      wrap.appendChild(h('div', { class: 'spinner center-spin' }));
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
      ['tl', 'tr', 'bl', 'br'].forEach(function (c) { paper.appendChild(h('i', { class: 'qc ' + c })); });
      paper.appendChild(inner);
      var topSura = h('span'), topJuz = h('span');
      inner.appendChild(h('div', { class: 'mtopbar' }, [h('div', { class: 'tcart' }, [topSura]), h('div', { class: 'tcart' }, [topJuz])]));
      var scroller = h('div', { class: 'mscroll' });
      inner.appendChild(scroller);
      var pageNo = h('div', { class: 'mnum' }, [h('b')]);
      paper.appendChild(pageNo);
      root.appendChild(paper);
      main.appendChild(root);
      scroller.appendChild(h('div', { class: 'spinner center-spin' }));
      var ch = params.ch, prefs = Quran.prefs(), rec = Quran.reciter();

      return Promise.all([Quran.chapters(), Quran.verses(ch).then(function (vs) { return Quran.mushafFonts(vs).then(function (ver) { return [vs, ver]; }); })]).then(function (r) {
        var info = r[0][ch - 1], verses = r[1][0], fontVer = r[1][1];
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
        var ayahEls = {}, wordEls = {}, pageOf = {};
        verses.forEach(function (v) {
          var a = h('span', { class: 'ayah' });
          wordEls[v.n] = {};
          pageOf[v.n] = v;
          v.words.forEach(function (w) {
            var glyph = fontVer && w.g && w.gp;
            if (w.end) {
              // the verse number never starts a line on its own: it stays joined to the verse's last word
              if (a.lastChild && a.lastChild.nodeType === 3) a.lastChild.nodeValue = ' ';
              // the mushaf font has its own verse-end ornament; otherwise our rosette with the number
              if (glyph) a.appendChild(h('span', { class: 'end g', text: w.g, style: { fontFamily: 'qpc' + fontVer + 'p' + w.gp } }));
              else a.appendChild(h('span', { class: 'end' }, [h('b', { text: w.t })]));
              return;
            }
            var we = glyph ? h('span', { class: 'w' + (isAllah(w.t) ? ' allah' : ''), text: w.g, style: { fontFamily: 'qpc' + fontVer + 'p' + w.gp } })
              : h('span', { class: 'w' + (isAllah(w.t) ? ' allah' : ''), text: w.t });
            wordEls[v.n][w.p] = we;
            a.appendChild(we);
            a.appendChild(document.createTextNode(' '));
          });
          ayahEls[v.n] = a;
          text.appendChild(a);
          text.appendChild(document.createTextNode(' '));
        });
        scroller.appendChild(h('div', { class: 'mbody' }, [basmala, text]));   // basmala + verses (centred in the free space when the surah is short)
        // a short surah that doesn't fill the page sits in the middle of it, top to bottom
        function centerIfShort() {
          scroller.classList.remove('fits');
          var pad = parseFloat(getComputedStyle(text).paddingBottom) || 0;
          if (text.offsetTop + text.offsetHeight - pad <= scroller.clientHeight) scroller.classList.add('fits');
        }
        centerIfShort();
        showFrom(0);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { centerIfShort(); showFrom(scroller.scrollTop); });

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
        function showFrom(st) {
          var L = lineH(), off = text.offsetTop;
          scroller.style.height = '';
          var room = scroller.clientHeight;
          scroller.scrollTop = st;
          if (scroller.classList.contains('fits')) return;
          var k = Math.floor((st + room - off) / L);   // lines of the text that fit completely
          if (k >= 1) scroller.style.height = Math.max(L, off + k * L - st) + 'px';
        }
        function keepVisible(el) {
          var L = lineH(), off = text.offsetTop, st = scroller.scrollTop, hgt = scroller.clientHeight;
          var line = Math.max(0, Math.floor((el.offsetTop - off + L * 0.3) / L));
          var lineTop = off + line * L;
          if (lineTop >= st && lineTop + L <= st + hgt) return;   // the verse's first line is already in view
          showFrom(line === 0 ? 0 : lineTop);
        }
        function markAyah(n, noSave) {
          if (n === curAyah) return;
          if (ayahEls[curAyah]) ayahEls[curAyah].classList.remove('cur');
          if (basmala) basmala.classList.toggle('cur', n === 0);
          curAyah = n;
          if (ayahEls[n]) { ayahEls[n].classList.add('cur'); keepVisible(ayahEls[n]); }
          else if (n === 0) scroller.scrollTop = 0;
          setWhere();
          if (n > 0 && !noSave) Quran.setPref('last', { ch: ch, ayah: n });
        }
        function markWord(p) {
          var we = (wordEls[curAyah] || {})[p] || null;
          if (we === curWord) return;
          if (curWord) curWord.classList.remove('on');
          curWord = we;
          if (curWord) curWord.classList.add('on');
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
          prog.firstChild.style.width = d ? Math.min(100, ms / d * 100) + '%' : '0';
          tm.textContent = fmtTime(ms) + (d ? ' / ' + fmtTime(d) : '');
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
