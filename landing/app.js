/* Mdluex IPTV landing page: language (English / Arabic), theme (light / dark), TV guides, and download
   buttons that always point at the newest GitHub release. */
(function () {
  var REPO = 'mdluex/mdluex-iptv';
  var html = document.documentElement;

  /* ---------- Arabic texts (English is written in the page itself) ---------- */
  var AR = {
    'nav.install': 'التثبيت', 'nav.download': 'التحميل', 'nav.features': 'المميزات', 'nav.help': 'المساعدة', 'nav.donate': 'ادعمنا', 'nav.server': 'السيرفر',
    'srv.eyebrow': 'لمحتواك الخاص', 'srv.title': 'سيرفر Mdluex IPTV', 'srv.sub': 'عندك أفلامك ومسلسلاتك أو قنواتك؟ شغّل سيرفر IPTV خاصًا بك على كمبيوتر ويندوز وشاهده على كل تلفزيون في البيت — بتطبيق Mdluex IPTV أو بأي تطبيق IPTV آخر. بدون كتابة عنوان IP: اختر في التطبيق «ابحث عن السيرفر».',
    'srv.media.t': 'أفلامك ومسلسلاتك', 'srv.media.p': 'اختر مجلداتك: الأسماء والمواسم والحلقات تُقرأ من أسماء الملفات، مع البوسترات والقصص والإعلانات من TMDB — أو صورة من الفيديو نفسه.',
    'srv.live.t': 'قنوات مباشرة ودليل برامج', 'srv.live.p': 'أضف القنوات أو استورد قائمة M3U، مع دليل برامج XMLTV يتحدّث تلقائيًا.',
    'srv.users.t': 'حسابات وعدد شاشات', 'srv.users.p': 'حساب لكل مشاهد بتاريخ انتهاء وحد للشاشات. شاهد من يتابع الآن وافصله إن أردت.',
    'srv.admin.t': 'لوحة تحكم سهلة', 'srv.admin.p': 'كل شيء من المتصفح وبنفس شكل Mdluex. يفتح جدار حماية ويندوز بنفسه (بضغطة واحدة) ومعه FFmpeg.',
    'srv.compat.t': 'يعمل مع أي مشغّل', 'srv.compat.p': 'واجهة Xtream Codes القياسية وقوائم M3U: يتصل به Mdluex IPTV وتطبيقات IPTV الأخرى.',
    'srv.free.t': 'مجاني للاستخدام الشخصي', 'srv.free.p': 'لمحتواك الخاص في البيت. تشغيل خدمة مدفوعة به يحتاج إذنًا مكتوبًا.',
    'srv.dl': 'تحميل لويندوز (43 ميجا)', 'srv.guide': 'دليل الإعداد',
    'don.eyebrow': 'الدعم', 'don.title': 'أعجبك Mdluex IPTV؟', 'don.sub': 'التطبيق مجاني وبدون إعلانات. إن جعل تلفزيونك أفضل يمكنك دعم تطويره — اضغط على زر، أو امسح أحد الرمزين بكاميرا هاتفك.',
    'don.patreon': 'ادعمنا شهريًا وتابع كل جديد قادم.', 'don.patreon.btn': 'ادعمنا على Patreon', 'don.bmc': 'شكر لمرة واحدة، بأي مبلغ.', 'don.bmc.btn': 'اشترِ لنا قهوة', 'foot.donate': 'ادعم التطبيق:',
    'lang.switch': 'English',
    'hero.kicker': 'مجاني · بدون إعلانات · للاستخدام الشخصي',
    'hero.title': 'اشتراك الـ IPTV الخاص بك، بشكل رائع على شاشتك',
    'hero.lead': 'قنوات مباشرة وأفلام ومسلسلات من اشتراك الـ IPTV الخاص بك — بالإضافة إلى القرآن الكريم مع التلاوة المباشرة وقنوات يوتيوب المفضلة لديك. لشاشات سامسونج وإل جي وAndroid TV وFire TV.',
    'hero.cta': 'ثبّته على شاشتي', 'hero.download': 'تحميل الملفات', 'hero.checking': 'جارٍ التحقق من أحدث إصدار…',
    'hero.version': 'أحدث إصدار: {v} · {d}',
    'note.player': 'تطبيق Mdluex IPTV مجرد مشغّل، ولا يأتي بقنوات أو أفلام أو مسلسلات — تسجّل الدخول باشتراك الـ IPTV الذي لديك بالفعل. القرآن الكريم وقنوات يوتيوب تعمل بدون اشتراك.',
    'pick.eyebrow': 'الخطوة ١', 'pick.title': 'ما نوع شاشتك؟', 'pick.sub': 'اختر شاشتك واتبع الصور. معظم الناس ينتهون خلال ٥ دقائق.',
    'pick.firetv': 'Fire TV Stick وCube وشاشات Fire TV', 'pick.android': 'Chromecast وShield وMi Box وسوني وTCL وهايسنس…',
    'pick.samsung': 'الشاشات الذكية من موديلات 2018 وأحدث', 'pick.lg': 'webOS 6 وأحدث (2021 فما بعد)',
    'level.easy': 'سهل', 'level.medium': 'تحتاج موبايل أو كمبيوتر مرة واحدة', 'level.hard': 'تحتاج كمبيوتر مرة واحدة',
    'g.title': 'التثبيت على', 'copy': 'نسخ', 'copied': 'تم النسخ',
    'fire.1.t': 'حمّل تطبيق «Downloader» المجاني', 'fire.1.p': 'على جهاز Fire TV ابحث عن Downloader في متجر التطبيقات وثبّته.',
    'fire.2.t': 'اسمح له بتثبيت التطبيقات', 'fire.2.p': 'الإعدادات ← My Fire TV ← Developer options ← Install unknown apps ← فعّلها لتطبيق Downloader.',
    'fire.2.tip': 'لا تجد «Developer options»؟ اذهب إلى الإعدادات ← My Fire TV ← About واضغط على اسم جهازك ٧ مرات.',
    'fire.3.t': 'اكتب هذا العنوان واضغط Go', 'fire.3.p': 'سيتم تحميل أحدث إصدار تلقائيًا.',
    'fire.4.t': 'اختر Install ثم Open', 'fire.4.p': 'في المرة القادمة ستجد Mdluex IPTV في «Your Apps & Channels».',
    'fire.vega': 'أحدث أجهزة Fire TV التي تعمل بنظام Vega OS لا تسمح بتثبيت تطبيقات من خارج متجر أمازون، لذلك لن يعمل عليها Mdluex IPTV.',
    'and.1.t': 'حمّل تطبيق «Downloader» المجاني', 'and.1.p': 'ثبّت Downloader (من AFTVnews) من متجر Google Play على شاشتك.',
    'and.3.t': 'اسمح له ثم ثبّت', 'and.3.p': 'عندما يطلب أندرويد، اسمح لـ Downloader بتثبيت التطبيقات غير المعروفة، ثم اختر Install.',
    'and.4.t': 'افتح Mdluex IPTV', 'and.4.p': 'ستجده في تطبيقاتك. تفضّل فلاشة USB؟ حمّل ملف أندرويد بالأسفل وافتحه بمدير الملفات.',
    'sam.intro': 'شاشات سامسونج لا تقبل التطبيقات من خارج متجرها إلا إذا كان التطبيق مُجهّزًا لشاشتك. تطبيق Apps2Samsung المجاني يقوم بذلك بدلًا منك.',
    'sam.1.t': 'فعّل وضع المطوّر', 'sam.1.p': 'على الشاشة افتح Apps ثم اضغط ١ ٢ ٣ ٤ ٥ على الريموت. ستفتح نافذة «Developer Mode» — اجعلها On.',
    'sam.2.t': 'اكتب عنوان الموبايل أو الكمبيوتر', 'sam.2.p': 'في خانة «Host PC IP» اكتب عنوان IP للموبايل أو الكمبيوتر الذي ستستخدمه (الموبايل: الإعدادات ← Wi-Fi ← شبكتك). ثم أطفئ الشاشة وشغّلها.',
    'sam.3.t': 'ثبّته باستخدام Apps2Samsung', 'sam.3.p': 'حمّل Apps2Samsung (ويندوز أو ماك أو لينكس أو أندرويد أو آيفون)، وابحث عن Mdluex IPTV في القائمة واختر Install. في أول مرة سجّل الدخول بحساب سامسونج مجاني.',
    'sam.3.link': 'حمّل Apps2Samsung ←',
    'sam.alt.t': 'عندك كمبيوتر ويندوز؟ استخدم برنامج التثبيت بضغطة واحدة', 'sam.alt.1': 'نفّذ الخطوتين ١ و٢ بعنوان الكمبيوتر.',
    'sam.alt.2': 'حمّل برنامج تثبيت سامسونج (.zip) من الأسفل، وفك الضغط عنه، واضغط مرتين على Install-MdluexIPTV.cmd.',
    'sam.alt.3': 'اتبع الشاشات — سيجد شاشتك ويثبّت التطبيق. شغّله مرة أخرى في أي وقت للتحديث.',
    'lg.intro': 'إل جي تسمح بالتطبيقات من خارج متجرها عن طريق تطبيق Developer Mode ومتجر Homebrew Channel المجاني. ستجهّز هذا مرة واحدة فقط.',
    'lg.1.t': 'فعّل وضع المطوّر', 'lg.1.p': 'أنشئ حسابًا مجانيًا على webostv.developer.lge.com. على الشاشة ثبّت «Developer Mode» من LG Content Store، وسجّل الدخول وفعّل Dev Mode Status.',
    'lg.2.t': 'ثبّت Homebrew Channel', 'lg.2.p': 'اتبع دليل Homebrew Channel (يستخدم برنامج webOS Dev Manager المجاني على الكمبيوتر).', 'lg.2.link': 'دليل Homebrew Channel ←',
    'lg.3.t': 'أضف قائمتنا وثبّت', 'lg.3.p': 'في Homebrew Channel افتح Settings ← Add repository واكتب:', 'lg.3.p2': 'ثم ابحث عن Mdluex IPTV في القائمة وثبّته.',
    'lg.extend': 'وضع المطوّر في إل جي يتوقف تلقائيًا بعد حوالي ٦ أسابيع: افتح تطبيق Developer Mode من وقت لآخر واضغط Extend.',
    'setup.eyebrow': 'الخطوة ٢', 'setup.title': 'أضف اشتراكك',
    'setup.1': 'افتح Mdluex IPTV واختر «Add IPTV playlist».', 'setup.2': 'اكتب عنوان السيرفر واسم المستخدم وكلمة المرور التي أعطاها لك مزوّد الـ IPTV.',
    'setup.3': 'احفظ — ستظهر قنواتك وأفلامك ومسلسلاتك، وتاريخ انتهاء اشتراكك في الأعلى.',
    'setup.qr': 'أسهل: امسح رمز QR الظاهر على الشاشة بهاتفك، واكتب بيانات الدخول هناك ثم اضغط إرسال — ستظهر على الشاشة تلقائيًا ومشفّرة.',
    'setup.demo': 'تريد التجربة فقط؟ افتح القرآن الكريم، أو شاهد قنوات يوتيوب — بدون أي اشتراك.',
    'dl.eyebrow': 'دائمًا أحدث إصدار', 'dl.title': 'التحميل', 'dl.sub': 'هذه الملفات من أحدث إصدار مباشرةً.', 'dl.all': 'كل الملفات وملاحظات الإصدار على GitHub ←',
    'dl.android.t': 'Android TV و Fire TV', 'dl.android.d': 'ملف التطبيق (APK). الأسهل: استخدم Downloader والعنوان المكتوب أعلاه.',
    'dl.samsung.t': 'سامسونج — برنامج التثبيت', 'dl.samsung.d': 'لكمبيوتر ويندوز: فك الضغط واضغط مرتين على Install-MdluexIPTV.cmd.',
    'dl.wgt.t': 'سامسونج — ملف التطبيق', 'dl.wgt.d': 'لبرامج التثبيت مثل Apps2Samsung (التي تجهّزه لشاشتك).',
    'dl.lg.t': 'إل جي (webOS)', 'dl.lg.d': 'حزمة التطبيق. الأسهل: أضف قائمتنا في Homebrew Channel.',
    'dl.get': 'تحميل', 'dl.size': '{s} م.ب', 'dl.version': 'الإصدار {v} · صدر {d}', 'dl.fail': 'تعذّر الوصول إلى GitHub الآن — افتح صفحة الإصدارات مباشرة.', 'dl.open': 'افتح صفحة الإصدارات',
    'feat.eyebrow': 'ماذا بالداخل', 'feat.title': 'كل شيء في تطبيق واحد',
    'feat.live.t': 'القنوات المباشرة', 'feat.live.p': 'شعارات القنوات، ودليل البرامج لما يُعرض الآن والتالي، والمفضلة وآخر ما شاهدت.',
    'feat.movies.t': 'أفلام ومسلسلات', 'feat.movies.p': 'بوسترات، ومواسم وحلقات، وقائمتي، وأزرار الحلقة السابقة والتالية، وتشغيل الحلقة التالية تلقائيًا.',
    'feat.resume.t': 'أكمل من حيث توقفت', 'feat.resume.p': 'الأفلام والحلقات والفيديوهات تتذكر مكانك.',
    'feat.quran.t': 'القرآن الكريم', 'feat.quran.p': 'صفحة مصحف مع ١٢ قارئًا — تضيء الآية والكلمة التي تُتلى أثناء الاستماع.',
    'feat.yt.t': 'قنوات يوتيوب', 'feat.yt.p': 'أضف قنواتك المفضلة؛ تظهر أحدث فيديوهاتها في الشاشة الرئيسية.',
    'feat.lang.t': 'عربي وإنجليزي', 'feat.lang.p': 'يتبع لغة شاشتك، ومن اليمين لليسار بالكامل بالعربية. مع قفل للأطفال.',
    'shot.movies': 'الأفلام', 'shot.series': 'المسلسلات والحلقات', 'shot.live': 'القنوات المباشرة مع دليل البرامج', 'shot.yt': 'قنوات يوتيوب', 'shot.quran': 'القرآن الكريم، تتبّع التلاوة كلمة بكلمة', 'shot.qr': 'أضف قائمتك بمسح رمز QR',
    'help.eyebrow': 'أسئلة', 'help.title': 'تحتاج مساعدة؟', 'help.issue': 'ما زالت عندك مشكلة؟ أخبرنا بموديل شاشتك وما يحدث ←',
    'q.free.t': 'هل هو مجاني؟ هل فيه قنوات؟', 'q.free.p': 'التطبيق مجاني، ولا يحتوي على قنوات — تحتاج اشتراك IPTV خاص بك. القرآن الكريم وقنوات يوتيوب تعمل بدونه.',
    'q.freeze.t': 'قناة مباشرة تقف أو لا تعمل.', 'q.freeze.p': 'افتح الإعدادات ← نوع بث القنوات المباشرة وبدّل بين MPEG-TS وHLS. غالبًا يعمل أحدهما أفضل مع مزوّد الخدمة.',
    'q.login.t': 'يقول إن بيانات الدخول خطأ أو منتهية.', 'q.login.p': 'تأكّد من عنوان السيرفر واسم المستخدم وكلمة المرور مع مزوّد الـ IPTV — هو وحده من يستطيع حل مشاكل الاشتراك.',
    'q.samsung.t': 'سامسونج: Apps2Samsung لا يجد شاشتي.', 'q.samsung.p': 'تأكّد أن الشاشة والموبايل أو الكمبيوتر على نفس شبكة الـ Wi-Fi، وأن «Host PC IP» في وضع المطوّر هو العنوان الحالي لذلك الجهاز. ثم أعد تشغيل الشاشة.',
    'q.update.t': 'كيف أحدّث التطبيق؟', 'q.update.p': 'Fire TV / Android TV: كرّر خطوات Downloader. سامسونج: يظهر التحديث في Apps2Samsung. إل جي: يظهر التحديث في Homebrew Channel. إعداداتك تبقى كما هي.',
    'q.pin.t': 'ما هو الرقم السري لقفل الأطفال؟', 'q.pin.p': 'يبدأ بـ 0000. غيّره من الإعدادات ← تغيير الرقم السري.',
    'contact.mail.t': 'الدعم والاستخدام التجاري', 'contact.web.t': 'الموقع الرسمي', 'foot.business': 'الدعم والاستخدام التجاري:',
    'foot.license': 'مجاني للاستخدام الشخصي. ليس للبيع أو لخدمات IPTV المدفوعة.', 'foot.by': 'من تطوير'
  };
  var EN = {
    'lang.switch': 'العربية', 'copied': 'Copied', 'hero.version': 'Latest version: {v} · {d}',
    'dl.android.t': 'Android TV & Fire TV', 'dl.android.d': 'The app file (APK). Easiest: use Downloader and the address above.',
    'dl.samsung.t': 'Samsung — installer', 'dl.samsung.d': 'For a Windows PC: unzip and double-click Install-MdluexIPTV.cmd.',
    'dl.wgt.t': 'Samsung — app file', 'dl.wgt.d': 'For installers like Apps2Samsung (they prepare it for your TV).',
    'dl.lg.t': 'LG (webOS)', 'dl.lg.d': 'The app package. Easiest: add our list in Homebrew Channel.',
    'dl.get': 'Download', 'dl.size': '{s} MB', 'dl.version': 'Version {v} · released {d}',
    'dl.fail': "Couldn't reach GitHub right now — open the releases page directly.", 'dl.open': 'Open the releases page'
  };

  var lang = html.lang === 'ar' ? 'ar' : 'en';
  var originals = {};
  function t(key, vars) {
    var s = (lang === 'ar' ? AR[key] : null) || EN[key] || originals[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function applyLang() {
    html.lang = lang; html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-t]').forEach(function (el) {
      var k = el.getAttribute('data-t');
      if (!(k in originals)) originals[k] = el.textContent;
      el.textContent = lang === 'ar' ? (AR[k] || originals[k]) : (EN[k] || originals[k]);
    });
    document.title = lang === 'ar' ? 'Mdluex IPTV — ثبّته على شاشتك' : 'Mdluex IPTV — Install on your TV';
    if (release) renderRelease(release); else if (failed) renderFail();
  }
  document.getElementById('langBtn').addEventListener('click', function () {
    lang = lang === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('mdx-lang', lang); } catch (e) {}
    applyLang();
  });

  /* ---------- light / dark ---------- */
  document.getElementById('themeBtn').addEventListener('click', function () {
    var dark = html.getAttribute('data-theme') !== 'dark';
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('mdx-theme', dark ? 'dark' : 'light'); } catch (e) {}
  });

  /* ---------- which TV: show its guide ---------- */
  var cards = document.querySelectorAll('.pick-card');
  function showGuide(id, scroll) {
    cards.forEach(function (c) { var on = c.getAttribute('data-guide') === id; c.classList.toggle('active', on); c.setAttribute('aria-selected', on); });
    document.querySelectorAll('.guide').forEach(function (g) { g.classList.toggle('show', g.id === 'guide-' + id); });
    if (scroll) document.getElementById('guides').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  cards.forEach(function (c) { c.addEventListener('click', function () { showGuide(c.getAttribute('data-guide'), true); }); });
  var fromHash = (location.hash || '').slice(1);
  showGuide(['firetv', 'android', 'samsung', 'lg'].indexOf(fromHash) >= 0 ? fromHash : 'firetv', false);

  /* ---------- copy buttons ---------- */
  var toastEl = document.getElementById('toast'), toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 1800); }
  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var done = function () { toast(t('copied')); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
    });
  });

  /* ---------- downloads: always the newest release ---------- */
  var release = null, failed = false;
  var KINDS = [
    { test: /-android\.apk$/i, key: 'android', icon: 'ico-android.svg' },
    { test: /^MdluexIPTV-v[\d.]+\.zip$/i, key: 'samsung', icon: 'ico-samsung.svg' },
    { test: /^MdluexIPTV-v[\d.]+\.wgt$/i, key: 'wgt', icon: 'ico-samsung.svg' },
    { test: /-lg-webos\.ipk$/i, key: 'lg', icon: 'ico-lg.svg' }
  ];
  function niceDate(iso) {
    try { return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso.slice(0, 10); }
  }
  function renderRelease(r) {
    var v = String(r.tag_name || '').replace(/^v/, ''), d = niceDate(r.published_at);
    document.getElementById('heroVersion').textContent = t('hero.version', { v: v, d: d });
    document.getElementById('relInfo').textContent = t('dl.version', { v: v, d: d });
    var box = document.getElementById('downloads');
    box.innerHTML = '';
    KINDS.forEach(function (k) {
      var a = (r.assets || []).filter(function (x) { return k.test.test(x.name); })[0];
      if (!a) return;
      var card = document.createElement('div');
      card.className = 'dl-card';
      card.innerHTML = '<div class="dl-ico"><img alt="" src="img/' + k.icon + '"></div><strong></strong><small></small><span class="meta"></span>' +
        '<a class="btn primary" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg><span></span></a>';
      card.querySelector('strong').textContent = t('dl.' + k.key + '.t');
      card.querySelector('small').textContent = t('dl.' + k.key + '.d');
      card.querySelector('.meta').textContent = a.name + ' · ' + t('dl.size', { s: (a.size / 1048576).toFixed(1) });
      var btn = card.querySelector('a');
      btn.href = a.browser_download_url;
      btn.querySelector('span').textContent = t('dl.get');
      box.appendChild(card);
    });
  }
  function renderFail() {
    document.getElementById('heroVersion').textContent = '';
    var box = document.getElementById('downloads');
    box.innerHTML = '<div class="dl-card" style="grid-column:1/-1"><strong></strong><a class="btn primary" target="_blank" rel="noopener" href="https://github.com/' + REPO + '/releases/latest"></a></div>';
    box.querySelector('strong').textContent = t('dl.fail');
    box.querySelector('a').textContent = t('dl.open');
  }
  fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (r) { release = r; renderRelease(r); })
    .catch(function () { failed = true; renderFail(); });

  applyLang();
})();

/* the demo video in the TV picture: plays muted and looping by itself; with "reduce motion" it waits for a click.
   If the video can't play (no connection, old browser), the home screen picture is shown instead. */
(function () {
  var v = document.getElementById('tvDemo'), play = document.getElementById('tvPlay');
  if (!v) return;
  function fallback() {
    if (!v.parentNode) return;
    var img = document.createElement('img');
    img.src = 'screens/home.png'; img.alt = 'Mdluex IPTV home screen';
    v.parentNode.replaceChild(img, v); play.hidden = true;
  }
  if (typeof v.play !== 'function' || (v.canPlayType && !v.canPlayType('video/mp4'))) { fallback(); return; }
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function start() { var p = v.play(); if (p && p.catch) p.catch(function () { play.hidden = false; }); }
  v.addEventListener('error', fallback);
  v.addEventListener('play', function () { play.hidden = true; });
  v.addEventListener('pause', function () { play.hidden = false; });
  v.addEventListener('click', function () { if (v.paused) start(); else v.pause(); });
  play.addEventListener('click', start);
  play.hidden = !calm;
  if (!calm) start();
})();
