"""Pull a file from the TV over the sdb sync service: sdbpull.py IP REMOTE LOCAL"""
import os, socket, struct, sys
sys.path.insert(0, os.path.dirname(__file__))
from sdb import send, recv, CNXN, OPEN, OKAY, WRTE, CLSE

def pull(ip, remote_path, local_path):
    s = socket.create_connection((ip, 26101), timeout=30)
    send(s, CNXN, 0x02000000, 256 * 1024, b"host::\0")
    recv(s)
    send(s, OPEN, 1, 0, b"sync:\0")
    c, a0, _, _ = recv(s)
    if c != OKAY:
        print("sync refused"); return
    remote = a0
    p = remote_path.encode()
    send(s, WRTE, 1, remote, b"RECV" + struct.pack("<I", len(p)) + p)
    buf, out, done = b"", open(local_path, "wb"), False
    while not done:
        c, a0, _, d = recv(s)
        if c == CLSE:
            break
        if c != WRTE:
            continue
        send(s, OKAY, 1, remote)
        buf += d
        while len(buf) >= 8:
            tag, n = buf[:4], struct.unpack("<I", buf[4:8])[0]
            if tag == b"DONE":
                done = True; break
            if tag == b"FAIL":
                if len(buf) < 8 + n: break
                print("FAIL:", buf[8:8 + n].decode(errors="replace")); done = True; break
            if tag != b"DATA":
                print("unexpected", tag); done = True; break
            if len(buf) < 8 + n: break
            out.write(buf[8:8 + n]); buf = buf[8 + n:]
    out.close(); s.close()
    print(remote_path, "->", os.path.getsize(local_path), "bytes")

if __name__ == "__main__":
    pull(sys.argv[1], sys.argv[2], sys.argv[3])
