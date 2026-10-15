"""Private agent PTY. JSON lines on stdio, no dependency on the job worker."""
import codecs, fcntl, json, os, pty, selectors, signal, struct, sys, termios
pid, fd = pty.fork()
if pid == 0:
    os.execv('/bin/bash', ['bash', '--noprofile', '--norc', '-i'])
def close(*_):
    try: os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError: pass
    raise SystemExit()
signal.signal(signal.SIGTERM, close)
try:
    import ctypes
    ctypes.CDLL(None).prctl(1, signal.SIGTERM)
except (AttributeError, OSError): pass
sel = selectors.DefaultSelector()
sel.register(fd, selectors.EVENT_READ)
sel.register(sys.stdin, selectors.EVENT_READ)
decoder = codecs.getincrementaldecoder('utf-8')('replace')
pending = b''
while True:
    for key, _ in sel.select():
        if key.fd == fd:
            try: data = os.read(fd, 4096)
            except OSError: close()
            if not data: close()
            print(json.dumps({'output': decoder.decode(data)}), flush=True)
        else:
            data = os.read(sys.stdin.fileno(), 16384)
            if not data: close()
            pending += data
            if len(pending) > 65536: close()
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                cmd = json.loads(line)
                if cmd['type'] == 'close': close()
                if cmd['type'] == 'input': os.write(fd, cmd['data'].encode())
                if cmd['type'] == 'resize':
                    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', cmd['rows'], cmd['cols'], 0, 0))
