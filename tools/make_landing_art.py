"""Draw the illustrations for the landing page (landing/img/*.svg) in one consistent style.

    python tools/make_landing_art.py

TV and phone frames in the app's colours, showing what you see at each install step. They use shapes, numbers
and addresses rather than words, so they work for English and Arabic alike.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'landing', 'img')
RED, DARK, SCREEN, PANEL, LIGHT, MUTED, OK = '#d11515', '#141416', '#1b1b21', '#2a2a32', '#f4f4f6', '#8a8a96', '#2ecc71'
BG = '#eef0f3'


def svg(body, w=400, h=225, bg=BG):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'font-family="Segoe UI, Arial, sans-serif">'
            f'<rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>')


def tv(inner, x=58, y=16, w=284, h=166):
    """A TV with a stand; `inner` is drawn in screen coordinates (0..w, 0..h)."""
    return (f'<rect x="{x - 8}" y="{y - 8}" width="{w + 16}" height="{h + 16}" rx="10" fill="{DARK}"/>'
            f'<rect x="{x + w / 2 - 34}" y="{y + h + 8}" width="68" height="10" rx="3" fill="#2a2a2e"/>'
            f'<rect x="{x + w / 2 - 70}" y="{y + h + 16}" width="140" height="6" rx="3" fill="#3a3a40"/>'
            f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{SCREEN}"/>{inner}</svg>')


def phone(inner, x=140, y=10, w=120, h=205):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{DARK}"/>'
            f'<svg x="{x + 7}" y="{y + 14}" width="{w - 14}" height="{h - 28}" viewBox="0 0 {w - 14} {h - 28}">'
            f'<rect width="{w - 14}" height="{h - 28}" rx="4" fill="{SCREEN}"/>{inner}</svg>')


def remote(x, y, s=1.0, highlight=None):
    """A TV remote; highlight=list of number keys to light up in red."""
    keys = ''
    n = 1
    for r in range(3):
        for c in range(3):
            on = highlight and n in highlight
            keys += (f'<circle cx="{x + (14 + c * 14) * s}" cy="{y + (58 + r * 14) * s}" r="{5.2 * s}" fill="{RED if on else "#3a3a42"}"/>'
                     f'<text x="{x + (14 + c * 14) * s}" y="{y + (60.6 + r * 14) * s}" font-size="{6.5 * s}" fill="{LIGHT}" text-anchor="middle" font-weight="700">{n}</text>')
            n += 1
    return (f'<rect x="{x}" y="{y}" width="{56 * s}" height="{122 * s}" rx="{12 * s}" fill="{DARK}"/>'
            f'<circle cx="{x + 28 * s}" cy="{y + 26 * s}" r="{13 * s}" fill="#2a2a32"/><circle cx="{x + 28 * s}" cy="{y + 26 * s}" r="{5 * s}" fill="{MUTED}"/>'
            + keys)


def app_tile(x, y, w=46, h=46, logo=True, color=RED):
    t = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{color}"/>'
    if logo:  # a simple "M" mark, like the app's logo
        t += (f'<path d="M{x + w * .25} {y + h * .72} V{y + h * .3} L{x + w * .5} {y + h * .55} L{x + w * .75} {y + h * .3} V{y + h * .72}" '
              f'fill="none" stroke="{LIGHT}" stroke-width="{w * .1}" stroke-linejoin="round" stroke-linecap="round"/>')
    return t


def downloader_icon(x, y, s=46):
    return (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="9" fill="#f27b1b"/>'
            f'<path d="M{x + s / 2} {y + s * .22} V{y + s * .62} M{x + s * .32} {y + s * .46} L{x + s / 2} {y + s * .64} L{x + s * .68} {y + s * .46}" '
            f'fill="none" stroke="#fff" stroke-width="{s * .09}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<rect x="{x + s * .26}" y="{y + s * .72}" width="{s * .48}" height="{s * .07}" rx="2" fill="#fff"/>')


def toggle(x, y, on=True):
    return (f'<rect x="{x}" y="{y}" width="34" height="18" rx="9" fill="{OK if on else "#555"}"/>'
            f'<circle cx="{x + (25 if on else 9)}" cy="{y + 9}" r="7" fill="#fff"/>')


def cursor(x, y):
    return f'<path d="M{x} {y} l0 22 l6-6 l5 11 l4-2 l-5-11 l8 0 z" fill="#fff" stroke="{DARK}" stroke-width="1.5" stroke-linejoin="round"/>'


ART = {}

# ---- Fire TV / Android: store with Downloader ----
ART['step-firetv-downloader.svg'] = svg(tv(
    f'<rect x="12" y="12" width="260" height="22" rx="11" fill="{PANEL}"/><circle cx="26" cy="23" r="5" fill="none" stroke="{MUTED}" stroke-width="2"/>'
    f'<rect x="38" y="20" width="70" height="6" rx="3" fill="{MUTED}"/>'
    + downloader_icon(20, 52, 62) +
    f'<rect x="94" y="56" width="110" height="10" rx="5" fill="{LIGHT}"/><rect x="94" y="72" width="80" height="7" rx="3.5" fill="{MUTED}"/>'
    f'<rect x="94" y="94" width="84" height="26" rx="6" fill="{RED}"/><path d="M128 101 v10 m-5-5 5 5 5-5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    + ''.join(f'<rect x="{20 + i * 64}" y="132" width="54" height="22" rx="5" fill="{PANEL}"/>' for i in range(4))))

# ---- allow unknown apps: settings list with a switch ----
ART['step-unknown-apps.svg'] = svg(tv(
    f'<rect x="0" y="0" width="92" height="166" fill="#22222a"/>'
    + ''.join(f'<rect x="12" y="{18 + i * 20}" width="{60 - i * 6}" height="7" rx="3.5" fill="{MUTED}"/>' for i in range(6)) +
    ''.join(f'<rect x="104" y="{18 + i * 34}" width="168" height="26" rx="6" fill="{PANEL if i != 1 else "#33333d"}"/>'
            f'<rect x="114" y="{27 + i * 34}" width="{70 + (i % 2) * 20}" height="8" rx="4" fill="{LIGHT if i == 1 else MUTED}"/>'
            + toggle(226, 22 + i * 34, on=(i == 1)) for i in range(4)) +
    downloader_icon(194, 56, 18)[0:0] + cursor(250, 46)))

# ---- type the address ----
ART['step-type-link.svg'] = svg(tv(
    downloader_icon(14, 14, 30) +
    f'<rect x="14" y="56" width="256" height="30" rx="6" fill="{LIGHT}"/>'
    f'<text x="24" y="76" font-size="12.5" font-weight="700" fill="{DARK}" font-family="Consolas, monospace">mdluex.github.io/mdluex-iptv/apk</text>'
    f'<rect x="232" y="98" width="38" height="22" rx="5" fill="{RED}"/><text x="251" y="113" font-size="11" font-weight="800" fill="#fff" text-anchor="middle">Go</text>'
    + ''.join(f'<rect x="{14 + (i % 10) * 21}" y="{128 + (i // 10) * 16}" width="17" height="12" rx="3" fill="{PANEL}"/>' for i in range(20))))

# ---- install, then open ----
ART['step-install-open.svg'] = svg(tv(
    app_tile(112, 18, 60, 60) +
    f'<rect x="92" y="88" width="100" height="9" rx="4.5" fill="{LIGHT}"/>'
    f'<rect x="62" y="114" width="74" height="28" rx="6" fill="{PANEL}"/><path d="M90 128 l6 6 12-12" stroke="{OK}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    f'<rect x="148" y="114" width="74" height="28" rx="6" fill="{RED}"/><path d="M180 121 l12 7 -12 7z" fill="#fff"/>'))

# ---- Samsung: Apps + 1 2 3 4 5 ----
ART['step-samsung-12345.svg'] = svg(
    tv(''.join(f'<rect x="{14 + (i % 4) * 66}" y="{16 + (i // 4) * 50}" width="58" height="42" rx="6" fill="{PANEL}"/>' for i in range(12)),
       x=30, y=16, w=250, h=150)
    + remote(318, 36, 1.0, highlight=[1, 2, 3, 4, 5])
    + f'<text x="346" y="182" font-size="12" font-weight="800" fill="{RED}" text-anchor="middle">1 2 3 4 5</text>')

# ---- Samsung: Developer Mode window with Host PC IP ----
ART['step-samsung-hostip.svg'] = svg(tv(
    f'<rect x="0" y="0" width="284" height="166" fill="#101014"/>'
    f'<rect x="36" y="16" width="212" height="134" rx="10" fill="{PANEL}"/>'
    f'<rect x="54" y="30" width="96" height="9" rx="4.5" fill="{LIGHT}"/>'
    f'<rect x="54" y="52" width="70" height="7" rx="3.5" fill="{MUTED}"/>' + toggle(196, 46, True) +
    f'<rect x="54" y="78" width="60" height="7" rx="3.5" fill="{MUTED}"/>'
    f'<rect x="54" y="92" width="176" height="24" rx="5" fill="{LIGHT}" stroke="{RED}" stroke-width="2"/>'
    f'<text x="64" y="108.5" font-size="12" font-weight="700" fill="{DARK}" font-family="Consolas, monospace">192.168.1.20</text>'
    f'<rect x="150" y="126" width="80" height="16" rx="4" fill="{RED}"/>'))

# ---- Samsung: Apps2Samsung on a phone ----
ART['step-apps2samsung.svg'] = svg(
    phone(f'<rect x="8" y="8" width="90" height="10" rx="5" fill="{PANEL}"/>'
          + ''.join(f'<rect x="8" y="{28 + i * 34}" width="90" height="28" rx="6" fill="{PANEL if i != 1 else "#33333d"}"/>'
                    + app_tile(12, 31 + i * 34, 22, 22, logo=(i == 1), color=(RED if i == 1 else '#444'))
                    + f'<rect x="40" y="{36 + i * 34}" width="{34 if i != 1 else 30}" height="6" rx="3" fill="{LIGHT if i == 1 else MUTED}"/>'
                    + (f'<rect x="72" y="{34 + i * 34}" width="22" height="14" rx="4" fill="{RED}"/><path d="M83 {37 + i * 34} v7 m-3-3 3 3 3-3" stroke="#fff" stroke-width="1.6" fill="none"/>' if i == 1 else '')
                    for i in range(4)))
    + '<path d="M270 112 q40 0 52 -20" fill="none" stroke="#9aa0aa" stroke-width="3" stroke-dasharray="6 6"/>'
    + f'<rect x="300" y="40" width="88" height="56" rx="6" fill="{DARK}"/><rect x="305" y="45" width="78" height="46" rx="3" fill="{SCREEN}"/>'
    + app_tile(330, 52, 28, 28)
    + f'<rect x="336" y="96" width="16" height="6" fill="#2a2a2e"/>')

# ---- LG: Developer Mode app ----
ART['step-lg-devmode.svg'] = svg(tv(
    f'<rect x="20" y="20" width="244" height="126" rx="10" fill="{PANEL}"/>'
    f'<path d="M50 52 l-12 12 12 12 M74 52 l12 12 -12 12" stroke="{RED}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    f'<rect x="104" y="44" width="110" height="9" rx="4.5" fill="{LIGHT}"/><rect x="104" y="62" width="80" height="7" rx="3.5" fill="{MUTED}"/>'
    f'<rect x="38" y="98" width="100" height="7" rx="3.5" fill="{MUTED}"/>' + toggle(210, 92, True) +
    f'<rect x="38" y="120" width="70" height="7" rx="3.5" fill="{MUTED}"/><rect x="190" y="114" width="56" height="18" rx="4" fill="#3a3a44"/>'))

# ---- LG: Homebrew Channel ----
ART['step-lg-homebrew.svg'] = svg(
    tv(''.join(f'<rect x="{14 + (i % 4) * 66}" y="{20 + (i // 4) * 60}" width="58" height="50" rx="8" fill="{PANEL if i != 5 else "#3b2a5c"}"/>' for i in range(8))
       + '<path d="M156 98 c0-10 14-10 14 0 c0 10-14 10-14 0z" fill="#f1c40f"/><rect x="150" y="106" width="26" height="6" rx="3" fill="#f1c40f"/>',
       x=30, y=16, w=250, h=150)
    + f'<rect x="300" y="60" width="90" height="62" rx="8" fill="{DARK}"/><rect x="306" y="66" width="78" height="40" rx="3" fill="#2f6fd6"/>'
    + f'<rect x="306" y="110" width="40" height="6" rx="3" fill="{MUTED}"/>')

# ---- LG: add our repository ----
ART['step-lg-repo.svg'] = svg(tv(
    f'<rect x="14" y="14" width="80" height="10" rx="5" fill="{LIGHT}"/>'
    f'<rect x="14" y="34" width="256" height="40" rx="6" fill="{PANEL}"/>'
    f'<rect x="22" y="44" width="240" height="22" rx="4" fill="{LIGHT}" stroke="{RED}" stroke-width="2"/>'
    f'<text x="28" y="59" font-size="8.6" font-weight="700" fill="{DARK}" font-family="Consolas, monospace">https://mdluex.github.io/mdluex-iptv/lg/apps.json</text>'
    f'<rect x="196" y="84" width="74" height="22" rx="5" fill="{RED}"/><path d="M226 89 v12 m-6-6 h12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>'
    + app_tile(14, 118, 34, 34) + f'<rect x="56" y="124" width="80" height="8" rx="4" fill="{LIGHT}"/><rect x="56" y="138" width="56" height="6" rx="3" fill="{MUTED}"/>'
    f'<rect x="214" y="124" width="56" height="20" rx="5" fill="{OK}"/><path d="M236 130 v8 m-4-4 4 4 4-4" stroke="#fff" stroke-width="2" fill="none"/>'))

# ---- first time: add your playlist ----
ART['step-playlist.svg'] = svg(tv(
    f'<rect x="0" y="0" width="284" height="166" fill="#101014"/>'
    f'<rect x="30" y="10" width="224" height="146" rx="10" fill="{PANEL}"/>'
    + ''.join(f'<rect x="46" y="{24 + i * 28}" width="56" height="6" rx="3" fill="{MUTED}"/>'
              f'<rect x="46" y="{33 + i * 28}" width="192" height="13" rx="3" fill="{LIGHT if i else "#3a3a44"}"/>' for i in range(4)) +
    f'<text x="52" y="72.5" font-size="8.5" font-weight="700" fill="{DARK}" font-family="Consolas, monospace">http://example.com:8080</text>'
    f'<text x="52" y="100.5" font-size="8.5" font-weight="700" fill="{DARK}" font-family="Consolas, monospace">username</text>'
    f'<text x="52" y="128.5" font-size="9" font-weight="700" fill="{DARK}" font-family="Consolas, monospace">••••••••</text>'
    f'<rect x="168" y="140" width="70" height="12" rx="3" fill="{RED}"/>'), w=400, h=225, bg='#e9ecf0')

# ---- the four TV kinds (generic icons, not brand logos) ----
def icon(body, bg='none'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">{body}</svg>'

ART['ico-firetv.svg'] = icon(f'<rect x="6" y="18" width="26" height="12" rx="3" fill="#ff9900"/><rect x="30" y="21" width="12" height="6" rx="2" fill="#555"/>'
                             f'<rect x="10" y="22" width="10" height="4" rx="2" fill="#fff" opacity=".8"/>')
ART['ico-android.svg'] = icon(f'<rect x="6" y="16" width="36" height="16" rx="5" fill="#3ddc84"/><circle cx="16" cy="24" r="2.5" fill="#fff"/><rect x="24" y="22" width="12" height="4" rx="2" fill="#fff"/>'
                              f'<rect x="10" y="34" width="6" height="4" rx="1" fill="#3ddc84"/><rect x="32" y="34" width="6" height="4" rx="1" fill="#3ddc84"/>')
ART['ico-samsung.svg'] = icon(f'<rect x="4" y="9" width="40" height="25" rx="3" fill="#1428a0"/><rect x="7" y="12" width="34" height="19" rx="1.5" fill="#4b6bd6"/>'
                              f'<rect x="20" y="35" width="8" height="3" fill="#333"/><rect x="14" y="38" width="20" height="2.5" rx="1.2" fill="#333"/>')
ART['ico-lg.svg'] = icon(f'<rect x="4" y="9" width="40" height="25" rx="3" fill="#a50034"/><rect x="7" y="12" width="34" height="19" rx="1.5" fill="#d64570"/>'
                         f'<path d="M14 40 l10-6 10 6" fill="none" stroke="#333" stroke-width="2.6" stroke-linecap="round"/>')

# ---- feature icons ----
def ficon(path):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><rect width="48" height="48" rx="12" fill="{RED}" opacity=".12"/>'
            f'<g fill="none" stroke="{RED}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">{path}</g></svg>')

ART['f-live.svg'] = ficon('<rect x="11" y="15" width="26" height="18" rx="3"/><path d="M19 10l5 5 5-5M17 37h14"/><circle cx="24" cy="24" r="2.5" fill="#d11515"/>')
ART['f-movies.svg'] = ficon('<rect x="11" y="13" width="26" height="22" rx="3"/><path d="M11 19h26M17 13l3 6M24 13l3 6M31 13l3 6"/>')
ART['f-resume.svg'] = ficon('<circle cx="24" cy="24" r="12"/><path d="M21 19v10l8-5z"/>')
ART['f-quran.svg'] = ficon('<path d="M24 16c-3-2.5-7-3.5-13-3.5v21c6 0 10 1 13 3.5 3-2.5 7-3.5 13-3.5v-21c-6 0-10 1-13 3.5zM24 16v21"/>')
ART['f-youtube.svg'] = ficon('<rect x="10" y="14" width="28" height="20" rx="6"/><path d="M21 19v10l8-5z"/>')
ART['f-lang.svg'] = ficon('<circle cx="24" cy="24" r="12"/><path d="M12 24h24M24 12c4 4 4 20 0 24M24 12c-4 4-4 20 0 24"/>')

os.makedirs(OUT, exist_ok=True)
for name, content in ART.items():
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(content)
print(len(ART), 'illustrations written to', OUT)
