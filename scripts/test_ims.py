import os, time, termios, select, sys

def at_cmd(port, cmd, timeout=2.0):
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    old = termios.tcgetattr(fd)
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = termios.B115200 | termios.CS8 | termios.CREAD | termios.CLOCAL
        attrs[3] = 0
        attrs[6][termios.VMIN] = 0
        attrs[6][termios.VTIME] = 5
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        # flush input buffer
        try:
            while True:
                r, _, _ = select.select([fd], [], [], 0.05)
                if fd not in r:
                    break
                os.read(fd, 4096)
        except:
            pass
        os.write(fd, (cmd + "\r").encode())
        deadline = time.time() + timeout
        chunks = []
        while time.time() < deadline:
            r, _, _ = select.select([fd], [], [], 0.1)
            if fd in r:
                try:
                    chunks.append(os.read(fd, 4096))
                except BlockingIOError:
                    pass
        return b"".join(chunks).decode("utf-8", errors="replace")
    finally:
        termios.tcsetattr(fd, termios.TCSANOW, old)
        os.close(fd)

port = "/dev/ttyUSB3"
print("=== Set VoLTE ON ===")
print(repr(at_cmd(port, 'AT+QCFG="ims",1')))
time.sleep(0.5)
print("=== Query IMS ===")
print(repr(at_cmd(port, 'AT+QCFG="ims"')))
time.sleep(0.5)
print("=== Query VoWiFi via IMS sub ===")
print(repr(at_cmd(port, 'AT+QCFG="imsowifi"')))