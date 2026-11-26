# Mdluex IPTV — developer notes

Building, testing and releasing the app. For installing and using it, see the [README](README.md).

## Project layout
| Path | What |
|---|---|
| `app/` | The TV app (HTML / CSS / JavaScript), shared by every TV system |
| `app/js/platform.js` | The only TV-specific part: keys, exit, YouTube app, remote type (colour keys or not) |
| `app/js/i18n.js` | English / Arabic texts and right-to-left layout; follows the TV's language |
| `app/js/quran.js` | Quran: surah list, mushaf-style reader, recitation with word-by-word highlighting (Quran.com API) |
| `app/fonts/` | Bundled fonts (Cairo, Amiri Quran, Scheherazade New), SIL Open Font License |
| `app/js/channel_snapshot.js` | Offline copy of the channel – refresh with `python tools/update_channel.py` |
| `platforms/android/` | Android TV / Fire TV app: a full-screen WebView with the shared app + a native ExoPlayer for streams |
| `platforms/webos/` | LG webOS app settings (`appinfo.json`) |
| `server/` | [Mdluex IPTV Server](server/README.md), the self-hosted Xtream Codes compatible server (Rust) |
| `installer/` | The Windows one-click Samsung installer |
| `landing/` | The install website (deployed on Vercel, root directory `landing`, redeploys on every push): English/Arabic, light/dark, download buttons that read the newest release |
| `tools/make_landing_art.py` | Draws the website's step illustrations (`landing/img/`) |
| `docs/` | GitHub Pages: screenshots, the LG Homebrew repository (`lg/`), the Fire TV short link (`apk/`) |
| `tools/install.ps1` | Build, sign, install and launch on a Samsung TV |
| `tools/build_android.ps1` | Build the Android APK into `dist\` |
| `tools/build_wgt.py` | Unsigned Samsung `.wgt` for Apps2Samsung into `dist\` |
| `tools/build_webos.ps1`, `pack_ipk.py` | Build the LG `.ipk` package into `dist\` |
| `tools/make_store_listings.py` | LG Homebrew Channel manifest + our repository (`docs/lg/apps.json`) |
| `tools/tvdebug.py` | Inspect the app running on a TV or Android device (Chrome DevTools protocol) |
| `tools/sdb*.py` | Small Samsung TV developer-connection helpers |
| `tools/fix_old_tv_css.py`, `bump_version.py` | Compatibility and cache-busting helpers |
| `tools/screenshot.py` | Full-HD screenshots of the app (headless Edge) |
| `iptv_check.py` | Check an IPTV server's account replies from a PC |

## Preview on a PC
```powershell
python -m http.server 8765 --directory app
```
Open http://localhost:8765 — arrow keys, Enter, Esc (Back), Space (play/pause), R/G/Y/B for the colour keys,
I for Info/Menu. Choose **Try demo** for sample content. (IPTV TS/HLS streams only play on a TV.)

## Remote keys
Samsung and LG remotes have colour keys (Red: remove from Continue Watching, Yellow: My List / favourite,
Blue: next episode). Android TV and Fire TV remotes don't, so `Platform.colorKeys` is false there and the same
actions are in an options menu opened with Info (Fire TV ☰ = `KEYCODE_MENU`). The Android app also turns a held
OK into Info (`MainActivity.dispatchKeyEvent`). `MdxNative.device()` returns `firetv` or `androidtv`.

## How YouTube playback works
YouTube refuses players embedded directly in TV apps (they load from local files — *error 153*). The app plays
videos through a tiny player page hosted on GitHub Pages, which gives YouTube a real web address:
**[mdluex/mdluex-tv-player](https://github.com/mdluex/mdluex-tv-player)**.

## Samsung — manual install with Tizen Studio
1. **TV:** Apps → press `1 2 3 4 5` → Developer Mode **On**, Host PC IP = your PC's address → restart the TV.
2. Install **Tizen Studio** (CLI is enough) into `C:\tizen-studio`, then in its Package Manager add
   **Samsung Certificate Extension** and **TV Extensions**.
3. In **Certificate Manager** create a **Samsung → TV** profile (sign in with your Samsung account; your TV's
   DUID must be in the distributor certificate). Keep your certificate files private — never commit them.
4. Run (adjust the TV address and profile name):
```powershell
powershell -ExecutionPolicy Bypass -File tools\install.ps1 -TvIp 192.168.1.20 -CertProfile MyProfile
```
**Can't connect?** Routers sometimes give the TV or PC a new address — update the TV's Developer Mode *Host PC
IP*, restart the TV, and pass the TV's current address with `-TvIp`.

## Android TV / Fire TV
```powershell
powershell -ExecutionPolicy Bypass -File tools\build_android.ps1          # release (needs keystore.properties)
powershell -ExecutionPolicy Bypass -File tools\build_android.ps1 -Debug   # debug-signed, installs right away
```
Needs the Android SDK and JDK 17+. Put `keystore.properties` (storeFile, storePassword, keyAlias, keyPassword) in
`platforms\android\` — it is git-ignored. Install with `adb install dist\MdluexIPTV-vX.X.X-android.apk`. Fire TV:
Settings → My Fire TV → Developer options → ADB debugging, then `adb connect <fire-tv-ip>:5555`.

## LG — install the package yourself
1. Create a free account on [webostv.developer.lge.com](https://webostv.developer.lge.com), then on the TV install
   **Developer Mode** from the LG Content Store, sign in and turn **Dev Mode Status** on (the TV restarts).
2. On your PC install LG's **webOS TV CLI** (or *webOS Dev Manager*), add the TV with `ares-setup-device`, then
   pair it with `ares-novacom --device tv --getkey` (enter the passphrase shown on the TV).
3. `ares-install --device tv MdluexIPTV-vX.X.X-lg-webos.ipk`

Build the package with `powershell -ExecutionPolicy Bypass -File tools\build_webos.ps1`. On LG TVs live channels
use HLS (`m3u8`) by default, which webOS plays natively.

## Making a release
Everything the installers download comes from the **latest GitHub release**, so every release must carry all of
these files (built into `dist\`):

| File | Built by | Used by |
|---|---|---|
| `MdluexIPTV-vX.X.X.zip` | the app + `installer\` + `LICENSE` | the Windows one-click Samsung installer |
| `MdluexIPTV-vX.X.X.wgt` | `python tools/build_wgt.py` | Apps2Samsung / TV-Store |
| `MdluexIPTV-vX.X.X-android.apk` | `tools\build_android.ps1` | Android TV, Fire TV (the `…/apk` short link finds it by the `-android.apk` ending) |
| `MdluexIPTV-vX.X.X-lg-webos.ipk` | `tools\build_webos.ps1` | LG (Homebrew Channel, `ares-install`) |
| `com.mdluex.iptv.manifest.json` | `python tools/make_store_listings.py` | LG Homebrew Channel |

Steps: bump `version` in `app/config.xml`, run the builds above, run `python tools/make_store_listings.py` (it also
updates `docs/lg/apps.json`), commit and push, then create the release with `vX.X.X` as the tag and upload all five
files. The Android release key and `keystore.properties` stay outside the repository.

After every release: check that Apps2Samsung's catalog and the LG Homebrew Channel offer the new version (both
read the latest release), and that the website (landing page, on Vercel) shows it — Vercel redeploys it on every push.

## Compatibility
Tested on a 2021 Samsung TV (Tizen 6.0, Chrome 76 engine) and Android (Android 16 emulator, 1080p). The LG and
Fire TV versions are built from the same code but have not yet been tested on a real LG TV or Fire TV. Older
engines lack some CSS (`inset`, flex `gap`); the app includes fallbacks.
