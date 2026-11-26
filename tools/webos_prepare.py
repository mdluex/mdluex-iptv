"""LG-only finishing touches on the staged webOS app (run by tools/build_webos.ps1).

    python tools/webos_prepare.py <staged app folder>

- removes the Samsung-only webapis.js script (it gives a "file not found" error on every LG launch)
- writes the CSS colour variables out as plain values, so older LG engines (webOS 3, Chrome 38, which
  has no CSS variables) still get the full styling. The source keeps its variables.
Idea and snippet from Kerolosashraf7 (github.com/mdluex/mdluex-iptv/issues/1).
"""
import io, os, re, sys

stage = sys.argv[1]

p = os.path.join(stage, 'index.html')
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'\s*<script src="\$WEBAPIS/webapis/webapis\.js"></script>', '', s)
io.open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(stage, 'css', 'app.css')
css = io.open(p, encoding='utf-8').read()
root = re.search(r':root\s*\{([^}]*)\}', css)
vars_ = {}
if root:
    for k, v in re.findall(r'--([\w-]+)\s*:\s*([^;]+);', root.group(1)):
        vars_[k] = re.sub(r'/\*.*?\*/', '', v).strip()

def sub(m):
    k, fallback = m.group(1), m.group(2)
    return vars_.get(k) or (fallback.strip() if fallback else m.group(0))

flat = re.sub(r'var\(--([\w-]+)\s*(?:,\s*([^)]+))?\)', sub, css)
left = len(re.findall(r'var\(--', flat))
io.open(p, 'w', encoding='utf-8').write(flat)
print('webOS: removed webapis.js, flattened %d CSS variables (%d dynamic ones kept)' % (len(vars_), left))
