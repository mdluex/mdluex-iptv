"""List a directory on the TV over the sdb sync service."""
import socket, struct, sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from sdb import send, recv, CNXN, OPEN, OKAY, WRTE, CLSE

def ls(ip, path):
    s = socket.create_connection((ip, 26101), timeout=15)
    send(s, CNXN, 0x02000000, 256 * 1024, b"host::\0")
    recv(s)
    send(s, OPEN, 1, 0, b"sync:\0")
    c, a0, a1, d = recv(s)
    if c != OKAY:
        print("sync refused:", c, d); return
    remote = a0
    p = path.encode()
    send(s, WRTE, 1, remote, b"LIST" + struct.pack("<I", len(p)) + p)
    buf = b""
    while True:
        c, a0, a1, d = recv(s)
        if c == WRTE:
            buf += d; send(s, OKAY, 1, remote)
        elif c == CLSE:
            break
        if buf.endswith(b"DONE" + b"\0" * 16) or (b"DONE" in buf[-20:]) or buf.startswith(b"FAIL"):
            break
    i = 0
    while i + 4 <= len(buf):
        tag = buf[i:i+4]
        if tag == b"DENT":
            mode, size, mtime, nlen = struct.unpack("<4I", buf[i+4:i+20])
            print(f"{oct(mode):>10} {size:>10}  {buf[i+20:i+20+nlen].decode(errors='replace')}")
            i += 20 + nlen
        elif tag == b"FAIL":
            n = struct.unpack("<I", buf[i+4:i+8])[0]; print("FAIL:", buf[i+8:i+8+n]); break
        else:
            break
    s.close()

if __name__ == "__main__":
    for p in sys.argv[2:]:
        print("====", p); ls(sys.argv[1], p)
