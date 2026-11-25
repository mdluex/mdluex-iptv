"""Build an unsigned Samsung .wgt from app/ for installers that sign it for each TV
(Apps2Samsung, TizenBrew Installer, `tizen package -s <profile>`).

    python tools/build_wgt.py            -> dist/MdluexIPTV-v<version>.wgt
"""
import os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
SKIP_DIRS = {".buildResult", ".sign", ".settings"}
SKIP_FILES = {"author-signature.xml", ".project", ".tproject"}


def main():
    cfg = open(os.path.join(APP, "config.xml"), encoding="utf-8").read()
    version = re.search(r'<widget[^>]*\sversion="([\d.]+)"', cfg).group(1)
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist", f"MdluexIPTV-v{version}.wgt")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    n = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for d, dirs, files in os.walk(APP):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS and not x.startswith("."))
            for f in sorted(files):
                if f in SKIP_FILES or f.endswith(".wgt") or re.match(r"signature\d+\.xml$", f) or f.startswith("."):
                    continue
                p = os.path.join(d, f)
                z.write(p, os.path.relpath(p, APP).replace(os.sep, "/"))
                n += 1
    print(f"Built {out} ({os.path.getsize(out) // 1024} KB, {n} files, unsigned)")


if __name__ == "__main__":
    main()
