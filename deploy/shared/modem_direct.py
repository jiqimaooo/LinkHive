#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass, field
from glob import glob
from pathlib import Path
from typing import Any, Optional
import errno
import fcntl
import os
import re
import select
import termios
import time


QUECTEL_VENDOR_ID = "2c7c"
DEFAULT_QMI_TIMEOUT_SECONDS = 5.0
DEFAULT_INIT_TIMEOUT_SECONDS = 30.0
DEFAULT_INIT_RETRIES = 3


@dataclass
class DirectModemSnapshot:
    id: str = ""
    qmi_path: str = ""
    at_port: str = ""
    source: str = "direct_at"
    manufacturer: str = "Quectel"
    model: str = ""
    imei: str = ""
    iccid: str = ""
    imsi: str = ""
    operator_name: str = ""
    operator_code: str = ""
    registration: str = ""
    signal_dbm: str = "--"
    access_tech: str = ""
    current_modes: str = ""
    error: str = ""
    probe: dict[str, Any] = field(default_factory=dict)

    def to_modemmanager_like(self) -> dict[str, str]:
        selector = self.id or self.imei or Path(self.at_port).name or "direct"
        return {
            "linkhive.direct": "1",
            "linkhive.modem_selector": selector,
            "linkhive.modem_path": self.qmi_path or self.at_port,
            "linkhive.at_port": self.at_port,
            "linkhive.qmi_path": self.qmi_path,
            "modem.generic.manufacturer": self.manufacturer,
            "modem.generic.model": self.model,
            "modem.generic.equipment-identifier": self.imei,
            "modem.generic.state": "registered" if self.registration in {"home", "roaming"} else "detected",
            "modem.generic.signal-quality.value": "",
            "modem.generic.access-technologies.value[1]": self.access_tech,
            "modem.generic.current-modes": self.current_modes,
            "modem.3gpp.registration-state": self.registration,
            "modem.3gpp.operator-name": self.operator_name,
            "modem.3gpp.operator-code": self.operator_code,
            "direct.sim.iccid": self.iccid,
            "direct.sim.imsi": self.imsi,
            "direct.signal.dbm": self.signal_dbm,
        }


def scan_quectel_usb_devices(sysfs_root: str = "/sys/bus/usb/devices") -> list[dict[str, str]]:
    devices: list[dict[str, str]] = []
    for item in sorted(Path(sysfs_root).glob("*")):
        vendor_path = item / "idVendor"
        try:
            vendor = vendor_path.read_text(encoding="utf-8").strip().lower()
        except OSError:
            continue
        if vendor != QUECTEL_VENDOR_ID:
            continue
        product = _read_text(item / "idProduct")
        manufacturer = _read_text(item / "manufacturer")
        product_name = _read_text(item / "product")
        devices.append(
            {
                "sysfs_path": str(item),
                "idVendor": vendor,
                "idProduct": product,
                "manufacturer": manufacturer,
                "product": product_name,
            }
        )
    return devices


def find_qmi_devices() -> list[str]:
    candidates = [*glob("/dev/cdc-wdm*"), *glob("/dev/wwan*qmi*")]
    return sorted(dict.fromkeys(candidates))


def find_at_ports() -> list[str]:
    ports = sorted(glob("/dev/ttyUSB*"), key=_at_port_priority)
    return ports


def detect_busy_device(path: str) -> Optional[str]:
    fd: Optional[int] = None
    try:
        fd = os.open(path, os.O_RDWR | os.O_NONBLOCK | os.O_CLOEXEC)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return f"{path} 正被其他进程占用"
        finally:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
        return None
    except OSError as exc:
        if exc.errno in {errno.EBUSY, errno.EACCES, errno.EPERM}:
            return f"{path} 不可用：{exc.strerror}"
        return f"{path} 打开失败：{exc.strerror}"
    finally:
        if fd is not None:
            os.close(fd)


class DirectModem:
    def __init__(self, qmi_path: str = "", at_port: str = "") -> None:
        self.qmi_path = qmi_path
        self.at_port = at_port
        self.last_error = ""

    @classmethod
    def autodetect(cls) -> "DirectModem":
        qmi_path = find_qmi_devices()[0] if find_qmi_devices() else ""
        at_ports = find_at_ports()
        preferred_at = next((port for port in at_ports if port.endswith("USB2")), at_ports[0] if at_ports else "")
        return cls(qmi_path=qmi_path, at_port=preferred_at)

    def initialize(self) -> DirectModemSnapshot:
        qmi_error = ""
        if self.qmi_path:
            busy = detect_busy_device(self.qmi_path)
            if busy:
                raise RuntimeError(busy)
            for attempt in range(1, DEFAULT_INIT_RETRIES + 1):
                try:
                    return self._initialize_qmi(attempt)
                except Exception as exc:
                    qmi_error = str(exc)
                    self.last_error = qmi_error
                    time.sleep(min(0.6 * attempt, 2.0))

        snapshot = self._initialize_at()
        snapshot.error = qmi_error
        return snapshot

    def _initialize_qmi(self, attempt: int) -> DirectModemSnapshot:
        deadline = time.monotonic() + DEFAULT_INIT_TIMEOUT_SECONDS
        with QmiDevice(self.qmi_path, timeout_seconds=DEFAULT_QMI_TIMEOUT_SECONDS) as qmi:
            # 这里先建立纯 Python QMI 入口和超时框架。后续 TLV 覆盖会在此处补齐
            # DMS/UIM/NAS/WDS/WMS 的 Client ID 分配和具体消息解析。
            qmi.open()
            if time.monotonic() > deadline:
                raise TimeoutError("QMI 初始化超时")
            raise NotImplementedError(f"QMI 原生协议栈尚未完成 DMS 初始化，第 {attempt} 次尝试降级 AT")

    def _initialize_at(self) -> DirectModemSnapshot:
        if not self.at_port:
            raise RuntimeError("未找到 AT 端口，无法降级读取模组")

        responses: dict[str, str] = {}
        manufacturer = _clean_at_value(at_command(self.at_port, "AT+CGMI", 1.5))
        model = _clean_at_value(at_command(self.at_port, "AT+CGMM", 1.5))
        imei = _extract_first_number(at_command(self.at_port, "AT+CGSN", 1.5), 14, 17)
        qccid = at_command(self.at_port, "AT+QCCID", 1.5)
        iccid = _parse_iccid(qccid)
        imsi = _extract_first_number(at_command(self.at_port, "AT+CIMI", 1.5), 5, 16)
        creg = at_command(self.at_port, "AT+CREG?", 1.5)
        cops = at_command(self.at_port, "AT+COPS?", 1.5)
        csq = at_command(self.at_port, "AT+CSQ", 1.5)
        usbnet = at_command(self.at_port, 'AT+QCFG="usbnet"', 1.5)
        qnwinfo = at_command(self.at_port, "AT+QNWINFO", 1.5)
        responses.update({"qccid": qccid, "creg": creg, "cops": cops, "csq": csq, "usbnet": usbnet, "qnwinfo": qnwinfo})

        registration = _parse_registration(creg)
        operator_name, operator_code = _parse_operator(cops)
        access_tech = _parse_access_tech(qnwinfo)
        signal_dbm = _parse_csq_dbm(csq)
        unique_id = f"imei-{imei}" if imei else f"at-{Path(self.at_port).name}"

        return DirectModemSnapshot(
            id=unique_id,
            qmi_path=self.qmi_path,
            at_port=self.at_port,
            source="direct_at",
            manufacturer=manufacturer or "Quectel",
            model=model,
            imei=imei,
            iccid=iccid,
            imsi=imsi,
            operator_name=operator_name,
            operator_code=operator_code or (imsi[:5] if imsi else ""),
            registration=registration,
            signal_dbm=signal_dbm,
            access_tech=access_tech,
            current_modes=f"AT+QCFG usbnet: {_single_line(usbnet)}" if usbnet else "",
            probe={"port": self.at_port, "responses": responses, "qmi_path": self.qmi_path},
        )


class QmiDevice:
    def __init__(self, path: str, timeout_seconds: float) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds
        self.fd: Optional[int] = None

    def __enter__(self) -> "QmiDevice":
        return self

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.close()

    def open(self) -> None:
        self.fd = os.open(self.path, os.O_RDWR | os.O_NONBLOCK | os.O_CLOEXEC)

    def close(self) -> None:
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def write(self, payload: bytes) -> None:
        if self.fd is None:
            raise RuntimeError("QMI 设备未打开")
        _, writable, _ = select.select([], [self.fd], [], self.timeout_seconds)
        if not writable:
            raise TimeoutError("QMI 写入超时")
        os.write(self.fd, payload)

    def read(self, size: int = 4096) -> bytes:
        if self.fd is None:
            raise RuntimeError("QMI 设备未打开")
        readable, _, _ = select.select([self.fd], [], [], self.timeout_seconds)
        if not readable:
            raise TimeoutError("QMI 读取超时")
        return os.read(self.fd, size)


def enumerate_direct_modems() -> list[tuple[dict[str, str], Optional[str]]]:
    if not scan_quectel_usb_devices() and not find_qmi_devices() and not find_at_ports():
        return []
    modem = DirectModem.autodetect()
    try:
        snapshot = modem.initialize()
        return [(snapshot.to_modemmanager_like(), None)]
    except Exception as exc:
        return [({}, str(exc))]


def get_direct_modem_info() -> tuple[dict[str, str], Optional[str]]:
    items = enumerate_direct_modems()
    return items[0] if items else ({}, "未检测到 Quectel 蜂窝模组")


def at_command(port: str, command: str, timeout_seconds: float = 1.5) -> str:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = attrs[2] | termios.CLOCAL | termios.CREAD
        attrs[3] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        os.write(fd, (command + "\r").encode("ascii", "ignore"))
        deadline = time.monotonic() + timeout_seconds
        chunks: list[bytes] = []
        while time.monotonic() < deadline:
            readable, _, _ = select.select([fd], [], [], 0.08)
            if not readable:
                continue
            try:
                chunk = os.read(fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
            chunks.append(chunk)
            raw = b"".join(chunks).decode("utf-8", "replace")
            if "\r\nOK" in raw or "\r\nERROR" in raw:
                return raw
        return b"".join(chunks).decode("utf-8", "replace")
    finally:
        os.close(fd)


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _at_port_priority(path: str) -> tuple[int, str]:
    name = Path(path).name
    if name.endswith("USB2"):
        return (0, path)
    if name.endswith("USB3"):
        return (1, path)
    return (5, path)


def _clean_at_value(raw: str) -> str:
    lines = [line.strip() for line in raw.splitlines() if line.strip() and not line.startswith("AT") and line.strip() not in {"OK", "ERROR"}]
    return lines[0] if lines else ""


def _extract_first_number(raw: str, min_len: int, max_len: int) -> str:
    match = re.search(rf"\b(\d{{{min_len},{max_len}}})\b", raw)
    return match.group(1) if match else ""


def _parse_iccid(raw: str) -> str:
    match = re.search(r"\+QCCID:\s*([0-9A-Fa-f]+)", raw)
    if match:
        return match.group(1)
    return _extract_first_number(raw, 18, 22)


def _parse_registration(raw: str) -> str:
    match = re.search(r"\+CREG:\s*\d+,(\d+)", raw)
    state = match.group(1) if match else ""
    if state == "1":
        return "home"
    if state == "5":
        return "roaming"
    if state in {"2", "3"}:
        return "searching"
    return "unknown"


def _parse_operator(raw: str) -> tuple[str, str]:
    match = re.search(r'\+COPS:\s*\d+,\s*(\d+),\s*"([^"]*)"', raw)
    if not match:
        return "", ""
    fmt, value = match.group(1), match.group(2)
    if fmt == "2":
        return "", value
    return value, ""


def _parse_access_tech(raw: str) -> str:
    match = re.search(r'\+QNWINFO:\s*"([^"]+)"', raw)
    value = match.group(1).upper() if match else ""
    if "LTE" in value:
        return "lte"
    if "WCDMA" in value or "UMTS" in value:
        return "umts"
    if "GSM" in value:
        return "gsm"
    return value.lower()


def _parse_csq_dbm(raw: str) -> str:
    match = re.search(r"\+CSQ:\s*(\d+),", raw)
    if not match:
        return "--"
    rssi = int(match.group(1))
    if rssi == 99:
        return "--"
    return f"{-113 + 2 * rssi} dBm"


def _single_line(raw: str) -> str:
    return " ".join(line.strip() for line in raw.splitlines() if line.strip())
