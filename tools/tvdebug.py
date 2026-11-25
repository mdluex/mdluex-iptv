"""Talk to the app running on the TV through the Chrome DevTools protocol.

Setup (app must be launched in debug mode):
  sdb -s <tv>:26101 shell 0 debug MdlxIPTV01.MdluexIPTV     -> prints "port: NNNNN"
  sdb -s <tv>:26101 forward tcp:9222 tcp:NNNNN
Usage:
  python tools/tvdebug.py eval "<javascript expression>"
  python tools/tvdebug.py watch 15        # print console messages/errors for 15 s
  python tools/tvdebug.py key Right 3     # press a remote key N times (Left/Right/Up/Down/Enter/Back)
"""
import json, sys, time, urllib.request
import websocket

KEYS = {"Left": 37, "Up": 38, "Right": 39, "Down": 40, "Enter": 13, "Back": 10009}

def connect():
    pages = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
    return websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=90)

_id = 0
def call(ws, method, params=None):
    global _id
    _id += 1
    ws.send(json.dumps({"id": _id, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == _id:
            return m

def ev(ws, expr):
    r = call(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    res = r.get("result", {})
    if "exceptionDetails" in res:
        return "EXCEPTION: " + json.dumps(res["exceptionDetails"].get("exception", {}).get("description", res["exceptionDetails"]))[:800]
    return res.get("result", {}).get("value", res.get("result", {}).get("description"))

def main():
    ws = connect()
    cmd = sys.argv[1]
    if cmd == "eval":
        out = ev(ws, sys.argv[2])
        print(json.dumps(out, ensure_ascii=False, indent=1) if not isinstance(out, str) else out)
    elif cmd == "watch":
        secs = float(sys.argv[2]) if len(sys.argv) > 2 else 10
        call(ws, "Runtime.enable"); call(ws, "Log.enable")
        ws.settimeout(1)
        end = time.time() + secs
        while time.time() < end:
            try:
                m = json.loads(ws.recv())
            except Exception:
                continue
            if m.get("method") == "Runtime.consoleAPICalled":
                p = m["params"]
                print(p["type"], " ".join(str(a.get("value", a.get("description", ""))) for a in p["args"])[:400])
            elif m.get("method") == "Runtime.exceptionThrown":
                d = m["params"]["exceptionDetails"]
                print("EXCEPTION", (d.get("exception", {}).get("description") or d.get("text"))[:400])
            elif m.get("method") == "Log.entryAdded":
                e = m["params"]["entry"]
                print("LOG", e["level"], e.get("text", "")[:300], e.get("url", "")[:120])
    elif cmd == "key":
        name, n = sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1
        for _ in range(n):
            ev(ws, "document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:%d,bubbles:true}))" % KEYS[name])
            time.sleep(0.25)
        print("pressed", name, n)
    ws.close()

if __name__ == "__main__":
    main()
