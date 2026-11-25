"""
IPTV account checker - asks your IPTV server for account info the same way
IPTV Smarters Pro does (Xtream Codes API), several times in a row, and shows
when the expiry date is missing and why.

Run:  python iptv_check.py
Your username/password are typed here and sent only to your IPTV server.
Nothing is saved.
"""
import getpass, json, socket, ssl, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

ROUNDS = 10          # how many times to ask the server
PAUSE_SEC = 3        # wait between attempts
TIMEOUT_SEC = 15     # Smarters gives up much sooner than this on slow servers

def fmt_exp(v):
    if v in (None, "", "null"):
        return None
    try:
        return datetime.fromtimestamp(int(v), timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, TypeError, OSError):
        return f"unreadable value {v!r}"

def ask(base, user, pw):
    q = urllib.parse.urlencode({"username": user, "password": pw})
    url = f"{base}/player_api.php?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": "IPTVSmartersPlayer"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC,
                                    context=ssl._create_unverified_context()) as r:
            body = r.read()
            code = r.status
    except urllib.error.HTTPError as e:
        return {"ok": False, "why": f"HTTP error {e.code}", "secs": time.time() - t0}
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as e:
        return {"ok": False, "why": f"no answer ({getattr(e, 'reason', e)})", "secs": time.time() - t0}
    secs = time.time() - t0
    try:
        data = json.loads(body)
    except ValueError:
        snippet = body[:120].decode(errors="replace").replace("\n", " ")
        return {"ok": False, "why": f"HTTP {code} but reply is not JSON: {snippet!r}", "secs": secs}
    ui = data.get("user_info") if isinstance(data, dict) else None
    if not ui:
        return {"ok": False, "why": "reply has no user_info (server rejected or sent empty data)", "secs": secs}
    return {"ok": True, "secs": secs, "auth": ui.get("auth"), "status": ui.get("status"),
            "exp": fmt_exp(ui.get("exp_date")), "raw_exp": ui.get("exp_date"),
            "active": ui.get("active_cons"), "max": ui.get("max_connections")}

def main():
    base = input("Server address (e.g. http://example.com:8080): ").strip().rstrip("/")
    if not base.startswith("http"):
        base = "http://" + base
    user = input("Username: ").strip()
    pw = getpass.getpass("Password (hidden): ")
    print(f"\nAsking the server {ROUNDS} times...\n")
    results = []
    for i in range(1, ROUNDS + 1):
        r = ask(base, user, pw)
        results.append(r)
        if r["ok"]:
            exp = r["exp"] or f"MISSING (server sent {r['raw_exp']!r})"
            print(f"#{i:2}  {r['secs']:5.1f}s  status={r['status']}  auth={r['auth']}  "
                  f"expiry={exp}  connections={r['active']}/{r['max']}")
        else:
            print(f"#{i:2}  {r['secs']:5.1f}s  FAILED: {r['why']}")
        time.sleep(PAUSE_SEC)

    print("\n=== Diagnosis ===")
    ok = [r for r in results if r["ok"]]
    failed = len(results) - len(ok)
    no_exp = [r for r in ok if not r["exp"]]
    slow = [r for r in results if r["secs"] > 5]
    full = [r for r in ok if str(r["active"]).isdigit() and str(r["max"]).isdigit()
            and int(r["active"]) >= int(r["max"])]
    if failed:
        print(f"- {failed}/{len(results)} requests failed outright. When this happens the app shows "
              "no expiry date. This is a server/provider problem.")
    if no_exp:
        print(f"- {len(no_exp)} replies had no expiry date even though the server answered. "
              "The provider's panel is sending empty data - ask them to fix your account.")
    if slow:
        print(f"- {len(slow)} replies took over 5 seconds. Smarters on TVs times out quickly, "
              "so slow replies show up as a missing expiry date.")
    if full:
        print("- Your connections were at the limit (active >= max). The server may refuse the "
              "TV while an old session (another device, or the TV app's previous session) is "
              "still open. That's why reinstalling sometimes 'fixes' it - it drops the old session.")
    if ok and any(r["status"] not in ("Active", None) for r in ok):
        print("- Account status is not 'Active' in some replies - check with your provider.")
    if not (failed or no_exp or slow or full):
        print("- Server answered correctly every time. Run this again right when the TV shows "
              "the problem; if it's fine then too, the issue is the app's saved data on the TV.")

if __name__ == "__main__":
    main()
