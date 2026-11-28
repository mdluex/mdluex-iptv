# Mdluex IPTV Server

A self-hosted IPTV media server for your own movies, series and live streams — one small program with a
web admin panel in the Mdluex style. It speaks the standard **Xtream Codes API**, so it works with
**Mdluex IPTV** on Samsung TVs and with any other Xtream / M3U player.

> Use it only with media and streams you have the right to share. It contains no content.

> **License: personal use only** ([LICENSE](../LICENSE)). Running paid subscriptions, an IPTV business or
> reseller sales with this server, or selling it, needs the author's written permission first.

## Features
- **Accounts (lines)** – username/password, expiry date (+1 month / +3 / +6 / +1 year buttons), max
  simultaneous screens, trial flag, enable/disable, notes, one-click M3U link.
- **Connection limits that work** – the same device switching channels/films keeps its slot; a second
  device is refused when the account is full. *Watching now* shows who watches what, from where, how much
  data — and lets you disconnect them.
- **Movies & Series from your folders** – titles, years, seasons and episodes are read from normal file
  names (`Movie (2020).mkv`, `Show/Season 1/Show.S01E02.mkv`), local `poster.jpg` / `fanart.jpg` are used.
- **A picture for everything** – a title with no poster file and nothing on TMDB gets a picture taken from the
  video itself (a typical frame about a fifth of the way in), so no card stays empty. A TMDB poster found later
  replaces it.
- **TMDB metadata (optional, free key)** – posters, backdrops, plots, ratings, cast, episode names and
  **YouTube trailers** (Mdluex IPTV plays them as banner previews).
- **Live TV** – channels from TS or HLS sources, M3U import (keeps groups, logos, tvg-id), HLS→TS remux
  with ffmpeg when needed.
- **TV guide** – XMLTV sources (`.xml` / `.xml.gz`), refreshed every 12 hours.
- **Standard outputs** – `player_api.php` (all common actions), `get.php` (M3U Plus), `xmltv.php`,
  `/live|movie|series/user/pass/id.ext` with seeking (HTTP Range).
- **Admin panel** – dashboard, accounts, watching now, live TV, movies & series poster grids with
  editors, categories, media folders (with a folder browser), TV guide, settings.

## Run it
```powershell
mdluex-server.exe
```
The admin panel opens in your browser (`http://localhost:8080/admin`). The **first start prints the admin
password** in the window — sign in and change it under Settings.

Options: `--port 8080`, `--data <folder>` (database location, default `mdluex-data`), `--no-browser`,
`--no-firewall` (don't touch Windows Firewall), `--no-code` (no server code, see below).

### Connect a TV without typing an address
In Mdluex IPTV choose **Add playlist → Find my server**:
- **Search** — the app looks for the server on your home network by itself (server on the usual port 8080).
- **Server code** — type the 6-letter code the server shows when it starts and on its dashboard. The server posts
  only its home-network address (like `http://192.168.1.20:8080`) to the public relay ntfy.sh under that code, so the
  app can read it back. Start with `--no-code` if you don't want that.
- **Easy name** — phones, PCs, Macs and many TVs also reach it as `http://mdluex-iptv.local:8080` (Bonjour / mDNS).

### Windows Firewall
On its first start the server opens its port in Windows Firewall for every network type — Windows asks once for
permission (click **Yes**). It also removes the *block* rule Windows adds when its own "allow access" prompt was closed
without allowing. If you say no, it tells you how to allow it by hand.

### Quick start
1. **Media folders** → add your movies folder and your series folder → **Scan now**.
2. **Settings** → paste a free [TMDB](https://www.themoviedb.org/settings/api) API key for posters & trailers, then scan again.
3. **Live TV** → add channels or **Import M3U**; **TV guide** → add an XMLTV URL.
4. **Accounts** → **New account** for each viewer.
5. In Mdluex IPTV: *Add playlist* → **Find my server** (or type `http://<this-pc-ip>:8080`), then the account's username and password.

When Windows asks for permission to change the firewall, click **Yes** (see *Windows Firewall* below). For viewers outside your home, forward the port on
your router or put the server behind a reverse proxy with HTTPS.

### The TV can't connect?
- In the TV app type the **On your TV** address the server shows (like `http://192.168.1.20:8080`), not `localhost`
  — on the TV, *localhost* means the TV itself.
- Check the port number, and that the server window is still open.
- Windows Firewall must allow the server: start it again and click **Yes** when Windows asks, or start
  `mdluex-server.exe` once with *Run as administrator*. Another security program (antivirus) may need its own rule.
- Easiest of all: in the TV app use **Add playlist → Find my server**.
- The TV and the PC must be on the same network (not a guest Wi-Fi that keeps devices apart).

## FFmpeg (included)
The Windows download includes `ffmpeg.exe` (FFmpeg 9.1 "essentials" build by gyan.dev), used for pictures from the
videos, HLS→TS remuxing, transcoding and recording. FFmpeg is free software by the FFmpeg developers under the GNU GPL
v3 — see `FFmpeg-LICENSE.txt`; its source code is at https://ffmpeg.org and the build's at https://www.gyan.dev/ffmpeg/builds/.
It runs as a separate program and is not part of Mdluex IPTV Server's own license. On Linux, install ffmpeg from your
distribution.

## Build from source
Requires Rust (and ffmpeg in `PATH` for HLS→TS remuxing).
```powershell
cargo build --release
```
The admin panel (`admin/`) is embedded into the single executable `target/release/mdluex-server.exe`.
Runs on Windows and Linux.

## Commercial features
- **Resellers & credits** – create reseller logins with a credit balance. Resellers sign in to the same panel
  and only see *Dashboard, Accounts, Watching now, Credit history* for their own customers. Creating or
  extending an account charges the package price; every movement is in the credit history.
- **Packages** – ready-made subscriptions (months or trial hours, screens, credit price).
- **Load balancing** – add edge servers under *Servers*; run the same program on each edge:
  ```
  mdluex-server --edge --main http://<main-address>:8080 --secret <secret shown in the panel> --port 8080
  ```
  New viewers are sent to the least-busy online edge with a signed one-minute link (tampered links are
  refused). Edges report their viewers every 10 s, so limits and *Disconnect* work across all servers.
  Live channels are relayed by the edge; movie/series files stay on the main server and are fetched by the edge.
- **Transcoding profiles** – H.264/AAC re-encode with resolution, bitrates and preset per channel (ffmpeg).
- **Catch-up / timeshift** – record chosen channels continuously in 5-minute pieces for N days; standard
  Xtream catch-up links work: `/timeshift/user/pass/minutes/YYYY-MM-DD:HH-MM/id.ts` and
  `/streaming/timeshift.php?...`. Past programmes inside the recorded period are flagged `has_archive`.
