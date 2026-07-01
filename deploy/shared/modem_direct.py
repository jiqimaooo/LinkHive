#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass, field
from glob import glob
from pathlib import Path
from typing import Any, Optional
import errno
import fcntl
import json
import os
import re
import select
import struct
import termios
import time
import xml.etree.ElementTree as ET


QUECTEL_VENDOR_ID = "2c7c"
DEFAULT_QMI_TIMEOUT_SECONDS = 2.0
DEFAULT_SERVING_SYSTEM_TIMEOUT_SECONDS = 6.0
DEFAULT_INIT_RETRIES = 1
CACHE_TTL_SECONDS = 30.0
PERSISTENT_CACHE_VERSION = 3
PERSISTENT_CACHE_PATH = Path(os.environ.get("LINKHIVE_MODEM_CACHE_PATH", "/var/lib/linkhive/modem-cache.json"))

_modem_cache: Optional[tuple[float, list[tuple[dict[str, str], Optional[str]]]]] = None

QMI_SERVICE_CTL = 0x00
QMI_SERVICE_WDS = 0x01
QMI_SERVICE_DMS = 0x02
QMI_SERVICE_NAS = 0x03
QMI_SERVICE_WMS = 0x05
QMI_SERVICE_UIM = 0x0B

QMI_CTL_ALLOCATE_CID = 0x0022
QMI_CTL_RELEASE_CID = 0x0023

QMI_DMS_GET_MANUFACTURER = 0x0021
QMI_DMS_GET_MODEL = 0x0022
QMI_DMS_GET_IDS = 0x0025
QMI_DMS_SET_OPERATING_MODE = 0x002E
QMI_DMS_UIM_GET_ICCID = 0x003C
QMI_DMS_UIM_GET_IMSI = 0x0043

QMI_NAS_GET_SERVING_SYSTEM = 0x0024
QMI_NAS_GET_HOME_NETWORK = 0x0025
QMI_NAS_SET_TECHNOLOGY_PREFERENCE = 0x002A
QMI_NAS_GET_SYSTEM_INFO = 0x004D
QMI_NAS_GET_SIGNAL_INFO = 0x004F

QMI_WDS_START_NETWORK = 0x0020
QMI_WDS_GET_PACKET_SERVICE_STATUS = 0x0022
QMI_UIM_GET_CARD_STATUS = 0x002F
QMI_WMS_RAW_SEND = 0x0020
QMI_WMS_RAW_READ = 0x0022
QMI_WMS_LIST_MESSAGES = 0x0031

QMI_RESULT_SUCCESS = 0
QMI_QMUX_TRANSFER_FLAG = 0x01
QMI_QMUX_REQUEST_FLAG = 0x00
QMI_QMUX_RESPONSE_FLAG = 0x80
QMI_MESSAGE_REQUEST_FLAG = 0x00
QMI_MESSAGE_RESPONSE_FLAG = 0x02

NAS_REGISTRATION_HOME = "home"
NAS_REGISTRATION_ROAMING = "roaming"
NAS_REGISTRATION_SEARCHING = "searching"
NAS_REGISTRATION_UNKNOWN = "unknown"

NAS_RADIO_LABELS = {
    0x01: "cdma",
    0x02: "evdo",
    0x04: "gsm",
    0x05: "umts",
    0x08: "lte",
    0x09: "td-scdma",
    0x0C: "nr5g",
}

PLMN_OPERATOR_NAMES = {
    "23402": "O2 UK",
    "23410": "O2 UK",
    "23411": "O2 UK",
    "46000": "中国移动",
    "46002": "中国移动",
    "46004": "中国移动",
    "46007": "中国移动",
    "46008": "中国移动",
    "46001": "中国联通",
    "46006": "中国联通",
    "46009": "中国联通",
    "46003": "中国电信",
    "46005": "中国电信",
    "46011": "中国电信",
    "46015": "中国广电",
}

PROVIDER_INFO_PATHS = (
    Path("/usr/share/mobile-broadband-provider-info/serviceproviders.xml"),
    Path("/usr/local/share/mobile-broadband-provider-info/serviceproviders.xml"),
)

KNOWN_EUICC_MODEL_MARKERS = ("qdc507",)
EID_AT_COMMANDS = (
    "AT+EID",
    'AT+QESIM="eid"',
    "AT+QEUICC?",
    "AT+QEUICCID?",
    "AT+QESIMINFO?",
)
SPN_AT_COMMANDS = (
    "AT+QSPN",
    "AT+CRSM=176,28486,0,0,17",
)

_provider_operator_cache: Optional[dict[str, str]] = None


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
    eid: str = ""
    euicc: str = ""
    operator_name: str = ""
    operator_code: str = ""
    home_operator_name: str = ""
    home_operator_code: str = ""
    registration: str = ""
    signal_dbm: str = "--"
    access_tech: str = ""
    current_modes: str = ""
    error: str = ""
    probe: dict[str, Any] = field(default_factory=dict)

    def to_status_dict(self) -> dict[str, str]:
        selector = self.id or self.imei or Path(self.at_port).name or "direct"
        return {
            "linkhive.direct": "1",
            "linkhive.modem_selector": selector,
            "linkhive.modem_path": self.qmi_path or self.at_port,
            "linkhive.at_port": self.at_port,
            "linkhive.qmi_path": self.qmi_path,
            "linkhive.direct.source": self.source,
            "modem.generic.manufacturer": self.manufacturer,
            "modem.generic.model": self.model,
            "modem.generic.equipment-identifier": self.imei,
            "modem.generic.state": "registered" if self.registration in {"home", "roaming"} else "detected",
            "modem.generic.signal-quality.value": _signal_quality_from_dbm(self.signal_dbm),
            "modem.generic.access-technologies.value[1]": self.access_tech,
            "modem.generic.current-modes": self.current_modes,
            "modem.3gpp.registration-state": self.registration,
            "modem.3gpp.operator-name": self.operator_name,
            "modem.3gpp.operator-code": self.operator_code,
            "direct.home-operator-name": self.home_operator_name,
            "direct.home-operator-code": self.home_operator_code,
            "direct.sim.iccid": self.iccid,
            "direct.sim.imsi": self.imsi,
            "direct.sim.eid": self.eid,
            "linkhive.euicc": self.euicc or ("supported" if self.eid else ""),
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


def _sysfs_device_path_for_devnode(path: str) -> Path:
    name = Path(path).name
    candidates: list[Path] = []
    if name.startswith("cdc-wdm"):
        candidates.append(Path("/sys/class/usbmisc") / name / "device")
    elif name.startswith("ttyUSB"):
        candidates.append(Path("/sys/class/tty") / name / "device")
    elif name.startswith("wwan") and "qmi" in name:
        candidates.append(Path("/sys/class/wwan") / name / "device")
        candidates.extend(Path("/sys/class/wwan").glob(f"*/{name}/device"))
    for candidate in candidates:
        try:
            return candidate.resolve(strict=True)
        except OSError:
            continue
    return Path()


def _usb_interface_number_for_devnode(path: str) -> Optional[int]:
    device_path = _sysfs_device_path_for_devnode(path)
    if not device_path:
        return None
    for parent in (device_path, *device_path.parents):
        match = re.search(r":\d+\.(\d+)$", parent.name)
        if match:
            return int(match.group(1))
    return None


def _quectel_usb_parent_for_devnode(path: str) -> str:
    device_path = _sysfs_device_path_for_devnode(path)
    if not device_path:
        return ""
    for parent in (device_path, *device_path.parents):
        vendor = _read_text(parent / "idVendor").lower()
        if vendor == QUECTEL_VENDOR_ID:
            try:
                return str(parent.resolve(strict=True))
            except OSError:
                return str(parent)
    return ""


def _add_grouped_devnode(
    groups: dict[str, dict[str, list[str]]],
    order: list[str],
    kind: str,
    path: str,
) -> None:
    parent = _quectel_usb_parent_for_devnode(path)
    key = parent or f"{kind}:{path}"
    if key not in groups:
        groups[key] = {"qmi": [], "at": []}
        order.append(key)
    if path not in groups[key][kind]:
        groups[key][kind].append(path)


def modem_topology_signature() -> dict[str, Any]:
    items: list[dict[str, str]] = []
    for kind, paths in (("qmi", find_qmi_devices()), ("at", find_at_ports())):
        for path in paths:
            parent_path = _quectel_usb_parent_for_devnode(path)
            parent = Path(parent_path) if parent_path else Path()
            interface_number = _usb_interface_number_for_devnode(path)
            items.append(
                {
                    "kind": kind,
                    "path": path,
                    "parent": parent_path,
                    "interface": "" if interface_number is None else str(interface_number),
                    "idVendor": _read_text(parent / "idVendor").lower() if parent_path else "",
                    "idProduct": _read_text(parent / "idProduct").lower() if parent_path else "",
                    "manufacturer": _read_text(parent / "manufacturer") if parent_path else "",
                    "product": _read_text(parent / "product") if parent_path else "",
                    "serial": _read_text(parent / "serial") if parent_path else "",
                }
            )
    items.sort(key=lambda item: (item["parent"], item["kind"], item["path"]))
    return {"version": PERSISTENT_CACHE_VERSION, "items": items}


def load_persistent_modem_cache(signature: dict[str, Any]) -> Optional[list[tuple[dict[str, str], Optional[str]]]]:
    try:
        payload = json.loads(PERSISTENT_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None
    if payload.get("version") != PERSISTENT_CACHE_VERSION or payload.get("signature") != signature:
        return None
    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        return None
    result: list[tuple[dict[str, str], Optional[str]]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            return None
        status = item.get("status")
        error = item.get("error")
        if not isinstance(status, dict):
            return None
        normalized_status = {str(key): str(value) for key, value in status.items()}
        result.append((normalized_status, str(error) if error else None))
    return result


def save_persistent_modem_cache(signature: dict[str, Any], result: list[tuple[dict[str, str], Optional[str]]]) -> None:
    if not result or any(error or not status for status, error in result):
        return
    payload = {
        "version": PERSISTENT_CACHE_VERSION,
        "signature": signature,
        "updated_at": time.time(),
        "items": [{"status": status, "error": error} for status, error in result],
    }
    try:
        PERSISTENT_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = PERSISTENT_CACHE_PATH.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temp_path.replace(PERSISTENT_CACHE_PATH)
    except Exception:
        return


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


def known_euicc_hardware(manufacturer: str = "", model: str = "") -> bool:
    normalized = f"{manufacturer} {model}".strip().lower()
    return any(marker in normalized for marker in KNOWN_EUICC_MODEL_MARKERS)


def extract_eid_from_at_response(raw_response: str) -> str:
    text = str(raw_response or "").replace(" ", "")
    if not text:
        return ""
    for match in re.finditer(r"\b\d{32}\b", text):
        eid = match.group(0)
        if eid.startswith("89"):
            return eid
    for match in re.finditer(r"5A10([0-9A-Fa-f]{32})(?:9000)?", text):
        eid_hex = match.group(1).upper()
        if re.fullmatch(r"\d{32}", eid_hex):
            return eid_hex
    match = re.search(r"\b\d{32}\b", text)
    return match.group(0) if match else ""


def read_eid_via_at(port: str, timeout_seconds: float = 1.8) -> tuple[str, dict[str, str]]:
    responses: dict[str, str] = {}
    for command in EID_AT_COMMANDS:
        try:
            raw_response = at_command(port, command, timeout_seconds)
        except Exception as exc:
            raw_response = f"ERROR: {exc}"
        responses[command] = raw_response
        eid = extract_eid_from_at_response(raw_response)
        if eid:
            return eid, responses
    return "", responses


def read_spn_via_at(port: str, timeout_seconds: float = 1.8) -> tuple[str, dict[str, str]]:
    responses: dict[str, str] = {}
    for command in SPN_AT_COMMANDS:
        try:
            raw_response = at_command(port, command, timeout_seconds)
        except Exception as exc:
            raw_response = f"ERROR: {exc}"
        responses[command] = raw_response
        spn = parse_spn_response(raw_response)
        if spn:
            return spn, responses
    return "", responses


def parse_spn_response(raw_response: str) -> str:
    text = str(raw_response or "")
    qspn_match = re.search(r"\+QSPN:\s*(.+)", text, re.IGNORECASE)
    if qspn_match:
        values = re.findall(r'"([^"]*)"', qspn_match.group(1))
        if len(values) >= 3:
            return normalize_spn(values[2])
        if values:
            return normalize_spn(values[-1])

    crsm_match = re.search(r"\+CRSM:\s*\d+\s*,\s*\d+\s*,\s*\"([0-9A-Fa-f]+)\"", text)
    if crsm_match:
        try:
            data = bytes.fromhex(crsm_match.group(1))
        except ValueError:
            data = b""
        if len(data) > 1:
            return normalize_spn(data[1:].rstrip(b"\xff\x00").decode("utf-8", "ignore"))
    return ""


def normalize_spn(value: str) -> str:
    normalized = re.sub(r"[\x00-\x1f\x7f\ufffd]+", "", str(value or "").replace("\xff", "")).strip()
    if not normalized or normalized in {"--", "unknown"}:
        return ""
    return normalized


class DirectModem:
    def __init__(self, qmi_path: str = "", at_port: str = "") -> None:
        self.qmi_path = qmi_path
        self.at_port = at_port
        self.last_error = ""

    @classmethod
    def autodetect(cls) -> "DirectModem":
        modems = cls.discover()
        if modems:
            return modems[0]
        return cls()

    @classmethod
    def discover(cls) -> list["DirectModem"]:
        qmi_devices = find_qmi_devices()
        at_ports = find_at_ports()
        groups: dict[str, dict[str, list[str]]] = {}
        order: list[str] = []
        for qmi_path in qmi_devices:
            _add_grouped_devnode(groups, order, "qmi", qmi_path)
        for at_port in at_ports:
            _add_grouped_devnode(groups, order, "at", at_port)

        if not groups:
            return []

        used_at_ports: set[str] = set()
        modems: list[DirectModem] = []
        for key in order:
            bucket = groups[key]
            qmi_path = sorted(bucket["qmi"])[0] if bucket["qmi"] else ""
            at_candidates = sorted(bucket["at"], key=_at_port_priority)
            at_port = at_candidates[0] if at_candidates else ""
            if not qmi_path and at_port in used_at_ports:
                continue
            if not at_port and qmi_path:
                remaining_at_ports = [port for port in at_ports if port not in used_at_ports]
                at_port = remaining_at_ports[0] if remaining_at_ports else ""
            if at_port:
                used_at_ports.add(at_port)
            if qmi_path or at_port:
                modems.append(cls(qmi_path=qmi_path, at_port=at_port))
        return modems

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
        deadline = time.monotonic() + DEFAULT_SERVING_SYSTEM_TIMEOUT_SECONDS
        with QmiClient(self.qmi_path, timeout_seconds=DEFAULT_QMI_TIMEOUT_SECONDS) as qmi:
            qmi.allocate_clients([QMI_SERVICE_DMS, QMI_SERVICE_UIM, QMI_SERVICE_NAS, QMI_SERVICE_WDS, QMI_SERVICE_WMS])
            qmi.dms_set_operating_mode_online()

            registration = NAS_REGISTRATION_UNKNOWN
            operator_name = ""
            operator_code = ""
            access_tech = ""
            last_registration_error = ""
            while time.monotonic() < deadline:
                try:
                    serving = qmi.nas_get_serving_system()
                except Exception as exc:
                    last_registration_error = str(exc)
                    time.sleep(1.0)
                    continue
                registration = str(serving.get("registration") or NAS_REGISTRATION_UNKNOWN)
                access_tech = str(serving.get("access_tech") or access_tech)
                operator_name = str(serving.get("operator_name") or operator_name)
                operator_code = str(serving.get("operator_code") or operator_code)
                break
            else:
                detail = f"：{last_registration_error}" if last_registration_error else ""
                raise TimeoutError(f"QMI 初始化超时，第 {attempt} 次尝试未读到网络状态{detail}")

            manufacturer = _qmi_optional(lambda: qmi.dms_get_string(QMI_DMS_GET_MANUFACTURER), "Quectel") or "Quectel"
            model = _qmi_optional(lambda: qmi.dms_get_string(QMI_DMS_GET_MODEL), "")
            imei = _qmi_optional(qmi.dms_get_imei, "")
            iccid = _qmi_optional(lambda: qmi.dms_uim_get_string(QMI_DMS_UIM_GET_ICCID), "")
            imsi = _qmi_optional(lambda: qmi.dms_uim_get_string(QMI_DMS_UIM_GET_IMSI), "")
            card_status = _qmi_optional(qmi.uim_get_card_status, {})
            eid = str(card_status.get("eid") or "")
            euicc_supported = known_euicc_hardware(manufacturer, model)
            eid_probe: dict[str, str] = {}
            if not eid and euicc_supported and self.at_port:
                eid, eid_probe = read_eid_via_at(self.at_port)
            home_network = _qmi_optional(qmi.nas_get_home_network, {})
            signal_dbm = _qmi_optional(qmi.nas_get_signal_dbm, "--")
            home_operator_code = _home_operator_code(imsi, str(home_network.get("operator_code") or ""))
            home_operator_name = first_non_empty(
                str(home_network.get("operator_name") or ""),
                operator_name_for_code(home_operator_code),
            )
            spn = ""
            spn_probe: dict[str, str] = {}
            if self.at_port:
                spn, spn_probe = read_spn_via_at(self.at_port)
            if spn:
                home_operator_name = spn
            if not operator_code:
                operator_code = str(home_network.get("operator_code") or (imsi[:5] if imsi else ""))
            if not operator_name:
                operator_name = first_non_empty(
                    str(home_network.get("operator_name") or ""),
                    operator_name_for_code(operator_code),
                )
            if not access_tech:
                access_tech = _qmi_optional(qmi.nas_guess_access_tech, "")
            unique_id = f"imei-{imei}" if imei else f"qmi-{Path(self.qmi_path).name}"

            return DirectModemSnapshot(
                id=unique_id,
                qmi_path=self.qmi_path,
                at_port=self.at_port,
                source="direct_qmi",
                manufacturer=manufacturer,
                model=model,
                imei=imei,
                iccid=iccid,
                imsi=imsi,
                eid=eid,
                euicc="supported" if eid or euicc_supported else "",
                operator_name=operator_name,
                operator_code=operator_code,
                home_operator_name=home_operator_name,
                home_operator_code=home_operator_code,
                registration=registration,
                signal_dbm=signal_dbm,
                access_tech=access_tech,
                current_modes="QMI",
                probe={
                    "qmi_path": self.qmi_path,
                    "at_port": self.at_port,
                    "card_status": card_status,
                    "eid_probe": eid_probe,
                    "spn_probe": spn_probe,
                },
            )

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

        # 获取当前运营商名字
        cops = at_command(self.at_port, "AT+COPS?", 1.5)
        # 切到数字格式获取运营商码
        at_command(self.at_port, "AT+COPS=3,2", 1.2)
        cops_num = at_command(self.at_port, "AT+COPS?", 1.5)
        at_command(self.at_port, "AT+COPS=3,0", 1.2)  # 恢复长名称格式

        csq = at_command(self.at_port, "AT+CSQ", 1.5)
        usbnet = at_command(self.at_port, 'AT+QCFG="usbnet"', 1.5)
        qnwinfo = at_command(self.at_port, "AT+QNWINFO", 1.5)
        responses.update({"qccid": qccid, "creg": creg, "cops": cops, "csq": csq,
                          "usbnet": usbnet, "qnwinfo": qnwinfo, "cops_num": cops_num})

        registration = _parse_registration(creg)
        operator_name, _ = _parse_operator(cops)       # 当前运营商名
        _, operator_code = _parse_operator(cops_num)   # 当前运营商数字码
        # 归属运营商从 IMSI 推导
        home_operator_code = imsi[:5] if len(imsi) >= 5 else ""
        spn, spn_responses = read_spn_via_at(self.at_port)
        responses.update({f"spn:{command}": response for command, response in spn_responses.items()})
        home_operator_name = first_non_empty(spn, operator_name_for_code(home_operator_code))
        operator_name = first_non_empty(operator_name, operator_name_for_code(operator_code), home_operator_name)
        access_tech = _parse_access_tech(qnwinfo)
        signal_dbm = _parse_csq_dbm(csq)
        unique_id = f"imei-{imei}" if imei else f"at-{Path(self.at_port).name}"
        euicc_supported = known_euicc_hardware(manufacturer, model)
        eid = ""
        eid_responses: dict[str, str] = {}
        if euicc_supported:
            eid, eid_responses = read_eid_via_at(self.at_port)
            responses.update({f"eid:{command}": response for command, response in eid_responses.items()})

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
            eid=eid,
            euicc="supported" if eid or euicc_supported else "",
            operator_name=operator_name,
            operator_code=operator_code or home_operator_code,
            home_operator_name=home_operator_name,
            home_operator_code=home_operator_code,
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


class QmiProtocolError(RuntimeError):
    pass


@dataclass
class QmiResponse:
    service: int
    client_id: int
    transaction_id: int
    message_id: int
    tlvs: dict[int, list[bytes]]


class QmiClient:
    def __init__(self, path: str, timeout_seconds: float) -> None:
        self.device = QmiDevice(path, timeout_seconds)
        self.timeout_seconds = timeout_seconds
        self.client_ids: dict[int, int] = {}
        self._transaction_id = 1
        self._ctl_transaction_id = 1

    def __enter__(self) -> "QmiClient":
        self.device.open()
        return self

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.device.close()

    def allocate_clients(self, services: list[int]) -> None:
        for service in services:
            self.allocate_client(service)

    def allocate_client(self, service: int) -> int:
        response = self.request(QMI_SERVICE_CTL, 0, QMI_CTL_ALLOCATE_CID, _tlv(0x01, bytes([service])))
        info = _tlv_first(response.tlvs, 0x01)
        if len(info) < 2:
            raise QmiProtocolError(f"QMI CTL Allocate CID 响应缺少 CID：service={service}")
        returned_service, cid = info[0], info[1]
        if returned_service != service:
            raise QmiProtocolError(f"QMI CTL Allocate CID 服务不匹配：请求 {service}，返回 {returned_service}")
        self.client_ids[service] = cid
        return cid

    def request(self, service: int, client_id: int, message_id: int, tlvs: bytes = b"") -> QmiResponse:
        transaction_id = self._next_transaction_id(service)
        self.device.write(_build_qmux_frame(service, client_id, transaction_id, message_id, tlvs))
        deadline = time.monotonic() + self.timeout_seconds
        while time.monotonic() < deadline:
            response = _parse_qmux_frame(self.device.read())
            if (
                response.service == service
                and response.client_id == client_id
                and response.message_id == message_id
                and response.transaction_id == transaction_id
            ):
                _ensure_qmi_success(response)
                return response
        raise TimeoutError(f"QMI 响应超时：service={service} message=0x{message_id:04x}")

    def service_request(self, service: int, message_id: int, tlvs: bytes = b"") -> QmiResponse:
        if service not in self.client_ids:
            self.allocate_client(service)
        return self.request(service, self.client_ids[service], message_id, tlvs)

    def dms_set_operating_mode_online(self) -> None:
        self.service_request(QMI_SERVICE_DMS, QMI_DMS_SET_OPERATING_MODE, _tlv(0x01, b"\x00"))

    def dms_get_string(self, message_id: int) -> str:
        response = self.service_request(QMI_SERVICE_DMS, message_id)
        return _decode_qmi_string(_tlv_first(response.tlvs, 0x01))

    def dms_get_imei(self) -> str:
        response = self.service_request(QMI_SERVICE_DMS, QMI_DMS_GET_IDS)
        imei = _decode_qmi_string(_tlv_first(response.tlvs, 0x11))
        if imei:
            return imei
        for items in response.tlvs.values():
            for value in items:
                candidate = _extract_first_number(_decode_qmi_string(value), 14, 17)
                if candidate:
                    return candidate
        return ""

    def dms_uim_get_string(self, message_id: int) -> str:
        response = self.service_request(QMI_SERVICE_DMS, message_id)
        return _decode_qmi_string(_tlv_first(response.tlvs, 0x01))

    def uim_get_card_status(self) -> dict[str, str]:
        response = self.service_request(QMI_SERVICE_UIM, QMI_UIM_GET_CARD_STATUS)
        card_status = _tlv_first(response.tlvs, 0x10)
        return _parse_uim_card_status(card_status)

    def nas_get_serving_system(self) -> dict[str, str]:
        response = self.service_request(QMI_SERVICE_NAS, QMI_NAS_GET_SERVING_SYSTEM)
        serving = _tlv_first(response.tlvs, 0x01)
        current_plmn = _tlv_first(response.tlvs, 0x12)
        roaming = _tlv_first(response.tlvs, 0x10)
        parsed = _parse_nas_serving_system(serving, roaming)
        parsed.update({key: value for key, value in _parse_plmn(current_plmn).items() if value})
        return parsed

    def nas_get_home_network(self) -> dict[str, str]:
        response = self.service_request(QMI_SERVICE_NAS, QMI_NAS_GET_HOME_NETWORK)
        return _parse_plmn(_tlv_first(response.tlvs, 0x01))

    def nas_get_signal_dbm(self) -> str:
        response = self.service_request(QMI_SERVICE_NAS, QMI_NAS_GET_SIGNAL_INFO)
        return _parse_nas_signal_info(response.tlvs)

    def nas_guess_access_tech(self) -> str:
        response = self.service_request(QMI_SERVICE_NAS, QMI_NAS_GET_SYSTEM_INFO)
        for tlv_id, label in ((0x14, "lte"), (0x13, "umts"), (0x12, "gsm"), (0x11, "evdo"), (0x10, "cdma")):
            value = _tlv_first(response.tlvs, tlv_id)
            if value and value[0] in {1, 2, 3, 4}:
                return label
        return ""

    def _next_transaction_id(self, service: int) -> int:
        if service == QMI_SERVICE_CTL:
            value = self._ctl_transaction_id & 0xFF
            self._ctl_transaction_id = 1 if value >= 0xFF else value + 1
            return value or 1
        value = self._transaction_id & 0xFFFF
        self._transaction_id = 1 if value >= 0xFFFF else value + 1
        return value or 1


def _tlv(kind: int, value: bytes) -> bytes:
    return bytes([kind]) + struct.pack("<H", len(value)) + value


def _build_qmux_frame(service: int, client_id: int, transaction_id: int, message_id: int, tlvs: bytes) -> bytes:
    if service == QMI_SERVICE_CTL:
        qmi = bytes([QMI_MESSAGE_REQUEST_FLAG, transaction_id & 0xFF])
        qmi += struct.pack("<HH", message_id, len(tlvs)) + tlvs
    else:
        qmi = bytes([QMI_MESSAGE_REQUEST_FLAG])
        qmi += struct.pack("<HHH", transaction_id & 0xFFFF, message_id, len(tlvs)) + tlvs
    qmux = bytes([QMI_QMUX_REQUEST_FLAG, service & 0xFF, client_id & 0xFF]) + qmi
    return bytes([QMI_QMUX_TRANSFER_FLAG]) + struct.pack("<H", len(qmux)) + qmux


def _parse_qmux_frame(frame: bytes) -> QmiResponse:
    if len(frame) < 9 or frame[0] != QMI_QMUX_TRANSFER_FLAG:
        raise QmiProtocolError("QMI 响应帧格式不正确")
    length = struct.unpack_from("<H", frame, 1)[0]
    body = frame[3 : 3 + length]
    if len(body) < 6:
        raise QmiProtocolError("QMI QMUX 响应过短")
    _qmux_flags, service, client_id = body[0], body[1], body[2]
    payload = body[3:]
    if service == QMI_SERVICE_CTL:
        if len(payload) < 6:
            raise QmiProtocolError("QMI CTL 响应过短")
        transaction_id = payload[1]
        message_id, tlv_length = struct.unpack_from("<HH", payload, 2)
        tlv_data = payload[6 : 6 + tlv_length]
    else:
        if len(payload) < 7:
            raise QmiProtocolError("QMI 服务响应过短")
        transaction_id = struct.unpack_from("<H", payload, 1)[0]
        message_id, tlv_length = struct.unpack_from("<HH", payload, 3)
        tlv_data = payload[7 : 7 + tlv_length]
    return QmiResponse(service=service, client_id=client_id, transaction_id=transaction_id, message_id=message_id, tlvs=_parse_tlvs(tlv_data))


def _parse_tlvs(payload: bytes) -> dict[int, list[bytes]]:
    tlvs: dict[int, list[bytes]] = {}
    offset = 0
    while offset + 3 <= len(payload):
        kind = payload[offset]
        length = struct.unpack_from("<H", payload, offset + 1)[0]
        start = offset + 3
        end = start + length
        if end > len(payload):
            break
        tlvs.setdefault(kind, []).append(payload[start:end])
        offset = end
    return tlvs


def _tlv_first(tlvs: dict[int, list[bytes]], kind: int) -> bytes:
    values = tlvs.get(kind) or []
    return values[0] if values else b""


def _ensure_qmi_success(response: QmiResponse) -> None:
    result = _tlv_first(response.tlvs, 0x02)
    if not result:
        return
    if len(result) < 4:
        raise QmiProtocolError("QMI Result TLV 过短")
    status, error = struct.unpack_from("<HH", result, 0)
    if status != QMI_RESULT_SUCCESS:
        raise QmiProtocolError(f"QMI 请求失败：service={response.service} message=0x{response.message_id:04x} error={error}")


def _decode_qmi_string(value: bytes) -> str:
    return value.rstrip(b"\x00").decode("utf-8", "replace").strip()


def _parse_uim_card_status(value: bytes) -> dict[str, str]:
    if len(value) < 9:
        return {}
    card_count = value[8]
    card_state = value[9] if card_count and len(value) > 9 else 0
    return {"card_present": "1" if card_state == 1 else "", "card_state": str(card_state)}


def _parse_nas_serving_system(serving: bytes, roaming: bytes) -> dict[str, str]:
    if len(serving) < 5:
        return {"registration": NAS_REGISTRATION_UNKNOWN}
    registration_raw = serving[0]
    radio_count = serving[4]
    radios = list(serving[5 : 5 + radio_count])
    if registration_raw == 0x01:
        registration = NAS_REGISTRATION_HOME
    elif registration_raw == 0x02:
        registration = NAS_REGISTRATION_SEARCHING
    elif registration_raw == 0x03:
        registration = "denied"
    else:
        registration = NAS_REGISTRATION_UNKNOWN
    if roaming and roaming[0] == 0x00 and registration == NAS_REGISTRATION_HOME:
        registration = NAS_REGISTRATION_ROAMING
    access_tech = _radio_access_tech(radios)
    return {"registration": registration, "access_tech": access_tech}


def _parse_plmn(value: bytes) -> dict[str, str]:
    if len(value) < 4:
        return {"operator_code": "", "operator_name": ""}
    mcc, mnc_raw = struct.unpack_from("<HH", value, 0)
    name = _decode_qmi_string(value[4:])
    mnc_str = _format_mnc(mnc_raw)
    operator_code = f"{mcc:03d}{mnc_str}" if mcc else ""
    return {"operator_code": operator_code, "operator_name": first_non_empty(name, operator_name_for_code(operator_code))}


def _format_mnc(mnc_raw: int) -> str:
    if mnc_raw & 0xFF00 == 0xFF00:
        return f"{mnc_raw & 0xFF:03d}"
    if 0 <= mnc_raw <= 99:
        return f"{mnc_raw:02d}"
    if 100 <= mnc_raw <= 999:
        return f"{mnc_raw:03d}"
    return f"{mnc_raw}"


def _home_operator_code(imsi: str, fallback: str = "") -> str:
    if len(imsi) >= 5:
        return imsi[:5]
    return fallback


def operator_name_for_code(operator_code: str) -> str:
    code = str(operator_code or "").strip()
    if not re.fullmatch(r"\d{5,6}", code):
        return ""
    return PLMN_OPERATOR_NAMES.get(code, "") or provider_operator_names().get(code, "")


def provider_operator_names() -> dict[str, str]:
    global _provider_operator_cache
    if _provider_operator_cache is not None:
        return _provider_operator_cache
    names: dict[str, str] = {}
    for path in PROVIDER_INFO_PATHS:
        if not path.exists():
            continue
        try:
            root = ET.parse(path).getroot()
        except Exception:
            continue
        for provider in root.findall(".//provider"):
            name = first_non_empty(provider.findtext("name"))
            if not name:
                continue
            for network_id in provider.findall(".//network-id"):
                mcc = str(network_id.get("mcc") or "").strip()
                mnc = str(network_id.get("mnc") or "").strip()
                if re.fullmatch(r"\d{3}", mcc) and re.fullmatch(r"\d{2,3}", mnc):
                    names.setdefault(f"{mcc}{mnc.zfill(2)}", name)
        if names:
            break
    _provider_operator_cache = names
    return names


def first_non_empty(*values: str) -> str:
    for value in values:
        normalized = str(value or "").strip()
        if normalized:
            return normalized
    return ""


def _radio_access_tech(radios: list[int]) -> str:
    for radio in (0x0C, 0x08, 0x05, 0x04, 0x02, 0x01):
        if radio in radios:
            return NAS_RADIO_LABELS.get(radio, "")
    return NAS_RADIO_LABELS.get(radios[0], "") if radios else ""


def _parse_nas_signal_info(tlvs: dict[int, list[bytes]]) -> str:
    lte = _tlv_first(tlvs, 0x14)
    if len(lte) >= 4:
        _rssi, _rsrq, rsrp = struct.unpack_from("<bbh", lte, 0)
        if rsrp:
            return f"{rsrp} dBm"
    wcdma = _tlv_first(tlvs, 0x13)
    if wcdma:
        return f"{struct.unpack_from('<b', wcdma, 0)[0]} dBm"
    gsm = _tlv_first(tlvs, 0x12)
    if gsm:
        return f"{struct.unpack_from('<b', gsm, 0)[0]} dBm"
    cdma = _tlv_first(tlvs, 0x10)
    if cdma:
        return f"{struct.unpack_from('<b', cdma, 0)[0]} dBm"
    return "--"


def _qmi_optional(callback: Any, default: Any) -> Any:
    try:
        return callback()
    except Exception:
        return default


def enumerate_direct_modems(force_refresh: bool = False) -> list[tuple[dict[str, str], Optional[str]]]:
    global _modem_cache
    now = time.monotonic()
    if not force_refresh and _modem_cache is not None:
        cached_time, cached_result = _modem_cache
        if now - cached_time < CACHE_TTL_SECONDS and cached_result:
            return cached_result

    signature = modem_topology_signature()
    if not signature["items"]:
        _modem_cache = (now, [])
        return []
    if not force_refresh:
        persistent_result = load_persistent_modem_cache(signature)
        if persistent_result:
            _modem_cache = (now, persistent_result)
            return persistent_result

    result = []
    for modem in DirectModem.discover():
        try:
            snapshot = modem.initialize()
            result.append((snapshot.to_status_dict(), None))
        except Exception as exc:
            result.append(({}, str(exc)))
    _modem_cache = (now, result)
    save_persistent_modem_cache(signature, result)
    return result


def get_direct_modem_info(device_id: str = "", force_refresh: bool = False) -> tuple[dict[str, str], Optional[str]]:
    items = enumerate_direct_modems(force_refresh=force_refresh)
    target = str(device_id or "").strip()
    if target.lower() in {"any", "modem-any", "default"}:
        target = ""
    if target:
        for modem, error in items:
            if _status_matches_device_id(modem, target):
                return modem, error
        return {}, f"未找到目标设备：{target}"
    for modem, error in items:
        if modem and not error:
            return modem, error
    return items[0] if items else ({}, "未检测到 Quectel 蜂窝模组")


def list_sms_via_at(device_id: str = "") -> tuple[list[dict[str, str]], Optional[str]]:
    status, error = get_direct_modem_info(device_id)
    at_port = status.get("linkhive.at_port", "")
    if error and not at_port:
        return [], error
    if not at_port:
        return [], "未找到 AT 端口，无法读取短信"
    original_charset = ""
    try:
        try:
            original_charset = _parse_cscs(at_command(at_port, "AT+CSCS?", 1.0))
        except Exception:
            original_charset = ""
        at_command(at_port, "AT+CMGF=1", 1.2)
        try:
            at_command(at_port, 'AT+CSCS="UCS2"', 1.2)
        except Exception:
            pass
        messages = _list_sms_from_all_storages(at_port, device_id)
        return messages, None
    except Exception as exc:
        return [], str(exc)
    finally:
        if original_charset:
            try:
                at_command(at_port, f'AT+CSCS="{original_charset}"', 1.0)
            except Exception:
                pass


def delete_sms_via_at(device_id: str, storage: str, sms_id: str) -> None:
    status, error = get_direct_modem_info(device_id)
    at_port = status.get("linkhive.at_port", "")
    if error and not at_port:
        raise RuntimeError(error)
    if not at_port:
        raise RuntimeError("未找到 AT 端口，无法删除短信")
    storage = str(storage or "").strip().upper()
    if storage not in {"ME", "SM"}:
        raise ValueError("短信存储必须是 ME 或 SM")
    sms_id = str(sms_id or "").strip()
    if not re.fullmatch(r"\d+", sms_id):
        raise ValueError("短信 ID 必须是数字")

    original_memories: list[str] = []
    try:
        original_memories = _parse_cpms_memories(at_command(at_port, "AT+CPMS?", 1.5))
        response = at_command(at_port, _cpms_set_command([storage, storage, storage]), 1.5)
        if "ERROR" in response or "+CMS ERROR" in response:
            raise RuntimeError(_single_line(response) or f"无法切换到 {storage} 短信存储")
        output = at_command(at_port, f"AT+CMGD={sms_id}", 3.0)
        if "ERROR" in output or "+CMS ERROR" in output:
            raise RuntimeError(_single_line(output) or "短信删除失败")
    finally:
        if original_memories:
            try:
                restore_memories = (original_memories + ["MT", "MT", "MT"])[:3]
                at_command(at_port, _cpms_set_command(restore_memories), 1.0)
            except Exception:
                pass


def send_sms_via_at(number: str, text: str, device_id: str = "") -> None:
    status, error = get_direct_modem_info(device_id)
    at_port = status.get("linkhive.at_port", "")
    if error and not at_port:
        raise RuntimeError(error)
    if not at_port:
        raise RuntimeError("未找到 AT 端口，无法发送短信")
    at_command(at_port, "AT+CMGF=1", 1.2)
    _at_sms_submit(at_port, number, text, 20.0)


def _status_matches_device_id(status: dict[str, str], target: str) -> bool:
    target_aliases = _device_id_aliases(target)
    candidates = set().union(*(
        _device_id_aliases(candidate)
        for candidate in (
            status.get("linkhive.modem_selector", ""),
            status.get("linkhive.modem_path", ""),
            status.get("linkhive.at_port", ""),
            status.get("linkhive.qmi_path", ""),
            status.get("modem.generic.equipment-identifier", ""),
        )
    ))
    imei = status.get("modem.generic.equipment-identifier", "")
    if imei:
        candidates.update(_device_id_aliases(f"imei-{imei}"))
    return bool(target_aliases & candidates)


def _device_id_aliases(raw_value: str) -> set[str]:
    value = str(raw_value or "").strip()
    if not value:
        return set()
    aliases = {value}
    basename = Path(value).name
    if basename:
        aliases.add(basename)
    for _ in range(3):
        for item in list(aliases):
            if item.startswith("imei-"):
                aliases.add(item.removeprefix("imei-"))
            if item.startswith("modem-"):
                aliases.add(item.removeprefix("modem-"))
            if item.startswith("at-"):
                aliases.add(item.removeprefix("at-"))
            if item.startswith("qmi-"):
                aliases.add(item.removeprefix("qmi-"))
    for item in list(aliases):
        if item.startswith("ttyUSB"):
            aliases.add(f"at-{item}")
            aliases.add(f"modem-at-{item}")
            aliases.add(f"/dev/{item}")
        if item.startswith("cdc-wdm"):
            aliases.add(f"qmi-{item}")
            aliases.add(f"modem-qmi-{item}")
            aliases.add(f"/dev/{item}")
    return aliases


def _list_sms_from_all_storages(at_port: str, device_id: str) -> list[dict[str, str]]:
    original_memories: list[str] = []
    try:
        original_memories = _parse_cpms_memories(at_command(at_port, "AT+CPMS?", 1.5))
    except Exception:
        original_memories = []

    merged: list[dict[str, str]] = []
    seen: set[tuple[str, str, str, str, str]] = set()
    for memory in ("ME", "SM"):
        try:
            response = at_command(at_port, _cpms_set_command([memory, memory, memory]), 1.5)
            if "ERROR" in response or "+CMS ERROR" in response:
                continue
            raw = at_command(at_port, 'AT+CMGL="ALL"', 4.0)
        except Exception:
            continue
        for message in _parse_cmgl(raw, device_id):
            raw_state = str(message.get("raw_state", "")).upper()
            if raw_state not in {"REC READ", "REC UNREAD"}:
                continue
            key = (
                memory,
                message.get("raw_id", message.get("id", "")),
                message.get("number", ""),
                message.get("timestamp", ""),
                message.get("text", ""),
            )
            if key in seen:
                continue
            seen.add(key)
            raw_id = message.get("raw_id", message.get("id", ""))
            merged.append({**message, "id": f"{memory}:{raw_id}", "raw_id": raw_id, "storage": memory})

    if original_memories:
        try:
            restore_memories = (original_memories + ["MT", "MT", "MT"])[:3]
            at_command(at_port, _cpms_set_command(restore_memories), 1.0)
        except Exception:
            pass

    merged.sort(key=lambda item: int(item.get("raw_id") or "0"), reverse=True)
    return merged


def _cpms_set_command(memories: list[str]) -> str:
    quoted = ",".join(f'"{memory}"' for memory in memories)
    return f"AT+CPMS={quoted}"


def _parse_cpms_memories(raw_response: str) -> list[str]:
    return re.findall(r'"([^"]+)"\s*,\s*\d+\s*,\s*\d+', raw_response)[:3]


def _parse_cscs(raw_response: str) -> str:
    match = re.search(r'\+CSCS:\s*"([^"]+)"', raw_response)
    return match.group(1) if match else ""


def at_command(port: str, command: str, timeout_seconds: float = 1.5) -> str:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = attrs[2] | termios.CLOCAL | termios.CREAD
        attrs[3] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        termios.tcflush(fd, termios.TCIOFLUSH)
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


def _at_sms_submit(port: str, number: str, text: str, timeout_seconds: float) -> str:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = attrs[2] | termios.CLOCAL | termios.CREAD
        attrs[3] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        termios.tcflush(fd, termios.TCIOFLUSH)
        os.write(fd, f'AT+CMGS="{number}"\r'.encode("ascii", "ignore"))
        deadline = time.monotonic() + timeout_seconds
        chunks: list[bytes] = []
        prompt_seen = False
        while time.monotonic() < deadline:
            readable, _, _ = select.select([fd], [], [], 0.1)
            if readable:
                chunk = os.read(fd, 4096)
                chunks.append(chunk)
                raw = b"".join(chunks).decode("utf-8", "replace")
                if ">" in raw and not prompt_seen:
                    prompt_seen = True
                    os.write(fd, text.encode("utf-8", "replace") + b"\x1a")
                if "\r\nOK" in raw or "+CMGS:" in raw:
                    return raw
                if "\r\nERROR" in raw or "+CMS ERROR" in raw:
                    raise RuntimeError(_single_line(raw) or "短信发送失败")
        raise TimeoutError("短信发送超时")
    finally:
        os.close(fd)


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _at_port_priority(path: str) -> tuple[int, str]:
    interface_number = _usb_interface_number_for_devnode(path)
    if interface_number == 2:
        return (0, path)
    if interface_number == 3:
        return (1, path)
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


def _signal_quality_from_dbm(raw: str) -> str:
    match = re.search(r"(-?\d+(?:\.\d+)?)", str(raw or ""))
    if not match:
        return ""
    dbm = float(match.group(1))
    quality = round((dbm + 113.0) * 100.0 / 62.0)
    return str(max(0, min(100, quality)))


def _single_line(raw: str) -> str:
    return " ".join(line.strip() for line in raw.splitlines() if line.strip())


def _decode_mojibake_text(raw_text: str) -> str:
    text = str(raw_text or "")
    if not text:
        return ""
    try:
        repaired = text.encode("latin1").decode("utf-8")
    except Exception:
        return text
    replacement_count = text.count("�")
    repaired_replacement_count = repaired.count("�")
    if repaired and repaired_replacement_count <= replacement_count:
        return repaired
    return text


def _decode_ucs2_hex(raw_text: str) -> str:
    compact = re.sub(r"\s+", "", str(raw_text or "").strip())
    if len(compact) < 4 or len(compact) % 4 != 0 or not re.fullmatch(r"[0-9A-Fa-f]+", compact):
        return ""
    try:
        decoded = bytes.fromhex(compact).decode("utf-16-be")
    except Exception:
        return ""
    printable = sum(ch.isprintable() or ch in "\r\n\t" for ch in decoded)
    if not decoded or printable / len(decoded) < 0.8:
        return ""
    return decoded.strip()


def _decode_at_text(raw_text: str) -> str:
    text = str(raw_text or "").strip()
    if not text:
        return ""
    decoded = _decode_ucs2_hex(text)
    if decoded:
        return decoded
    if "\n" in text:
        parts = [_decode_ucs2_hex(part) or _decode_mojibake_text(part) for part in text.splitlines()]
        return "\n".join(part for part in parts if part).strip()
    return _decode_mojibake_text(text)


def _parse_cmgl(raw: str, device_id: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in raw.splitlines() if line.strip() and not line.startswith("AT+") and line.strip() != "OK"]
    messages: list[dict[str, str]] = []
    index = 0
    while index < len(lines):
        header = lines[index]
        match = re.match(r'\+CMGL:\s*(\d+),"([^"]*)","([^"]*)",[^,]*(?:,"([^"]*)")?', header)
        if not match:
            index += 1
            continue
        sms_id, state, number, timestamp = match.group(1), match.group(2), match.group(3), match.group(4) or ""
        text_lines: list[str] = []
        index += 1
        while index < len(lines) and not lines[index].startswith("+CMGL:"):
            text_lines.append(lines[index])
            index += 1
        normalized_state = {
            "REC READ": "received",
            "REC UNREAD": "received",
            "STO SENT": "sent",
            "STO UNSENT": "stored",
        }.get(state.upper(), state.lower() or "unknown")
        messages.append(
            {
                "id": sms_id,
                "raw_id": sms_id,
                "device_id": device_id,
                "number": _decode_at_text(number) or number,
                "text": _decode_at_text("\n".join(text_lines)),
                "timestamp": timestamp,
                "state": normalized_state,
                "raw_state": state,
                "state_label": {
                    "received": "已接收",
                    "sent": "已发送",
                    "stored": "已存储",
                }.get(normalized_state, state or "未知"),
            }
        )
    messages.sort(key=lambda item: int(item.get("id") or "0"), reverse=True)
    return messages
