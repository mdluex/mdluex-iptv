"""Make app.css work on older Samsung TV engines (Tizen 6 / Chrome 76):
- replaces `inset: 0` with top/right/bottom/left
- appends spacing fallbacks used when flex `gap` is unsupported (html.no-flex-gap)
Safe to run more than once.
"""
import pathlib, re

p = pathlib.Path(__file__).resolve().parent.parent / "app" / "css" / "app.css"
css = p.read_text(encoding="utf-8")
css, n = re.subn(r"inset:\s*0;", "top: 0; right: 0; bottom: 0; left: 0;", css)
print(f"replaced {n} inset rules")

MARK = "/* ===== old-TV flex-gap fallback ===== */"
if MARK not in css:
    # (selector, horizontal gap, vertical gap for wrapping/column containers)
    rows = [
        ("#top-right", 26), (".chip", 10), ("#hintbar", 36), (".hint", 10), (".hero .meta", 22),
        (".btn", 14), (".row-track", 18), (".ch", 18), (".ep", 26), (".ep .t", 20), (".seasons", 14),
        (".search-box", 20), (".pin-dots", 22), (".osd-hints", 34), (".osd-live", 30),
    ]
    out = [MARK]
    for sel, g in rows:
        out.append(f".no-flex-gap {sel} {{ gap: 0; }}")
        out.append(f".no-flex-gap {sel} > * + * {{ -webkit-margin-start: {g}px; margin-inline-start: {g}px; }}")
    # wrapping containers: horizontal + vertical spacing
    out.append(".no-flex-gap .btn-row { gap: 0; margin-bottom: -20px; }")
    out.append(".no-flex-gap .btn-row > * { -webkit-margin-end: 20px; margin-inline-end: 20px; margin-bottom: 20px; }")
    out.append(".no-flex-gap .grid { gap: 0; }")
    out.append(".no-flex-gap .grid > * { margin: 0 22px 26px 0; }")
    # column container
    out.append(".no-flex-gap #sidebar { gap: 0; }")
    out.append(".no-flex-gap #sidebar > * + * { margin-top: 6px; }")
    css = css.rstrip() + "\n\n" + "\n".join(out) + "\n"
    print("added flex-gap fallback")
p.write_text(css, encoding="utf-8")
