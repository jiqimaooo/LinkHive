export type Profile = {
  iccid: string
  display_name: string
  provider_name?: string
  is_active?: boolean
  iccid_short?: string
  state?: string
  smsc_address?: string
  smsc_type?: string
}

export type SmsItem = {
  id: string
  number: string
  text: string
  timestamp: string
  state: string
  state_label: string
}

export type StatusData = {
  profiles: Profile[]
  capabilities: {
    sim_type: string
    esim_management_enabled: boolean
    lpac_installed: boolean
  }
  modem_available: boolean
  status_message: string
  errors: string[]
  modem: {
    number: string
    operator_code: string
    operator_name: string
    registration: string
    state: string
    signal: string
    access_tech: string
    current_modes: string
    apn: string
    ip_type: string
  }
  connection: {
    apn: string
    username: string
    password?: string
    ip_type: string
    network_id: string
  }
  services: {
    modemmanager: string
    sms_forwarder: string
    web_admin: string
  }
  notifications?: {
    configured_count: number
    configured_labels: string[]
    targets: NotificationTarget[]
  }
  keepalive?: {
    settings: KeepaliveSettings
    tasks: KeepaliveTask[]
    active_run: KeepaliveRun | null
    queued_runs: KeepaliveRun[]
    recent_runs: KeepaliveRun[]
    next_allowed_at: string
  }
  sms: SmsItem[]
  timestamp: string
}

export type AuthStatus = {
  auth_enabled: boolean
  authenticated: boolean
  username: string
}

export type KeepaliveSettings = {
  queue_gap_seconds: number
}

export type KeepaliveTask = {
  id: string
  label: string
  enabled: boolean
  profile_iccid: string
  profile_name: string
  target_number: string
  message: string
  cron_expression: string
  schedule_label: string
  next_run: string
  next_run_label: string
}

export type KeepaliveRun = {
  id: string
  task_id: string
  label: string
  trigger: string
  scheduled_for: string
  scheduled_for_label: string
  profile_iccid: string
  profile_name: string
  target_number: string
  state: "queued" | "running" | "done" | "error" | string
  error: string
  last_message: string
  created_at: string
  updated_at: string
}

export type NotificationTarget = {
  id: string
  label: string
  url: string
  enabled: boolean
  type: string
}

export type ChannelKind = "bark" | "telegram" | "gotify" | "ntfy" | "discord" | "custom"

export type NotificationChannelField = {
  key: string
  label: string
  placeholder: string
  required?: boolean
  inputType?: "text" | "password" | "url"
  options?: Array<{ label: string; value: string }>
}

export type NotificationChannelDefinition = {
  type: ChannelKind
  label: string
  description: string
  fields: NotificationChannelField[]
  createValues: () => Record<string, string>
}

export type ActionLevel = "info" | "warning" | "error" | "command"

export type ActionEvent = {
  time: string
  level: ActionLevel
  message: string
}

export type ActionState = "queued" | "running" | "done" | "error"

export type ActionName =
  | "switch_profile"
  | "recover_modem"
  | "restart_sms"
  | "resend_last_sms"
  | "send_test_sms"
  | "save_profile_smsc"
  | "run_keepalive_task"
  | "save_apn"
  | "save_notifications"
  | "apply_radio_mode"
  | "apply_network_selection"

export type ActionSnapshot = {
  ok: boolean
  id: string
  action: ActionName
  state: ActionState
  events: ActionEvent[]
  cursor: number
  message: string
  error: string
  status?: StatusData
}

export type PersistedAction = {
  id: string
  action: ActionName
  label: string
  cursor: number
  target?: string
}

export type NotificationFormTarget = {
  id: string
  type: ChannelKind
  enabled: boolean
  values: Record<string, string>
}

export type ApnFormState = {
  apn: string
  username: string
  password: string
  ip_type: string
}

export type ProfileSmscFormState = {
  address: string
  type: string
}

export type KeepaliveFormTask = {
  id: string
  label: string
  enabled: boolean
  profile_iccid: string
  target_number: string
  message: string
  cron_expression: string
}

export const EMPTY_NOTIFICATIONS = {
  configured_count: 0,
  configured_labels: [],
  targets: [],
} satisfies NonNullable<StatusData["notifications"]>

export const EMPTY_KEEPALIVE = {
  settings: { queue_gap_seconds: 180 },
  tasks: [],
  active_run: null,
  queued_runs: [],
  recent_runs: [],
  next_allowed_at: "",
} satisfies NonNullable<StatusData["keepalive"]>
