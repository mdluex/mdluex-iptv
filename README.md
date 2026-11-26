# Mdluex IPTV

A fast, Netflix-style IPTV player for **Samsung (Tizen)**, **Android TV / Google TV**, **Amazon Fire TV** and **LG (webOS)** smart TVs,
built for Xtream Codes servers — plus the
**Mdluex Industries** YouTube channel, watchable without any IPTV account.

> Mdluex IPTV is only a player. It contains no channels, movies or series: you sign in with the IPTV
> subscription you already have.

## Install — the quick way
| TV | Easiest way | Details |
|---|---|---|
| **Samsung** (2017+) | [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung): add the source `github.com/mdluex/mdluex-iptv` — it signs the app for your TV | [Samsung](#samsung-tv--with-apps2samsung-easiest) |
| **Android TV / Google TV** | Install `MdluexIPTV-vX.X.X-android.apk` from the [latest release](https://github.com/mdluex/mdluex-iptv/releases/latest) | [Android](#android-tv--google-tv) |
| **Amazon Fire TV** (Fire OS) | In the *Downloader* app, open `mdluex.github.io/mdluex-iptv/apk` | [Fire TV](#amazon-fire-tv) |
| **LG** (webOS 6+, 2021+) | [Homebrew Channel](https://www.webosbrew.org/devmode/): add the repository `https://mdluex.github.io/mdluex-iptv/lg/apps.json` | [LG](#lg-tv-webos) |

Mdluex IPTV has also been submitted to the community catalogs of
[Apps2Samsung](https://github.com/Apps2Samsung/tizen-community-packages/pull/306) and the
[webOS Homebrew Channel](https://github.com/webosbrew/apps-repo/pull/383). Once they're accepted, the app shows up in
those apps' own lists without adding anything.

## Demo
[![Mdluex IPTV demo – click to watch the full video](docs/demo-preview.gif)](docs/demo.mp4)

▶ **[Watch the full demo video (1:42)](docs/demo.mp4)** — recorded on a 2021 Samsung TV: home screen with trailer
previews, movies, series, the Mdluex Industries channel and the player.

![Mdluex IPTV – the Mdluex Industries channel, Videos tab](docs/channel-videos-tab.png)
*The Mdluex Industries channel (Videos tab): the banner follows the focused video and plays a muted preview.*

## Features
- **Resume anywhere** – movies, episodes and YouTube videos remember where you stopped. *Continue Watching* on Home and in every section; press **Red** on a card to remove it.
- **Account that never locks you out** – the expiry date is fetched with retries; if the server is slow or down, the last known info is shown instead of a blank screen. Clear messages for wrong login, expired/banned accounts and full connection limits.
- **Featured banner** – follows the item you're on, with a muted preview (trailer clips or frames from the video).
- **Live TV** – categories with item counts, channel logos, now/next TV guide, favorites (**Yellow**), recently watched, CH ▲▼ zapping, channel list (◀), number keys, auto-reconnect, TS/HLS switch.
- **Movies & Series** – poster grids, item counts per category, Recently Added, My List, details pages, seasons & episodes with watched marks, **auto-play next episode**.
- **Player** – seek with ◀ ▶ (faster when held), FF/RW ±30 s, audio & subtitle tracks, picture mode, sleep timer.
- **Mdluex Industries channel** – Home / Videos / Shorts / Playlists tabs like YouTube, featured video, in-app playback with quality (1080p–360p), speed and subtitles.
- **Search** across channels, movies, series and channel videos.
- **Arabic / RTL** content shown right-to-left, parental PIN lock (default `0000`), multiple playlists, demo mode.

## Mdluex IPTV Server
Host your own movies, series and live channels: [`server/`](server/README.md) is a self-hosted IPTV server
(Rust, single executable, web admin panel in the same style) with an Xtream Codes compatible API —
accounts with expiry and screen limits, *Watching now*, library scanning with TMDB posters & trailers,
live TV with M3U import and XMLTV guide, **resellers & credits, packages, load-balancing edge servers,
transcoding profiles and catch-up/timeshift**. Download `MdluexIPTV-Server-…-windows.zip` from the
[latest release](https://github.com/mdluex/mdluex-iptv/releases/latest).

## How YouTube playback works
YouTube refuses players embedded directly in TV apps (they load from local files — *error 153*). The app plays
videos through a tiny player page hosted on GitHub Pages, which gives YouTube a real web address:
**[mdluex/mdluex-tv-player](https://github.com/mdluex/mdluex-tv-player)**.

## Project layout
| Path | What |
|---|---|
| `app/` | The TV app (HTML / CSS / JavaScript) |
| `app/js/channel_snapshot.js` | Offline copy of the channel – refresh with `python tools/update_channel.py` |
| `app/js/platform.js` | The only TV-specific part: keys, exit, YouTube app, video player per TV system |
| `platforms/android/` | Android TV app: a full-screen WebView with the shared app + a native ExoPlayer for streams |
| `platforms/webos/` | LG webOS app settings (`appinfo.json`) |
| `tools/install.ps1` | Build, sign, install and launch on a Samsung TV |
| `tools/build_android.ps1` | Build the Android APK into `dist\` |
| `tools/build_wgt.py` | Unsigned Samsung `.wgt` for Apps2Samsung into `dist\` |
| `tools/make_store_listings.py` | LG Homebrew Channel manifest + our repository (`docs/lg/apps.json`) |
| `tools/build_webos.ps1`, `pack_ipk.py` | Build the LG `.ipk` package into `dist\` |
| `tools/tvdebug.py` | Inspect the app running on the TV (Chrome DevTools protocol) |
| `tools/sdb*.py` | Small TV developer-connection helpers |
| `tools/fix_old_tv_css.py`, `bump_version.py` | Compatibility and cache-busting helpers |
| `tools/screenshot.py` | Full-HD screenshots of the app (headless Edge), e.g. for this README |
| `iptv_check.py` | Check an IPTV server's account replies from a PC |

## Preview on a PC
```powershell
python -m http.server 8765 --directory app
```
Open http://localhost:8765 — arrow keys, Enter, Esc (Back), Space (play/pause), R/G/Y/B for the colour keys.
Choose **Try demo** for sample content. (IPTV TS/HLS streams only play on the TV.)

## Samsung TV — with Apps2Samsung (easiest)
[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) is a free installer for Windows, Mac, Linux, Android
and iPhone that makes the Samsung certificate for your TV and signs apps for it automatically.
1. **On the TV:** Apps → press `1 2 3 4 5` → Developer Mode **On** → Host PC IP = the address of the device running
   Apps2Samsung → restart the TV.
2. In Apps2Samsung open **Settings → Installing → Your sources** and add **`github.com/mdluex/mdluex-iptv`**.
3. **Mdluex IPTV** now shows in its catalog: install it (the first time it asks you to sign in to your Samsung
   account to make the certificate). Updates appear there when a new release is published.

Once the [catalog submission](https://github.com/Apps2Samsung/tizen-community-packages/pull/306) is accepted, step 2
isn't needed: Mdluex IPTV will already be in Apps2Samsung's (and TV-Store's) community catalog.

Every release includes an unsigned **`MdluexIPTV-vX.X.X.wgt`** for installers like this one (build it with
`python tools/build_wgt.py`).

## Samsung TV — one-click installer for Windows
1. **On the TV:** Apps → press `1 2 3 4 5` → Developer Mode **On** → Host PC IP = your PC's IP address → restart the TV.
2. **On a Windows PC** (same network): download **`MdluexIPTV-vX.X.X.zip`** from the
   **[latest release](https://github.com/mdluex/mdluex-iptv/releases/latest)**, extract it and double-click
   **`Install-MdluexIPTV.cmd`**.
3. The installer finds your TV, installs Samsung's free Tizen tools if needed, helps you create your Samsung
   certificate (you sign in with your own Samsung account — required by Samsung, once per TV), then signs,
   installs and opens the app. Run it again any time to update.

> Why not USB? Samsung TVs from 2017 onward only install apps from the Samsung store or through Developer
> Mode, and each app must be signed for the specific TV — the installer handles that for you.

## Samsung TV — manual install
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

## Android TV / Google TV
Works on Android TV boxes and TVs (Android 7 or newer), e.g. Chromecast with Google TV, Nvidia Shield, Xiaomi
Mi Box, Sony / TCL / Hisense Android TVs. Same app and screens as on Samsung; streams play with Android's
built-in video player (ExoPlayer), so live TS and HLS channels work.

1. Download **`MdluexIPTV-vX.X.X-android.apk`** from the **[latest release](https://github.com/mdluex/mdluex-iptv/releases/latest)**.
2. Put it on a USB stick and open it on the TV with a file manager, or send it with an app like *Send Files to TV*
   or *Downloader*.
3. Allow **Install unknown apps** for that app when Android asks (Settings → Apps → Security & restrictions).
4. Open **Mdluex IPTV** from the apps row. The TV remote's Back, Play/Pause and channel keys all work. Most
   Android remotes have no coloured buttons, so **hold OK** on a movie, series or channel for its options
   (add to My List, remove from Continue Watching); in the player, ▲ opens audio, subtitles and more.

You can also install it from a PC with `adb install MdluexIPTV-vX.X.X-android.apk` (Developer options → USB/network
debugging on). Build it yourself with `powershell -ExecutionPolicy Bypass -File tools\build_android.ps1`
(needs the Android SDK and JDK 17+).

## Amazon Fire TV
Fire TV Sticks, Fire TV Cube and Fire TV smart TVs running **Fire OS** use the same Android app.

1. On the Fire TV, install **Downloader** (by AFTVnews) from the Amazon Appstore.
2. Settings → My Fire TV → Developer options → **Install unknown apps** → turn it on for Downloader.
   (No Developer options? Settings → My Fire TV → About → click the device name 7 times.)
3. Open Downloader, type **`mdluex.github.io/mdluex-iptv/apk`** and select Go. It downloads the newest version;
   choose **Install**.
4. Open **Mdluex IPTV** from *Your Apps & Channels*.

The Fire TV remote has no coloured buttons: press **☰** (Menu) on a movie, series or channel for its options
(add to My List, remove from Continue Watching), and in the live player for favourites and the channel list.
Holding OK does the same.

Newer Fire TV devices that run **Vega OS** instead of Fire OS can't install Android apps, so Mdluex IPTV doesn't run on
them.

## LG TV (webOS)
**Easiest: Homebrew Channel.** Once the TV is in Developer Mode (step 1 below) install the free
[Homebrew Channel](https://www.webosbrew.org/devmode/) (e.g. with *webOS Dev Manager*). Then in Homebrew Channel open
**Settings → Add repository**, enter

```
https://mdluex.github.io/mdluex-iptv/lg/apps.json
```

and install **Mdluex IPTV** from its app list. New versions show up there as updates. Once the
[submission to the official Homebrew repository](https://github.com/webosbrew/apps-repo/pull/383) is accepted, it
will be in Homebrew Channel's default list too. Needs webOS 6.0 or newer (LG TVs from 2021 on).

**Or install the package yourself.** LG TVs install apps outside the LG store only through LG's **Developer Mode** app:
1. Create a free account on [webostv.developer.lge.com](https://webostv.developer.lge.com), then on the TV install
   **Developer Mode** from the LG Content Store, sign in with that account and turn **Dev Mode Status** on
   (the TV restarts). Keep the app's passphrase screen open for the next step.
2. On your PC install LG's **webOS TV CLI** (or *webOS Dev Manager*), add the TV with
   `ares-setup-device`, then pair it with `ares-novacom --device tv --getkey` (enter the passphrase).
3. Download **`MdluexIPTV-vX.X.X-lg-webos.ipk`** from the latest release and install it:
```powershell
ares-install --device tv MdluexIPTV-vX.X.X-lg-webos.ipk
```
LG's Developer Mode session lasts 1000 hours; extend it in the Developer Mode app so the app keeps working. On LG
TVs live channels use the HLS (`m3u8`) format by default, which webOS plays natively. Build the package yourself
with `powershell -ExecutionPolicy Bypass -File tools\build_webos.ps1`.

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

## Compatibility
Tested on a 2021 Samsung TV (Tizen 6.0, Chrome 76 engine) and Android TV (Android 16 emulator, 1080p). The LG
version is built from the same code but has not yet been tested on a real LG TV. Older engines lack some CSS (`inset`, flex `gap`);
the app includes fallbacks.

## License
**Personal use only** — see [LICENSE](LICENSE).

- ✅ Use, install and modify it for yourself and your household, and share it **for free** (keep the license and credit).
- ❌ **Not allowed without my written permission:** selling it, charging for access, running **paid subscriptions /
  an IPTV business / reseller panels** with it, putting it in a commercial product, or publishing it on an app store.

**Community installers — permission granted:** the free catalogs of
[Apps2Samsung / TV-Store](https://github.com/Apps2Samsung/tizen-community-packages) and the
[webOS Homebrew Channel](https://github.com/webosbrew/apps-repo) may list Mdluex IPTV and redistribute the unmodified
official releases from this repository.

Want to use it commercially? **Contact me first** through [GitHub](https://github.com/mdluex) or the
[Mdluex Industries YouTube channel](https://www.youtube.com/@Mdlu3x).

## Author
**Mahmoud Salah** — [Mdluex Industries on YouTube](https://www.youtube.com/@Mdlu3x)
