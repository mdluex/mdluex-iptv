/* App language: English or Arabic (right-to-left).
   "Automatic" follows the TV's own language; Settings → Language can choose one.
   T('Text {0}', x) returns the text in the current language with {0}, {1}… filled in. */
var I18N = (function () {
  var AR = {
    /* navigation */
    'Home': 'الرئيسية', 'Search': 'بحث', 'Live TV': 'البث المباشر', 'Movies': 'الأفلام', 'Series': 'المسلسلات',
    'My List': 'قائمتي', 'Mdluex Channel': 'قناة Mdluex', 'Settings': 'الإعدادات', 'Quran': 'القرآن الكريم',
    'YouTube Channels': 'قنوات يوتيوب',
    /* general */
    'OK': 'موافق', 'Cancel': 'إلغاء', 'Exit': 'خروج', 'Stay': 'البقاء', 'Back': 'رجوع', 'Open': 'فتح', 'Menu': 'القائمة',
    'Options': 'خيارات', 'Play': 'تشغيل', 'Watch': 'مشاهدة', 'Return': 'رجوع', 'Change': 'تغيير', 'Type': 'كتابة',
    'Results': 'النتائج', 'Delete': 'حذف', 'Edit': 'تعديل', 'Clear': 'مسح', 'Cleared': 'تم المسح', 'Hide': 'إخفاء',
    'Show': 'إظهار', 'On': 'مفعّل', 'Off': 'إيقاف', 'Never': 'أبدًا', 'Save': 'حفظ', 'Add': 'إضافة', 'Remove': 'إزالة',
    'Try again': 'حاول مرة أخرى', 'Something went wrong': 'حدث خطأ ما', 'Exit Mdluex IPTV?': 'الخروج من Mdluex IPTV؟',
    'Exit works on the TV': 'الخروج يعمل على الشاشة فقط', 'just now': 'الآن', '{0} min ago': 'منذ {0} دقيقة',
    '{0} h ago': 'منذ {0} ساعة', '{0} days ago': 'منذ {0} يوم', 'AM': 'ص', 'PM': 'م',
    'Loading {0}…': 'جارٍ تحميل {0}…', 'Demo playback': 'تشغيل تجريبي',
    /* PIN */
    'Enter PIN': 'أدخل الرقم السري', 'Use the number buttons on your remote or the pad below.': 'استخدم أزرار الأرقام في الريموت أو لوحة الأرقام بالأسفل.',
    'Wrong PIN': 'رقم سري خاطئ', 'Locked category': 'قسم مقفل', 'New PIN': 'الرقم السري الجديد', 'Repeat the new PIN': 'أعد إدخال الرقم السري الجديد',
    'PIN changed': 'تم تغيير الرقم السري', 'PINs did not match': 'الرقمان غير متطابقين', 'Enter PIN to change': 'أدخل الرقم السري للتغيير',
    /* playlists & account */
    'Add playlist': 'إضافة قائمة', '+ Add playlist': '+ إضافة قائمة', ' (demo)': ' (تجريبي)', 'Manage playlists': 'إدارة القوائم',
    'Switch playlist': 'تبديل القائمة', 'Switched to {0}': 'تم التبديل إلى {0}', 'Add IPTV playlist': 'إضافة قائمة IPTV',
    'Edit playlist': 'تعديل القائمة', 'Name (anything you like)': 'الاسم (أي اسم تريده)', 'Server address': 'عنوان السيرفر',
    'Username': 'اسم المستخدم', 'Password': 'كلمة المرور', 'My IPTV': 'My IPTV',
    'Server address and username are required.': 'عنوان السيرفر واسم المستخدم مطلوبان.', 'Checking…': 'جارٍ التحقق…',
    'Save & connect': 'حفظ واتصال', 'Connecting…': 'جارٍ الاتصال…', 'expires {0}': 'ينتهي {0}', 'no expiry date': 'بدون تاريخ انتهاء',
    '✓ Connected – account {0}, {1}, connections {2}': '✓ تم الاتصال – الحساب {0}، {1}، الاتصالات {2}',
    'Checking account…': 'جارٍ التحقق من الحساب…', 'Account not checked': 'لم يتم التحقق من الحساب', 'Login rejected': 'تم رفض الدخول',
    'Active': 'نشط', 'Unknown': 'غير معروف', 'Expired': 'منتهي', 'Banned': 'محظور', 'Disabled': 'معطّل',
    'Expired {0}': 'انتهى {0}', 'Expires {0} · {1}': 'ينتهي {0} · {1}', 'No expiry date (unlimited)': 'بدون تاريخ انتهاء (غير محدود)',
    ' (saved)': ' (محفوظ)', 'The server rejected your username or password': 'رفض السيرفر اسم المستخدم أو كلمة المرور',
    'Account status: {0}': 'حالة الحساب: {0}', 'Your subscription ends in {0}': 'ينتهي اشتراكك خلال {0}',
    '{0} – showing your last saved account info': '{0} – يتم عرض آخر بيانات محفوظة للحساب',
    'Server answered with error {0}': 'رد السيرفر بخطأ {0}', 'Server sent an empty reply': 'أرسل السيرفر ردًا فارغًا',
    'Server sent an unreadable reply': 'أرسل السيرفر ردًا غير مفهوم', 'Server took too long to answer': 'استغرق السيرفر وقتًا طويلًا للرد',
    'Cannot reach the server': 'لا يمكن الوصول إلى السيرفر', 'Server reply had no account information': 'رد السيرفر لا يحتوي على بيانات الحساب',
    /* home & cards */
    'Continue Watching': 'متابعة المشاهدة', 'Recently Added': 'المضاف حديثًا', 'Recently Added Movies': 'أفلام مضافة حديثًا',
    'Recently Updated Series': 'مسلسلات محدثة حديثًا', 'My List · Movies': 'قائمتي · أفلام', 'My List · Series': 'قائمتي · مسلسلات',
    'Recently Watched Channels': 'قنوات شاهدتها مؤخرًا', 'Featured on Mdluex Industries': 'مميز على Mdluex Industries',
    'Movie': 'فيلم', 'Episodes': 'الحلقات', 'More info': 'المزيد', 'Resume': 'استئناف', 'Start over': 'من البداية',
    '{0} left': 'متبقي {0}', 'Season {0} · Episode {1}': 'الموسم {0} · الحلقة {1}', 'Resume from {0}': 'استئناف من {0}',
    'Continue watching?': 'متابعة المشاهدة؟', 'Play from start': 'تشغيل من البداية', 'Resume {0}': 'استئناف {0}',
    'Remove from Continue Watching': 'إزالة من متابعة المشاهدة', 'Removed from Continue Watching': 'تمت الإزالة من متابعة المشاهدة',
    'Add to My List': 'إضافة إلى قائمتي', 'Remove from My List': 'إزالة من قائمتي', 'Added to My List': 'تمت الإضافة إلى قائمتي',
    'Removed from My List': 'تمت الإزالة من قائمتي', 'Favorite': 'المفضلة', 'Zap while watching': 'تقليب القنوات أثناء المشاهدة',
    'Live TV, movies and series from your IPTV account – plus the Mdluex Industries channel.': 'قنوات مباشرة وأفلام ومسلسلات من حساب الـ IPTV الخاص بك – بالإضافة إلى قناة Mdluex Industries.',
    'Watch Mdluex Channel': 'شاهد قناة Mdluex', 'Try demo': 'جرّب العرض التجريبي', 'Demo': 'تجريبي',
    'Press the yellow button': 'اضغط الزر الأصفر', 'Press ☰': 'اضغط ☰', 'Hold OK': 'اضغط مطوّلًا على OK',
    '{0} on a channel to add it here.': '{0} على أي قناة لإضافتها هنا.', 'No channels here.': 'لا توجد قنوات هنا.',
    'Your list is empty. {0} on any channel, movie or series to add it.': 'قائمتك فارغة. {0} على أي قناة أو فيلم أو مسلسل لإضافته.',
    'All Movies': 'كل الأفلام', 'All Series': 'كل المسلسلات', 'Channels': 'القنوات', 'Nothing here yet.': 'لا يوجد شيء هنا بعد.',
    'NOW · ': 'الآن · ', 'No TV guide for this channel.': 'لا يوجد دليل برامج لهذه القناة.',
    'Cast: ': 'الممثلون: ', 'Director: ': 'الإخراج: ', 'Genre: ': 'النوع: ', 'Season {0}': 'الموسم {0}',
    'Play S{0}:E{1}': 'تشغيل م{0}:ح{1}', 'Resume S{0}:E{1}': 'استئناف م{0}:ح{1}', 'S{0}:E{1}': 'م{0}:ح{1}', 'E{0}': 'ح{0}',
    'Episode {0}': 'الحلقة {0}', 'No episodes.': 'لا توجد حلقات.',
    'Search channels, movies, series and Mdluex videos…': 'ابحث في القنوات والأفلام والمسلسلات وفيديوهات Mdluex…',
    '{0} found': 'وُجد {0}', 'No results for "{0}".': 'لا توجد نتائج لـ "{0}".', 'Videos': 'الفيديوهات', 'Shorts': 'Shorts',
    'Playlists': 'قوائم التشغيل', 'Playlist': 'قائمة تشغيل', 'Playlist · {0}': 'قائمة تشغيل · {0}', '{0} videos': '{0} فيديو',
    '1 video': 'فيديو واحد', 'Featured video': 'فيديو مميز', 'Videos ({0})': 'الفيديوهات ({0})', 'Shorts ({0})': 'Shorts ({0})',
    'Playlists ({0})': 'قوائم التشغيل ({0})', 'Tabs · Videos': 'الأقسام · الفيديوهات', 'Channel': 'القناة', 'YouTube': 'يوتيوب',
    'Mdluex Industries': 'Mdluex Industries',
    'Mdluex Industries is always on': 'قناة Mdluex Industries ثابتة دائمًا', 'Open channel': 'فتح القناة', 'Remove channel': 'إزالة القناة',
    'Remove {0}?': 'إزالة {0}؟', 'Its videos will no longer show in the app.': 'لن تظهر فيديوهاتها في التطبيق بعد الآن.', 'Removed {0}': 'تمت إزالة {0}',
    'Always on': 'ثابتة دائمًا', 'Add channel': 'إضافة قناة', 'Videos from your channels also show on Home.': 'فيديوهات قنواتك تظهر أيضًا في الرئيسية.',
    'Channel name, @handle or link…': 'اسم القناة أو @المعرّف أو الرابط…',
    'Type a channel name, an @handle or a channel link. Press OK on the box to open the keyboard.': 'اكتب اسم القناة أو @المعرّف أو رابط القناة. اضغط OK على الخانة لفتح لوحة المفاتيح.',
    'No channels found for "{0}".': 'لا توجد قنوات لـ "{0}".', 'Added': 'مضافة', 'This channel is already in your list': 'هذه القناة موجودة بالفعل في قائمتك',
    'Added {0}': 'تمت إضافة {0}', 'Could not reach YouTube. Check the internet connection and try again.': 'تعذّر الوصول إلى يوتيوب. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.',
    /* Quran */
    'Listen and read along: the verse and the word being recited light up as you listen.': 'استمع واقرأ معه: تضيء الآية والكلمة التي تُتلى أثناء الاستماع.',
    'Turn the page': 'تقليب الصفحة',
    'Page {0} · Juz {1}': 'الصفحة {0} · الجزء {1}', 'Small': 'صغير', 'Large': 'كبير', 'Larger': 'أكبر', 'Largest': 'الأكبر',
    'Makki': 'مكية','Madani': 'مدنية', '{0} verses': '{0} آية', 'Continue: {0}, verse {1}': 'متابعة: {0}، الآية {1}',
    'Reciter: {0}': 'القارئ: {0}', 'Reciter': 'القارئ', 'Listen & read': 'استماع وقراءة', 'Verse {0} of {1}': 'الآية {0} من {1}',
    'Previous · next verse': 'الآية السابقة · التالية', 'Next · previous surah': 'السورة التالية · السابقة',
    'Could not play this recitation': 'تعذّر تشغيل هذه التلاوة', 'Repeat the current verse': 'تكرار الآية الحالية',
    'Continue to the next surah': 'الانتقال إلى السورة التالية', 'Text size': 'حجم الخط', 'All surahs': 'كل السور',
    'Repeating this verse': 'جارٍ تكرار هذه الآية', 'Repeat off': 'تم إيقاف التكرار',
    'Could not load the Quran. Check the internet connection.': 'تعذّر تحميل القرآن. تحقق من الاتصال بالإنترنت.',
    /* settings */
    'Account': 'الحساب', 'Status': 'الحالة', 'Expires': 'ينتهي', 'Days left': 'الأيام المتبقية', 'Connections': 'الاتصالات',
    'Could not reach the server ({0}). Showing account info saved {1}.': 'تعذّر الوصول إلى السيرفر ({0}). يتم عرض بيانات الحساب المحفوظة {1}.',
    'unknown error': 'خطأ غير معروف', 'Checked {0}.': 'آخر تحقق {0}.', 'Refresh account info': 'تحديث بيانات الحساب',
    'Use this playlist': 'استخدام هذه القائمة', 'Delete "{0}"?': 'حذف "{0}"؟',
    'Its favorites and watch history will be removed too.': 'سيتم حذف المفضلة وسجل المشاهدة الخاصين بها أيضًا.',
    'Playlist deleted': 'تم حذف القائمة', 'Playback': 'التشغيل', 'Auto-play next episode': 'تشغيل الحلقة التالية تلقائيًا',
    'Video previews in the banner': 'معاينة الفيديو في البانر', 'Off (pictures only)': 'إيقاف (صور فقط)',
    'Live TV stream type': 'نوع بث القنوات المباشرة', 'Try HLS if channels freeze or fail': 'جرّب HLS إذا توقفت القنوات أو لم تعمل',
    'Parental control': 'الرقابة الأبوية', 'Lock adult categories': 'قفل أقسام الكبار', 'Change PIN': 'تغيير الرقم السري',
    'Default is 0000': 'الافتراضي 0000', 'General': 'عام', 'Clock format': 'تنسيق الساعة', '24-hour (17:30)': '24 ساعة (17:30)',
    '12-hour (5:30 PM)': '12 ساعة (5:30 م)', 'Clear watch history': 'مسح سجل المشاهدة', 'Clear watch history?': 'مسح سجل المشاهدة؟',
    'Continue Watching and resume points will be removed for this playlist.': 'سيتم حذف متابعة المشاهدة ونقاط الاستئناف لهذه القائمة.',
    'History cleared': 'تم مسح السجل', 'Clear recently watched channels': 'مسح القنوات التي شاهدتها مؤخرًا', 'About': 'حول التطبيق',
    'Mdluex IPTV {0} · by Mdluex Industries': 'Mdluex IPTV {0} · من Mdluex Industries',
    'Website': 'الموقع الرسمي',
    '"localhost" means this TV itself: type the address of the PC running the server, like http://192.168.1.20:8080.': 'كلمة "localhost" تعني التلفزيون نفسه: اكتب عنوان الكمبيوتر الذي يعمل عليه السيرفر، مثل http://192.168.1.20:8080.',
    'Check the address and port, that the server is running, and that Windows Firewall on that PC allows it (Private and Public networks).': 'تحقّق من العنوان والمنفذ (port)، وأن السيرفر يعمل، وأن جدار حماية ويندوز على ذلك الكمبيوتر يسمح له (الشبكات الخاصة والعامة).', 'Highlight timing': 'توقيت التظليل', 'No delay': 'بدون تأخير', 'Slightly later': 'متأخر قليلًا',
    'Normal (TV)': 'عادي (للتلفزيون)', 'Later': 'متأخر', 'Much later': 'متأخر كثيرًا', '{0} s after the voice': 'بعد الصوت بـ {0} ث', 'With the audio clock': 'مع ساعة الصوت', 'Subscribe': 'اشترك', 'Subscribe to {0}': 'اشترك في {0}',
    'Scan with your phone camera: YouTube opens and asks you to subscribe in one tap.': 'امسح الرمز بكاميرا هاتفك: سيفتح يوتيوب ويطلب منك الاشتراك بضغطة واحدة.',
    'Press Subscribe under the video': 'اضغط «اشتراك» تحت الفيديو', 'Close': 'إغلاق', 'Support Mdluex IPTV': 'ادعم Mdluex IPTV', 'Donate': 'تبرّع',
    'Mdluex IPTV is free. If you enjoy it, you can support it: scan a code with your phone camera.': 'تطبيق Mdluex IPTV مجاني. إن أعجبك يمكنك دعمه: امسح أحد الرمزين بكاميرا هاتفك.',
    'Subscribe to Mdluex Industries on YouTube': 'اشترك في قناة Mdluex Industries على يوتيوب', 'Support & commercial use': 'الدعم والاستخدام التجاري',
    'Language': 'اللغة', 'Automatic (TV language)': 'تلقائي (لغة الشاشة)', 'English': 'English', 'العربية': 'العربية',
    /* player */
    'Play / Pause': 'تشغيل / إيقاف مؤقت', 'Seek': 'تقديم / ترجيع', 'Audio · Subtitles · More': 'الصوت · الترجمة · المزيد',
    'Blue: Next episode': 'الأزرق: الحلقة التالية', 'Change channel': 'تغيير القناة', 'Channel list': 'قائمة القنوات', 'Info': 'معلومات',
    'Now: {0}': 'الآن: {0}', '{0}  Next: {1}': '{0}  التالي: {1}', 'LIVE': 'مباشر', 'Playback problem': 'مشكلة في التشغيل',
    'Switch to {0}': 'التبديل إلى {0}', 'Next episode in {0}s': 'الحلقة التالية خلال {0} ث', 'Up next': 'التالي',
    'Play now': 'تشغيل الآن', 'Audio': 'الصوت', 'Subtitles': 'الترجمة', 'Picture': 'الصورة', 'Fit to screen': 'ملاءمة الشاشة',
    'Stretch': 'تمديد', 'Original aspect': 'الأبعاد الأصلية', 'More': 'المزيد', 'Sleep timer': 'مؤقّت النوم',
    'Restart from beginning': 'إعادة من البداية', 'Next episode': 'الحلقة التالية', 'Audio: {0}': 'الصوت: {0}',
    'Subtitles: {0}': 'الترجمة: {0}', '{0} minutes': '{0} دقيقة', 'Sleep timer: playback stopped': 'مؤقّت النوم: تم إيقاف التشغيل',
    'Playback will stop in {0}': 'سيتوقف التشغيل خلال {0}', 'Sleep timer off': 'تم إيقاف مؤقّت النوم',
    'Restarted from the beginning': 'تمت الإعادة من البداية', 'Added to favorites': 'تمت الإضافة إلى المفضلة',
    'Removed from favorites': 'تمت الإزالة من المفضلة', 'Add to favorites': 'إضافة إلى المفضلة', 'Remove from favorites': 'إزالة من المفضلة',
    'Quality': 'الجودة', 'Speed': 'السرعة', 'Normal': 'عادي', 'No subtitles for this video': 'لا توجد ترجمة لهذا الفيديو',
    'Open in YouTube app': 'فتح في تطبيق يوتيوب', 'Quality: {0}': 'الجودة: {0}', 'Speed: {0}': 'السرعة: {0}',
    'Auto': 'تلقائي', 'Track {0}': 'مسار {0}', 'Subtitle {0}': 'ترجمة {0}',
    'Reconnecting…': 'جارٍ إعادة الاتصال…', 'Play next': 'تشغيل التالي', 'Channel {0}': 'قناة {0}',
    'Channel {0} is not in this list': 'القناة {0} غير موجودة في هذه القائمة', 'Resuming from {0}': 'استئناف من {0}',
    'Episode not found': 'الحلقة غير موجودة', 'YouTube error {0}': 'خطأ يوتيوب {0}',
    '{0}. You can open it in the YouTube app instead.': '{0}. يمكنك فتحه في تطبيق يوتيوب بدلًا من ذلك.',
    'Invalid video': 'فيديو غير صالح', 'The TV cannot play this video': 'لا تستطيع الشاشة تشغيل هذا الفيديو',
    'Video not found or private': 'الفيديو غير موجود أو خاص', 'The owner does not allow playing this video in apps': 'صاحب الفيديو لا يسمح بتشغيله داخل التطبيقات',
    'YouTube rejected the player': 'رفض يوتيوب المشغّل', 'Could not load the YouTube player': 'تعذّر تحميل مشغّل يوتيوب',
    'Could not open the YouTube app': 'تعذّر فتح تطبيق يوتيوب',
    /* more screens */
    '12-hour': '12 ساعة', '24-hour': '24 ساعة', '5:30 PM': '5:30 م', 'Add your IPTV account': 'أضف حساب الـ IPTV الخاص بك',
    'Live TV, movies and series need an IPTV playlist. Mdluex Channel works without one.': 'القنوات المباشرة والأفلام والمسلسلات تحتاج قائمة IPTV. قناة Mdluex تعمل بدونها.',
    'All Channels': 'كل القنوات', 'Favorite Channels': 'القنوات المفضلة', 'Favorites': 'المفضلة', 'Recently Watched': 'شاهدتها مؤخرًا',
    'All your connections are in use. If streams fail, close the app on your other devices.': 'كل اتصالاتك مستخدمة. إذا لم يعمل البث، أغلق التطبيق على أجهزتك الأخرى.',
    'Continue watching': 'متابعة المشاهدة', 'Recently added': 'أضيف حديثًا', 'Mdluex Industries · YouTube': 'Mdluex Industries · يوتيوب',
    'Current PIN': 'الرقم السري الحالي', 'Repeat new PIN': 'أعد إدخال الرقم السري الجديد', 'Start from the beginning': 'من البداية',
    'Enter the Xtream login your IPTV provider gave you. Press OK on a box to type.': 'أدخل بيانات Xtream التي أعطاها لك مزوّد الـ IPTV. اضغط OK على أي خانة للكتابة.',
    'Press Save again to keep it anyway.': 'اضغط حفظ مرة أخرى للإبقاء عليها على أي حال.', 'Test connection': 'اختبار الاتصال',
    'The server rejected this username or password.': 'رفض السيرفر اسم المستخدم أو كلمة المرور.',
    'This series has no episodes yet.': 'هذا المسلسل لا يحتوي على حلقات بعد.',
    'Type at least 2 letters. Press OK on the box to open the keyboard.': 'اكتب حرفين على الأقل. اضغط OK على الخانة لفتح لوحة المفاتيح.',
    '{0} min': '{0} دقيقة', '✓ Watched': '✓ تمت المشاهدة', 'HLS (m3u8)': 'HLS (m3u8)', 'MPEG-TS (ts)': 'MPEG-TS (ts)',
    '🔒 Locked. Press OK on the category and enter your PIN.': '🔒 مقفل. اضغط OK على القسم وأدخل الرقم السري.',
    '🔒 This category is locked. Press OK on it and enter your PIN.': '🔒 هذا القسم مقفل. اضغط OK عليه وأدخل الرقم السري.',
    'No results for "{0}".': 'لا توجد نتائج لـ "{0}".',
    'Episodes': 'الحلقات', 'Next / previous episode': 'الحلقة التالية / السابقة', 'Previous episode': 'الحلقة السابقة', 'None': 'لا يوجد',
    'All episodes': 'كل الحلقات', 'Playing': 'يُعرض الآن', 'No episodes in this season.': 'لا توجد حلقات في هذا الموسم.',
    '▲▼ Move   OK Play': '▲▼ تنقّل   OK تشغيل', '◀▶ Season': '◀▶ الموسم', 'BACK Close': 'BACK إغلاق',
    'Waiting for your phone…': 'في انتظار هاتفك…', '✓ Received from your phone': '✓ تم الاستلام من هاتفك',
    'This code has expired. Close this window and open it again for a new one.': 'انتهت صلاحية هذا الرمز. أغلق هذه النافذة وافتحها مرة أخرى للحصول على رمز جديد.',
    'Easier: use your phone': 'أسهل: استخدم هاتفك', 'Scan this code with your phone camera, type the login there and press Send. It appears here by itself.': 'امسح هذا الرمز بكاميرا هاتفك، واكتب بيانات الدخول هناك ثم اضغط إرسال. ستظهر هنا تلقائيًا.',
    '🔒 Sent encrypted. Only this TV can read it.': '🔒 تُرسل مشفّرة. هذا التلفزيون فقط يستطيع قراءتها.',
    'Long-press': 'الضغط المطوّل',
    'Could not open the stream ({0})':'تعذّر فتح البث ({0})', 'Could not start: {0}': 'تعذّر بدء التشغيل: {0}', 'Playback error: {0}': 'خطأ في التشغيل: {0}'
  };
  var MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function isAr(code) { return /^ar([-_]|$)/i.test(String(code || '')); }
  /* the TV's language: webOS and Samsung report it through their own system APIs (saved, since Samsung's is async) */
  function systemLang() {
    try { if (window.PalmSystem && PalmSystem.locale) return isAr(PalmSystem.locale) ? 'ar' : 'en'; } catch (e) {}
    try { var saved = localStorage.getItem('mdx.sysLang'); if (saved) return saved; } catch (e) {}
    return isAr(navigator.language || (navigator.languages || [])[0]) ? 'ar' : 'en';
  }
  var pref = (Store.settings().lang) || 'auto';
  var lang = pref === 'ar' || pref === 'en' ? pref : systemLang();

  /* Samsung: the TV menu language comes from tizen.systeminfo (asynchronous). If it differs from what we
     started with, remember it and reload once in the right language. */
  try {
    if (typeof tizen !== 'undefined' && tizen.systeminfo) {
      tizen.systeminfo.getPropertyValue('LOCALE', function (l) {
        var sys = isAr(l && l.language) ? 'ar' : 'en';
        var before = null; try { before = localStorage.getItem('mdx.sysLang'); } catch (e) {}
        try { localStorage.setItem('mdx.sysLang', sys); } catch (e) {}
        if ((Store.settings().lang || 'auto') === 'auto' && sys !== lang && before !== sys) location.reload();
      }, function () {});
    }
  } catch (e) {}

  function t(s) {
    var out = (lang === 'ar' && AR[s]) || s;
    for (var i = 1; i < arguments.length; i++) out = out.split('{' + (i - 1) + '}').join(arguments[i]);
    return out;
  }
  /* "3 days" with the right Arabic plural */
  function days(n) {
    if (lang !== 'ar') return n + (n === 1 ? ' day' : ' days');
    if (n === 1) return 'يوم واحد';
    if (n === 2) return 'يومان';
    if (n >= 3 && n <= 10) return n + ' أيام';
    return n + ' يومًا';
  }
  function month(i) { return (lang === 'ar' ? MONTHS_AR : MONTHS_EN)[i]; }

  var html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  html.className += ' lang-' + lang;
  try { var simSub = document.querySelector('#sim-player .sim-sub'); if (simSub) simSub.textContent = t('Demo playback'); } catch (e) {}

  return { lang: lang, pref: pref, rtl: lang === 'ar', t: t, days: days, month: month };
})();
var T = I18N.t;
