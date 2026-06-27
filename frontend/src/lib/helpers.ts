import type { ActionLevel, ActionName, DashboardTrafficSample, KeepaliveRun, NotificationFormTarget, Profile, ProfileSmscFormState } from "./types"
import { NOTIFICATION_CHANNEL_DEFINITIONS, NOTIFICATION_CHANNEL_ORDER } from "./constants"

export function inferRadioMode(currentModes: string) {
  const normalized = currentModes.toLowerCase()
  if (normalized.includes("none") || normalized.includes("any")) return "network_disabled"
  if (normalized.includes("4g") && !normalized.includes("3g")) return "4g_only"
  if (normalized.includes("3g") && !normalized.includes("4g")) return "3g_only"
  return "3g4g_prefer4g"
}

export function formatRegistrationState(registration: string) {
  const normalized = registration.trim().toLowerCase()
  const labels: Record<string, string> = {
    home: "本地网络",
    roaming: "漫游",
    searching: "搜索中",
    denied: "被拒绝",
    unknown: "未知",
    registered: "已注册",
    idle: "空闲",
    disabled: "已禁用",
  }
  return labels[normalized] || registration || "--"
}

export function formatAccessTech(accessTech: string) {
  const normalized = accessTech.trim().toLowerCase()
  const labels: Record<string, string> = {
    lte: "LTE",
    nr5g: "5G NR",
    "5gnr": "5G NR",
    gsm: "GSM",
    umts: "UMTS",
    edge: "EDGE",
    gprs: "GPRS",
  }
  return labels[normalized] || accessTech.toUpperCase() || "--"
}

export function formatOperatorName(operatorName: string | null | undefined, operatorCode?: string | null) {
  const name = String(operatorName ?? "").trim()
  const code = String(operatorCode ?? "").trim()
  const normalizedName = name.toLowerCase().replace(/[\s_-]+/g, " ")
  const codePrefix = code.slice(0, 5)
  const labels: Record<string, string> = {
    "china mobile": "中国移动",
    "china mobile communications": "中国移动",
    "cmcc": "中国移动",
    "chn mobile": "中国移动",
    "china unicom": "中国联通",
    "china unicorn": "中国联通",
    "chn unicom": "中国联通",
    "cucc": "中国联通",
    "china telecom": "中国电信",
    "chn telecom": "中国电信",
    "ctcc": "中国电信",
  }
  const codeLabels: Record<string, string> = {
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
  }
  return labels[normalizedName] || codeLabels[codePrefix] || displayValue(name)
}

export function formatCurrentModes(currentModes: string) {
  const normalized = currentModes.trim()
  if (!normalized || normalized === "--") {
    return "允许制式：--\n首选制式：--"
  }
  const allowedMatch = normalized.match(/allowed:\s*([^;]+)/i)
  const preferredMatch = normalized.match(/preferred:\s*([^;]+)/i)
  const allowed = allowedMatch?.[1]?.trim() || normalized
  const preferred = preferredMatch?.[1]?.trim() || "none"
  const formatMode = (value: string) => {
    const lower = value.toLowerCase()
    if (lower === "none") return "无"
    return value.toUpperCase()
  }
  return `允许制式：${formatMode(allowed)}\n首选制式：${formatMode(preferred)}`
}

export function serviceVariant(state: string) {
  if (state === "active") return "default" as const
  if (state === "activating") return "secondary" as const
  return "destructive" as const
}

export function signalVariant(signalValue: string) {
  const signal = Number.parseInt(signalValue, 10)
  if (Number.isNaN(signal)) return "outline" as const
  if (signal >= 60) return "default" as const
  if (signal >= 30) return "secondary" as const
  return "destructive" as const
}

export function displayValue(value: string | number | null | undefined, fallback = "未上报") {
  const normalized = String(value ?? "").trim()
  return normalized && normalized !== "--" ? normalized : fallback
}

export function formatBytes(bytes: number | null | undefined) {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalized = value / 1024 ** unitIndex
  const digits = unitIndex <= 1 ? 0 : normalized >= 100 ? 0 : 1
  return `${normalized.toFixed(digits)} ${units[unitIndex]}`
}

export function formatTrafficForChart(bytes: number | null | undefined) {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Number((value / 1024 / 1024).toFixed(2))
}

export function normalizeTrafficSamples(samples: DashboardTrafficSample[] = []) {
  return samples.map((sample) => ({
    time: sample.time,
    upload: formatTrafficForChart(sample.upload_bytes),
    download: formatTrafficForChart(sample.download_bytes),
    total: formatTrafficForChart(sample.total_bytes),
  }))
}

export function serviceStateLabel(state: string) {
  const normalized = state.trim().toLowerCase()
  if (normalized === "active") return "运行中"
  if (normalized === "activating" || normalized === "reloading") return "启动中"
  if (normalized === "failed") return "异常"
  if (normalized === "inactive" || normalized === "deactivating") return "停止"
  return state || "未知"
}

export function serviceStateTone(state: string) {
  const normalized = state.trim().toLowerCase()
  if (normalized === "active") return "success" as const
  if (normalized === "activating" || normalized === "reloading") return "warning" as const
  if (normalized === "failed") return "danger" as const
  return "muted" as const
}

export function keepaliveRunStateLabel(state: KeepaliveRun["state"]) {
  switch (state) {
    case "queued":
      return "排队中"
    case "running":
      return "执行中"
    case "done":
      return "已完成"
    case "error":
      return "失败"
    default:
      return state || "--"
  }
}

export function keepaliveRunStateVariant(state: KeepaliveRun["state"]) {
  if (state === "done") return "default" as const
  if (state === "running" || state === "queued") return "secondary" as const
  return "destructive" as const
}

export function keepaliveTriggerLabel(trigger: string) {
  return trigger === "schedule" ? "定时" : "手动"
}

export function levelClassName(level: ActionLevel) {
  if (level === "error") return "text-rose-300"
  if (level === "warning") return "text-amber-300"
  if (level === "command") return "text-cyan-300"
  return "text-slate-100"
}

export function friendlyActionName(action: ActionName) {
  switch (action) {
    case "switch_profile":
      return "切换 eSIM"
    case "recover_modem":
      return "重启基带"
    case "restart_sms":
      return "重启短信转发"
    case "resend_last_sms":
      return "重发最后一条短信"
    case "send_test_sms":
      return "发送测试短信"
    case "save_profile_smsc":
      return "保存短信中心"
    case "run_keepalive_task":
      return "执行保活任务"
    case "save_apn":
      return "保存 APN"
    case "save_notifications":
      return "保存通知渠道"
    case "apply_radio_mode":
      return "应用网络制式"
    case "apply_network_selection":
      return "应用选网设置"
    case "apply_ims_settings":
      return "应用 IMS 设置"
  }
}

export function notificationChannelLabel(target: NotificationFormTarget) {
  if (target.type === "custom") return target.values.custom_label?.trim() || "自定义"
  return NOTIFICATION_CHANNEL_DEFINITIONS[target.type].label
}

export function notificationFieldValue(target: NotificationFormTarget, fieldKey: string) {
  return target.values[fieldKey] ?? ""
}

export function getNotifications(status: { notifications?: { configured_count: number; configured_labels: string[]; targets: import("./types").NotificationTarget[] } } | null | undefined) {
  return status?.notifications ?? { configured_count: 0, configured_labels: [], targets: [] }
}

export function getKeepalive(status: { keepalive?: { settings: import("./types").KeepaliveSettings; tasks: import("./types").KeepaliveTask[]; active_run: import("./types").KeepaliveRun | null; queued_runs: import("./types").KeepaliveRun[]; recent_runs: import("./types").KeepaliveRun[]; next_allowed_at: string } } | null | undefined) {
  return status?.keepalive ?? { settings: { queue_gap_seconds: 180 }, tasks: [], active_run: null, queued_runs: [], recent_runs: [], next_allowed_at: "" }
}

export function getActiveProfile(profiles: Profile[]) {
  return profiles.find((profile) => profile.is_active) ?? null
}

export function buildProfileSmscForms(profiles: Profile[] = []): Record<string, ProfileSmscFormState> {
  return Object.fromEntries(
    profiles.map((profile) => [
      profile.iccid,
      {
        address: profile.smsc_address || "",
        type: profile.smsc_type || "145",
      },
    ]),
  )
}

export function normalizeKeepaliveTasks(tasks: import("./types").KeepaliveTask[] = []): import("./types").KeepaliveFormTask[] {
  return tasks.map((task) => ({
    id: task.id,
    label: task.label,
    enabled: task.enabled,
    profile_iccid: task.profile_iccid,
    target_number: task.target_number,
    message: task.message,
    cron_expression: task.cron_expression,
  }))
}

export function createKeepaliveTask(profiles: Profile[]): import("./types").KeepaliveFormTask {
  const fallbackProfile = getActiveProfile(profiles) ?? profiles[0]
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const fallbackLabel = fallbackProfile?.display_name ? `${fallbackProfile.display_name} 保活` : "保活任务"
  return {
    id: `keepalive-${randomId}`,
    label: fallbackLabel,
    enabled: true,
    profile_iccid: fallbackProfile?.iccid ?? "",
    target_number: "",
    message: "KEEPALIVE",
    cron_expression: "0 9 * * *",
  }
}

export {
  NOTIFICATION_CHANNEL_DEFINITIONS,
  NOTIFICATION_CHANNEL_ORDER,
}
