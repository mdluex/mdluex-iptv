"""Bump the ?v= tag on the app's script/style links so browsers load fresh files.
Run: python tools/bump_version.py
"""
import pathlib, re, time

p = pathlib.Path(__file__).resolve().parent.parent / "app" / "index.html"
s = p.read_text(encoding="utf-8")
v = time.strftime("%Y%m%d%H%M%S")
s, n1 = re.subn(r'(src="js/[\w_]+\.js)(\?v=\w+)?"', r'\1?v=' + v + '"', s)
s, n2 = re.subn(r'(href="css/app\.css)(\?v=\w+)?"', r'\1?v=' + v + '"', s)
p.write_text(s, encoding="utf-8")
print(f"{n1 + n2} links tagged v={v}")
