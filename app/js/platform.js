/* Older TV engines (Tizen 4 = Chrome 56) lack a few newer JavaScript helpers: add them. */
if (!String.prototype.padStart) {
  String.prototype.padStart = function (len, fill) {
    var s = String(this); fill = fill == null ? ' ' : String(fill);
    while (s.length < len) s = fill + s;
    return s.length > len && fill.length > 1 ? s.slice(s.length - len) : s;
  };
}
/* Which TV system we run on, and the few things that differ between them.
   Everything else (screens, design, features) is shared by Samsung Tizen, LG webOS and Android TV. */
var Platform = (function () {
  var ua = navigator.userAgent || '';
  var name =
    typeof tizen !== 'undefined' ? 'tizen' :
    typeof MdxNative !== 'undefined' ? 'android' :
    (typeof PalmServiceBridge !== 'undefined' || /Web0S|webOS/i.test(ua)) ? 'webos' :
    'browser';
  /* Android builds tell us the device family: 'firetv', 'androidtv' or 'mobile' (phone / tablet) */
  var device = '';
  try { if (name === 'android' && MdxNative.device) device = String(MdxNative.device()); } catch (e) {}
  /* Samsung and LG remotes have red/green/yellow/blue buttons; Android TV and Fire TV remotes don't,
     so there the item actions live in an options menu (Fire TV: the ☰ button; any Android remote: hold OK). */
  var colorKeys = name !== 'android';
  /* touch controls (swipe to scroll, tap, on-screen player buttons) only on Android phones and tablets:
     the Android app checks TV mode / Android TV / touchscreen itself, so TVs and TV boxes never get them. */
  var touch = (name === 'android' && device === 'mobile') || (name === 'browser' && /[?&]touch=1/.test(location.search));

  /* LG webOS system services (luna://...) without LG's helper library */
  function luna(uri, params, cb) {
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function (r) { if (cb) { try { cb(JSON.parse(r)); } catch (e) { cb({}); } } };
      b.call(uri, JSON.stringify(params || {}));
      return true;
    } catch (e) { return false; }
  }

  return {
    name: name,
    version: '1.4.0',
    device: device,
    fireTV: device === 'firetv',
    colorKeys: colorKeys,
    touch: touch,
    /* the label for the key that opens the options menu, where there are no colored buttons */
    menuKey: device === 'firetv' ? '☰' : 'Hold OK',
    isTV: name !== 'browser',
    /* The TV's on-screen keyboard shrinks the window: TVs keep their full-HD layout. */
    keepFullHD: name !== 'browser',

    /* key codes for "Back" on each remote */
    isBackKey: function (code) { return code === 10009 || code === 461 || code === 27; },

    registerKeys: function () {
      if (name !== 'tizen') return;
      try {
        var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
          'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info',
          '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        if (tizen.tvinputdevice.registerKeyBatch) tizen.tvinputdevice.registerKeyBatch(keys);
        else keys.forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} });
      } catch (e) {}
    },

    exit: function () {
      try {
        if (name === 'tizen') tizen.application.getCurrentApplication().exit();
        else if (name === 'android') MdxNative.exit();
        else if (name === 'webos') window.close();
        else return false;
        return true;
      } catch (e) { return false; }
    },

    /* Open a YouTube video in the TV's own YouTube app */
    openYouTube: function (id) {
      try {
        if (name === 'tizen') {
          var data = new tizen.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: 'v=' + id })]);
          var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null, [data]);
          tizen.application.launchAppControl(ctrl, '111299001912', function () {}, function () { App.toast('Could not open the YouTube app'); });
          return true;
        }
        if (name === 'android') { MdxNative.openUrl('https://www.youtube.com/watch?v=' + id); return true; }
        if (name === 'webos') {
          return luna('luna://com.webos.applicationManager/launch', { id: 'youtube.leanback.v4', params: { contentTarget: 'v=' + id } });
        }
      } catch (e) {}
      window.open('https://www.youtube.com/watch?v=' + id, '_blank');
      return false;
    },

    /* Live TV default: webOS plays HLS most reliably; Samsung and Android (ExoPlayer) handle MPEG-TS */
    defaultLiveFormat: name === 'webos' ? 'm3u8' : 'ts'
  };
})();
document.documentElement.className += ' platform-' + Platform.name + (Platform.fireTV ? ' platform-firetv' : '') + (Platform.touch ? ' touch' : '');
