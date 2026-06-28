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
import struct
import termios
import time


QUECTEL_VENDOR_ID = "2c7c"
DEFAULT_QMI_TIMEOUT_SECONDS = 5.0
DEFAULT_INIT_TIMEOUT_SECONDS = 30.0
DEFAULT_INIT_RETRIES = 3

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
    operator_name: str = ""
    operator_code: str = ""
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
            "modem.generic.signal-quality.value": "",
            "modem.generic.access-technologies.value[1]": self.access_tech,
            "modem.generic.current-modes": self.current_modes,
            "modem.3gpp.registration-state": self.registration,
            "modem.3gpp.operator-name": self.operator_name,
            "modem.3gpp.operator-code": self.operator_code,
            "direct.sim.iccid": self.iccid,
            "direct.sim.imsi": self.imsi,
            "direct.sim.eid": self.eid,
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
                if registration in {NAS_REGISTRATION_HOME, NAS_REGISTRATION_ROAMING}:
                    break
                time.sleep(1.0)
            else:
                detail = f"：{last_registration_error}" if last_registration_error else ""
                raise TimeoutError(f"QMI 初始化超时，第 {attempt} 次尝试未等到网络注册{detail}")

            manufacturer = _qmi_optional(lambda: qmi.dms_get_string(QMI_DMS_GET_MANUFACTURER), "Quectel") or "Quectel"
            model = _qmi_optional(lambda: qmi.dms_get_string(QMI_DMS_GET_MODEL), "")
            imei = _qmi_optional(qmi.dms_get_imei, "")
            iccid = _qmi_optional(lambda: qmi.dms_uim_get_string(QMI_DMS_UIM_GET_ICCID), "")
            imsi = _qmi_optional(lambda: qmi.dms_uim_get_string(QMI_DMS_UIM_GET_IMSI), "")
            card_status = _qmi_optional(qmi.uim_get_card_status, {})
            eid = str(card_status.get("eid") or "")
            home_network = _qmi_optional(qmi.nas_get_home_network, {})
            signal_dbm = _qmi_optional(qmi.nas_get_signal_dbm, "--")
            if not operator_name:
                operator_name = str(home_network.get("operator_name") or "")
            if not operator_code:
                operator_code = str(home_network.get("operator_code") or (imsi[:5] if imsi else ""))
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
                operator_name=operator_name,
                operator_code=operator_code,
                registration=registration,
                signal_dbm=signal_dbm,
                access_tech=access_tech,
                current_modes="QMI",
                probe={"qmi_path": self.qmi_path, "at_port": self.at_port, "card_status": card_status},
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
            eid="",
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
    mcc, mnc = struct.unpack_from("<HH", value, 0)
    name = _decode_qmi_string(value[4:])
    operator_code = f"{mcc:03d}{mnc:02d}" if mcc else ""
    return {"operator_code": operator_code, "operator_name": name}


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


def enumerate_direct_modems() -> list[tuple[dict[str, str], Optional[str]]]:
    if not scan_quectel_usb_devices() and not find_qmi_devices() and not find_at_ports():
        return []
    modem = DirectModem.autodetect()
    try:
        snapshot = modem.initialize()
        return [(snapshot.to_status_dict(), None)]
    except Exception as exc:
        return [({}, str(exc))]


def get_direct_modem_info() -> tuple[dict[str, str], Optional[str]]:
    items = enumerate_direct_modems()
    return items[0] if items else ({}, "未检测到 Quectel 蜂窝模组")


def list_sms_via_at(device_id: str = "") -> tuple[list[dict[str, str]], Optional[str]]:
    modem = DirectModem.autodetect()
    if not modem.at_port:
        return [], "未找到 AT 端口，无法读取短信"
    try:
        at_command(modem.at_port, "AT+CMGF=1", 1.2)
        raw = at_command(modem.at_port, 'AT+CMGL="ALL"', 4.0)
        return _parse_cmgl(raw, device_id), None
    except Exception as exc:
        return [], str(exc)


def send_sms_via_at(number: str, text: str) -> None:
    modem = DirectModem.autodetect()
    if not modem.at_port:
        raise RuntimeError("未找到 AT 端口，无法发送短信")
    at_command(modem.at_port, "AT+CMGF=1", 1.2)
    _at_sms_submit(modem.at_port, number, text, 20.0)


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


def _at_sms_submit(port: str, number: str, text: str, timeout_seconds: float) -> str:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = attrs[2] | termios.CLOCAL | termios.CREAD
        attrs[3] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
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
                "device_id": device_id,
                "number": number,
                "text": "\n".join(text_lines).strip(),
                "timestamp": timestamp,
                "state": normalized_state,
                "state_label": {
                    "received": "已接收",
                    "sent": "已发送",
                    "stored": "已存储",
                }.get(normalized_state, state or "未知"),
            }
        )
    messages.sort(key=lambda item: int(item.get("id") or "0"), reverse=True)
    return messages
