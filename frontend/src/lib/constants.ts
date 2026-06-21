import type { ChannelKind, NotificationChannelDefinition, NotificationFormTarget, NotificationTarget } from "./types"

export const ACTIVE_ACTION_KEY = "ess-active-action"
export const ICON_VERSION = "20260312-2"
export const DEFAULT_BARK_ICON_URL =
  `https://raw.githubusercontent.com/cyDione/LinkHive/main/frontend/public/app-icon.png?v=${ICON_VERSION}`

export const NOTIFICATION_CHANNEL_DEFINITIONS: Record<ChannelKind, NotificationChannelDefinition> = {
  bark: {
    type: "bark",
    label: "Bark",
    description: "适合 iPhone 和 Apple 设备，填写服务器地址与设备 Key。",
    fields: [
      { key: "server_url", label: "服务器地址", placeholder: "https://api.day.app", required: true, inputType: "url" },
      { key: "device_key", label: "Device Key", placeholder: "输入 Bark 的 Device Key", required: true },
      { key: "group", label: "分组", placeholder: "sms" },
      {
        key: "level",
        label: "推送级别",
        placeholder: "选择推送级别",
        options: [
          { label: "active", value: "active" },
          { label: "timeSensitive", value: "timeSensitive" },
          { label: "passive", value: "passive" },
        ],
      },
    ],
    createValues: () => ({
      server_url: "https://api.day.app",
      device_key: "",
      group: "sms",
      level: "active",
    }),
  },
  telegram: {
    type: "telegram",
    label: "Telegram",
    description: "通过 Telegram Bot 推送，填写 Bot Token 和 Chat ID。",
    fields: [
      { key: "bot_token", label: "Bot Token", placeholder: "123456:ABCDEF...", required: true, inputType: "password" },
      { key: "chat_id", label: "Chat ID", placeholder: "例如 123456789", required: true },
    ],
    createValues: () => ({
      bot_token: "",
      chat_id: "",
    }),
  },
  gotify: {
    type: "gotify",
    label: "Gotify",
    description: "适合自建 Gotify 服务，填写服务器地址和应用 Token。",
    fields: [
      { key: "server_url", label: "服务器地址", placeholder: "https://push.example.com", required: true, inputType: "url" },
      { key: "token", label: "应用 Token", placeholder: "输入 Gotify Token", required: true, inputType: "password" },
      { key: "priority", label: "优先级", placeholder: "可留空，例如 5" },
    ],
    createValues: () => ({
      server_url: "",
      token: "",
      priority: "",
    }),
  },
  ntfy: {
    type: "ntfy",
    label: "ntfy",
    description: "适合 ntfy.sh 或自建 ntfy，填写服务器地址与主题名。",
    fields: [
      { key: "server_url", label: "服务器地址", placeholder: "https://ntfy.sh", required: true, inputType: "url" },
      { key: "topic", label: "主题", placeholder: "例如 esim-sms", required: true },
      { key: "token", label: "访问 Token", placeholder: "需要鉴权时填写", inputType: "password" },
    ],
    createValues: () => ({
      server_url: "https://ntfy.sh",
      topic: "",
      token: "",
    }),
  },
  discord: {
    type: "discord",
    label: "Discord",
    description: "填写 Discord Webhook ID 与 Token。",
    fields: [
      { key: "webhook_id", label: "Webhook ID", placeholder: "输入 Discord Webhook ID", required: true },
      { key: "webhook_token", label: "Webhook Token", placeholder: "输入 Discord Webhook Token", required: true, inputType: "password" },
    ],
    createValues: () => ({
      webhook_id: "",
      webhook_token: "",
    }),
  },
  custom: {
    type: "custom",
    label: "自定义",
    description: "高级模式，直接保存一条完整的 Apprise URL。",
    fields: [
      { key: "custom_label", label: "显示名称", placeholder: "例如 Webhook", required: true },
      { key: "url", label: "Apprise URL", placeholder: "输入完整的 Apprise URL", required: true },
    ],
    createValues: () => ({
      custom_label: "",
      url: "",
    }),
  },
}

export const NOTIFICATION_CHANNEL_ORDER: ChannelKind[] = ["bark", "telegram", "gotify", "ntfy", "discord", "custom"]

export const NOTIFICATION_CHANNEL_ALIASES: Record<string, ChannelKind> = {
  bark: "bark",
  barks: "bark",
  telegram: "telegram",
  tgram: "telegram",
  gotify: "gotify",
  gotifys: "gotify",
  ntfy: "ntfy",
  ntfys: "ntfy",
  discord: "discord",
  custom: "custom",
}

// --- Notification URL builders & parsers ---

function inferNotificationType(url: string, fallback = "apprise") {
  const match = url.trim().match(/^([a-z0-9+.-]+):\/\//i)
  return match?.[1]?.toLowerCase() || fallback
}

function normalizeServerUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(normalized)
  } catch {
    return null
  }
}

function convertCustomSchemeUrl(url: string, secureScheme: string, insecureScheme: string) {
  if (url.startsWith(`${secureScheme}://`)) return new URL(url.replace(`${secureScheme}://`, "https://"))
  if (url.startsWith(`${insecureScheme}://`)) return new URL(url.replace(`${insecureScheme}://`, "http://"))
  return null
}

function notificationChannelType(rawType: string, url: string): ChannelKind {
  const direct = NOTIFICATION_CHANNEL_ALIASES[rawType.trim().toLowerCase()]
  if (direct) return direct

  const inferred = inferNotificationType(url, "").toLowerCase()
  if (NOTIFICATION_CHANNEL_ALIASES[inferred]) return NOTIFICATION_CHANNEL_ALIASES[inferred]

  if (/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i.test(url.trim())) return "discord"
  return "custom"
}

export function createNotificationTarget(type: ChannelKind, overrides: Partial<NotificationFormTarget> = {}): NotificationFormTarget {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const definition = NOTIFICATION_CHANNEL_DEFINITIONS[type]
  return {
    id: overrides.id ?? `notification-${randomId}`,
    type,
    enabled: overrides.enabled ?? true,
    values: {
      ...definition.createValues(),
      ...(overrides.values ?? {}),
    },
  }
}

export function buildNotificationUrl(target: NotificationFormTarget) {
  const values = target.values
  switch (target.type) {
    case "bark": {
      const server = normalizeServerUrl(values.server_url ?? "")
      if (!server) return ""
      const scheme = server.protocol === "http:" ? "bark" : "barks"
      const pathSegments = server.pathname.split("/").filter(Boolean)
      const deviceKey = values.device_key?.trim() ?? ""
      const query = new URLSearchParams()
      if (values.group?.trim()) query.set("group", values.group.trim())
      if (values.level?.trim()) query.set("level", values.level.trim())
      query.set("icon", DEFAULT_BARK_ICON_URL)
      const nextPath = [...pathSegments, deviceKey].filter(Boolean).join("/")
      const queryText = query.toString()
      return `${scheme}://${server.host}${nextPath ? `/${nextPath}` : ""}${queryText ? `?${queryText}` : ""}`
    }
    case "telegram": {
      const botToken = values.bot_token?.trim() ?? ""
      const chatId = values.chat_id?.trim() ?? ""
      return botToken && chatId ? `tgram://${botToken}/${chatId}` : ""
    }
    case "gotify": {
      const server = normalizeServerUrl(values.server_url ?? "")
      if (!server) return ""
      const scheme = server.protocol === "http:" ? "gotify" : "gotifys"
      const pathSegments = server.pathname.split("/").filter(Boolean)
      const token = values.token?.trim() ?? ""
      const priority = values.priority?.trim() ?? ""
      const query = new URLSearchParams()
      if (priority) query.set("priority", priority)
      const nextPath = [...pathSegments, token].filter(Boolean).join("/")
      const queryText = query.toString()
      return `${scheme}://${server.host}${nextPath ? `/${nextPath}` : ""}${queryText ? `?${queryText}` : ""}`
    }
    case "ntfy": {
      const server = normalizeServerUrl(values.server_url ?? "")
      if (!server) return ""
      const scheme = server.protocol === "http:" ? "ntfy" : "ntfys"
      const pathSegments = server.pathname.split("/").filter(Boolean)
      const topic = values.topic?.trim() ?? ""
      const token = values.token?.trim() ?? ""
      const authPrefix = token ? `${encodeURIComponent(token)}@` : ""
      const nextPath = [...pathSegments, topic].filter(Boolean).join("/")
      return `${scheme}://${authPrefix}${server.host}${nextPath ? `/${nextPath}` : ""}`
    }
    case "discord": {
      const webhookId = values.webhook_id?.trim() ?? ""
      const webhookToken = values.webhook_token?.trim() ?? ""
      return webhookId && webhookToken ? `discord://${webhookId}/${webhookToken}` : ""
    }
    case "custom":
      return values.url?.trim() ?? ""
  }
}

export function parseNotificationTarget(target: NotificationTarget): NotificationFormTarget {
  const type = notificationChannelType(target.type ?? "", target.url ?? "")
  const enabled = target.enabled ?? true
  const id = target.id
  const url = target.url ?? ""

  if (type === "bark") {
    const parsed = convertCustomSchemeUrl(url, "barks", "bark")
    if (!parsed) return createNotificationTarget("bark", { id, enabled })
    const segments = parsed.pathname.split("/").filter(Boolean)
    const deviceKey = decodeURIComponent(segments.pop() ?? "")
    const serverUrl = `${parsed.protocol}//${parsed.host}${segments.length ? `/${segments.join("/")}` : ""}`
    return createNotificationTarget("bark", {
      id,
      enabled,
      values: {
        server_url: serverUrl,
        device_key: deviceKey,
        group: parsed.searchParams.get("group") ?? "sms",
        level: parsed.searchParams.get("level") ?? "active",
      },
    })
  }

  if (type === "telegram") {
    const match = url.trim().match(/^tgram:\/\/([^/]+)\/([^/?#]+)/i)
    return createNotificationTarget("telegram", {
      id,
      enabled,
      values: {
        bot_token: decodeURIComponent(match?.[1] ?? ""),
        chat_id: decodeURIComponent(match?.[2] ?? ""),
      },
    })
  }

  if (type === "gotify") {
    const parsed = convertCustomSchemeUrl(url, "gotifys", "gotify")
    if (!parsed) return createNotificationTarget("gotify", { id, enabled })
    const segments = parsed.pathname.split("/").filter(Boolean)
    const token = decodeURIComponent(segments.pop() ?? "")
    const serverUrl = `${parsed.protocol}//${parsed.host}${segments.length ? `/${segments.join("/")}` : ""}`
    return createNotificationTarget("gotify", {
      id,
      enabled,
      values: {
        server_url: serverUrl,
        token,
        priority: parsed.searchParams.get("priority") ?? "",
      },
    })
  }

  if (type === "ntfy") {
    const parsed = convertCustomSchemeUrl(url, "ntfys", "ntfy")
    if (!parsed) return createNotificationTarget("ntfy", { id, enabled })
    const segments = parsed.pathname.split("/").filter(Boolean)
    const topic = decodeURIComponent(segments.pop() ?? "")
    const serverUrl = `${parsed.protocol}//${parsed.host}${segments.length ? `/${segments.join("/")}` : ""}`
    return createNotificationTarget("ntfy", {
      id,
      enabled,
      values: {
        server_url: serverUrl,
        topic,
        token: decodeURIComponent(parsed.username ?? ""),
      },
    })
  }

  if (type === "discord") {
    if (/^discord:\/\//i.test(url.trim())) {
      const match = url.trim().match(/^discord:\/\/([^/]+)\/([^/?#]+)/i)
      return createNotificationTarget("discord", {
        id,
        enabled,
        values: {
          webhook_id: decodeURIComponent(match?.[1] ?? ""),
          webhook_token: decodeURIComponent(match?.[2] ?? ""),
        },
      })
    }

    const parsed = normalizeServerUrl(url)
    const segments = parsed?.pathname.split("/").filter(Boolean) ?? []
    const webhookIndex = segments.findIndex((segment) => segment === "webhooks")
    return createNotificationTarget("discord", {
      id,
      enabled,
      values: {
        webhook_id: webhookIndex >= 0 ? decodeURIComponent(segments[webhookIndex + 1] ?? "") : "",
        webhook_token: webhookIndex >= 0 ? decodeURIComponent(segments[webhookIndex + 2] ?? "") : "",
      },
    })
  }

  return createNotificationTarget("custom", {
    id,
    enabled,
    values: {
      custom_label: target.label ?? "",
      url,
    },
  })
}

export function normalizeNotificationTargets(targets: NotificationTarget[] = []) {
  const seenTypes = new Set<ChannelKind>()
  const normalized: NotificationFormTarget[] = []
  for (const target of targets) {
    const parsed = parseNotificationTarget(target)
    if (seenTypes.has(parsed.type)) continue
    seenTypes.add(parsed.type)
    normalized.push(parsed)
  }
  return normalized.sort(
    (left, right) =>
      NOTIFICATION_CHANNEL_ORDER.indexOf(left.type) - NOTIFICATION_CHANNEL_ORDER.indexOf(right.type),
  )
}
