#!/usr/bin/env python3
from __future__ import annotations
import base64
import hashlib
import json
import logging
import os
import re
import sys
import time
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
for candidate in (SCRIPT_DIR, SCRIPT_DIR.parent / "shared"):
    if (candidate / "notification_utils.py").exists() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from notification_utils import (  # noqa: E402
    configured_channel_labels,
    format_beijing_timestamp,
    format_sms_notification,
    load_notification_targets,
    send_apprise_notification,
)
from modem_direct import list_sms_via_at  # noqa: E402


CONFIG_PATH = Path(os.environ.get("SMS_FORWARDER_CONFIG", "/etc/sms-forwarder.conf"))
STATE_PATH = Path(os.environ.get("SMS_FORWARDER_STATE", "/var/lib/sms-forwarder/state.json"))
POLL_INTERVAL = int(os.environ.get("SMS_FORWARDER_POLL_INTERVAL", "15"))
LOG_LEVEL = os.environ.get("SMS_FORWARDER_LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOG = logging.getLogger("sms-forwarder")


def load_env_file(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        raise FileNotFoundError(f"config file not found: {path}")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip("\"'")
    return data


def ensure_state() -> dict[str, object]:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        return {"seen_sms": [], "seen_fingerprints": []}
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if "seen_sms" not in state or not isinstance(state["seen_sms"], list):
            state["seen_sms"] = []
        if "seen_fingerprints" not in state or not isinstance(state["seen_fingerprints"], list):
            state["seen_fingerprints"] = []
        return state
    except json.JSONDecodeError:
        LOG.warning("state file is corrupted, rebuilding: %s", STATE_PATH)
        return {"seen_sms": [], "seen_fingerprints": []}


def save_state(state: dict[str, object]) -> None:
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_PATH)


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
        decoded = base64.b64decode(compact, validate=True)
        decoded_text = decoded.decode("utf-8")
    except Exception:
        return raw_text
    printable = sum(ch.isprintable() or ch in "\r\n\t" for ch in decoded_text)
    if not decoded_text or printable / len(decoded_text) < 0.85:
        return raw_text
    return decoded_text


def normalize_sms_text(raw_text: str) -> str:
    text = decode_escaped_text(raw_text)
    return maybe_decode_base64(text)


def fetch_sms_messages(device_id: str) -> tuple[list[dict[str, str]], str]:
    messages, error = list_sms_via_at(device_id)
    if error:
        return [], error
    normalized: list[dict[str, str]] = []
    for item in messages:
        normalized.append(
            {
                "path": f"{item.get('device_id', device_id)}:{item.get('id', '')}",
                "state": item.get("state", ""),
                "number": item.get("number", ""),
                "text": normalize_sms_text(item.get("text", "")),
                "timestamp": format_beijing_timestamp(item.get("timestamp", "")),
                "storage": item.get("storage", ""),
            }
        )
    return normalized, ""


def build_sms_fingerprint(detail: dict[str, str]) -> str:
    raw = "\n".join(
        [
            detail.get("number", ""),
            detail.get("timestamp", ""),
            detail.get("state", ""),
            detail.get("text", ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()


def main() -> int:
    config = load_env_file(CONFIG_PATH)
    modem_id = config.get("MODEM_ID", "any")
    targets = load_notification_targets(config)
    forward_states = {s.strip() for s in config.get("FORWARD_SMS_STATES", "received").split(",") if s.strip()}

    if not targets:
        raise RuntimeError("未配置通知渠道，请先在配置文件或前端页面中保存 Apprise 渠道")

    state = ensure_state()
    seen_sms = set(state.get("seen_sms", []))
    seen_fingerprints = set(state.get("seen_fingerprints", []))
    LOG.info(
        "sms forwarder started, modem=%s poll_interval=%s channels=%s",
        modem_id,
        POLL_INTERVAL,
        ",".join(configured_channel_labels(targets)) or "none",
    )

    while True:
        try:
            messages, read_error = fetch_sms_messages(modem_id)
            if read_error:
                LOG.warning("read sms failed: %s", read_error)
                time.sleep(POLL_INTERVAL)
                continue
            current_seen = set(seen_sms)
            changed = False

            for detail in messages:
                sms_path = detail["path"]
                fingerprint = build_sms_fingerprint(detail)

                if fingerprint in seen_fingerprints:
                    continue

                if sms_path not in current_seen:
                    seen_sms.add(sms_path)
                    changed = True

                seen_fingerprints.add(fingerprint)
                changed = True

                if detail["state"] not in forward_states:
                    LOG.info("skip sms %s with state=%s", sms_path, detail["state"])
                    continue

                title, body = format_sms_notification(detail)
                labels = send_apprise_notification(targets, title, body)
                LOG.info("notification delivered via %s", ",".join(labels))

            if changed:
                state["seen_sms"] = sorted(seen_sms)
                state["seen_fingerprints"] = sorted(seen_fingerprints)[-200:]
                save_state(state)
        except Exception as exc:
            LOG.exception("unexpected failure: %s", exc)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    raise SystemExit(main())
