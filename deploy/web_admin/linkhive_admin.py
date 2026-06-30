#!/usr/bin/env python3
from __future__ import annotations
from collections import deque
from functools import lru_cache
import hashlib
import hmac
import json
import mimetypes
import os
import re
import select
import secrets
import shlex
import subprocess
import sys
import termios
import threading
import time
import uuid
import ipaddress
import json
import struct
from base64 import b32encode, b32decode, b64decode
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from glob import glob
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import unquote, urlparse


SCRIPT_DIR = Path(__file__).resolve().parent
for candidate in (SCRIPT_DIR, SCRIPT_DIR.parent / "shared"):
    if (candidate / "notification_utils.py").exists() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from notification_utils import (  # noqa: E402
    configured_channel_labels,
    configured_notification_targets,
    ensure_notification_config,
    format_channel_label,
    format_sms_notification,
    load_notification_targets,
    normalize_notification_target,
    save_notification_targets_in_config,
    send_apprise_notification,
)
from modem_direct import (  # noqa: E402
    at_command,
    enumerate_direct_modems,
    extract_eid_from_at_response,
    get_direct_modem_info,
    known_euicc_hardware,
    list_sms_via_at,
    operator_name_for_code,
    parse_spn_response,
    send_sms_via_at,
)


HOST = os.environ.get("FOURG_WIFI_ADMIN_HOST", "0.0.0.0")
PORT = int(os.environ.get("FOURG_WIFI_ADMIN_PORT", "8080"))
MODEM_BACKEND = "direct"
NOTIFICATION_CONFIG_PATH = Path("/etc/sms-forwarder.conf")
SMS_FORWARDER_SERVICE = "sms-forwarder.service"
APP_CONFIG_PATH = Path("/etc/linkhive.conf")
STATIC_DIR = Path(
    os.environ.get("FOURG_WIFI_ADMIN_STATIC_DIR", str(Path(__file__).resolve().with_name("frontend_dist")))
)
PROFILE_SMSC_CONFIG_KEY = "PROFILE_SMSC_CONFIG_JSON"
AUTH_COOKIE_NAME = "linkhive_session"
AUTH_SESSION_TTL_SECONDS = 7 * 24 * 3600
BEIJING_TZ = timezone(timedelta(hours=8))
ACTION_RETENTION_SECONDS = 1800
ACTION_MAX_EVENTS = 400
KEEPALIVE_TASKS_KEY = "KEEPALIVE_TASKS_JSON"
KEEPALIVE_SETTINGS_KEY = "KEEPALIVE_SETTINGS_JSON"
KEEPALIVE_ACTION_NAME = "run_keepalive_task"
KEEPALIVE_SCHEDULER_INTERVAL_SECONDS = 15
KEEPALIVE_SCHEDULE_GRACE_SECONDS = 75
KEEPALIVE_SWITCH_SETTLE_SECONDS = 20
KEEPALIVE_NETWORK_WAIT_SECONDS = 120
KEEPALIVE_NETWORK_POLL_SECONDS = 10
KEEPALIVE_RETRY_INTERVAL_SECONDS = 30
KEEPALIVE_MAX_SEND_ATTEMPTS = 3
KEEPALIVE_HISTORY_LIMIT = 10
WEEKDAY_ORDER = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
WEEKDAY_LABELS = {
    "mon": "周一",
    "tue": "周二",
    "wed": "周三",
    "thu": "周四",
    "fri": "周五",
    "sat": "周六",
    "sun": "周日",
}
MONTH_ALIASES = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
CRON_WEEKDAY_ALIASES = {
    "sun": 0,
    "mon": 1,
    "tue": 2,
    "wed": 3,
    "thu": 4,
    "fri": 5,
    "sat": 6,
}
PROFILE_APN_DEFAULTS = {
    "giffgaff": {"apn": "giffgaff.com", "username": "giffgaff", "password": "password", "ip_type": "ipv4"},
    "t-mobile": {"apn": "fast.t-mobile.com", "username": "", "password": "", "ip_type": "ipv4v6"},
}
FALLBACK_INDEX_HTML = """<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>eSIM 管理页</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #e2e8f0;
        font: 16px/1.6 system-ui, sans-serif;
      }
      main {
        max-width: 720px;
        padding: 32px;
        border-radius: 24px;
        background: rgba(15, 23, 42, 0.9);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
      }
      code {
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.2);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>前端静态文件还没部署</h1>
      <p>API 已正常启动，但 <code>frontend_dist</code> 目录里没有构建后的页面文件。</p>
      <p>请先在本地执行前端构建，再把构建产物同步到设备。</p>
    </main>
  </body>
</html>
"""

ACTIONS: dict[str, dict[str, Any]] = {}
ACTIONS_LOCK = threading.Lock()
ACTION_QUEUE: deque[str] = deque()
ACTION_QUEUE_CONDITION = threading.Condition()
PROFILE_CACHE: list[dict[str, Any]] = []
PROFILE_CACHE_ERROR = ""
PROFILE_CACHE_UPDATED_AT = 0.0
PROFILE_CACHE_LOCK = threading.Lock()
KEEPALIVE_RUNTIME_LOCK = threading.Lock()
KEEPALIVE_LAST_ENQUEUED: dict[str, str] = {}
KEEPALIVE_NEXT_ALLOWED_AT = 0.0
DASHBOARD_TRAFFIC_LOCK = threading.Lock()
DASHBOARD_TRAFFIC_BASELINE: dict[str, Any] = {"date": "", "rx": 0, "tx": 0, "iface": ""}
DASHBOARD_TRAFFIC_HISTORY: deque[dict[str, Any]] = deque(maxlen=48)
RAW_SIM_PROBE_CACHE: dict[str, Any] = {"updated_at": 0.0, "items": [], "error": ""}
RAW_SIM_PROBE_LOCK = threading.Lock()
SLOW_PROBE_CACHE: dict[str, dict[str, Any]] = {}
SLOW_PROBE_CACHE_LOCK = threading.Lock()
IMS_STATUS_CACHE_SECONDS = 300.0
SMS_LIST_CACHE_SECONDS = 20.0
SMS_STORAGE_CACHE_SECONDS = 60.0


def run_command(args: list[str], check: bool = True, env: Optional[dict[str, str]] = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=check, capture_output=True, text=True, errors="replace", env=env)


def command_output_text(result: subprocess.CompletedProcess[str]) -> str:
    return (result.stdout or result.stderr or "").strip()


def is_transient_modem_error(message: str) -> bool:
    normalized = str(message or "").strip().lower()
    transient_markers = (
        "modem is not enabled",
        "modem not enabled yet",
        "not yet enabled",
        "not enabled yet",
        "not enabled",
        "not registered",
        "modem is not registered",
        "could not find a registered modem",
        "operation only allowed in",
    )
    return any(marker in normalized for marker in transient_markers)


def is_positive_capability_hint(value: Any) -> bool:
    normalized = normalize_dashboard_value(value).strip().lower()
    if not normalized:
        return False
    if normalized in {
        "0",
        "false",
        "no",
        "none",
        "unknown",
        "unsupported",
        "not supported",
        "unavailable",
        "not available",
        "disabled",
        "不支持",
        "未支持",
        "不可用",
        "未启用",
    }:
        return False
    if normalized in {"1", "true", "yes", "supported", "available", "enabled", "euicc", "esim"}:
        return True
    return bool(re.fullmatch(r"\d{20,40}", normalized))


def has_esim_capability_hint(modem: dict[str, str], sim_info: Optional[dict[str, str]] = None) -> bool:
    sim_info = sim_info or {}
    if known_euicc_hardware(
        first_dashboard_value(modem.get("modem.generic.manufacturer")),
        first_dashboard_value(modem.get("modem.generic.model")),
    ):
        return True
    return any(
        is_positive_capability_hint(value)
        for value in (
            sim_info.get("sim.properties.eid"),
            modem.get("sim.properties.eid"),
            modem.get("direct.sim.eid"),
            modem.get("linkhive.euicc"),
        )
    )


def modem_ready_for_esim_profile_probe(modem: dict[str, str]) -> bool:
    state = first_dashboard_value(modem.get("modem.generic.state")).lower()
    registration = first_dashboard_value(modem.get("modem.3gpp.registration-state")).lower()
    if state in {"disabled", "failed", "locked", "detected"}:
        return False
    return registration in {"home", "roaming"} or state in {"enabled", "registered", "connected"}


def device_ready_for_sms_read(device: dict[str, Any]) -> bool:
    if device.get("source") == "at_probe":
        return False
    if not device.get("capabilities", {}).get("sms_supported"):
        return False
    state = str(device.get("state") or "").strip().lower()
    registration = str(device.get("registration") or "").strip().lower()
    if state in {"disabled", "failed", "locked", "detected"}:
        return False
    return registration in {"home", "roaming"} or state in {"enabled", "registered", "connected"}


def clear_profile_cache_error() -> None:
    global PROFILE_CACHE_ERROR
    with PROFILE_CACHE_LOCK:
        PROFILE_CACHE_ERROR = ""


def format_command(args: list[str]) -> str:
    return shlex.join(args)


def parse_lpac_json(raw: str) -> dict[str, Any]:
    data = json.loads(raw)
    return data.get("payload", {})


def find_qmi_device_path() -> Optional[str]:
    candidates = [
        "/dev/wwan0qmi0",
        *sorted(glob("/dev/wwan*qmi*")),
        *sorted(glob("/dev/cdc-wdm*")),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def wait_for_qmi_device(ctx: "ActionContext", timeout_seconds: int = 12) -> str:
    deadline = time.time() + timeout_seconds
    last_seen: Optional[str] = None
    while time.time() < deadline:
        device_path = find_qmi_device_path()
        if device_path:
            if device_path != last_seen:
                ctx.log(f"检测到 QMI 设备：{device_path}")
            return device_path
        last_seen = device_path
        time.sleep(0.5)
    raise RuntimeError("等待 QMI 设备节点超时，未找到 /dev/wwan*qmi* 或 /dev/cdc-wdm*")


def parse_key_value_output(raw: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip()] = value.strip()
    return parsed


def decode_escaped_text(raw_text: str) -> str:
    if "\\" not in raw_text:
        return raw_text
    try:
        escaped = raw_text.encode("latin1", errors="backslashreplace").decode("unicode_escape")
        return escaped.encode("latin1").decode("utf-8")
    except Exception:
        return raw_text


def maybe_decode_base64(raw_text: str) -> str:
    compact = "".join(raw_text.split())
    if len(compact) < 16 or len(compact) % 4 != 0:
        return raw_text
    if not re.fullmatch(r"[A-Za-z0-9+/=]+", compact):
        return raw_text
    try:
        decoded = b64decode(compact, validate=True)
        text = decoded.decode("utf-8")
    except Exception:
        return raw_text
    printable = sum(ch.isprintable() or ch in "\r\n\t" for ch in text)
    return text if text and printable / len(text) >= 0.85 else raw_text


def normalize_sms_text(raw_text: str) -> str:
    return maybe_decode_base64(decode_escaped_text(raw_text))


def format_beijing_timestamp(raw_timestamp: str) -> str:
    if not raw_timestamp:
        return "未知时间"
    try:
        normalized = raw_timestamp.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(BEIJING_TZ).strftime("%Y年%m月%d日 %H时%M分")
    except Exception:
        return raw_timestamp


def format_sms_state_label(state: str) -> str:
    return {
        "received": "已接收",
        "receiving": "接收中",
        "sent": "已发送",
        "sending": "发送中",
        "stored": "已存储",
    }.get(state, state or "未知")


def time_label_now() -> str:
    return datetime.now(BEIJING_TZ).strftime("%H:%M:%S")


def read_env_config(path: Path) -> dict[str, str]:
    config: dict[str, str] = {}
    if not path.exists():
        return config
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        config[key.strip()] = value.strip().strip("\"'")
    return config


def write_env_config(path: Path, config: dict[str, str]) -> None:
    lines = [f"{key}={value}" for key, value in config.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def app_runtime_config() -> dict[str, str]:
    config = read_env_config(APP_CONFIG_PATH)
    if "SIM_TYPE" not in config and os.environ.get("SIM_TYPE"):
        config["SIM_TYPE"] = os.environ["SIM_TYPE"]
    if "ESIM_MANAGEMENT_ENABLED" not in config and os.environ.get("ESIM_MANAGEMENT_ENABLED"):
        config["ESIM_MANAGEMENT_ENABLED"] = os.environ["ESIM_MANAGEMENT_ENABLED"]
    return config


def esim_management_enabled() -> bool:
    config = app_runtime_config()
    raw = str(config.get("ESIM_MANAGEMENT_ENABLED", "")).strip().lower()
    if raw:
        return raw in {"1", "true", "yes", "enabled"}
    return str(config.get("SIM_TYPE", "physical")).strip().lower() != "physical"


def sim_type() -> str:
    return str(app_runtime_config().get("SIM_TYPE", "physical")).strip().lower() or "physical"


def normalize_sim_type(raw_value: Any) -> str:
    value = str(raw_value or "").strip().lower()
    if value not in {"physical", "esim"}:
        raise ValueError("SIM 模式只支持 physical 或 esim")
    return value


def set_sim_type(next_sim_type: str) -> dict[str, str]:
    normalized = normalize_sim_type(next_sim_type)
    config = app_runtime_config()
    config["SIM_TYPE"] = normalized
    config["ESIM_MANAGEMENT_ENABLED"] = "1" if normalized == "esim" else "0"
    write_env_config(APP_CONFIG_PATH, config)
    return config


def auth_config() -> dict[str, str]:
    return app_runtime_config()


def auth_enabled() -> bool:
    config = auth_config()
    if str(config.get("LINKHIVE_AUTH_ENABLED", "1")).strip().lower() in {"0", "false", "no", "off"}:
        return False
    return bool(str(config.get("LINKHIVE_PASSWORD_HASH", "")).strip())


def app_version() -> str:
    flag = Path("/tmp/linkhive_update_ready")
    if flag.exists():
        return flag.read_text().strip()
    return "V1.0-20250621"


def auth_username() -> str:
    return auth_config().get("LINKHIVE_ADMIN_USER", "admin").strip() or "admin"


def auth_secret() -> str:
    configured = auth_config().get("LINKHIVE_SESSION_SECRET", "").strip()
    if configured:
        return configured
    return auth_config().get("LINKHIVE_PASSWORD_HASH", "linkhive-dev-secret")


def config_flag(key: str, default: bool = False) -> bool:
    config = auth_config()
    raw = str(config.get(key, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on", "enabled"}


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return digest.hex()


def verify_password(password: str) -> bool:
    raw_hash = auth_config().get("LINKHIVE_PASSWORD_HASH", "").strip()
    parts = raw_hash.split("$")
    if len(parts) != 3 or parts[0] != "pbkdf2_sha256":
        return False
    _, salt, expected = parts
    actual = hash_password(password, salt)
    return hmac.compare_digest(actual, expected)


def sign_session(username: str, expires_at: int) -> str:
    message = f"{username}:{expires_at}".encode("utf-8")
    return hmac.new(auth_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()


def totp_secret() -> str:
    config = read_env_config(APP_CONFIG_PATH)
    return config.get("LINKHIVE_TOTP_SECRET", "").strip()


def totp_enabled() -> bool:
    config = read_env_config(APP_CONFIG_PATH)
    return config.get("LINKHIVE_TOTP_ENABLED", "").strip().lower() in {"1", "true", "yes"}


def generate_totp_secret() -> str:
    return b32encode(secrets.token_bytes(20)).decode("utf-8").rstrip("=")


def _totp_hotp(secret_bytes: bytes, counter: int) -> int:
    hmac_result = hmac.new(secret_bytes, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = hmac_result[-1] & 0x0F
    binary = ((hmac_result[offset] & 0x7F) << 24
              | (hmac_result[offset + 1] & 0xFF) << 16
              | (hmac_result[offset + 2] & 0xFF) << 8
              | (hmac_result[offset + 3] & 0xFF))
    return binary % 1_000_000


def decode_totp_secret(secret: str) -> bytes:
    normalized = secret.strip().replace(" ", "").upper()
    padding = "=" * ((8 - len(normalized) % 8) % 8)
    return b32decode(normalized + padding)


def totp_code(secret: str) -> str:
    secret_bytes = decode_totp_secret(secret)
    counter = int(time.time() // 30)
    return str(_totp_hotp(secret_bytes, counter)).zfill(6)


def verify_totp(secret: str, code: str) -> bool:
    normalized = code.strip()
    if not re.fullmatch(r"\d{6}", normalized):
        return False
    try:
        secret_bytes = decode_totp_secret(secret)
    except Exception:
        return False
    current_counter = int(time.time() // 30)
    for counter in range(current_counter - 1, current_counter + 2):
        expected = str(_totp_hotp(secret_bytes, counter)).zfill(6)
        if hmac.compare_digest(normalized, expected):
            return True
    return False


def totp_otpauth_url(secret: str, label: str = "admin") -> str:
    encoded = secret.rstrip("=")
    return f"otpauth://totp/LinkHive:{label}?secret={encoded}&issuer=LinkHive"


_FAILED_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_FAILED_ATTEMPTS_LOCK = threading.Lock()


def _is_lan_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private
    except ValueError:
        return False


def brute_force_enabled() -> bool:
    config = read_env_config(APP_CONFIG_PATH)
    return config.get("LINKHIVE_BRUTE_FORCE_ENABLED", "1").strip().lower() in {"1", "true", "yes"}


def brute_force_max_attempts() -> int:
    config = read_env_config(APP_CONFIG_PATH)
    try:
        return max(1, int(config.get("LINKHIVE_BRUTE_FORCE_MAX_ATTEMPTS", "5")))
    except ValueError:
        return 5


def brute_force_lan_enabled() -> bool:
    config = read_env_config(APP_CONFIG_PATH)
    return config.get("LINKHIVE_BRUTE_FORCE_LAN_ENABLED", "1").strip().lower() in {"1", "true", "yes"}


def banned_ips() -> set[str]:
    config = read_env_config(APP_CONFIG_PATH)
    raw = config.get("LINKHIVE_BRUTE_FORCE_BANNED_IPS", "[]")
    try:
        return set(json.loads(raw))
    except (json.JSONDecodeError, TypeError):
        return set()


def save_banned_ips(ips: set[str]) -> None:
    config = read_env_config(APP_CONFIG_PATH)
    config["LINKHIVE_BRUTE_FORCE_BANNED_IPS"] = json.dumps(sorted(ips))
    write_env_config(APP_CONFIG_PATH, config)


def _cleanup_expired_attempts(now: float, window_seconds: int = 86400) -> None:
    with _FAILED_ATTEMPTS_LOCK:
        for ip in list(_FAILED_ATTEMPTS.keys()):
            _FAILED_ATTEMPTS[ip] = [t for t in _FAILED_ATTEMPTS[ip] if now - t < window_seconds]
            if not _FAILED_ATTEMPTS[ip]:
                del _FAILED_ATTEMPTS[ip]


def record_failed_attempt(ip: str) -> None:
    now = time.time()
    _cleanup_expired_attempts(now)
    with _FAILED_ATTEMPTS_LOCK:
        _FAILED_ATTEMPTS[ip].append(now)


def is_ip_banned(ip: str) -> bool:
    if not brute_force_enabled():
        return False
    if _is_lan_ip(ip) and not brute_force_lan_enabled():
        return False
    if ip in banned_ips():
        return True
    now = time.time()
    _cleanup_expired_attempts(now)
    max_attempts = brute_force_max_attempts()
    with _FAILED_ATTEMPTS_LOCK:
        should_ban = len(_FAILED_ATTEMPTS.get(ip, [])) >= max_attempts
        if should_ban:
            _FAILED_ATTEMPTS.pop(ip, None)
    if should_ban:
        save_banned_ips(banned_ips() | {ip})
        return True
    return False


def make_session_cookie(username: str) -> str:
    expires_at = int(time.time()) + AUTH_SESSION_TTL_SECONDS
    signature = sign_session(username, expires_at)
    return f"{username}:{expires_at}:{signature}"


def parse_cookie_header(raw_cookie: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in raw_cookie.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


def valid_session_cookie(raw_cookie: str) -> bool:
    if not auth_enabled():
        return True
    session_value = parse_cookie_header(raw_cookie).get(AUTH_COOKIE_NAME, "")
    parts = session_value.split(":")
    if len(parts) != 3:
        return False
    username, raw_expires_at, signature = parts
    try:
        expires_at = int(raw_expires_at)
    except ValueError:
        return False
    if username != auth_username() or expires_at < int(time.time()):
        return False
    expected = sign_session(username, expires_at)
    return hmac.compare_digest(signature, expected)


def parse_iso_datetime(raw_value: str) -> Optional[datetime]:
    if not raw_value:
        return None
    try:
        normalized = raw_value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=BEIJING_TZ)
        return parsed.astimezone(BEIJING_TZ)
    except Exception:
        return None


def format_runtime_timestamp(raw_timestamp: float) -> str:
    if raw_timestamp <= 0:
        return ""
    return datetime.fromtimestamp(raw_timestamp, tz=BEIJING_TZ).strftime("%Y年%m月%d日 %H时%M分%S秒")


def parse_signal_value(raw_value: str) -> int:
    try:
        return max(0, int(str(raw_value).strip()))
    except Exception:
        return 0


def normalize_signal_dbm(raw_value: str) -> str:
    value = str(raw_value or "").strip().replace("dBm", "").strip()
    if not value or value == "--":
        return "--"
    try:
        number = float(value)
    except Exception:
        return "--"
    if number.is_integer():
        return f"{int(number)} dBm"
    return f"{number:.1f} dBm"


def modem_at_ports(modem: dict[str, str]) -> list[str]:
    ports: list[str] = []
    direct_port = str(modem.get("linkhive.at_port") or "").strip()
    if direct_port:
        ports.append(direct_port)
    for key, value in modem.items():
        if not key.startswith("modem.generic.ports.value"):
            continue
        match = re.match(r"([A-Za-z0-9._/-]+)\s+\(([^)]+)\)", str(value).strip())
        if not match or match.group(2) != "at":
            continue
        port_name = match.group(1)
        port_path = port_name if port_name.startswith("/dev/") else f"/dev/{port_name}"
        if port_path not in ports:
            ports.append(port_path)
    return sorted(ports, reverse=True)


def run_at_command(port_path: str, command: str, timeout_seconds: float = 1.2) -> str:
    fd = os.open(port_path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    old_attrs = termios.tcgetattr(fd)
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = termios.B115200 | termios.CS8 | termios.CREAD | termios.CLOCAL
        attrs[3] = 0
        attrs[6][termios.VMIN] = 0
        attrs[6][termios.VTIME] = 5
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        termios.tcflush(fd, termios.TCIOFLUSH)
        os.write(fd, f"{command}\r".encode())
        deadline = time.time() + timeout_seconds
        chunks: list[bytes] = []
        while time.time() < deadline:
            readable, _, _ = select.select([fd], [], [], 0.1)
            if fd not in readable:
                continue
            try:
                chunks.append(os.read(fd, 8192))
            except BlockingIOError:
                continue
        return b"".join(chunks).decode("utf-8", errors="replace")
    finally:
        try:
            termios.tcsetattr(fd, termios.TCSANOW, old_attrs)
        finally:
            os.close(fd)


def first_at_response(modem: dict[str, str], command: str, timeout_seconds: float = 1.2) -> str:
    for port_path in modem_at_ports(modem):
        try:
            response = run_at_command(port_path, command, timeout_seconds)
        except Exception:
            continue
        if response.strip():
            return response
    return ""


def clean_at_response(raw_response: str, command: str = "") -> str:
    lines: list[str] = []
    command_upper = command.strip().upper()
    for raw_line in raw_response.replace("\r", "\n").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if command_upper and line.upper() == command_upper:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def at_port_priority(port_path: str) -> tuple[int, str]:
    result = run_command(["udevadm", "info", "-q", "property", "-n", port_path], check=False)
    output = result.stdout if result.returncode == 0 else ""
    if "ID_MM_PORT_TYPE_AT_PRIMARY=1" in output:
        return (0, port_path)
    if "ID_MM_PORT_TYPE_AT_SECONDARY=1" in output:
        return (1, port_path)
    if "ID_MM_CANDIDATE=1" in output:
        return (2, port_path)
    return (3, port_path)


def raw_at_port_candidates() -> list[str]:
    ports = sorted(glob("/dev/ttyUSB*"), key=at_port_priority)
    return [port for port in ports if os.path.exists(port)]


def parse_at_value(raw_response: str, patterns: list[str]) -> str:
    text = clean_at_response(raw_response)
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip().strip('"')
    for line in text.splitlines():
        normalized = line.strip()
        if normalized and normalized.upper() not in {"OK", "ERROR"} and not normalized.startswith("+"):
            return normalized
    return ""


def read_raw_at_snapshot(port_path: str) -> dict[str, Any]:
    """直接读取 AT 口，用于 QMI 尚未就绪时识别实体 SIM/eUICC。"""
    commands = {
        "at": "AT",
        "identity": "ATI",
        "pin": "AT+CPIN?",
        "iccid": "AT+CCID",
        "qccid": "AT+QCCID",
        "imsi": "AT+CIMI",
        "operator": "AT+COPS?",
        "simstat": "AT+QSIMSTAT?",
        "initstat": "AT+QINISTAT",
        "eid": "AT+EID",
        "qesim_eid": 'AT+QESIM="eid"',
        "qeuicc": "AT+QEUICC?",
        "qeuiccid": "AT+QEUICCID?",
        "qspn": "AT+QSPN",
        "spn": "AT+CRSM=176,28486,0,0,17",
    }
    responses: dict[str, str] = {}
    for key, command in commands.items():
        try:
            responses[key] = run_at_command(port_path, command, 1.2)
        except Exception as exc:
            responses[key] = f"ERROR: {exc}"

    if "OK" not in responses.get("at", "") and "OK" not in responses.get("identity", ""):
        return {}

    iccid = parse_at_value(
        responses.get("iccid", "") or responses.get("qccid", ""),
        [r"\+CCID:\s*([0-9A-F]+)", r"\+QCCID:\s*([0-9A-F]+)"],
    )
    if not iccid:
        iccid = parse_at_value(responses.get("qccid", ""), [r"\+QCCID:\s*([0-9A-F]+)"])
    imsi = parse_at_value(responses.get("imsi", ""), [r"^(\d{5,})$"])
    pin_state = parse_at_value(responses.get("pin", ""), [r"\+CPIN:\s*([A-Z0-9 _-]+)"])
    sim_present = bool(iccid or imsi or pin_state.upper() == "READY")
    home_operator_code = imsi[:5] if len(imsi) >= 5 else ""

    model = ""
    manufacturer = ""
    identity_lines = [
        line
        for line in clean_at_response(responses.get("identity", ""), "ATI").splitlines()
        if line.upper() not in {"OK", "ERROR"}
    ]
    if identity_lines:
        manufacturer = identity_lines[0]
    if len(identity_lines) >= 2:
        model = identity_lines[1]
    eid = first_dashboard_value(*(extract_eid_from_at_response(value) for value in responses.values()))
    euicc = "supported" if eid or known_euicc_hardware(manufacturer, model) else ""
    spn = first_dashboard_value(*(parse_spn_response(value) for value in responses.values()))

    return {
        "port": port_path,
        "manufacturer": manufacturer,
        "model": model,
        "iccid": iccid,
        "imsi": imsi,
        "eid": eid,
        "euicc": euicc,
        "operator_code": home_operator_code,
        "direct.home-operator-name": first_dashboard_value(spn, operator_name_for_code(home_operator_code)),
        "direct.home-operator-code": home_operator_code,
        "pin_state": pin_state,
        "sim_present": sim_present,
        "responses": {key: clean_at_response(value, commands[key]) for key, value in responses.items()},
    }


def probe_raw_sim_devices(force: bool = False) -> tuple[list[dict[str, Any]], str]:
    with RAW_SIM_PROBE_LOCK:
        now = time.time()
        if not force and now - float(RAW_SIM_PROBE_CACHE.get("updated_at") or 0) < 12:
            return list(RAW_SIM_PROBE_CACHE.get("items") or []), str(RAW_SIM_PROBE_CACHE.get("error") or "")

        items: list[dict[str, Any]] = []
        errors: list[str] = []
        for port_path in raw_at_port_candidates():
            try:
                snapshot = read_raw_at_snapshot(port_path)
            except Exception as exc:
                errors.append(f"{port_path}: {exc}")
                continue
            if snapshot:
                items.append(snapshot)

        RAW_SIM_PROBE_CACHE.update({"updated_at": now, "items": items, "error": "；".join(errors)})
        return items, str(RAW_SIM_PROBE_CACHE["error"])


def parse_qcsq_signal_dbm(raw_response: str) -> str:
    match = re.search(r'\+QCSQ:\s*"([^"]+)"\s*,\s*([-\d]+)(?:\s*,\s*([-\d]+))?', raw_response)
    if not match:
        return "--"
    mode = match.group(1).lower()
    if mode == "lte":
        lte_match = re.search(r'\+QCSQ:\s*"LTE"\s*,\s*([-\d]+)\s*,\s*([-\d]+)\s*,\s*([-\d]+)\s*,\s*([-\d]+)', raw_response)
        if lte_match:
            return normalize_signal_dbm(lte_match.group(2))
    return normalize_signal_dbm(match.group(2))


def parse_csq_signal_dbm(raw_response: str) -> str:
    match = re.search(r"\+CSQ:\s*(\d+)\s*,", raw_response)
    if not match:
        return "--"
    rssi = int(match.group(1))
    if rssi == 99:
        return "--"
    return normalize_signal_dbm(str(-113 + 2 * rssi))


def read_at_signal_dbm(modem: dict[str, str]) -> str:
    qcsq_signal = parse_qcsq_signal_dbm(first_at_response(modem, "AT+QCSQ", 1.5))
    if qcsq_signal != "--":
        return qcsq_signal
    return parse_csq_signal_dbm(first_at_response(modem, "AT+CSQ", 1.5))


def read_modem_signal_dbm(modem: dict[str, str], device_id: str = "") -> str:
    if first_dashboard_value(modem.get("linkhive.direct")):
        return first_dashboard_value(modem.get("direct.signal.dbm")) or "--"
    return read_at_signal_dbm(modem)


def parse_ims_enabled(raw_response: str) -> Optional[bool]:
    """Parse AT+QCFG="ims" response. Returns True/False/None (unsupported)."""
    match = re.search(r'\+QCFG:\s*"ims"\s*,\s*(\d)', raw_response)
    if not match:
        return None
    return match.group(1) == "1"


def parse_vowifi_enabled(raw_response: str) -> Optional[bool]:
    """Parse AT+QCFG="vowifi" response. Returns True/False/None (unsupported)."""
    match = re.search(r'\+QCFG:\s*"vowifi"\s*,\s*(\d)', raw_response)
    if not match:
        return None
    return match.group(1) == "1"


def read_ims_status(modem: dict[str, str]) -> dict[str, Any]:
    """Read VoLTE/VoWiFi status from modem via AT commands."""
    ims_response = first_at_response(modem, 'AT+QCFG="ims"', 2.0)
    vowifi_response = first_at_response(modem, 'AT+QCFG="vowifi"', 2.0)

    volte_enabled = parse_ims_enabled(ims_response)
    vowifi_enabled = parse_vowifi_enabled(vowifi_response)

    # Detect ERROR in vowifi response as explicit "not supported"
    vowifi_supported = vowifi_enabled is not None
    if not vowifi_supported and "ERROR" in vowifi_response:
        vowifi_supported = False

    # If both queries return None, the modem likely doesn't support IMS AT commands
    ims_supported = volte_enabled is not None or vowifi_supported

    return {
        "ims_supported": ims_supported,
        "volte_enabled": volte_enabled if volte_enabled is not None else False,
        "volte_supported": volte_enabled is not None,
        "vowifi_enabled": vowifi_enabled if vowifi_enabled is not None else False,
        "vowifi_supported": vowifi_supported,
    }


def normalize_weekdays(raw_value: Any) -> list[str]:
    if isinstance(raw_value, str):
        values = [item.strip().lower() for item in raw_value.split(",")]
    elif isinstance(raw_value, list):
        values = [str(item).strip().lower() for item in raw_value]
    else:
        values = []
    normalized: list[str] = []
    for value in values:
        if value in WEEKDAY_ORDER and value not in normalized:
            normalized.append(value)
    normalized.sort(key=WEEKDAY_ORDER.index)
    return normalized


def legacy_keepalive_cron(time_text: str, days_of_week: list[str]) -> str:
    hour_text, minute_text = parse_keepalive_time(time_text).split(":", 1)
    day_numbers = [str(CRON_WEEKDAY_ALIASES[day]) for day in days_of_week if day in CRON_WEEKDAY_ALIASES]
    if not day_numbers:
        raise ValueError("旧保活任务缺少执行日，无法转换为 cron 表达式")
    return f"{int(minute_text)} {int(hour_text)} * * {','.join(day_numbers)}"


def normalize_keepalive_settings(raw_value: Any) -> dict[str, int]:
    raw = raw_value if isinstance(raw_value, dict) else {}
    try:
        queue_gap_seconds = int(raw.get("queue_gap_seconds", 180))
    except Exception:
        queue_gap_seconds = 180
    queue_gap_seconds = max(30, min(queue_gap_seconds, 1800))
    return {"queue_gap_seconds": queue_gap_seconds}


def parse_keepalive_time(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise ValueError("保活时间格式必须是 HH:MM")
    return value


def parse_cron_value(token: str, minimum: int, maximum: int, aliases: Optional[dict[str, int]] = None) -> int:
    normalized = token.strip().lower()
    if aliases and normalized in aliases:
        value = aliases[normalized]
    else:
        value = int(normalized)
    if maximum == 6 and value == 7:
        value = 0
    if value < minimum or value > maximum:
        raise ValueError
    return value


def parse_cron_field(
    field_name: str,
    raw_field: str,
    minimum: int,
    maximum: int,
    aliases: Optional[dict[str, int]] = None,
) -> tuple[frozenset[int], bool]:
    field = raw_field.strip().lower()
    if not field:
        raise ValueError(f"cron 的 {field_name} 字段为空")
    is_any = field == "*"
    values: set[int] = set()

    for segment in field.split(","):
        item = segment.strip()
        if not item:
            raise ValueError(f"cron 的 {field_name} 字段包含空片段")

        step = 1
        if "/" in item:
            base, step_text = item.split("/", 1)
            try:
                step = int(step_text)
            except Exception as exc:
                raise ValueError(f"cron 的 {field_name} 步长不正确") from exc
            if step <= 0:
                raise ValueError(f"cron 的 {field_name} 步长必须大于 0")
        else:
            base = item

        if base == "*":
            start = minimum
            end = maximum
        elif "-" in base:
            left, right = base.split("-", 1)
            try:
                start = parse_cron_value(left, minimum, maximum, aliases)
                end = parse_cron_value(right, minimum, maximum, aliases)
            except Exception as exc:
                raise ValueError(f"cron 的 {field_name} 范围不正确") from exc
            if start > end:
                raise ValueError(f"cron 的 {field_name} 范围起止顺序不正确")
        else:
            try:
                start = parse_cron_value(base, minimum, maximum, aliases)
            except Exception as exc:
                raise ValueError(f"cron 的 {field_name} 值不正确") from exc
            end = start

        for value in range(start, end + 1, step):
            if maximum == 6 and value == 7:
                values.add(0)
            else:
                values.add(value)

    if not values:
        raise ValueError(f"cron 的 {field_name} 字段未解析出任何值")
    return frozenset(values), is_any


@lru_cache(maxsize=256)
def parse_cron_expression(raw_expression: str) -> dict[str, Any]:
    expression = str(raw_expression or "").strip().lower()
    parts = expression.split()
    if len(parts) != 5:
        raise ValueError("cron 表达式必须是 5 段：分钟 小时 日 月 星期")

    minute_values, minute_any = parse_cron_field("分钟", parts[0], 0, 59)
    hour_values, hour_any = parse_cron_field("小时", parts[1], 0, 23)
    day_values, day_any = parse_cron_field("日期", parts[2], 1, 31)
    month_values, month_any = parse_cron_field("月份", parts[3], 1, 12, MONTH_ALIASES)
    weekday_values, weekday_any = parse_cron_field("星期", parts[4], 0, 6, CRON_WEEKDAY_ALIASES)

    return {
        "expression": expression,
        "minutes": minute_values,
        "hours": hour_values,
        "days": day_values,
        "months": month_values,
        "weekdays": weekday_values,
        "minute_any": minute_any,
        "hour_any": hour_any,
        "day_any": day_any,
        "month_any": month_any,
        "weekday_any": weekday_any,
    }


def normalize_cron_expression(raw_value: Any) -> str:
    expression = str(raw_value or "").strip().lower()
    parse_cron_expression(expression)
    return expression


def cron_weekday_value(dt: datetime) -> int:
    return (dt.weekday() + 1) % 7


def cron_day_matches(schedule: dict[str, Any], dt: datetime) -> bool:
    day_match = dt.day in schedule["days"]
    weekday_match = cron_weekday_value(dt) in schedule["weekdays"]
    if schedule["day_any"] and schedule["weekday_any"]:
        return True
    if schedule["day_any"]:
        return weekday_match
    if schedule["weekday_any"]:
        return day_match
    return day_match or weekday_match


def cron_matches_datetime(raw_expression: str, dt: datetime) -> bool:
    schedule = parse_cron_expression(raw_expression)
    if dt.month not in schedule["months"]:
        return False
    if not cron_day_matches(schedule, dt):
        return False
    if dt.hour not in schedule["hours"]:
        return False
    return dt.minute in schedule["minutes"]


def next_allowed_value(sorted_values: list[int], current_value: int) -> Optional[int]:
    for value in sorted_values:
        if value >= current_value:
            return value
    return None


def parse_keepalive_task(raw_task: dict[str, Any]) -> dict[str, Any]:
    task_id = str(raw_task.get("id", "")).strip() or uuid.uuid4().hex[:12]
    label = str(raw_task.get("label", "")).strip()
    device_id = str(raw_task.get("device_id", "")).strip()
    profile_iccid = str(raw_task.get("profile_iccid", "")).strip()
    target_number = str(raw_task.get("target_number", "")).strip()
    message = str(raw_task.get("message", "")).strip()
    enabled_raw = raw_task.get("enabled", True)
    if isinstance(enabled_raw, bool):
        enabled = enabled_raw
    else:
        enabled = str(enabled_raw).strip().lower() not in {"0", "false", "no", "off", ""}
    cron_expression = str(raw_task.get("cron_expression", "")).strip().lower()
    if not cron_expression:
        weekdays = normalize_weekdays(raw_task.get("days_of_week", []))
        cron_expression = legacy_keepalive_cron(raw_task.get("time", ""), weekdays)
    if "device_id" not in raw_task and enabled:
        enabled = False
    if not label:
        raise ValueError("保活任务名称不能为空")
    if not target_number:
        raise ValueError(f"保活任务 {label} 缺少目标手机号")
    if not message:
        raise ValueError(f"保活任务 {label} 缺少短信内容")
    return {
        "id": task_id,
        "label": label,
        "enabled": enabled,
        "device_id": device_id,
        "profile_iccid": profile_iccid,
        "target_number": target_number,
        "message": message,
        "cron_expression": normalize_cron_expression(cron_expression),
    }


def load_keepalive_config() -> tuple[dict[str, int], list[dict[str, Any]]]:
    config = read_env_config(APP_CONFIG_PATH)
    raw_settings = str(config.get(KEEPALIVE_SETTINGS_KEY, "")).strip()
    raw_tasks = str(config.get(KEEPALIVE_TASKS_KEY, "")).strip()

    try:
        parsed_settings = json.loads(raw_settings) if raw_settings else {}
    except json.JSONDecodeError:
        parsed_settings = {}
    settings = normalize_keepalive_settings(parsed_settings)

    try:
        parsed_tasks = json.loads(raw_tasks) if raw_tasks else []
    except json.JSONDecodeError:
        parsed_tasks = []
    if not isinstance(parsed_tasks, list):
        parsed_tasks = []

    tasks: list[dict[str, Any]] = []
    for item in parsed_tasks:
        if not isinstance(item, dict):
            continue
        tasks.append(parse_keepalive_task(item))
    return settings, tasks


def save_keepalive_config(settings: dict[str, Any], tasks: list[dict[str, Any]]) -> tuple[dict[str, int], list[dict[str, Any]]]:
    normalized_settings = normalize_keepalive_settings(settings)
    normalized_tasks = [parse_keepalive_task(task) for task in tasks]
    config = read_env_config(APP_CONFIG_PATH)
    config[KEEPALIVE_SETTINGS_KEY] = json.dumps(normalized_settings, ensure_ascii=False, separators=(",", ":"))
    config[KEEPALIVE_TASKS_KEY] = json.dumps(normalized_tasks, ensure_ascii=False, separators=(",", ":"))
    write_env_config(APP_CONFIG_PATH, config)
    active_task_ids = {task["id"] for task in normalized_tasks}
    with KEEPALIVE_RUNTIME_LOCK:
        stale_ids = [task_id for task_id in KEEPALIVE_LAST_ENQUEUED if task_id not in active_task_ids]
        for task_id in stale_ids:
            KEEPALIVE_LAST_ENQUEUED.pop(task_id, None)
    return normalized_settings, normalized_tasks


def next_keepalive_run(task: dict[str, Any], now: Optional[datetime] = None) -> Optional[datetime]:
    current = ((now or datetime.now(BEIJING_TZ)).astimezone(BEIJING_TZ) + timedelta(minutes=1)).replace(
        second=0,
        microsecond=0,
    )
    schedule = parse_cron_expression(task["cron_expression"])
    sorted_minutes = sorted(schedule["minutes"])
    sorted_hours = sorted(schedule["hours"])
    sorted_months = sorted(schedule["months"])

    for _ in range(0, 200000):
        if current.month not in schedule["months"]:
            next_month = next_allowed_value(sorted_months, current.month + 1)
            next_year = current.year
            if next_month is None:
                next_month = sorted_months[0]
                next_year += 1
            current = current.replace(
                year=next_year,
                month=next_month,
                day=1,
                hour=sorted_hours[0],
                minute=sorted_minutes[0],
                second=0,
                microsecond=0,
            )
            continue

        if not cron_day_matches(schedule, current):
            current = (current + timedelta(days=1)).replace(
                hour=sorted_hours[0],
                minute=sorted_minutes[0],
                second=0,
                microsecond=0,
            )
            continue

        if current.hour not in schedule["hours"]:
            next_hour = next_allowed_value(sorted_hours, current.hour)
            if next_hour is None:
                current = (current + timedelta(days=1)).replace(
                    hour=sorted_hours[0],
                    minute=sorted_minutes[0],
                    second=0,
                    microsecond=0,
                )
            else:
                current = current.replace(hour=next_hour, minute=sorted_minutes[0], second=0, microsecond=0)
            continue

        if current.minute not in schedule["minutes"]:
            next_minute = next_allowed_value(sorted_minutes, current.minute)
            if next_minute is None:
                current = (current + timedelta(hours=1)).replace(
                    minute=sorted_minutes[0],
                    second=0,
                    microsecond=0,
                )
            else:
                current = current.replace(minute=next_minute, second=0, microsecond=0)
            continue

        if cron_matches_datetime(task["cron_expression"], current):
            return current
        current += timedelta(minutes=1)
    return None


def due_keepalive_run(task: dict[str, Any], now: Optional[datetime] = None) -> Optional[datetime]:
    current = (now or datetime.now(BEIJING_TZ)).astimezone(BEIJING_TZ)
    scheduled = current.replace(second=0, microsecond=0)
    delta_seconds = (current - scheduled).total_seconds()
    if 0 <= delta_seconds <= KEEPALIVE_SCHEDULE_GRACE_SECONDS and cron_matches_datetime(task["cron_expression"], scheduled):
        return scheduled
    return None


def keepalive_schedule_key(scheduled_at: datetime) -> str:
    return scheduled_at.astimezone(BEIJING_TZ).strftime("%Y%m%d%H%M")


def active_profile_from_list(profiles: list[dict[str, Any]]) -> dict[str, Any]:
    return next((profile for profile in profiles if profile_is_active(profile)), {})


def profile_name_for_iccid(iccid: str, profiles: list[dict[str, Any]]) -> str:
    for profile in profiles:
        if str(profile.get("iccid", "")).strip() == iccid:
            return str(profile.get("display_name") or profile_display_name(profile)).strip()
    return f"Profile {iccid[-6:]}" if len(iccid) >= 6 else iccid or "未知 Profile"


def describe_keepalive_record(record: dict[str, Any]) -> dict[str, Any]:
    metadata = record.get("metadata", {})
    scheduled_for = str(metadata.get("scheduled_for", "")).strip()
    created_at = float(record.get("created_at", 0))
    updated_at = float(record.get("updated_at", 0))
    last_message = ""
    events = record.get("events", [])
    if isinstance(events, list) and events:
        last_message = str(events[-1].get("message", "")).strip()
    return {
        "id": record.get("id", ""),
        "task_id": metadata.get("task_id", ""),
        "label": metadata.get("label", "") or "保活任务",
        "device_id": metadata.get("device_id", ""),
        "device_label": metadata.get("device_label", ""),
        "trigger": metadata.get("trigger", "manual"),
        "scheduled_for": scheduled_for,
        "scheduled_for_label": format_beijing_timestamp(scheduled_for) if scheduled_for else "",
        "profile_iccid": metadata.get("profile_iccid", ""),
        "profile_name": metadata.get("profile_name", ""),
        "target_number": metadata.get("target_number", ""),
        "state": record.get("state", ""),
        "error": record.get("error", ""),
        "last_message": last_message,
        "created_at": format_runtime_timestamp(created_at),
        "updated_at": format_runtime_timestamp(updated_at),
    }


def keepalive_status_snapshot(profiles: list[dict[str, Any]], devices: Optional[list[dict[str, Any]]] = None) -> dict[str, Any]:
    now = datetime.now(BEIJING_TZ)
    settings, tasks = load_keepalive_config()
    profile_map = {str(profile.get("iccid", "")).strip(): profile for profile in profiles}
    device_map = {str(device.get("id", "")).strip(): device for device in (devices or [])}

    task_views: list[dict[str, Any]] = []
    for task in tasks:
        next_run = next_keepalive_run(task, now)
        profile = profile_map.get(task["profile_iccid"], {})
        device = device_map.get(task.get("device_id", ""), {})
        task_views.append(
            {
                **task,
                "device_label": str(device.get("label", "")).strip(),
                "profile_name": (
                    str(profile.get("display_name", "")).strip()
                    if profile
                    else profile_name_for_iccid(task["profile_iccid"], profiles) if task.get("profile_iccid") else ""
                ),
                "schedule_label": task["cron_expression"],
                "next_run": next_run.isoformat() if next_run else "",
                "next_run_label": format_beijing_timestamp(next_run.isoformat()) if next_run else "",
            }
        )

    with ACTIONS_LOCK:
        keepalive_records = [
            record
            for record in ACTIONS.values()
            if record.get("action") == KEEPALIVE_ACTION_NAME and record.get("metadata", {}).get("kind") == "keepalive"
        ]

    queue_items: list[dict[str, Any]] = []
    active_run: Optional[dict[str, Any]] = None
    history: list[dict[str, Any]] = []
    for record in sorted(keepalive_records, key=lambda item: float(item.get("created_at", 0)), reverse=True):
        description = describe_keepalive_record(record)
        state = str(record.get("state", "")).strip()
        if state == "running" and active_run is None:
            active_run = description
        elif state == "queued":
            queue_items.append(description)
        elif state in {"done", "error"} and len(history) < KEEPALIVE_HISTORY_LIMIT:
            history.append(description)

    with KEEPALIVE_RUNTIME_LOCK:
        next_allowed_at = KEEPALIVE_NEXT_ALLOWED_AT

    return {
        "settings": settings,
        "tasks": task_views,
        "active_run": active_run,
        "queued_runs": sorted(queue_items, key=lambda item: item.get("scheduled_for", "")),
        "recent_runs": history,
        "next_allowed_at": format_runtime_timestamp(next_allowed_at),
    }


def keepalive_queue_delay_seconds() -> int:
    settings, _ = load_keepalive_config()
    return int(settings["queue_gap_seconds"])


def schedule_keepalive_gap(seconds: Optional[int] = None) -> None:
    gap_seconds = seconds if seconds is not None else keepalive_queue_delay_seconds()
    with KEEPALIVE_RUNTIME_LOCK:
        global KEEPALIVE_NEXT_ALLOWED_AT
        KEEPALIVE_NEXT_ALLOWED_AT = max(KEEPALIVE_NEXT_ALLOWED_AT, time.time() + max(0, gap_seconds))


def wait_for_keepalive_gap(ctx: "ActionContext", gap_seconds: Optional[int] = None) -> None:
    expected_gap = gap_seconds if gap_seconds is not None else keepalive_queue_delay_seconds()
    while True:
        with KEEPALIVE_RUNTIME_LOCK:
            remaining = KEEPALIVE_NEXT_ALLOWED_AT - time.time()
        if remaining <= 0:
            return
        ctx.sleep(max(1, int(remaining) + 1), f"等待切卡缓冲时间，避免频繁切卡（配置 {expected_gap} 秒）")


def profile_is_active(profile: dict[str, Any]) -> bool:
    for key in ("enabled", "active", "is_enabled", "is_active"):
        value = profile.get(key)
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in {"1", "true", "yes", "enabled", "active"}:
            return True
    return (
        str(profile.get("state", "")).lower() in {"enabled", "active"}
        or str(profile.get("profileState", "")).lower() in {"enabled", "active"}
    )


def profile_display_name(profile: dict[str, Any]) -> str:
    for key in (
        "profileNickname",
        "nickname",
        "serviceProviderName",
        "profileName",
        "name",
        "profile_name",
        "provider",
        "carrier",
        "operator",
    ):
        raw_value = profile.get(key, "")
        if raw_value is None:
            continue
        value = str(raw_value).strip()
        if value:
            return value
    iccid = str(profile.get("iccid", "")).strip()
    return f"Profile {iccid[-6:]}" if iccid else "未知 Profile"


def enrich_profile(profile: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(profile)
    enriched["display_name"] = profile_display_name(profile)
    enriched["is_active"] = profile_is_active(profile)
    enriched["provider_name"] = str(
        profile.get("serviceProviderName")
        or profile.get("provider")
        or profile.get("carrier")
        or profile.get("operator")
        or profile.get("profileName")
        or ""
    ).strip()
    enriched["iccid_short"] = str(profile.get("iccid", ""))[-6:]
    return enriched


def normalize_smsc_type(raw_value: Any) -> str:
    text = str(raw_value or "").strip()
    if not text:
        return "145"
    if not re.fullmatch(r"\d{1,3}", text):
        raise ValueError("SMSC 类型必须是数字")
    return text


def normalize_smsc_address(raw_value: Any) -> str:
    text = str(raw_value or "").strip()
    if not text:
        return ""
    if not re.fullmatch(r"\+?[0-9]{5,20}", text):
        raise ValueError("SMSC 地址格式不正确")
    return text


def load_profile_smsc_config() -> dict[str, dict[str, str]]:
    config = read_env_config(APP_CONFIG_PATH)
    raw_value = str(config.get(PROFILE_SMSC_CONFIG_KEY, "")).strip()
    if not raw_value:
        return {}
    try:
        parsed = json.loads(raw_value)
    except Exception as exc:
        raise RuntimeError(f"读取 Profile SMSC 配置失败：{exc}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Profile SMSC 配置格式不正确")

    normalized: dict[str, dict[str, str]] = {}
    for iccid, item in parsed.items():
        iccid_text = str(iccid or "").strip()
        if not iccid_text or not isinstance(item, dict):
            continue
        address = normalize_smsc_address(item.get("address", ""))
        if not address:
            continue
        normalized[iccid_text] = {
            "address": address,
            "type": normalize_smsc_type(item.get("type", "145")),
        }
    return normalized


def save_profile_smsc_config(mapping: dict[str, dict[str, str]]) -> None:
    config = read_env_config(APP_CONFIG_PATH)
    sanitized: dict[str, dict[str, str]] = {}
    for iccid, item in mapping.items():
        iccid_text = str(iccid or "").strip()
        if not iccid_text:
            continue
        address = normalize_smsc_address(item.get("address", ""))
        if not address:
            continue
        sanitized[iccid_text] = {
            "address": address,
            "type": normalize_smsc_type(item.get("type", "145")),
        }
    if sanitized:
        config[PROFILE_SMSC_CONFIG_KEY] = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))
    else:
        config.pop(PROFILE_SMSC_CONFIG_KEY, None)
    write_env_config(APP_CONFIG_PATH, config)


def attach_profile_smsc_config(profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        smsc_mapping = load_profile_smsc_config()
    except Exception:
        smsc_mapping = {}
    enriched_profiles: list[dict[str, Any]] = []
    for profile in profiles:
        enriched = dict(profile)
        iccid = str(enriched.get("iccid", "")).strip()
        smsc_item = smsc_mapping.get(iccid, {})
        enriched["smsc_address"] = str(smsc_item.get("address", "")).strip()
        enriched["smsc_type"] = str(smsc_item.get("type", "")).strip()
        enriched_profiles.append(enriched)
    return enriched_profiles


def get_profiles() -> list[dict[str, Any]]:
    result = run_command(["/usr/local/bin/lpac-switch", "list"])
    payload = parse_lpac_json(result.stdout)
    if payload.get("code") != 0:
        raise RuntimeError(payload.get("message", "读取 eSIM 列表失败"))
    profiles = payload.get("data", [])
    return [enrich_profile(profile) for profile in profiles]


def refresh_profile_cache(force: bool = False) -> list[dict[str, Any]]:
    global PROFILE_CACHE, PROFILE_CACHE_ERROR, PROFILE_CACHE_UPDATED_AT
    with PROFILE_CACHE_LOCK:
        if PROFILE_CACHE and not force:
            return list(PROFILE_CACHE)
        profiles = get_profiles()
        PROFILE_CACHE = profiles
        PROFILE_CACHE_ERROR = ""
        PROFILE_CACHE_UPDATED_AT = time.time()
        return list(PROFILE_CACHE)


def get_cached_profiles() -> tuple[list[dict[str, Any]], Optional[str]]:
    global PROFILE_CACHE_ERROR
    with PROFILE_CACHE_LOCK:
        if PROFILE_CACHE:
            return list(PROFILE_CACHE), None
        if PROFILE_CACHE_ERROR:
            return [], PROFILE_CACHE_ERROR
    try:
        return refresh_profile_cache(force=True), None
    except Exception as exc:
        with PROFILE_CACHE_LOCK:
            PROFILE_CACHE_ERROR = str(exc)
        return [], str(exc)


def get_profile_cache_snapshot() -> tuple[list[dict[str, Any]], Optional[str]]:
    with PROFILE_CACHE_LOCK:
        return list(PROFILE_CACHE), PROFILE_CACHE_ERROR or None


def get_profile_by_iccid(iccid: str) -> dict[str, Any]:
    profiles, _ = get_cached_profiles()
    return next((profile for profile in profiles if str(profile.get("iccid")) == iccid), {})


def modem_id_from_path(path: str) -> str:
    match = re.search(r"/Modem/(\d+)$", str(path or "").strip())
    return match.group(1) if match else str(path or "").strip()


def list_modem_paths() -> list[str]:
    return []


def modem_selector_for_device_id(device_id: str = "") -> str:
    target = str(device_id or "").strip()
    return target.removeprefix("imei-") if target.startswith("imei-") else target


def get_modem_info(device_id: str = "", force_refresh: bool = False) -> tuple[dict[str, str], Optional[str]]:
    return get_direct_modem_info(device_id, force_refresh=force_refresh)


def enumerate_modem_infos(force_refresh: bool = False) -> list[tuple[dict[str, str], Optional[str]]]:
    return enumerate_direct_modems(force_refresh=force_refresh)


def modem_device_id(modem: dict[str, str]) -> str:
    imei = first_dashboard_value(modem.get("modem.generic.equipment-identifier"))
    if imei:
        return f"imei-{imei}"
    selector = first_dashboard_value(modem.get("linkhive.modem_selector"))
    if selector:
        return f"modem-{selector}"
    modem_path = first_dashboard_value(modem.get("linkhive.modem_path"))
    modem_id = modem_id_from_path(modem_path)
    return f"modem-{modem_id}" if modem_id else "modem-any"


def list_sms(device_id: str = "") -> tuple[list[dict[str, str]], Optional[str]]:
    return list_sms_via_at(device_id)


def cpms_set_command(memories: list[str]) -> str:
    quoted = ",".join(f'"{memory}"' for memory in memories)
    return f"AT+CPMS={quoted}"


def parse_cpms_memories(raw_response: str) -> list[str]:
    return re.findall(r'"([^"]+)"\s*,\s*\d+\s*,\s*\d+', raw_response)[:3]


def parse_cpms_first_count(raw_response: str) -> Optional[int]:
    match = re.search(r"\+CPMS:\s*(?:\"[^\"]+\"\s*,\s*)?(\d+)\s*,\s*(\d+)", raw_response)
    if not match:
        return None
    return int(match.group(1))


def read_sms_storage_counts(modem: dict[str, str], fallback_device_count: int) -> dict[str, int]:
    for port_path in modem_at_ports(modem):
        original_memories: list[str] = []
        try:
            original_response = run_at_command(port_path, "AT+CPMS?", 1.2)
            original_memories = parse_cpms_memories(original_response)
            device_count = parse_cpms_first_count(run_at_command(port_path, cpms_set_command(["ME", "ME", "ME"]), 1.5))
            sim_count = parse_cpms_first_count(run_at_command(port_path, cpms_set_command(["SM", "SM", "SM"]), 1.5))
            if original_memories:
                restore_memories = (original_memories + ["MT", "MT", "MT"])[:3]
                run_at_command(port_path, cpms_set_command(restore_memories), 1.0)
            return {
                "device_count": fallback_device_count if device_count is None else device_count,
                "sim_count": 0 if sim_count is None else sim_count,
            }
        except Exception:
            if original_memories:
                try:
                    restore_memories = (original_memories + ["MT", "MT", "MT"])[:3]
                    run_at_command(port_path, cpms_set_command(restore_memories), 1.0)
                except Exception:
                    pass
            continue
    return {"device_count": fallback_device_count, "sim_count": 0}


def service_state(name: str) -> str:
    result = run_command(["systemctl", "is-active", name], check=False)
    return command_output_text(result) or "unknown"


def get_connection_info() -> dict[str, str]:
    result = run_command(["nmcli", "connection", "show", "modem"], check=False)
    return parse_key_value_output(result.stdout) if result.returncode == 0 else {}


def normalize_dashboard_value(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    return "" if not value or value == "--" else value


def first_dashboard_value(*values: Any) -> str:
    for value in values:
        normalized = normalize_dashboard_value(value)
        if normalized:
            return normalized
    return ""


def clone_cached_value(value: Any) -> Any:
    if isinstance(value, list):
        return [dict(item) if isinstance(item, dict) else item for item in value]
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, tuple):
        return tuple(clone_cached_value(item) for item in value)
    return value


def cached_slow_probe(key: str, ttl_seconds: float, default: Any, producer: Callable[[], Any]) -> Any:
    now = time.time()
    with SLOW_PROBE_CACHE_LOCK:
        entry = SLOW_PROBE_CACHE.setdefault(key, {"updated_at": 0.0, "value": clone_cached_value(default), "running": False})
        if now - float(entry.get("updated_at") or 0) < ttl_seconds:
            return clone_cached_value(entry.get("value", default))
        if not entry.get("running"):
            entry["running"] = True

            def refresh() -> None:
                success = True
                try:
                    value = producer()
                except Exception:
                    success = False
                    value = clone_cached_value(default)
                with SLOW_PROBE_CACHE_LOCK:
                    entry["value"] = value
                    entry["updated_at"] = time.time() if success else 0.0
                    entry["running"] = False

            threading.Thread(target=refresh, daemon=True).start()
        return clone_cached_value(entry.get("value", default))


def cached_ims_status(modem: dict[str, str], modem_error: Optional[str]) -> dict[str, Any]:
    default = {"ims_supported": False, "volte_enabled": False, "vowifi_enabled": False}
    if modem_error:
        return default
    device_id = modem_device_id(modem)
    return cached_slow_probe(
        f"ims:{device_id}",
        IMS_STATUS_CACHE_SECONDS,
        default,
        lambda: read_ims_status(modem),
    )


def cached_list_sms(device_id: str) -> tuple[list[dict[str, str]], Optional[str]]:
    return cached_slow_probe(
        f"sms-list:{device_id or 'primary'}",
        SMS_LIST_CACHE_SECONDS,
        ([], None),
        lambda: list_sms(device_id),
    )


def cached_sms_storage_counts(modem: dict[str, str], fallback_count: int) -> dict[str, Any]:
    device_id = modem_device_id(modem)
    default = {"device_count": fallback_count, "sim_count": 0, "readable_count": fallback_count}
    return cached_slow_probe(
        f"sms-storage:{device_id}",
        SMS_STORAGE_CACHE_SECONDS,
        default,
        lambda: read_sms_storage_counts(modem, fallback_count),
    )


def get_modem_sim_info(modem: dict[str, str]) -> dict[str, str]:
    return {
        "sim.properties.iccid": first_dashboard_value(modem.get("direct.sim.iccid")),
        "sim.properties.imsi": first_dashboard_value(modem.get("direct.sim.imsi")),
        "sim.properties.eid": first_dashboard_value(modem.get("direct.sim.eid")),
        "sim.properties.operator-code": first_dashboard_value(modem.get("modem.3gpp.operator-code")),
        "sim.properties.operator-name": first_dashboard_value(modem.get("modem.3gpp.operator-name")),
    }


def get_active_cellular_interface() -> str:
    result = run_command(["nmcli", "-t", "-f", "NAME,DEVICE,TYPE", "connection", "show", "--active"], check=False)
    if result.returncode != 0:
        return ""
    fallback = ""
    for raw_line in result.stdout.splitlines():
        parts = raw_line.split(":")
        if len(parts) < 3:
            continue
        name, device, conn_type = parts[0], parts[1], parts[2]
        if not device or device == "--":
            continue
        if conn_type in {"gsm", "cdma"} or name == "modem":
            return device
        if not fallback and device.startswith(("wwan", "usb", "ppp")):
            fallback = device
    return fallback


def read_interface_ip(interface_name: str) -> str:
    if not interface_name:
        return ""
    for family in ("-4", "-6"):
        result = run_command(["ip", "-o", family, "addr", "show", "dev", interface_name], check=False)
        if result.returncode != 0:
            continue
        match = re.search(r"\sinet6?\s+([^\s/]+)", result.stdout)
        if match:
            return match.group(1)
    return ""


def read_interface_counter(interface_name: str, counter_name: str) -> int:
    if not interface_name or not re.fullmatch(r"[A-Za-z0-9_.:-]+", interface_name):
        return 0
    counter_path = Path("/sys/class/net") / interface_name / "statistics" / counter_name
    try:
        return max(0, int(counter_path.read_text(encoding="utf-8").strip()))
    except Exception:
        return 0


def find_modem_band(modem: dict[str, str]) -> str:
    preferred_keys = (
        "modem.3gpp.frequency-band",
        "modem.generic.current-bands.value[1]",
        "modem.generic.current-bands",
        "modem.3gpp.lte.frequency-band",
    )
    direct = first_dashboard_value(*(modem.get(key) for key in preferred_keys))
    if direct:
        return direct
    for key, value in modem.items():
        key_lower = key.lower()
        if "band" in key_lower or "earfcn" in key_lower:
            normalized = normalize_dashboard_value(value)
            if normalized:
                return normalized
    return ""


def dashboard_traffic_snapshot(interface_name: str) -> dict[str, Any]:
    today = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")
    rx_bytes = read_interface_counter(interface_name, "rx_bytes")
    tx_bytes = read_interface_counter(interface_name, "tx_bytes")
    now_label = datetime.now(BEIJING_TZ).strftime("%H:%M")

    with DASHBOARD_TRAFFIC_LOCK:
        baseline_changed = (
            DASHBOARD_TRAFFIC_BASELINE["date"] != today
            or DASHBOARD_TRAFFIC_BASELINE["iface"] != interface_name
            or rx_bytes < int(DASHBOARD_TRAFFIC_BASELINE["rx"] or 0)
            or tx_bytes < int(DASHBOARD_TRAFFIC_BASELINE["tx"] or 0)
        )
        if baseline_changed:
            DASHBOARD_TRAFFIC_BASELINE.update({"date": today, "rx": rx_bytes, "tx": tx_bytes, "iface": interface_name})
            DASHBOARD_TRAFFIC_HISTORY.clear()

        download_bytes = max(0, rx_bytes - int(DASHBOARD_TRAFFIC_BASELINE["rx"] or 0))
        upload_bytes = max(0, tx_bytes - int(DASHBOARD_TRAFFIC_BASELINE["tx"] or 0))
        total_bytes = download_bytes + upload_bytes
        sample = {
            "time": now_label,
            "upload_bytes": upload_bytes,
            "download_bytes": download_bytes,
            "total_bytes": total_bytes,
        }
        if not DASHBOARD_TRAFFIC_HISTORY or DASHBOARD_TRAFFIC_HISTORY[-1] != sample:
            DASHBOARD_TRAFFIC_HISTORY.append(sample)
        return {
            "today_upload_bytes": upload_bytes,
            "today_download_bytes": download_bytes,
            "today_total_bytes": total_bytes,
            "samples": list(DASHBOARD_TRAFFIC_HISTORY),
        }


def build_dashboard_snapshot(
    modem: dict[str, str],
    profiles: list[dict[str, Any]],
    esim_enabled: bool,
) -> dict[str, Any]:
    sim_info = get_modem_sim_info(modem)
    active_profile = next((profile for profile in profiles if profile.get("is_active")), None)
    interface_name = get_active_cellular_interface()
    ip_address = read_interface_ip(interface_name)
    access_tech = first_dashboard_value(modem.get("modem.generic.access-technologies.value[1]"))
    registration = first_dashboard_value(modem.get("modem.3gpp.registration-state"))
    operator_name = first_dashboard_value(modem.get("modem.3gpp.operator-name"))
    home_operator_name = first_dashboard_value(modem.get("direct.home-operator-name"))
    home_operator_code = first_dashboard_value(
        modem.get("direct.home-operator-code"),
        str(sim_info.get("sim.properties.imsi", ""))[:5],
    )

    return {
        "device": {
            "model": first_dashboard_value(modem.get("modem.generic.model")),
            "manufacturer": first_dashboard_value(modem.get("modem.generic.manufacturer")),
            "imei": first_dashboard_value(modem.get("modem.generic.equipment-identifier")),
            "iccid": first_dashboard_value(
                active_profile.get("iccid") if active_profile else "",
                sim_info.get("sim.properties.iccid"),
                sim_info.get("sim.identifier"),
            ),
            "operator": operator_name,
            "home_operator": home_operator_name,
            "home_operator_code": home_operator_code,
            "network_type": access_tech,
            "band": find_modem_band(modem),
            "ip_address": ip_address,
            "interface_name": interface_name,
            "roaming": registration == "roaming",
            "sim_label": active_profile.get("display_name") if active_profile and esim_enabled else "普通 SIM",
        },
        "traffic": dashboard_traffic_snapshot(interface_name),
    }


def profile_device_id(profile: dict[str, Any], fallback_device_id: str = "") -> str:
    return str(profile.get("device_id") or profile.get("modem_device_id") or fallback_device_id or "").strip()


def attach_profile_device_id(profiles: list[dict[str, Any]], device_id: str) -> list[dict[str, Any]]:
    return [{**profile, "device_id": profile_device_id(profile, device_id)} for profile in profiles]


def build_device_status(
    modem: dict[str, str],
    *,
    profiles: list[dict[str, Any]],
    lpac_installed: bool,
    primary_device_id: str,
) -> dict[str, Any]:
    device_id = modem_device_id(modem)
    sim_info = get_modem_sim_info(modem)
    device_profiles = [profile for profile in profiles if profile_device_id(profile, primary_device_id) == device_id]
    active_profile = next((profile for profile in device_profiles if profile.get("is_active")), None)
    interface_name = get_active_cellular_interface()
    registration = first_dashboard_value(modem.get("modem.3gpp.registration-state"))
    iccid = first_dashboard_value(
        active_profile.get("iccid") if active_profile else "",
        sim_info.get("sim.properties.iccid"),
        sim_info.get("sim.identifier"),
    )
    eid = first_dashboard_value(sim_info.get("sim.properties.eid"))
    has_euicc_hint = has_esim_capability_hint(modem, sim_info)
    esim_supported = bool(lpac_installed and (device_profiles or has_euicc_hint))
    if active_profile and active_profile.get("iccid") == iccid:
        active_sim_kind = "esim"
    elif has_euicc_hint:
        active_sim_kind = "esim"
    elif device_profiles:
        active_sim_kind = "unknown"
    else:
        active_sim_kind = "physical"
    signal_dbm = read_modem_signal_dbm(modem, device_id)

    return {
        "id": device_id,
        "source": first_dashboard_value(modem.get("linkhive.direct.source"), "direct_at") if first_dashboard_value(modem.get("linkhive.direct")) else "direct",
        "probe": {
            "port": first_dashboard_value(modem.get("linkhive.at_port")),
            "qmi_path": first_dashboard_value(modem.get("linkhive.qmi_path")),
        } if first_dashboard_value(modem.get("linkhive.direct")) else {},
        "label": " ".join(
            part
            for part in [
                first_dashboard_value(modem.get("modem.generic.manufacturer")),
                first_dashboard_value(modem.get("modem.generic.model")),
            ]
            if part
        )
        or device_id,
        "modem_path": first_dashboard_value(modem.get("linkhive.modem_path")),
        "modem_selector": first_dashboard_value(modem.get("linkhive.modem_selector")),
        "manufacturer": first_dashboard_value(modem.get("modem.generic.manufacturer")),
        "model": first_dashboard_value(modem.get("modem.generic.model")),
        "imei": first_dashboard_value(modem.get("modem.generic.equipment-identifier")),
        "number": first_dashboard_value(modem.get("modem.generic.own-numbers.value[1]")),
        "iccid": iccid,
        "imsi": first_dashboard_value(sim_info.get("sim.properties.imsi")),
        "eid": eid,
        "pin_state": "",
        "operator_name": first_dashboard_value(modem.get("modem.3gpp.operator-name")),
        "operator_code": first_dashboard_value(modem.get("modem.3gpp.operator-code")),
        "home_operator": first_dashboard_value(modem.get("direct.home-operator-name")),
        "home_operator_code": first_dashboard_value(
            modem.get("direct.home-operator-code"),
            str(sim_info.get("sim.properties.imsi", ""))[:5],
        ),
        "registration": registration,
        "state": first_dashboard_value(modem.get("modem.generic.state")),
        "signal": first_dashboard_value(modem.get("modem.generic.signal-quality.value")),
        "signal_dbm": signal_dbm,
        "access_tech": first_dashboard_value(modem.get("modem.generic.access-technologies.value[1]")),
        "current_modes": first_dashboard_value(modem.get("modem.generic.current-modes")),
        "band": find_modem_band(modem),
        "interface_name": interface_name,
        "ip_address": read_interface_ip(interface_name),
        "roaming": registration == "roaming",
        "sim_label": active_profile.get("display_name") if active_profile else ("普通 SIM" if active_sim_kind == "physical" else "SIM 类型未确认"),
        "active_sim_kind": active_sim_kind,
        "capabilities": {
            "sms_supported": True,
            "data_supported": True,
            "esim_supported": esim_supported,
            "lpac_supported": bool(lpac_installed and esim_supported),
        },
        "profiles": device_profiles,
        "connection": {
            "apn": "",
            "username": "",
            "password": "",
            "ip_type": "",
            "network_id": "",
        },
    }


def build_raw_probe_device(snapshot: dict[str, Any], lpac_installed: bool) -> dict[str, Any]:
    iccid = str(snapshot.get("iccid") or "").strip()
    imsi = str(snapshot.get("imsi") or "").strip()
    port = str(snapshot.get("port") or "").strip()
    device_id = f"raw-sim-{iccid}" if iccid else f"raw-port-{Path(port).name or uuid.uuid4().hex[:8]}"
    model = str(snapshot.get("model") or "").strip()
    manufacturer = str(snapshot.get("manufacturer") or "").strip()
    has_euicc_hint = (
        is_positive_capability_hint(snapshot.get("eid"))
        or is_positive_capability_hint(snapshot.get("euicc"))
        or known_euicc_hardware(manufacturer, model)
    )
    label = " ".join(part for part in [manufacturer, model] if part) or f"AT 设备 {Path(port).name}"

    return {
        "id": device_id,
        "source": "at_probe",
        "probe": {
            "port": port,
            "pin_state": str(snapshot.get("pin_state") or ""),
            "sim_present": bool(snapshot.get("sim_present")),
            "responses": snapshot.get("responses") if isinstance(snapshot.get("responses"), dict) else {},
        },
        "label": label,
        "modem_path": "",
        "modem_selector": "",
        "manufacturer": manufacturer,
        "model": model,
        "imei": "",
        "number": "",
        "iccid": iccid,
        "imsi": imsi,
        "eid": str(snapshot.get("eid") or "").strip(),
        "pin_state": str(snapshot.get("pin_state") or ""),
        "operator_name": "",
        "operator_code": "",
        "home_operator": str(
            snapshot.get("direct.home-operator-name")
            or operator_name_for_code(str(snapshot.get("operator_code") or ""))
        ),
        "home_operator_code": str(snapshot.get("direct.home-operator-code") or snapshot.get("operator_code") or ""),
        "registration": "probe-only",
        "state": "detected",
        "signal": "0",
        "signal_dbm": "--",
        "access_tech": "",
        "current_modes": "",
        "band": "",
        "interface_name": "",
        "ip_address": "",
        "roaming": False,
        "sim_label": "SIM 已识别" if snapshot.get("sim_present") else "未确认 SIM",
        "active_sim_kind": "esim" if has_euicc_hint else "unknown",
        "capabilities": {
            "sms_supported": False,
            "data_supported": False,
            "esim_supported": bool(lpac_installed and has_euicc_hint),
            "lpac_supported": bool(lpac_installed and has_euicc_hint),
        },
        "profiles": [],
        "connection": {
            "apn": "",
            "username": "",
            "password": "",
            "ip_type": "",
            "network_id": "",
        },
    }


def build_devices_snapshot(
    profiles: list[dict[str, Any]],
    lpac_installed: bool,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    modem_items = [(modem, error) for modem, error in enumerate_modem_infos(force_refresh=force_refresh) if modem and not error]
    if not modem_items:
        raw_items, _probe_error = probe_raw_sim_devices()
        return [build_raw_probe_device(item, lpac_installed) for item in raw_items]
    primary_device_id = modem_device_id(modem_items[0][0])
    return [
        build_device_status(modem, profiles=profiles, lpac_installed=lpac_installed, primary_device_id=primary_device_id)
        for modem, _error in modem_items
    ]


def device_status_for_id(device_id: str = "", force_refresh: bool = False) -> dict[str, Any]:
    modem, _modem_error = get_modem_info(device_id, force_refresh=force_refresh)
    sim_info = get_modem_sim_info(modem) if modem else {}
    cached_profiles, _cache_error = get_profile_cache_snapshot()
    profiles = cached_profiles if has_esim_capability_hint(modem, sim_info) else []
    devices = build_devices_snapshot(profiles, os.path.exists("/opt/lpac/lpac"), force_refresh=force_refresh)
    if not devices:
        return {}
    target = str(device_id or "").strip()
    if target:
        return next((device for device in devices if device.get("id") == target), {})
    return devices[0]


def infer_apn_defaults_from_connection(apn: str, username: str = "") -> Optional[dict[str, str]]:
    for value in PROFILE_APN_DEFAULTS.values():
        if value["apn"] == apn and (not value["username"] or value["username"] == username):
            return value
    return None


def modem_network_ready(modem: dict[str, str]) -> bool:
    registration = str(modem.get("modem.3gpp.registration-state", "")).strip().lower()
    state = str(modem.get("modem.generic.state", "")).strip().lower()
    signal = parse_signal_value(modem.get("modem.generic.signal-quality.value", "0"))
    return signal > 0 and (
        registration in {"home", "roaming", "registered"}
        or state in {"registered", "connected"}
    )


def wait_for_modem_network_ready(
    ctx: ActionContext,
    *,
    device_id: str = "",
    timeout_seconds: int = KEEPALIVE_NETWORK_WAIT_SECONDS,
    poll_seconds: int = KEEPALIVE_NETWORK_POLL_SECONDS,
) -> tuple[bool, str]:
    deadline = time.time() + timeout_seconds
    last_state = ""
    while time.time() < deadline:
        modem, modem_error = get_modem_info(device_id)
        if modem_error:
            current_state = f"error:{modem_error}"
            if current_state != last_state:
                ctx.log(f"等待网络注册：{modem_error}", "warning")
                last_state = current_state
            time.sleep(poll_seconds)
            continue

        operator_name = modem.get("modem.3gpp.operator-name", "--")
        registration = modem.get("modem.3gpp.registration-state", "--")
        signal = parse_signal_value(modem.get("modem.generic.signal-quality.value", "0"))
        current_state = f"{operator_name}|{registration}|{signal}"
        if modem_network_ready(modem):
            ctx.log(f"网络已可用：{operator_name} / {registration} / 信号 {signal}%")
            return True, ""
        if current_state != last_state:
            ctx.log(f"等待网络注册：{operator_name} / {registration} / 信号 {signal}%")
            last_state = current_state
        time.sleep(poll_seconds)
    return False, f"等待网络可用超时，已等待 {timeout_seconds} 秒"


def send_sms_message(
    ctx: ActionContext,
    number: str,
    text: str,
    *,
    device_id: str = "",
    success_message: str,
    failure_prefix: str,
) -> None:
    ctx.log(f"通过直连基带发送短信：{number}")
    try:
        send_sms_via_at(number, text, device_id)
    except Exception as exc:
        raise RuntimeError(f"{failure_prefix}{exc}") from exc
    ctx.log(success_message)


def send_keepalive_sms(ctx: ActionContext, number: str, text: str, device_id: str = "") -> None:
    send_sms_message(
        ctx,
        number,
        text,
        device_id=device_id,
        success_message="保活短信已发送",
        failure_prefix="发送保活短信失败：",
    )


def keepalive_notification_payload(
    task: dict[str, Any],
    *,
    profile_name: str,
    trigger: str,
    scheduled_for: str,
    success: bool,
    attempts: int,
    detail: str,
    original_profile_name: str,
) -> tuple[str, str]:
    title = f"{'保活成功' if success else '保活失败'}：{task['label']}"
    lines = [
        f"任务：{task['label']}",
        f"触发方式：{'定时' if trigger == 'schedule' else '手动'}",
        f"目标 Profile：{profile_name}",
        f"目标号码：{task['target_number']}",
        f"执行时间：{format_beijing_timestamp(scheduled_for) if scheduled_for else format_beijing_timestamp(datetime.now(timezone.utc).isoformat())}",
        f"尝试次数：{attempts}",
        f"结果：{'成功' if success else '失败'}",
        f"原始 Profile：{original_profile_name or '未知'}",
    ]
    if detail:
        lines.append(f"详情：{detail}")
    return title, "\n".join(lines)


def notify_keepalive_result(
    ctx: ActionContext,
    task: dict[str, Any],
    *,
    profile_name: str,
    trigger: str,
    scheduled_for: str,
    success: bool,
    attempts: int,
    detail: str,
    original_profile_name: str,
) -> None:
    config = read_env_config(NOTIFICATION_CONFIG_PATH)
    targets = load_notification_targets(config)
    labels = configured_channel_labels(targets)
    if not labels:
        ctx.log("未配置任何启用的通知渠道，已跳过保活结果通知", "warning")
        return
    title, body = keepalive_notification_payload(
        task,
        profile_name=profile_name,
        trigger=trigger,
        scheduled_for=scheduled_for,
        success=success,
        attempts=attempts,
        detail=detail,
        original_profile_name=original_profile_name,
    )
    try:
        ctx.log(f"准备发送保活结果通知：{'、'.join(labels)}")
        delivered_labels = send_apprise_notification(targets, title, body)
        ctx.log(f"保活结果通知已发送到：{'、'.join(delivered_labels)}")
    except Exception as exc:
        ctx.log(f"保活结果通知发送失败：{exc}", "warning")


def get_status(refresh_profiles: bool = False, refresh_devices: bool = False) -> dict[str, Any]:
    global PROFILE_CACHE_ERROR
    status_message = ""
    errors: list[str] = []
    notification_config = read_env_config(NOTIFICATION_CONFIG_PATH)
    notification_targets = load_notification_targets(notification_config)
    configured_targets = configured_notification_targets(notification_targets)
    lpac_installed = os.path.exists("/opt/lpac/lpac")
    esim_enabled = False
    current_sim_type = sim_type()
    connection = get_connection_info()
    connection_defaults = infer_apn_defaults_from_connection(
        "" if connection.get("gsm.apn", "") == "--" else connection.get("gsm.apn", ""),
        "" if connection.get("gsm.username", "") == "--" else connection.get("gsm.username", ""),
    )

    modem, modem_error = get_modem_info(force_refresh=refresh_devices)
    if modem_error:
        status_message = "基带当前离线或正在重连，稍等片刻后再刷新。"
        if not is_transient_modem_error(modem_error):
            errors.append(modem_error)

    sim_info_for_profile_probe = get_modem_sim_info(modem) if modem else {}
    has_euicc_hint = has_esim_capability_hint(modem, sim_info_for_profile_probe) if modem else False
    cached_profiles, _cache_error = get_profile_cache_snapshot()
    profiles = cached_profiles if has_euicc_hint else []
    should_read_profiles = bool(lpac_installed and has_euicc_hint and modem_ready_for_esim_profile_probe(modem))

    if should_read_profiles:
        try:
            profiles = refresh_profile_cache(force=True) if refresh_profiles else get_cached_profiles()[0]
        except Exception as exc:
            profiles = cached_profiles
            with PROFILE_CACHE_LOCK:
                PROFILE_CACHE_ERROR = str(exc)
    else:
        profiles = []
        clear_profile_cache_error()

    try:
        profiles = attach_profile_smsc_config(profiles)
    except Exception as exc:
        errors.append(str(exc))

    primary_device_id = modem_device_id(modem) if modem else ""
    profiles = attach_profile_device_id(profiles, primary_device_id)
    devices = build_devices_snapshot(profiles, lpac_installed, force_refresh=refresh_devices)
    esim_enabled = any(device.get("capabilities", {}).get("esim_supported") for device in devices)
    if devices:
        current_sim_type = str(devices[0].get("active_sim_kind") or current_sim_type)

    try:
        dashboard = build_dashboard_snapshot(modem, profiles, esim_enabled)
    except Exception as exc:
        dashboard = {
            "device": {
                "model": "",
                "manufacturer": "",
                "imei": "",
                "iccid": "",
                "operator": "",
                "home_operator": "",
                "home_operator_code": "",
                "network_type": "",
                "band": "",
                "ip_address": "",
                "interface_name": "",
                "roaming": False,
                "sim_label": "普通 SIM" if not esim_enabled else "",
            },
            "traffic": {
                "today_upload_bytes": 0,
                "today_download_bytes": 0,
                "today_total_bytes": 0,
                "samples": [],
            },
        }
        errors.append(f"读取仪表盘扩展状态失败：{exc}")

    signal_dbm = read_modem_signal_dbm(modem)

    ims_status = cached_ims_status(modem, modem_error)

    sms_messages: list[dict[str, str]] = []
    sms_errors: list[str] = []
    if devices:
        for device in devices:
            if not device_ready_for_sms_read(device):
                continue
            device_messages, sms_error = cached_list_sms(str(device.get("id", "")))
            if sms_error:
                if not is_transient_modem_error(sms_error):
                    sms_errors.append(f"{device.get('label') or device.get('id')}：{sms_error}")
                continue
            sms_messages.extend(device_messages)
    elif not modem_error:
        sms_messages, sms_error = cached_list_sms("")
        if sms_error and not is_transient_modem_error(sms_error):
            sms_errors.append(sms_error)
    if sms_errors:
        if not status_message:
            status_message = "暂时拿不到部分短信列表，可能是基带还在重新注册。"
        errors.extend(sms_errors)
    sms_messages.sort(key=lambda item: int(item.get("id") or "0"), reverse=True)
    sms_storage = cached_sms_storage_counts(modem, len(sms_messages))
    # KPI 展示以当前可读取的短信列表为准，避免 ME/SM 存储计数重复相加。
    sms_storage["readable_count"] = len(sms_messages)

    try:
        keepalive = keepalive_status_snapshot(profiles, devices)
    except Exception as exc:
        keepalive = {
            "settings": normalize_keepalive_settings({}),
            "tasks": [],
            "active_run": None,
            "queued_runs": [],
            "recent_runs": [],
            "next_allowed_at": "",
        }
        errors.append(f"读取保活配置失败：{exc}")

    connection_payload = {
        "apn": "" if connection.get("gsm.apn", "") == "--" else connection.get("gsm.apn", ""),
        "username": "" if connection.get("gsm.username", "") == "--" else connection.get("gsm.username", ""),
        "password": (
            ""
            if connection.get("gsm.password", "") in {"--", "<hidden>"}
            else connection.get("gsm.password", "")
        ),
        "ip_type": connection_defaults["ip_type"] if connection_defaults else "",
        "network_id": "" if connection.get("gsm.network-id", "") == "--" else connection.get("gsm.network-id", ""),
    }
    if devices:
        devices[0]["connection"] = connection_payload

    return {
        "profiles": profiles,
        "devices": devices,
        "capabilities": {
            "sim_type": current_sim_type,
            "esim_management_enabled": esim_enabled,
            "lpac_installed": lpac_installed,
        },
        "modem_available": not modem_error,
        "status_message": status_message,
        "errors": errors,
        "modem": {
            "number": modem.get("modem.generic.own-numbers.value[1]", "--"),
            "operator_code": modem.get("modem.3gpp.operator-code", "--"),
            "operator_name": modem.get("modem.3gpp.operator-name", "--"),
            "registration": modem.get("modem.3gpp.registration-state", "--"),
            "state": modem.get("modem.generic.state", "--"),
            "signal": modem.get("modem.generic.signal-quality.value", "--"),
            "signal_dbm": signal_dbm,
            "access_tech": modem.get("modem.generic.access-technologies.value[1]", "--"),
            "current_modes": modem.get("modem.generic.current-modes", "--"),
            "apn": modem.get("modem.3gpp.eps.initial-bearer.settings.apn", "--"),
            "ip_type": modem.get("modem.3gpp.eps.initial-bearer.settings.ip-type", "--"),
            "ims_supported": ims_status["ims_supported"],
            "volte_enabled": ims_status["volte_enabled"],
            "volte_supported": ims_status.get("volte_supported", True),
            "vowifi_enabled": ims_status["vowifi_enabled"],
            "vowifi_supported": ims_status.get("vowifi_supported", False),
        },
        "sms_storage": sms_storage,
        "connection": connection_payload,
        "dashboard": dashboard,
        "services": {
            "modemmanager": "active" if not modem_error else "inactive",
            "sms_forwarder": service_state(SMS_FORWARDER_SERVICE),
            "web_admin": service_state("linkhive-admin.service"),
        },
        "notifications": {
            "configured_count": len(configured_targets),
            "configured_labels": configured_channel_labels(configured_targets),
            "targets": notification_targets,
        },
        "keepalive": keepalive,
        "sms": sms_messages,
        "timestamp": format_beijing_timestamp(datetime.now(timezone.utc).isoformat()),
    }


def cleanup_actions() -> None:
    cutoff = time.time() - ACTION_RETENTION_SECONDS
    with ACTIONS_LOCK:
        stale_ids = [
            action_id
            for action_id, record in ACTIONS.items()
            if record["updated_at"] < cutoff and record["state"] in {"done", "error"}
        ]
        for action_id in stale_ids:
            ACTIONS.pop(action_id, None)


def append_action_event(action_id: str, level: str, message: str) -> None:
    with ACTIONS_LOCK:
        record = ACTIONS.get(action_id)
        if not record:
            return
        record["events"].append({"time": time_label_now(), "level": level, "message": message})
        if len(record["events"]) > ACTION_MAX_EVENTS:
            record["events"] = record["events"][-ACTION_MAX_EVENTS:]
        record["updated_at"] = time.time()


def set_action_state(action_id: str, state: str, **extra: Any) -> None:
    with ACTIONS_LOCK:
        record = ACTIONS.get(action_id)
        if not record:
            return
        record["state"] = state
        record["updated_at"] = time.time()
        for key, value in extra.items():
            record[key] = value


class ActionContext:
    def __init__(self, action_id: str):
        self.action_id = action_id
        self.messages: list[str] = []

    def log(self, message: str, level: str = "info") -> None:
        self.messages.append(message)
        append_action_event(self.action_id, level, message)

    def command(self, args: list[str]) -> None:
        self.log(f"$ {format_command(args)}", "command")

    def sleep(self, seconds: int, reason: str) -> None:
        self.log(f"{reason}（等待 {seconds} 秒）")
        time.sleep(seconds)

    def summary(self) -> str:
        return "\n".join(self.messages)


def run_logged_command(
    ctx: ActionContext,
    args: list[str],
    *,
    check: bool = True,
    success_message: str = "",
    failure_prefix: str = "",
    env: Optional[dict[str, str]] = None,
) -> subprocess.CompletedProcess[str]:
    ctx.command(args)
    result = run_command(args, check=False, env=env)
    output = command_output_text(result)
    if output:
        for line in output.splitlines():
            ctx.log(line)
    if result.returncode != 0 and check:
        raise RuntimeError(f"{failure_prefix}{output or '命令执行失败'}")
    if success_message:
        ctx.log(success_message)
    return result


def recover_modem(ctx: ActionContext, payload: Optional[dict[str, Any]] = None) -> None:
    device_id = str((payload or {}).get("device_id", "")).strip()
    ctx.log("开始恢复基带")
    modem, modem_error = get_modem_info(device_id)
    if modem_error:
        ctx.log(f"当前还无法读取基带状态：{modem_error}", "warning")
    else:
        ctx.log("直连基带探测完成")
        ctx.log(
            "当前注册状态："
            f"{modem.get('modem.3gpp.operator-name', '--')} / "
            f"{modem.get('modem.3gpp.operator-code', '--')} / "
            f"{modem.get('modem.3gpp.registration-state', '--')}"
        )
    run_logged_command(
        ctx,
        ["systemctl", "restart", SMS_FORWARDER_SERVICE],
        check=False,
        success_message="短信转发服务已尝试重启",
    )


def apply_apn_settings(ctx: ActionContext, payload: dict[str, Any]) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    apn = str(payload.get("apn", "")).strip()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()
    ip_type = str(payload.get("ip_type", "ipv4v6")).strip() or "ipv4v6"

    ctx.log("开始保存 APN 配置")
    modem, modem_error = get_modem_info(device_id)
    at_port = first_dashboard_value(modem.get("linkhive.at_port"))
    if modem_error or not at_port:
        raise RuntimeError(f"无法读取 AT 端口：{modem_error or '未上报'}")
    pdp_type = {"ipv4": "IP", "ipv6": "IPV6", "ipv4v6": "IPV4V6"}.get(ip_type, "IPV4V6")
    output = at_command(at_port, f'AT+CGDCONT=1,"{pdp_type}","{apn}"', 2.0)
    if "ERROR" in output:
        raise RuntimeError(f"保存 APN 失败：{output.strip() or '未知错误'}")
    ctx.log("APN 已通过 AT+CGDCONT 写入")

    run_logged_command(
        ctx,
        [
            "nmcli",
            "connection",
            "modify",
            "modem",
            "gsm.apn",
            apn,
            "gsm.username",
            username,
            "gsm.password",
            password,
            "gsm.auto-config",
            "no",
            "ipv4.method",
            "auto",
            "ipv6.method",
            "auto",
        ],
        success_message="NetworkManager 的 modem 连接已更新",
    )


def switch_profile(ctx: ActionContext, payload: dict[str, Any], *, schedule_gap_after: bool = True) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    device = device_status_for_id(device_id)
    if not device.get("capabilities", {}).get("esim_supported"):
        raise RuntimeError("目标设备不支持 eSIM 管理")

    iccid = str(payload.get("iccid", "")).strip()
    if not iccid:
        raise ValueError("缺少 ICCID")

    profile_name = f"Profile {iccid[-6:]}" if len(iccid) >= 6 else iccid
    try:
        profile = get_profile_by_iccid(iccid)
        profile_name = profile.get("display_name", profile_name)
    except Exception as exc:
        ctx.log(f"预读取 Profile 列表失败，改为直接按 ICCID 切换：{exc}", "warning")

    ctx.log(f"准备切换到 {profile_name}")
    result = run_logged_command(
        ctx,
        ["/usr/local/bin/lpac-switch", "enable", iccid],
        check=False,
    )
    payload_json = parse_lpac_json(result.stdout) if result.stdout else {"code": -1, "message": command_output_text(result)}
    if payload_json.get("code") != 0:
        raise RuntimeError(payload_json.get("message", "切换 eSIM 失败"))
    if payload_json.get("message"):
        ctx.log(str(payload_json["message"]))
    ctx.log("切卡命令已下发，继续恢复基带")
    recover_modem(ctx, {"device_id": device_id})
    try:
        refresh_profile_cache(force=True)
        ctx.log("eSIM Profiles 缓存已更新")
    except Exception as exc:
        ctx.log(f"刷新 eSIM Profiles 缓存失败：{exc}", "warning")
    try:
        if apply_profile_smsc_if_configured(ctx, iccid, device_id=device_id):
            ctx.log(f"{profile_name} 的短信中心已自动恢复")
        else:
            ctx.log(f"{profile_name} 未配置短信中心恢复规则，已跳过")
    except Exception as exc:
        raise RuntimeError(f"Profile 切换完成，但应用短信中心失败：{exc}") from exc
    if schedule_gap_after:
        schedule_keepalive_gap()
    ctx.log(f"{profile_name} 切换完成")


def lpac_runtime_env(device: dict[str, Any], apdu_mode: str) -> dict[str, str]:
    env = os.environ.copy()
    env["LPAC_APDU"] = apdu_mode
    env["LPAC_HTTP"] = "curl"
    qmi_lib_path = "/opt/libqmi-1.36.0/lib/x86_64-linux-gnu"
    if os.path.isdir(qmi_lib_path):
        current_library_path = env.get("LD_LIBRARY_PATH", "")
        env["LD_LIBRARY_PATH"] = f"{qmi_lib_path}:{current_library_path}" if current_library_path else qmi_lib_path
    probe = device.get("probe") if isinstance(device.get("probe"), dict) else {}
    qmi_device = str(probe.get("qmi_path") or "").strip()
    if not qmi_device:
        modem, _error = get_modem_info(str(device.get("id") or ""))
        qmi_device = first_dashboard_value(modem.get("linkhive.qmi_path"))
    if not qmi_device:
        qmi_device = find_qmi_device_path() or ""
    if qmi_device:
        env["LPAC_APDU_QMI_DEVICE"] = qmi_device
    at_port = str(probe.get("port") or "").strip()
    if not at_port:
        modem, _error = get_modem_info(str(device.get("id") or ""))
        at_ports = modem_at_ports(modem)
        at_port = at_ports[0] if at_ports else ""
    if at_port:
        env["LPAC_APDU_AT_DEVICE"] = at_port
    return env


def download_esim_profile(ctx: ActionContext, payload: dict[str, Any]) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    activation_code = str(payload.get("activation_code", "")).strip()
    confirmation_code = str(payload.get("confirmation_code", "")).strip()
    apdu_mode = str(payload.get("apdu_mode", "qmi")).strip() or "qmi"
    if apdu_mode not in {"qmi", "at"}:
        raise ValueError("写入通道只支持 qmi 或 at")
    if not activation_code:
        raise ValueError("缺少 SM-DP+ 激活码")
    if not os.path.exists("/opt/lpac/lpac"):
        raise RuntimeError("未检测到 /opt/lpac/lpac，请先完成 lpac 部署后再写入 eSIM Profile")

    device = device_status_for_id(device_id)
    if not device:
        raise RuntimeError("未找到目标设备")

    ctx.log(f"准备向 {device.get('label') or device_id or '当前设备'} 写入 eSIM Profile")
    ctx.log(f"写入通道：{apdu_mode}")
    env = lpac_runtime_env(device, apdu_mode)
    if env.get("LPAC_APDU_AT_DEVICE"):
        ctx.log(f"AT 设备：{env['LPAC_APDU_AT_DEVICE']}")
    if env.get("LPAC_APDU_QMI_DEVICE"):
        ctx.log(f"QMI 设备：{env['LPAC_APDU_QMI_DEVICE']}")

    args = ["/usr/local/bin/lpac-switch", "download", activation_code]
    if confirmation_code:
        args.append(confirmation_code)
    result = run_logged_command(ctx, args, check=False, env=env)
    payload_json: dict[str, Any]
    if result.stdout.strip().startswith("{"):
        try:
            payload_json = parse_lpac_json(result.stdout)
        except Exception:
            payload_json = {"code": result.returncode, "message": command_output_text(result)}
    else:
        payload_json = {"code": result.returncode, "message": command_output_text(result)}
    if result.returncode != 0 or int(payload_json.get("code", result.returncode) or 0) != 0:
        raise RuntimeError(str(payload_json.get("message") or command_output_text(result) or "eSIM Profile 写入失败"))

    ctx.log("eSIM Profile 下载/写入命令已完成")
    try:
        refresh_profile_cache(force=True)
        ctx.log("eSIM Profiles 缓存已刷新")
    except Exception as exc:
        ctx.log(f"刷新 eSIM Profiles 失败：{exc}", "warning")
    ctx.log("建议等待 10-20 秒后刷新设备状态，确认新 Profile 是否出现")


def save_notifications_config(ctx: ActionContext, payload: dict[str, Any]) -> None:
    raw_targets = payload.get("targets", [])
    if not isinstance(raw_targets, list):
        raise ValueError("通知渠道配置格式不正确")

    sanitized_targets: list[dict[str, Any]] = []
    for raw_target in raw_targets:
        if not isinstance(raw_target, dict):
            continue
        label = str(raw_target.get("label", "")).strip()
        url = str(raw_target.get("url", "")).strip()
        enabled_raw = raw_target.get("enabled", True)
        if isinstance(enabled_raw, bool):
            enabled = enabled_raw
        else:
            enabled = str(enabled_raw).strip().lower() not in {"0", "false", "no", "off", ""}
        if not label and not url:
            continue
        if enabled and not url:
            raise ValueError("启用中的通知渠道必须填写 Apprise URL")
        sanitized_targets.append(normalize_notification_target(raw_target))

    if not sanitized_targets:
        raise ValueError("请至少保留一个通知渠道")
    if not configured_channel_labels(sanitized_targets):
        raise ValueError("请至少启用一个通知渠道")

    config = ensure_notification_config(read_env_config(NOTIFICATION_CONFIG_PATH))
    save_notification_targets_in_config(config, sanitized_targets)
    write_env_config(NOTIFICATION_CONFIG_PATH, config)
    ctx.log(f"通知渠道配置已写入：{'、'.join(configured_channel_labels(sanitized_targets))}")
    run_logged_command(
        ctx,
        ["systemctl", "restart", SMS_FORWARDER_SERVICE],
        check=False,
        success_message="短信转发服务已重启",
    )


def save_keepalive_settings(ctx: ActionContext, payload: dict[str, Any]) -> None:
    raw_settings = payload.get("settings", {})
    raw_tasks = payload.get("tasks", [])
    if raw_settings is None:
        raw_settings = {}
    if not isinstance(raw_settings, dict):
        raise ValueError("保活设置格式不正确")
    if not isinstance(raw_tasks, list):
        raise ValueError("保活任务格式不正确")

    normalized_settings, normalized_tasks = save_keepalive_config(raw_settings, raw_tasks)
    enabled_count = sum(1 for task in normalized_tasks if task["enabled"])
    ctx.log(
        f"保活设置已写入：{len(normalized_tasks)} 条任务，"
        f"启用 {enabled_count} 条，切卡缓冲 {normalized_settings['queue_gap_seconds']} 秒"
    )


def update_sim_mode(ctx: ActionContext, payload: dict[str, Any]) -> None:
    next_sim_type = normalize_sim_type(payload.get("sim_type") or payload.get("mode"))
    set_sim_type(next_sim_type)
    if next_sim_type == "esim":
        ctx.log("已切换到 eSIM 模式，普通 SIM 模式自动关闭")
        if not os.path.exists("/opt/lpac/lpac"):
            ctx.log("未检测到 /opt/lpac/bin/lpac，eSIM Profile 读取与切卡可能不可用", "warning")
    else:
        ctx.log("已切换到普通 SIM 模式，eSIM 管理自动关闭")


def restart_sms_service(ctx: ActionContext) -> None:
    run_logged_command(
        ctx,
        ["systemctl", "restart", SMS_FORWARDER_SERVICE],
        success_message="短信转发服务已重启",
    )


def send_test_sms(ctx: ActionContext, payload: dict[str, Any]) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    number = str(payload.get("number", "")).strip()
    message = str(payload.get("message", "")).strip()
    if not number:
        raise ValueError("缺少测试短信目标号码")
    if not message:
        raise ValueError("缺少测试短信内容")

    ctx.log(f"开始发送测试短信到：{number}")
    device = device_status_for_id(device_id)
    if device.get("capabilities", {}).get("esim_supported"):
        profiles = refresh_profile_cache(force=True)
        active_profile = active_profile_from_list(profiles)
        active_iccid = str(active_profile.get("iccid", "")).strip()
        if active_iccid:
            if apply_profile_smsc_if_configured(ctx, active_iccid, device_id=device_id):
                ctx.log("已按当前 Profile 自动应用短信中心")
            else:
                ctx.log("当前 Profile 未配置短信中心，继续按基带现有配置发送")
    ready, detail = wait_for_modem_network_ready(ctx, device_id=device_id, timeout_seconds=45, poll_seconds=5)
    if not ready:
        raise RuntimeError(detail)

    for line in message.splitlines():
        ctx.log(line)

    send_sms_message(
        ctx,
        number,
        message,
        device_id=device_id,
        success_message="测试短信已发送",
        failure_prefix="发送测试短信失败：",
    )


def query_current_smsc(ctx: ActionContext, device_id: str = "") -> Optional[tuple[str, str]]:
    modem, _modem_error = get_modem_info(device_id)
    at_port = first_dashboard_value(modem.get("linkhive.at_port"))
    if not at_port:
        return None
    output = at_command(at_port, "AT+CSCA?", 2.0)
    match = re.search(r'\+CSCA:\s*"([^"]+)"\s*,\s*(\d+)', output)
    return (match.group(1), match.group(2)) if match else None


def smsc_matches_target(current: Optional[tuple[str, str]], target_address: str, target_type: str) -> bool:
    if not current:
        return False
    return normalize_smsc_address(current[0]) == target_address and normalize_smsc_type(current[1]) == target_type


def apply_smsc_value(ctx: ActionContext, smsc_address: str, smsc_type: str, device_id: str = "") -> None:
    address = normalize_smsc_address(smsc_address)
    smsc_kind = normalize_smsc_type(smsc_type)
    current_before = query_current_smsc(ctx, device_id)
    if smsc_matches_target(current_before, address, smsc_kind):
        ctx.log(f"当前短信中心已是目标值：{address},{smsc_kind}，跳过重复写入")
        return

    ctx.log(f"准备应用短信中心：{address},{smsc_kind}")
    modem, modem_error = get_modem_info(device_id)
    at_port = first_dashboard_value(modem.get("linkhive.at_port"))
    if modem_error or not at_port:
        raise RuntimeError(f"无法读取 AT 端口：{modem_error or '未上报'}")
    output = at_command(at_port, f'AT+CSCA="{address}",{smsc_kind}', 2.0)
    if "ERROR" in output:
        raise RuntimeError(f"短信中心写入失败：{output.strip() or '未知错误'}")
    queried = query_current_smsc(ctx, device_id)
    if not smsc_matches_target(queried, address, smsc_kind):
        raise RuntimeError("短信中心写入后校验失败")
    ctx.log("短信中心已写入")


def apply_profile_smsc_if_configured(ctx: ActionContext, iccid: str, device_id: str = "") -> bool:
    smsc_mapping = load_profile_smsc_config()
    item = smsc_mapping.get(str(iccid or "").strip())
    if not item:
        return False
    apply_smsc_value(ctx, item["address"], item["type"], device_id)
    return True


def save_profile_smsc(ctx: ActionContext, payload: dict[str, Any]) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    iccid = str(payload.get("iccid", "")).strip()
    smsc_address = normalize_smsc_address(payload.get("smsc_address", ""))
    smsc_type = normalize_smsc_type(payload.get("smsc_type", "145"))
    apply_now = bool(payload.get("apply_now", True))
    if not iccid:
        raise ValueError("缺少 ICCID")

    profile = get_profile_by_iccid(iccid)
    profile_name = str(profile.get("display_name") or profile_display_name(profile)).strip() or iccid
    smsc_mapping = load_profile_smsc_config()
    if smsc_address:
        smsc_mapping[iccid] = {"address": smsc_address, "type": smsc_type}
    else:
        smsc_mapping.pop(iccid, None)
    save_profile_smsc_config(smsc_mapping)
    if not smsc_address:
        ctx.log(f"已清除 {profile_name} 的短信中心关联")
        return

    ctx.log(f"已为 {profile_name} 保存短信中心：{smsc_address},{smsc_type}")

    profiles = refresh_profile_cache(force=True)
    active_profile = active_profile_from_list(profiles)
    active_iccid = str(active_profile.get("iccid", "")).strip()
    if apply_now and active_iccid == iccid:
        apply_smsc_value(ctx, smsc_address, smsc_type, device_id)
        return
    if active_iccid == iccid:
        ctx.log("当前 Profile 正在使用，短信中心已保存，下次切卡后会自动重新应用")
        return
    ctx.log("目标 Profile 当前未启用，已保存关联；切换到该 Profile 后会自动应用短信中心")


def apply_radio_mode(ctx: ActionContext, payload: dict[str, Any]) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    mode = str(payload.get("mode", "")).strip()
    modem, modem_error = get_modem_info(device_id)
    at_port = first_dashboard_value(modem.get("linkhive.at_port"))
    if modem_error or not at_port:
        raise RuntimeError(f"无法读取 AT 端口：{modem_error or '未上报'}")
    at_modes = {
        "4g_only": ('AT+QCFG="nwscanmode",3,1', "仅 4G"),
        "3g4g_prefer4g": ('AT+QCFG="nwscanmode",0,1', "自动，优先当前网络策略"),
        "3g_only": ('AT+QCFG="nwscanmode",2,1', "仅 3G"),
    }
    if mode not in at_modes:
        raise ValueError("不支持的制式选项")
    command, label = at_modes[mode]
    output = at_command(at_port, command, 2.0)
    if "ERROR" in output:
        raise RuntimeError(f"切换网络制式失败：{output.strip() or '未知错误'}")
    ctx.log(f"网络制式已切换到 {label}")


def apply_network_selection(ctx: ActionContext, payload: dict[str, Any]) -> None:
    device_id = str(payload.get("device_id", "")).strip()
    operator_code = str(payload.get("operator_code", "")).strip()
    modem, modem_error = get_modem_info(device_id)
    at_port = first_dashboard_value(modem.get("linkhive.at_port"))
    if modem_error or not at_port:
        raise RuntimeError(f"无法读取 AT 端口：{modem_error or '未上报'}")
    command = "AT+COPS=0" if not operator_code else f'AT+COPS=1,2,"{operator_code}"'
    output = at_command(at_port, command, 8.0)
    if "ERROR" in output:
        raise RuntimeError(f"选网失败：{output.strip() or '未知错误'}")
    ctx.log("已切回自动选网" if not operator_code else f"已请求注册到运营商 {operator_code}")
    ctx.sleep(5, "等待选网结果")
    modem, modem_error = get_modem_info(device_id)
    if modem_error:
        ctx.log(f"当前无法读取注册状态：{modem_error}", "warning")
        return
    ctx.log(
        "当前注册状态："
        f"{modem.get('modem.3gpp.operator-name', '--')} / "
        f"{modem.get('modem.3gpp.operator-code', '--')} / "
        f"{modem.get('modem.3gpp.registration-state', '--')}"
    )


def apply_ims_settings(ctx: ActionContext, payload: dict[str, Any]) -> None:
    """Enable/disable VoLTE and VoWiFi via AT commands."""
    device_id = str(payload.get("device_id", "")).strip()
    volte = payload.get("volte_enabled")
    vowifi = payload.get("vowifi_enabled")

    modem, modem_error = get_modem_info(device_id)
    if modem_error:
        raise RuntimeError(f"无法读取基带信息：{modem_error}")

    ports = modem_at_ports(modem)
    if not ports:
        raise RuntimeError("未找到可用的 AT 端口")

    port_path = ports[0]
    changes_made = False

    if volte is not None:
        volte_val = "1" if volte else "0"
        ctx.log(f"设置 VoLTE: {'开启' if volte else '关闭'}")
        response = run_at_command(port_path, f'AT+QCFG="ims",{volte_val}', 2.0)
        if "OK" in response:
            ctx.log("VoLTE 设置成功")
            changes_made = True
        elif "ERROR" in response:
            ctx.log(f"VoLTE 设置失败：{response.strip()}", "warning")
        else:
            ctx.log(f"VoLTE 响应：{response.strip()}", "warning")

    if vowifi is not None:
        vowifi_val = "1" if vowifi else "0"
        ctx.log(f"设置 VoWiFi: {'开启' if vowifi else '关闭'}")
        # VoWiFi mode: 1=cellular preferred, 2=wifi preferred, 3=wifi only
        vowifi_mode = "1" if vowifi else ""
        cmd = f'AT+QCFG="vowifi",{vowifi_val},{vowifi_mode}' if vowifi else f'AT+QCFG="vowifi",{vowifi_val}'
        response = run_at_command(port_path, cmd, 2.0)
        if "OK" in response:
            ctx.log("VoWiFi 设置成功")
            changes_made = True
        elif "ERROR" in response:
            ctx.log(f"VoWiFi 设置失败：{response.strip()}", "warning")
        else:
            ctx.log(f"VoWiFi 响应：{response.strip()}", "warning")

    if changes_made:
        # Persist to config for reapply after modem restart
        config = app_runtime_config()
        if volte is not None:
            config["VOLTE_ENABLED"] = "1" if volte else "0"
        if vowifi is not None:
            config["VOWIFI_ENABLED"] = "1" if vowifi else "0"
        write_env_config(APP_CONFIG_PATH, config)
        ctx.log("IMS 配置已持久化到 linkhive.conf")

        ctx.log("等待基带重新注册网络")
        recover_modem(ctx, {"device_id": device_id})
        ctx.sleep(10, "等待基带重新注册网络")

        modem, modem_error = get_modem_info(device_id)
        if modem_error:
            ctx.log(f"当前还无法读取基带状态：{modem_error}", "warning")
        else:
            ctx.log(
                "当前注册状态："
                f"{modem.get('modem.3gpp.operator-name', '--')} / "
                f"{modem.get('modem.3gpp.operator-code', '--')} / "
                f"{modem.get('modem.3gpp.registration-state', '--')}"
            )
    else:
        ctx.log("未做任何更改", "warning")


def run_keepalive_task(ctx: ActionContext, payload: dict[str, Any]) -> None:
    task_id = str(payload.get("task_id", "")).strip()
    if not task_id:
        raise ValueError("缺少保活任务 ID")

    settings, tasks = load_keepalive_config()
    task = next((item for item in tasks if item["id"] == task_id), None)
    if not task:
        raise RuntimeError("保活任务不存在或已删除")
    device_id = str(task.get("device_id", "") or payload.get("device_id", "")).strip()
    if not device_id:
        raise RuntimeError("保活任务未绑定设备，请先在短信保活页面选择设备")
    device = device_status_for_id(device_id)
    if not device:
        raise RuntimeError("保活任务绑定的设备当前不可用")

    is_esim = bool(device.get("capabilities", {}).get("esim_supported") and task.get("profile_iccid"))
    trigger = str(payload.get("trigger", "manual")).strip() or "manual"
    scheduled_for = str(payload.get("scheduled_for", "")).strip()

    if is_esim:
        profiles = attach_profile_device_id(refresh_profile_cache(force=True), device_id)
        target_profile_name = profile_name_for_iccid(task["profile_iccid"], profiles)
        active_profile = active_profile_from_list(profiles)
        original_profile_iccid = str(active_profile.get("iccid", "")).strip()
        original_profile_name = (
            str(active_profile.get("display_name") or profile_display_name(active_profile)).strip()
            if active_profile
            else ""
        )
    else:
        profiles = []
        target_profile_name = "当前 SIM"
        original_profile_iccid = ""
        original_profile_name = ""

    switched_to_target = False
    notification_sent = False
    attempts = 0
    main_error = ""
    restore_error = ""
    last_detail = ""

    ctx.log(f"开始执行保活任务：{task['label']}")
    ctx.log(f"目标设备：{device.get('label') or device_id}")
    ctx.log(f"目标 Profile：{target_profile_name}")
    ctx.log(f"目标号码：{task['target_number']}")
    if scheduled_for:
        ctx.log(f"计划时间：{format_beijing_timestamp(scheduled_for)}")

    try:
        if is_esim and task.get("profile_iccid", "") and task["profile_iccid"] != original_profile_iccid:
            wait_for_keepalive_gap(ctx, settings["queue_gap_seconds"])
            switch_profile(ctx, {"iccid": task["profile_iccid"], "device_id": device_id}, schedule_gap_after=False)
            switched_to_target = True
            ctx.sleep(KEEPALIVE_SWITCH_SETTLE_SECONDS, "等待切卡后的网络重新稳定")
        elif is_esim:
            ctx.log("目标 Profile 当前已在使用，跳过切卡")
            if apply_profile_smsc_if_configured(ctx, task.get("profile_iccid", ""), device_id=device_id):
                ctx.log("已按目标 Profile 自动应用短信中心")
            else:
                ctx.log("目标 Profile 未配置短信中心，继续按基带现有配置发送")
        else:
            ctx.log("普通 SIM 模式，跳过 Profile 切换，直接使用当前基带发送短信")

        send_success = False
        for attempt in range(1, KEEPALIVE_MAX_SEND_ATTEMPTS + 1):
            attempts = attempt
            ctx.log(f"开始第 {attempt} 次保活短信发送")
            ready, detail = wait_for_modem_network_ready(ctx, device_id=device_id)
            if not ready:
                last_detail = detail
                ctx.log(detail, "warning")
            else:
                send_keepalive_sms(ctx, task["target_number"], task["message"], device_id)
                send_success = True
                last_detail = "短信发送成功"
                break
            if attempt < KEEPALIVE_MAX_SEND_ATTEMPTS:
                ctx.sleep(KEEPALIVE_RETRY_INTERVAL_SECONDS, "等待下一次保活短信尝试")

        notify_keepalive_result(
            ctx,
            task,
            profile_name=target_profile_name,
            trigger=trigger,
            scheduled_for=scheduled_for,
            success=send_success,
            attempts=attempts,
            detail=last_detail,
            original_profile_name=original_profile_name,
        )
        notification_sent = True
        if not send_success:
            main_error = f"保活短信连续 {KEEPALIVE_MAX_SEND_ATTEMPTS} 次失败：{last_detail or '未知原因'}"
    except Exception as exc:
        main_error = str(exc)
        if not notification_sent:
            notify_keepalive_result(
                ctx,
                task,
                profile_name=target_profile_name,
                trigger=trigger,
                scheduled_for=scheduled_for,
                success=False,
                attempts=attempts,
                detail=main_error,
                original_profile_name=original_profile_name,
            )
            notification_sent = True
    finally:
        if switched_to_target:
            try:
                if original_profile_iccid:
                    ctx.log(f"准备切回原 Profile：{original_profile_name or profile_name_for_iccid(original_profile_iccid, profiles)}")
                    switch_profile(ctx, {"iccid": original_profile_iccid, "device_id": device_id}, schedule_gap_after=False)
                else:
                    ctx.log("当前没有可识别的原始 Profile，已跳过回切", "warning")
            except Exception as exc:
                restore_error = str(exc)
                ctx.log(f"切回原 Profile 失败：{restore_error}", "error")
        schedule_keepalive_gap(settings["queue_gap_seconds"])

    if restore_error and main_error:
        raise RuntimeError(f"{main_error}；切回原 Profile 失败：{restore_error}")
    if restore_error:
        raise RuntimeError(f"切回原 Profile 失败：{restore_error}")
    if main_error:
        raise RuntimeError(main_error)
    ctx.log("保活任务执行完成")


def execute_action(action: str, payload: dict[str, Any], ctx: ActionContext) -> None:
    if action == "switch_profile":
        switch_profile(ctx, payload)
        return
    if action == "download_esim_profile":
        download_esim_profile(ctx, payload)
        return
    if action == "save_apn":
        apply_apn_settings(ctx, payload)
        return
    if action == "save_notifications":
        save_notifications_config(ctx, payload)
        return
    if action == "save_keepalive":
        save_keepalive_settings(ctx, payload)
        return
    if action == "update_sim_mode":
        update_sim_mode(ctx, payload)
        return
    if action == "recover_modem":
        recover_modem(ctx, payload)
        return
    if action == "restart_sms":
        restart_sms_service(ctx)
        return
    if action == "send_test_sms":
        send_test_sms(ctx, payload)
        return
    if action == "save_profile_smsc":
        save_profile_smsc(ctx, payload)
        return
    if action == "apply_radio_mode":
        apply_radio_mode(ctx, payload)
        return
    if action == "apply_network_selection":
        apply_network_selection(ctx, payload)
        return
    if action == "apply_ims_settings":
        apply_ims_settings(ctx, payload)
        return
    if action == KEEPALIVE_ACTION_NAME:
        run_keepalive_task(ctx, payload)
        return
    if action == "update":
        perform_update(ctx, payload)
        return
    raise ValueError("不支持的操作")


def run_action_worker(action_id: str, action: str, payload: dict[str, Any]) -> None:
    ctx = ActionContext(action_id)
    try:
        set_action_state(action_id, "running")
        ctx.log(f"开始执行：{action}")
        execute_action(action, payload, ctx)
        final_status = get_status()
        set_action_state(action_id, "done", message=ctx.summary(), error="", status=final_status)
        ctx.log("执行完成")
        # 更新完成后重启服务
        if action == "update":
            time.sleep(1)
            python = sys.executable
            os.execv(python, [python] + sys.argv)
    except Exception as exc:
        error_message = str(exc)
        set_action_state(action_id, "error", message=ctx.summary(), error=error_message)
        ctx.log(f"执行失败：{error_message}", "error")


def start_action(action: str, payload: dict[str, Any], *, metadata: Optional[dict[str, Any]] = None) -> str:
    cleanup_actions()
    effective_metadata = dict(metadata or {})
    if action == KEEPALIVE_ACTION_NAME and not effective_metadata:
        task_id = str(payload.get("task_id", "")).strip()
        _, tasks = load_keepalive_config()
        task = next((item for item in tasks if item["id"] == task_id), None)
        if task:
            device = device_status_for_id(str(task.get("device_id", "")))
            effective_metadata = {
                "kind": "keepalive",
                "task_id": task["id"],
                "label": task["label"],
                "device_id": task.get("device_id", ""),
                "device_label": device.get("label", ""),
                "profile_iccid": task["profile_iccid"],
                "profile_name": profile_name_for_iccid(task["profile_iccid"], get_cached_profiles()[0]) if task.get("profile_iccid") else "",
                "target_number": task["target_number"],
                "scheduled_for": str(payload.get("scheduled_for", "")).strip(),
                "trigger": str(payload.get("trigger", "manual")).strip() or "manual",
            }
    action_id = uuid.uuid4().hex[:12]
    with ACTIONS_LOCK:
        ACTIONS[action_id] = {
            "id": action_id,
            "action": action,
            "payload": dict(payload),
            "state": "queued",
            "events": [],
            "message": "",
            "error": "",
            "status": None,
            "metadata": effective_metadata,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
    with ACTION_QUEUE_CONDITION:
        ACTION_QUEUE.append(action_id)
        ACTION_QUEUE_CONDITION.notify()
    return action_id


def action_queue_worker() -> None:
    while True:
        with ACTION_QUEUE_CONDITION:
            while not ACTION_QUEUE:
                ACTION_QUEUE_CONDITION.wait()
            action_id = ACTION_QUEUE.popleft()

        with ACTIONS_LOCK:
            record = ACTIONS.get(action_id)
            if not record:
                continue
            action = str(record.get("action", "")).strip()
            payload = record.get("payload", {})
        if not isinstance(payload, dict):
            payload = {}
        run_action_worker(action_id, action, payload)


def enqueue_keepalive_action(task: dict[str, Any], *, trigger: str, scheduled_for: Optional[datetime]) -> str:
    scheduled_for_text = scheduled_for.isoformat() if scheduled_for else ""
    device = device_status_for_id(str(task.get("device_id", "")))
    metadata = {
        "kind": "keepalive",
        "task_id": task["id"],
        "label": task["label"],
        "device_id": task.get("device_id", ""),
        "device_label": device.get("label", ""),
        "profile_iccid": task["profile_iccid"],
        "profile_name": profile_name_for_iccid(task["profile_iccid"], get_cached_profiles()[0]) if task.get("profile_iccid") else "",
        "target_number": task["target_number"],
        "scheduled_for": scheduled_for_text,
        "trigger": trigger,
    }
    return start_action(
        KEEPALIVE_ACTION_NAME,
        {
            "task_id": task["id"],
            "trigger": trigger,
            "scheduled_for": scheduled_for_text,
        },
        metadata=metadata,
    )


def perform_update(ctx: ActionContext, _payload: dict[str, Any]) -> None:
    ctx.log("正在从 GitHub 获取最新版本信息...")
    import urllib.request
    import tempfile
    import shutil
    import tarfile

    api_url = "https://api.github.com/repos/jiqimaooo/LinkHive/releases/latest"
    req = urllib.request.Request(api_url, headers={"User-Agent": "LinkHive"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        release = json.loads(resp.read().decode())
    tag = release.get("tag_name", "")
    ctx.log(f"最新版本：{tag}")
    assets = release.get("assets", [])
    if not assets:
        raise RuntimeError("未找到发布资源")
    download_url = assets[0].get("browser_download_url", "")
    if not download_url:
        raise RuntimeError("未找到下载链接")
    total_size = assets[0].get("size", 0)
    ctx.log(f"开始下载 {tag}（{total_size / 1024 / 1024:.1f} MB）...")

    tmp_dir = tempfile.mkdtemp(prefix="linkhive_update_")
    ext = ".zip" if download_url.endswith(".zip") else ".tar.gz"
    archive_path = os.path.join(tmp_dir, f"release{ext}")
    try:
        req2 = urllib.request.Request(download_url, headers={"User-Agent": "LinkHive"})
        with urllib.request.urlopen(req2, timeout=300) as dl:
            downloaded = 0
            with open(archive_path, "wb") as f:
                while True:
                    chunk = dl.read(256 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size:
                        pct = int(downloaded / total_size * 100)
                        if pct % 10 == 0:
                            ctx.log(f"下载进度：{pct}%")
        ctx.log("下载完成，正在解压...")

        if archive_path.endswith(".zip") or download_url.endswith(".zip"):
            import zipfile
            with zipfile.ZipFile(archive_path, "r") as zf:
                zf.extractall(tmp_dir)
        else:
            with tarfile.open(archive_path, "r:gz") as tar:
                tar.extractall(tmp_dir)
        ctx.log("解压完成，正在替换文件...")

        static_dir = Path(os.environ.get("FOURG_WIFI_ADMIN_STATIC_DIR", str(SCRIPT_DIR / "frontend_dist")))
        # 查找解压后的 dist 目录
        for root, dirs, _files in os.walk(tmp_dir):
            if "dist" in dirs or "frontend_dist" in dirs:
                src = Path(root) / ("frontend_dist" if "frontend_dist" in dirs else "dist")
                if src.exists():
                    if static_dir.exists():
                        shutil.rmtree(static_dir)
                    shutil.copytree(src, static_dir)
                    ctx.log(f"静态文件已更新到 {static_dir}")
                    break
            # 更新 linkhive_admin.py 主程序
            for f in _files:
                if f == "linkhive_admin.py":
                    src_file = Path(root) / f
                    dest = Path(sys.argv[0]).resolve()
                    shutil.copy2(src_file, dest)
                    ctx.log(f"已更新主程序：{dest}")
                    break

        ctx.log("更新完成，2 秒后自动重启服务...")
        ctx.sleep(1, "")
        # 格式化版本号为统一展示格式 Vx.x-YYYYMMDD
        import re
        m = re.match(r"v(\d{4})\.(\d{2})\.(\d{2})-(\d+\.\d+)", tag)
        if m:
            display = f"V{m.group(4)}-{m.group(1)}{m.group(2)}{m.group(3)}"
        else:
            display = tag
        Path("/tmp/linkhive_update_ready").write_text(display)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def keepalive_scheduler() -> None:
    while True:
        try:
            _, tasks = load_keepalive_config()
            now = datetime.now(BEIJING_TZ)
            enabled_task_ids = {task["id"] for task in tasks if task["enabled"]}
            with KEEPALIVE_RUNTIME_LOCK:
                stale_ids = [task_id for task_id in KEEPALIVE_LAST_ENQUEUED if task_id not in enabled_task_ids]
                for task_id in stale_ids:
                    KEEPALIVE_LAST_ENQUEUED.pop(task_id, None)

            for task in tasks:
                if not task["enabled"]:
                    continue
                scheduled_at = due_keepalive_run(task, now)
                if not scheduled_at:
                    continue
                schedule_key = keepalive_schedule_key(scheduled_at)
                with KEEPALIVE_RUNTIME_LOCK:
                    if KEEPALIVE_LAST_ENQUEUED.get(task["id"]) == schedule_key:
                        continue
                    KEEPALIVE_LAST_ENQUEUED[task["id"]] = schedule_key
                enqueue_keepalive_action(task, trigger="schedule", scheduled_for=scheduled_at)
        except Exception as exc:
            print(f"keepalive scheduler failed: {exc}")
        time.sleep(KEEPALIVE_SCHEDULER_INTERVAL_SECONDS)


def get_action_snapshot(action_id: str, cursor: int) -> dict[str, Any]:
    cleanup_actions()
    with ACTIONS_LOCK:
        record = ACTIONS.get(action_id)
        if not record:
            raise KeyError("任务不存在或已过期")
        events = record["events"][cursor:]
        next_cursor = cursor + len(events)
        return {
            "id": record["id"],
            "action": record["action"],
            "state": record["state"],
            "events": events,
            "cursor": next_cursor,
            "message": record["message"],
            "error": record["error"],
            "status": record.get("status"),
        }


def execute_sync_action(action: str, payload: dict[str, Any]) -> str:
    temp_action_id = uuid.uuid4().hex[:12]
    ctx = ActionContext(temp_action_id)
    execute_action(action, payload, ctx)
    return ctx.summary()


class AppHandler(BaseHTTPRequestHandler):
    server_version = "LinkHiveAdmin/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _write_json(
        self,
        code: int,
        payload: dict[str, Any],
        extra_headers: Optional[dict[str, str]] = None,
    ) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def _write_bytes(
        self,
        code: int,
        content_type: str,
        data: bytes,
        extra_headers: Optional[dict[str, str]] = None,
    ) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def _serve_static(self, request_path: str) -> bool:
        root = STATIC_DIR.resolve()
        path = request_path or "/"
        relative = "index.html" if path == "/" else path.lstrip("/")
        candidate = (root / unquote(relative)).resolve()

        if candidate.exists() and candidate.is_dir():
            candidate = candidate / "index.html"

        if not candidate.exists() or root not in candidate.parents and candidate != root / "index.html":
            if "." not in Path(relative).name:
                index_file = root / "index.html"
                if index_file.exists():
                    stat = index_file.stat()
                    self._write_bytes(
                        200,
                        "text/html; charset=utf-8",
                        index_file.read_bytes(),
                        extra_headers={
                            "Cache-Control": "no-store, max-age=0",
                            "Last-Modified": self.date_time_string(stat.st_mtime),
                        },
                    )
                    return True
            return False

        content_type, _ = mimetypes.guess_type(candidate.name)
        if candidate.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif candidate.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        elif candidate.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif candidate.suffix == ".json":
            content_type = "application/json; charset=utf-8"
        stat = candidate.stat()
        cache_control = "public, max-age=3600"
        if candidate.suffix == ".html" or candidate.name.endswith(".webmanifest"):
            cache_control = "no-store, max-age=0"
        elif re.search(r"-[A-Za-z0-9_-]{8,}\.(?:js|css)$", candidate.name):
            cache_control = "public, max-age=31536000, immutable"
        self._write_bytes(
            200,
            content_type or "application/octet-stream",
            candidate.read_bytes(),
            extra_headers={
                "Cache-Control": cache_control,
                "Last-Modified": self.date_time_string(stat.st_mtime),
            },
        )
        return True

    def _handle_sync_action(self, action: str, payload: dict[str, Any]) -> None:
        try:
            message = execute_sync_action(action, payload)
            self._write_json(200, {"ok": True, "message": message})
        except Exception as exc:
            self._write_json(500, {"error": str(exc)})

    def _client_ip(self) -> str:
        forwarded = self.headers.get("X-Forwarded-For", "")
        if config_flag("LINKHIVE_TRUST_PROXY_HEADERS") and forwarded:
            return forwarded.split(",")[0].strip()
        return self.client_address[0]

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin", "").strip()
        if not origin:
            referer = self.headers.get("Referer", "").strip()
            if not referer:
                return True
            parsed_referer = urlparse(referer)
            origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}"

        host = self.headers.get("Host", "").strip()
        allowed = {f"http://{host}", f"https://{host}"}
        if config_flag("LINKHIVE_TRUST_PROXY_HEADERS"):
            forwarded_host = self.headers.get("X-Forwarded-Host", "").strip()
            forwarded_proto = self.headers.get("X-Forwarded-Proto", "").strip() or "https"
            if forwarded_host:
                allowed.add(f"{forwarded_proto}://{forwarded_host}")
        return origin in allowed

    def _require_same_origin(self) -> bool:
        if self._origin_allowed():
            return True
        self._write_json(403, {"error": "请求来源不匹配"})
        return False

    def _cookie_header(self, value: str, *, max_age: int) -> str:
        parts = [
            f"{AUTH_COOKIE_NAME}={value}",
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
            f"Max-Age={max_age}",
        ]
        forwarded_https = (
            config_flag("LINKHIVE_TRUST_PROXY_HEADERS")
            and self.headers.get("X-Forwarded-Proto", "").strip().lower() == "https"
        )
        if config_flag("LINKHIVE_COOKIE_SECURE") or forwarded_https:
            parts.append("Secure")
        return "; ".join(parts)

    def _authenticated(self) -> bool:
        return valid_session_cookie(self.headers.get("Cookie", ""))

    def _require_auth(self) -> bool:
        if self._authenticated():
            return True
        self._write_json(401, {"error": "请先登录", "authenticated": False})
        return False

    def _auth_status_payload(self) -> dict[str, Any]:
        return {
            "auth_enabled": auth_enabled(),
            "authenticated": self._authenticated(),
            "username": auth_username(),
            "version": app_version(),
        }

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/auth/status":
            self._write_json(200, {**self._auth_status_payload(), "totp_enabled": totp_enabled()})
            return

        if path == "/api/auth/totp-status":
            if not self._require_auth():
                return
            self._write_json(200, {"enabled": totp_enabled(), "secret": totp_secret()})
            return

        if path == "/api/auth/ban-status":
            if not self._require_auth():
                return
            self._write_json(200, {
                "enabled": brute_force_enabled(),
                "max_attempts": brute_force_max_attempts(),
                "lan_enabled": brute_force_lan_enabled(),
                "banned_ips": sorted(banned_ips()),
            })
            return

        if path.startswith("/api/") and not self._require_auth():
            return

        if path == "/api/status":
            try:
                refresh_profiles = "refresh_profiles=1" in parsed.query
                refresh_devices = "refresh_devices=1" in parsed.query
                self._write_json(200, get_status(refresh_profiles=refresh_profiles, refresh_devices=refresh_devices))
            except Exception as exc:
                self._write_json(500, {"error": str(exc)})
            return

        if path.startswith("/api/action/"):
            action_id = path.removeprefix("/api/action/").strip()
            try:
                cursor_match = re.search(r"(?:^|&)cursor=(\d+)(?:&|$)", parsed.query)
                cursor = int(cursor_match.group(1)) if cursor_match else 0
                self._write_json(200, {"ok": True, **get_action_snapshot(action_id, cursor)})
            except KeyError as exc:
                self._write_json(404, {"error": str(exc)})
            except Exception as exc:
                self._write_json(500, {"error": str(exc)})
            return

        if STATIC_DIR.exists() and self._serve_static(path):
            return

        if path == "/":
            self._write_bytes(200, "text/html; charset=utf-8", FALLBACK_INDEX_HTML.encode("utf-8"))
            return

        self._write_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/") and not self._require_same_origin():
                return
            data = self._read_json_body()
            if path == "/api/auth/login":
                client_ip = self._client_ip()
                if is_ip_banned(client_ip):
                    self._write_json(403, {"error": "IP 已被封禁，请稍后再试"})
                    return
                username = str(data.get("username", "")).strip()
                password = str(data.get("password", ""))
                totp_code_value = str(data.get("totp_code", "")).strip()
                if not auth_enabled():
                    self._write_json(200, self._auth_status_payload())
                    return
                if username != auth_username() or not verify_password(password):
                    record_failed_attempt(client_ip)
                    self._write_json(401, {"error": "用户名或密码不正确", "authenticated": False})
                    return
                if totp_enabled() and not totp_code_value:
                    self._write_json(200, {"totp_required": True, "username": username})
                    return
                if totp_enabled():
                    if not verify_totp(totp_secret(), totp_code_value):
                        record_failed_attempt(client_ip)
                        self._write_json(401, {"error": "二次认证验证码不正确"})
                        return
                cookie_value = make_session_cookie(username)
                self._write_json(
                    200,
                    {"ok": True, "authenticated": True, "username": username},
                    extra_headers={
                        "Set-Cookie": self._cookie_header(cookie_value, max_age=AUTH_SESSION_TTL_SECONDS)
                    },
                )
                return
            if path == "/api/auth/logout":
                self._write_json(
                    200,
                    {"ok": True, "authenticated": False},
                    extra_headers={"Set-Cookie": self._cookie_header("", max_age=0)},
                )
                return
            if path == "/api/auth/change-password":
                if not self._require_auth():
                    return
                if not auth_enabled():
                    self._write_json(400, {"error": "当前未启用密码认证"})
                    return
                old_password = str(data.get("old_password", ""))
                new_username = str(data.get("new_username", "")).strip()
                new_password = str(data.get("new_password", "")).strip()
                config = read_env_config(APP_CONFIG_PATH)
                if new_username:
                    if not new_username or len(new_username) < 2:
                        self._write_json(400, {"error": "用户名不能少于 2 位"})
                        return
                    config["LINKHIVE_ADMIN_USER"] = new_username
                if new_password:
                    if not verify_password(old_password):
                        self._write_json(401, {"error": "旧密码不正确"})
                        return
                    if len(new_password) < 4:
                        self._write_json(400, {"error": "新密码不能少于 4 位"})
                        return
                    salt = secrets.token_hex(16)
                    new_hash = f"pbkdf2_sha256${salt}${hash_password(new_password, salt)}"
                    config["LINKHIVE_PASSWORD_HASH"] = new_hash
                write_env_config(APP_CONFIG_PATH, config)
                self._write_json(200, {"ok": True, "message": "账户信息已修改"})
                return
            if path == "/api/auth/totp-setup":
                if not self._require_auth():
                    return
                secret = generate_totp_secret()
                otpauth_url = totp_otpauth_url(secret, auth_username())
                config = read_env_config(APP_CONFIG_PATH)
                config["LINKHIVE_TOTP_SECRET"] = secret
                config["LINKHIVE_TOTP_ENABLED"] = "false"
                write_env_config(APP_CONFIG_PATH, config)
                self._write_json(200, {"ok": True, "secret": secret, "otpauth_url": otpauth_url})
                return
            if path == "/api/auth/totp-verify":
                if not self._require_auth():
                    return
                code = str(data.get("code", "")).strip()
                secret = totp_secret()
                if not secret:
                    self._write_json(400, {"error": "请先生成二次认证密钥"})
                    return
                if not verify_totp(secret, code):
                    self._write_json(401, {"error": "验证码不正确"})
                    return
                config = read_env_config(APP_CONFIG_PATH)
                config["LINKHIVE_TOTP_ENABLED"] = "true"
                write_env_config(APP_CONFIG_PATH, config)
                self._write_json(200, {"ok": True, "message": "二次认证已启用"})
                return
            if path == "/api/auth/totp-disable":
                if not self._require_auth():
                    return
                config = read_env_config(APP_CONFIG_PATH)
                config["LINKHIVE_TOTP_ENABLED"] = "false"
                write_env_config(APP_CONFIG_PATH, config)
                self._write_json(200, {"ok": True, "message": "二次认证已禁用"})
                return
            if path == "/api/auth/ban-settings":
                if not self._require_auth():
                    return
                enabled = str(data.get("enabled", "false")).strip().lower()
                max_attempts = str(data.get("max_attempts", "5")).strip()
                lan_enabled = str(data.get("lan_enabled", "false")).strip().lower()
                config = read_env_config(APP_CONFIG_PATH)
                config["LINKHIVE_BRUTE_FORCE_ENABLED"] = "true" if enabled in {"1", "true", "yes"} else "false"
                config["LINKHIVE_BRUTE_FORCE_MAX_ATTEMPTS"] = max_attempts
                config["LINKHIVE_BRUTE_FORCE_LAN_ENABLED"] = "true" if lan_enabled in {"1", "true", "yes"} else "false"
                write_env_config(APP_CONFIG_PATH, config)
                self._write_json(200, {"ok": True, "message": "防暴力破解配置已更新"})
                return
            if path == "/api/auth/unban-ip":
                if not self._require_auth():
                    return
                ip = str(data.get("ip", "")).strip()
                if not ip:
                    self._write_json(400, {"error": "缺少 IP"})
                    return
                current = banned_ips()
                if ip in current:
                    current.remove(ip)
                    save_banned_ips(current)
                self._write_json(200, {"ok": True, "message": f"已解封 {ip}"})
                return
            if path.startswith("/api/") and not self._require_auth():
                return
            if path == "/api/action/start":
                action = str(data.get("action", "")).strip()
                payload = data.get("payload", {})
                if not isinstance(payload, dict):
                    raise ValueError("payload 必须是对象")
                action_id = start_action(action, payload)
                self._write_json(200, {"ok": True, "id": action_id})
                return
            if path == "/api/profile/switch":
                self._handle_sync_action("switch_profile", data)
                return
            if path == "/api/apn":
                self._handle_sync_action("save_apn", data)
                return
            if path == "/api/notifications":
                self._handle_sync_action("save_notifications", data)
                return
            if path == "/api/keepalive":
                message = execute_sync_action("save_keepalive", data)
                self._write_json(200, {"ok": True, "message": message, "status": get_status()})
                return
            if path == "/api/settings/sim-mode":
                message = execute_sync_action("update_sim_mode", data)
                self._write_json(200, {"ok": True, "message": message, "status": get_status(refresh_profiles=True)})
                return
            if path == "/api/modem/recover":
                self._handle_sync_action("recover_modem", data)
                return
            if path == "/api/modem/mode":
                self._handle_sync_action("apply_radio_mode", data)
                return
            if path == "/api/modem/network":
                self._handle_sync_action("apply_network_selection", data)
                return
            if path == "/api/service/restart-sms":
                self._handle_sync_action("restart_sms", data)
                return
            self._write_json(404, {"error": "Not found"})
        except Exception as exc:
            self._write_json(500, {"error": str(exc)})


def main() -> None:
    if os.path.exists("/opt/lpac/lpac"):
        print("lpac installed, eSIM profile cache will initialize on demand")
    else:
        print("lpac not installed, eSIM management unavailable")
    threading.Thread(target=action_queue_worker, daemon=True).start()
    threading.Thread(target=keepalive_scheduler, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"LinkHive admin listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
