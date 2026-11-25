"""Take a 1920x1080 screenshot of the app (as the TV shows it) using headless Microsoft Edge.

Needs the PC preview server running:  python -m http.server 8765 --directory app
Usage:
  python tools/screenshot.py OUT.png "<javascript to run first>" [wait_seconds]
Example (Mdluex Channel, Videos tab):
  python tools/screenshot.py docs/channel-videos.png "App.go('channel', {tab: 'videos'}, {reset: true})" 10
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, base64
import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9333

out, script = sys.argv[1], sys.argv[2]
wait = float(sys.argv[3]) if len(sys.argv) > 3 else 8
profile = tempfile.mkdtemp(prefix="mdx-shot-")
edge = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}", "--window-size=1920,1080",
                         "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "--mute-audio",
                         f"--user-data-dir={profile}", "about:blank"])
try:
    for _ in range(50):
        try:
            pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=2))
            page = next(p for p in pages if p.get("type") == "page")
            break
        except Exception:
            time.sleep(0.3)
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=60)
    n = [0]
    def call(method, params=None):
        n[0] += 1
        ws.send(json.dumps({"id": n[0], "method": method, "params": params or {}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == n[0]:
                return m
    call("Emulation.setDeviceMetricsOverride", {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False})
    call("Page.navigate", {"url": f"http://localhost:8765/?shot={int(time.time())}"})
    time.sleep(4)
    call("Runtime.evaluate", {"expression": script, "awaitPromise": True})
    time.sleep(wait)
    shot = call("Page.captureScreenshot", {"format": "png"})
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(shot["result"]["data"]))
    print("saved", out)
finally:
    edge.terminate()
