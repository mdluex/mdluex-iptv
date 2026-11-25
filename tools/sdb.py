"""Minimal sdb (Tizen Smart Development Bridge) client: runs one shell command."""
import socket, struct, sys

def cmd(s): return struct.unpack("<I", s.encode())[0]
CNXN, OPEN, OKAY, WRTE, CLSE = map(cmd, ["CNXN", "OPEN", "OKAY", "WRTE", "CLSE"])
NAMES = {v: k for k, v in zip(["CNXN", "OPEN", "OKAY", "WRTE", "CLSE"], [CNXN, OPEN, OKAY, WRTE, CLSE])}

def send(sock, c, a0, a1, data=b""):
    hdr = struct.pack("<6I", c, a0, a1, len(data), sum(data) & 0xFFFFFFFF, c ^ 0xFFFFFFFF)
    sock.sendall(hdr + data)

def recvn(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk: raise EOFError("connection closed")
        buf += chunk
    return buf

def recv(sock):
    c, a0, a1, ln, _, _ = struct.unpack("<6I", recvn(sock, 24))
    return c, a0, a1, recvn(sock, ln) if ln else b""

def run(ip, command, port=26101):
    s = socket.create_connection((ip, port), timeout=20)
    send(s, CNXN, 0x02000000, 256 * 1024, b"host::\0")
    c, a0, a1, d = recv(s)
    print("[connect]", NAMES.get(c, hex(c)), d[:120])
    send(s, OPEN, 1, 0, b"shell:" + command.encode() + b"\0")
    out = b""
    while True:
        try:
            c, a0, a1, d = recv(s)
        except (EOFError, socket.timeout):
            break
        if c == WRTE:
            out += d
            send(s, OKAY, 1, a0)
        elif c == CLSE:
            break
        elif c != OKAY:
            print("[msg]", NAMES.get(c, hex(c)), d[:200])
    s.close()
    return out.decode(errors="replace")

if __name__ == "__main__":
    print(run(sys.argv[1], " ".join(sys.argv[2:])))
