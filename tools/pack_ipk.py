"""Pack a webOS app folder into an .ipk (the same layout LG's ares-package produces), no LG tools needed.

Usage: python tools/pack_ipk.py <app folder with appinfo.json> <output folder>
.ipk = "ar" archive: debian-binary, control.tar.gz, data.tar.gz
data:  usr/palm/applications/<id>/...  +  usr/palm/packages/<id>/packageinfo.json
"""
import io, json, os, sys, tarfile, time


def tar_gz(entries):
    """entries: list of (archive name, bytes or None for a directory)"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as t:
        for name, data in entries:
            info = tarfile.TarInfo(name)
            info.mtime = int(time.time())
            info.uid = info.gid = 0
            info.uname = info.gname = "root"
            if data is None:
                info.type = tarfile.DIRTYPE
                info.mode = 0o755
                t.addfile(info)
            else:
                info.size = len(data)
                info.mode = 0o644
                t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def ar(members):
    out = io.BytesIO()
    out.write(b"!<arch>\n")
    for name, data in members:
        hdr = f"{name + '/':<16}{int(time.time()):<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n"
        out.write(hdr.encode("ascii"))
        out.write(data)
        if len(data) % 2:
            out.write(b"\n")
    return out.getvalue()


def main(src, dest):
    info = json.load(open(os.path.join(src, "appinfo.json"), encoding="utf-8"))
    app_id, version = info["id"], info["version"]
    base = f"usr/palm/applications/{app_id}"
    # member names without a leading "./" (what ares-package writes and what installers/checkers look up)
    entries = [("usr", None), ("usr/palm", None), ("usr/palm/applications", None), (base, None)]
    size = 0
    for root, dirs, files in os.walk(src):
        dirs.sort()
        rel = os.path.relpath(root, src).replace("\\", "/")
        if rel != ".":
            entries.append((f"{base}/{rel}", None))
        for f in sorted(files):
            data = open(os.path.join(root, f), "rb").read()
            size += len(data)
            entries.append((f"{base}/{f}" if rel == "." else f"{base}/{rel}/{f}", data))
    pkginfo = {"app": app_id, "id": app_id, "loc_name": info.get("title", app_id), "package_format_version": 2,
               "vendor": info.get("vendor", ""), "version": version}
    entries += [("usr/palm/packages", None), (f"usr/palm/packages/{app_id}", None),
                (f"usr/palm/packages/{app_id}/packageinfo.json", json.dumps(pkginfo, indent=2).encode())]
    control = (f"Package: {app_id}\nVersion: {version}\nSection: misc\nPriority: optional\nArchitecture: all\n"
               f"Installed-Size: {max(1, size // 1024)}\nMaintainer: {info.get('vendor', 'N/A')}\n"
               f"Description: {info.get('title', app_id)}\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n")
    ipk = ar([("debian-binary", b"2.0\n"),
              ("control.tar.gz", tar_gz([("control", control.encode())])),
              ("data.tar.gz", tar_gz(entries))])
    os.makedirs(dest, exist_ok=True)
    path = os.path.join(dest, f"{app_id}_{version}_all.ipk")
    open(path, "wb").write(ipk)
    print(f"Built {path} ({len(ipk) // 1024} KB, {len([e for e in entries if e[1] is not None])} files)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
