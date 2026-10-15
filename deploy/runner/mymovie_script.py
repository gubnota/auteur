"""Kill the complete custom-script process group when the agent closes its pipe."""
import os, selectors, signal, subprocess, sys
child = subprocess.Popen(["/bin/sh", "-c", sys.argv[1]], stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, start_new_session=True)
def stop(*_):
    try: os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError: pass
    raise SystemExit(130)
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
# Parent-death notification on Linux. macOS cleanup uses the stdin pipe too.
try:
    import ctypes
    ctypes.CDLL(None).prctl(1, signal.SIGTERM)
except (AttributeError, OSError): pass
sel = selectors.DefaultSelector()
sel.register(child.stdout, selectors.EVENT_READ)
sel.register(sys.stdin, selectors.EVENT_READ)
while child.poll() is None:
    for key, _ in sel.select(0.25):
        data = os.read(key.fd, 4096)
        if key.fileobj is sys.stdin:
            if not data: stop()
        elif data:
            sys.stdout.buffer.write(data); sys.stdout.buffer.flush()
        else: sel.unregister(key.fileobj)
# Prevent background grandchildren from retaining stdout or escaping the step.
code = child.returncode
try: os.killpg(child.pid, signal.SIGKILL)
except ProcessLookupError: pass
sys.stdout.buffer.write(child.stdout.read()); sys.stdout.buffer.flush()
sys.exit(code)
