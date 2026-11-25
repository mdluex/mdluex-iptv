"""Make the listing files that let community installers find Mdluex IPTV.

    python tools/make_store_listings.py

Writes:
  dist/com.mdluex.iptv.manifest.json   LG Homebrew Channel app manifest (upload to the GitHub release)
  docs/lg/apps.json, docs/lg/icon.png  Our own Homebrew Channel repository (served by GitHub Pages at
                                       https://mdluex.github.io/mdluex-iptv/lg/apps.json)
Samsung needs no listing file: Apps2Samsung takes the .wgt from the latest GitHub release.
Run after tools/build_webos.ps1 (the .ipk and its icon must exist).
"""
import hashlib, json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "mdluex/mdluex-iptv"
PAGES = "https://mdluex.github.io/mdluex-iptv"
APP_ID = "com.mdluex.iptv"


def main():
    cfg = open(os.path.join(ROOT, "app", "config.xml"), encoding="utf-8").read()
    version = re.search(r'<widget[^>]*\sversion="([\d.]+)"', cfg).group(1)
    tag = "v" + version
    ipk_name = f"MdluexIPTV-v{version}-lg-webos.ipk"
    ipk = os.path.join(ROOT, "dist", ipk_name)
    data = open(ipk, "rb").read()
    release = f"https://github.com/{REPO}/releases/download/{tag}"

    manifest = {
        "id": APP_ID,
        "version": version,
        "type": "web",
        "title": "Mdluex IPTV",
        "appDescription": "IPTV player for Xtream Codes servers",
        "iconUri": f"{PAGES}/lg/icon.png",
        "sourceUrl": f"https://github.com/{REPO}",
        "rootRequired": False,
        "ipkUrl": f"{release}/{ipk_name}",
        "ipkHash": {"sha256": hashlib.sha256(data).hexdigest()},
        "ipkSize": len(data),
    }
    out = os.path.join(ROOT, "dist", f"{APP_ID}.manifest.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    lg = os.path.join(ROOT, "docs", "lg")
    os.makedirs(lg, exist_ok=True)
    shutil.copyfile(os.path.join(ROOT, "build", "webos", APP_ID, "webos-largeIcon.png"), os.path.join(lg, "icon.png"))
    repo = {
        "paging": {"page": 1, "count": 1, "maxPage": 1, "itemsTotal": 1, "prevUrl": None, "nextUrl": None},
        "packages": [{
            "id": APP_ID,
            "title": "Mdluex IPTV",
            "iconUri": f"{PAGES}/lg/icon.png",
            "manifestUrl": f"{release}/{APP_ID}.manifest.json",
            "manifest": manifest,
            "pool": "non-free",
            "shortDescription": "Netflix-style IPTV player for your own Xtream Codes subscription, plus the "
                                "Mdluex Industries YouTube channel. Contains no channels. Personal use only.",
            "requirements": {"webosRelease": ">=4.0"},
        }],
    }
    with open(os.path.join(lg, "apps.json"), "w", encoding="utf-8") as f:
        json.dump(repo, f, indent=2)
    print("Wrote", out, "and docs/lg/apps.json for", tag)


if __name__ == "__main__":
    main()
