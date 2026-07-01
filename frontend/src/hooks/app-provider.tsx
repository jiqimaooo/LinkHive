import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import type { ActionEvent, ActionName, ActionSnapshot, ApnFormState, AuthStatus, ChannelKind, KeepaliveFormTask, KeepaliveSettings, NotificationFormTarget, PersistedAction, ProfileSmscFormState, StatusData } from "@/lib/types"
import { requestJson, sleep } from "@/lib/api"
import {
  getKeepalive,
  getNotifications,
  normalizeKeepaliveTasks,
  buildProfileSmscForms,
  notificationChannelLabel,
  notificationFieldValue,
  inferRadioMode,
} from "@/lib/helpers"
import {
  NOTIFICATION_CHANNEL_DEFINITIONS,
  NOTIFICATION_CHANNEL_ORDER,
  ACTIVE_ACTION_KEY,
  buildNotificationUrl,
  normalizeNotificationTargets,
} from "@/lib/constants"
import { AppContext } from "./app-context"

export function AppProvider({ children }: { children: ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "" })
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [status, setStatus] = useState<StatusData | null>(null)
  const [logs, setLogs] = useState<ActionEvent[]>([])
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeAction, setActiveAction] = useState<PersistedAction | null>(null)
  const [submittingActionLabel, setSubmittingActionLabel] = useState<string | null>(null)
  const [notificationTargets, setNotificationTargets] = useState<NotificationFormTarget[]>([])
  const [newNotificationType, setNewNotificationType] = useState<ChannelKind>("bark")
  const [keepaliveSettings, setKeepaliveSettings] = useState<KeepaliveSettings>({ queue_gap_seconds: 180 })
  const [keepaliveTasks, setKeepaliveTasks] = useState<KeepaliveFormTask[]>([])
  const [expandedKeepaliveTaskId, setExpandedKeepaliveTaskId] = useState<string | null>(null)
  const [profileSmscForms, setProfileSmscForms] = useState<Record<string, ProfileSmscFormState>>({})
  const [expandedProfileIccid, setExpandedProfileIccid] = useState<string | null>(null)
  const [apnForm, setApnForm] = useState<ApnFormState>({ apn: "", username: "", password: "", ip_type: "ipv4v6" })
  const [networkCode, setNetworkCode] = useState("")
  const [radioMode, setRadioMode] = useState("network_disabled")
  const [switchingMode, setSwitchingMode] = useState<"physical" | "esim" | null>(null)

  const notificationsDirtyRef = useRef(false)
  const keepaliveDirtyRef = useRef(false)
  const profileSmscDirtyRef = useRef(false)
  const apnDirtyRef = useRef(false)
  const networkDirtyRef = useRef(false)
  const radioModeDirtyRef = useRef(false)
  const pollTokenRef = useRef(0)

  const appendLog = useCallback((event: ActionEvent) => {
    setLogs((current) => [...current.slice(-199), event])
  }, [])

  const refreshAuthStatus = useCallback(async () => {
    const snapshot = await requestJson<AuthStatus>("/api/auth/status")
    setAuthStatus(snapshot)
    return snapshot
  }, [])

  const syncFormsFromStatus = useCallback((snapshot: StatusData) => {
    if (!notificationsDirtyRef.current) {
      setNotificationTargets(normalizeNotificationTargets(getNotifications(snapshot).targets))
    }
    if (!keepaliveDirtyRef.current) {
      const keepalive = getKeepalive(snapshot)
      setKeepaliveSettings(keepalive.settings)
      setKeepaliveTasks(normalizeKeepaliveTasks(keepalive.tasks))
    }
    if (!profileSmscDirtyRef.current) {
      setProfileSmscForms(buildProfileSmscForms(snapshot.profiles))
    }
    if (!apnDirtyRef.current) {
      setApnForm({
        apn: snapshot.connection.apn,
        username: snapshot.connection.username,
        password: snapshot.connection.password ?? "",
        ip_type: snapshot.connection.ip_type || "ipv4v6",
      })
    }
    if (!networkDirtyRef.current) setNetworkCode(snapshot.connection.network_id)
    if (!radioModeDirtyRef.current) {
      setRadioMode(inferRadioMode(snapshot.modem.current_modes))
    }
  }, [])

  const refreshStatus = useCallback(async (silent = false, refreshProfiles = false, refreshSms = false) => {
    if (!silent) setIsRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (refreshProfiles) params.set("refresh_profiles", "1")
      if (refreshSms) params.set("refresh_sms", "1")
      const query = params.toString()
      const snapshot = await requestJson<StatusData>(
        query ? `/api/status?${query}` : "/api/status",
      )
      setStatus(snapshot)
      syncFormsFromStatus(snapshot)
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "刷新状态失败")
    } finally {
      setIsLoadingStatus(false)
      if (!silent) setIsRefreshing(false)
    }
  }, [syncFormsFromStatus])

  const [totpRequired, setTotpRequired] = useState(false)
  const [banRemaining, setBanRemaining] = useState(0)

  const login = useCallback(async (totpCode?: string) => {
    setIsLoggingIn(true)
    try {
      const body: Record<string, string> = { ...loginForm }
      if (totpCode) body.totp_code = totpCode
      const snapshot = await requestJson<AuthStatus & { ok?: true; totp_required?: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (snapshot.totp_required) {
        setTotpRequired(true)
        setIsLoggingIn(false)
        return
      }
      setAuthStatus({
        auth_enabled: (snapshot as AuthStatus).auth_enabled,
        authenticated: (snapshot as AuthStatus).authenticated,
        username: (snapshot as AuthStatus).username,
      })
      setLoginForm((current) => ({ ...current, password: "" }))
      setTotpRequired(false)
      await refreshStatus(false, true)
    } catch (error) {
      const err = error as Error & { data?: Record<string, unknown> }
      if (err.data?.ban_remaining && typeof err.data.ban_remaining === 'number') {
        setBanRemaining(err.data.ban_remaining as number)
      } else {
        toast.error(err.message || "登录失败")
      }
    } finally {
      setIsLoggingIn(false)
    }
  }, [loginForm, refreshStatus])

  const logout = useCallback(async () => {
    await requestJson("/api/auth/logout", { method: "POST" }).catch(() => null)
    setAuthStatus((current) => ({
      auth_enabled: current?.auth_enabled ?? true,
      authenticated: false,
      username: current?.username ?? "admin",
    }))
    setStatus(null)
  }, [])

  const switchSimMode = useCallback(async (simType: "physical" | "esim") => {
    if (switchingMode || status?.capabilities.sim_type === simType) return
    setSwitchingMode(simType)
    try {
      const response = await requestJson<{ ok: true; status: StatusData }>("/api/settings/sim-mode", {
        method: "POST",
        body: JSON.stringify({ sim_type: simType }),
      })
      setStatus(response.status)
      syncFormsFromStatus(response.status)
      toast.success(simType === "esim" ? "已启用 eSIM 模式" : "已启用普通 SIM 模式")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换 SIM 模式失败")
    } finally {
      setSwitchingMode(null)
    }
  }, [status?.capabilities.sim_type, switchingMode, syncFormsFromStatus])

  const finishAction = useCallback((snapshot: ActionSnapshot, currentAction: PersistedAction) => {
    if (snapshot.status) {
      setStatus(snapshot.status)
      syncFormsFromStatus(snapshot.status)
    }
    window.localStorage.removeItem(ACTIVE_ACTION_KEY)
    setActiveAction(null)
    setSubmittingActionLabel(null)
    notificationsDirtyRef.current = false
    keepaliveDirtyRef.current = false
    profileSmscDirtyRef.current = false
    apnDirtyRef.current = false
    networkDirtyRef.current = false
    radioModeDirtyRef.current = false
    if (snapshot.state === "done") {
      toast.success(`${currentAction.label}已完成`)
      return
    }
    toast.error(snapshot.error || `${currentAction.label}失败`)
  }, [syncFormsFromStatus])

  const pollAction = useCallback(async (persisted: PersistedAction) => {
    const token = ++pollTokenRef.current
    let cursor = persisted.cursor
    while (pollTokenRef.current === token) {
      try {
        const snapshot = await requestJson<ActionSnapshot>(`/api/action/${persisted.id}?cursor=${cursor}`)
        if (snapshot.events.length > 0) {
          for (const event of snapshot.events) appendLog(event)
          cursor = snapshot.cursor
          const nextAction = { ...persisted, cursor }
          setActiveAction(nextAction)
          window.localStorage.setItem(ACTIVE_ACTION_KEY, JSON.stringify(nextAction))
          persisted = nextAction
        }
        if (snapshot.state === "done" || snapshot.state === "error") {
          finishAction(snapshot, persisted)
          return
        }
      } catch (error) {
        window.localStorage.removeItem(ACTIVE_ACTION_KEY)
        setActiveAction(null)
        setSubmittingActionLabel(null)
        appendLog({
          time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          level: "error",
          message: error instanceof Error ? error.message : "轮询任务状态失败",
        })
        toast.error("任务状态同步失败")
        return
      }
      await sleep(700)
    }
  }, [appendLog, finishAction])

  const runAction = useCallback(async (action: ActionName, payload: Record<string, unknown>, label: string) => {
    if (activeAction || submittingActionLabel) {
      toast.info("当前已有任务在执行，请稍等")
      return
    }
    setSubmittingActionLabel(label)
    appendLog({
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "info",
      message: `准备执行：${label}`,
    })
    try {
      const response = await requestJson<{ ok: true; id: string }>("/api/action/start", {
        method: "POST",
        body: JSON.stringify({ action, payload }),
      })
      const persisted: PersistedAction = {
        id: response.id,
        action,
        label,
        cursor: 0,
        target:
          typeof payload.iccid === "string"
            ? payload.iccid
            : typeof payload.operator_code === "string"
              ? payload.operator_code
              : "",
      }
      setActiveAction(persisted)
      setSubmittingActionLabel(null)
      window.localStorage.setItem(ACTIVE_ACTION_KEY, JSON.stringify(persisted))
      appendLog({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "info",
        message: `任务已提交：${label}（${response.id}）`,
      })
      void pollAction(persisted)
    } catch (error) {
      setSubmittingActionLabel(null)
      const message = error instanceof Error ? error.message : "提交任务失败"
      appendLog({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "error",
        message,
      })
      toast.error(message)
    }
  }, [activeAction, appendLog, pollAction, submittingActionLabel])

  const saveNotifications = useCallback(async (targetsOverride?: NotificationFormTarget[]) => {
    if (activeAction || submittingActionLabel) {
      toast.info("当前已有任务在执行，请稍等")
      return false
    }

    try {
      const targetsToSave = targetsOverride ?? notificationTargets
      const payloadTargets = targetsToSave.map((target, index) => {
        const definition = NOTIFICATION_CHANNEL_DEFINITIONS[target.type]
        const url = buildNotificationUrl(target)
        if (target.enabled) {
          const missingField = definition.fields.find(
            (field) => field.required && !notificationFieldValue(target, field.key).trim(),
          )
          if (missingField) {
            throw new Error(`${definition.label} 还缺少 ${missingField.label}`)
          }

          if (!url.trim()) {
            throw new Error(`${definition.label} 配置还不完整`)
          }
        }

        return {
          id: target.id || `notification-${index + 1}`,
          label: notificationChannelLabel(target),
          url,
          enabled: target.enabled,
          type: target.type,
        }
      })

      setSubmittingActionLabel("保存通知渠道")
      appendLog({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "info",
        message: `准备执行：保存通知渠道（${payloadTargets.length} 条）`,
      })

      const response = await requestJson<{ ok: boolean; status?: StatusData }>("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          action: "save_notifications",
          targets: payloadTargets,
        }),
      })

      notificationsDirtyRef.current = false
      setSubmittingActionLabel(null)

      if (response.status) {
        setStatus(response.status)
        syncFormsFromStatus(response.status)
      } else {
        await refreshStatus(false)
      }

      appendLog({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "info",
        message: "通知渠道已保存",
      })
      toast.success("通知渠道配置已保存")
      return true
    } catch (error) {
      setSubmittingActionLabel(null)
      const message = error instanceof Error ? error.message : "保存通知渠道失败"
      appendLog({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "error",
        message,
      })
      toast.error(message)
      return false
    }
  }, [activeAction, appendLog, notificationTargets, refreshStatus, submittingActionLabel, syncFormsFromStatus])

  const esimEnabled = status?.capabilities.esim_management_enabled ?? true

  const saveKeepalive = useCallback(async () => {
    if (activeAction || submittingActionLabel) {
      toast.info("当前已有任务在执行，请稍等")
      return
    }

    try {
      const payloadTasks = keepaliveTasks.map((task, index) => {
        const device = (status?.devices ?? []).find((item) => item.id === task.device_id)
        if (!task.label.trim()) throw new Error(`第 ${index + 1} 条保活任务缺少名称`)
        if (!task.device_id.trim()) throw new Error(`保活任务 ${task.label} 缺少目标设备`)
        if (!device) throw new Error(`保活任务 ${task.label} 绑定的设备当前不可用`)
        if (!task.target_number.trim()) throw new Error(`保活任务 ${task.label} 缺少目标手机号`)
        if (!task.message.trim()) throw new Error(`保活任务 ${task.label} 缺少短信内容`)
        if (task.cron_expression.trim().split(/\s+/).length !== 5) throw new Error(`保活任务 ${task.label} 的 cron 表达式必须是 5 段`)
        return {
          id: task.id,
          label: task.label.trim(),
          enabled: task.enabled,
          device_id: task.device_id.trim(),
          profile_iccid: task.profile_iccid.trim(),
          target_number: task.target_number.trim(),
          message: task.message,
          cron_expression: task.cron_expression.trim(),
        }
      })

      setSubmittingActionLabel("保存保活配置")
      appendLog({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "info",
        message: `准备执行：保存保活配置（${payloadTasks.length} 条）`,
      })

      const response = await requestJson<{ ok: boolean; status?: StatusData }>("/api/keepalive", {
        method: "POST",
        body: JSON.stringify({ settings: keepaliveSettings, tasks: payloadTasks }),
      })

      keepaliveDirtyRef.current = false
      setSubmittingActionLabel(null)

      if (response.status) {
        setStatus(response.status)
        syncFormsFromStatus(response.status)
      } else {
        await refreshStatus(false)
      }

      appendLog({ time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), level: "info", message: "保活配置已保存" })
      toast.success("保活配置已保存")
    } catch (error) {
      setSubmittingActionLabel(null)
      const message = error instanceof Error ? error.message : "保存保活配置失败"
      appendLog({ time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), level: "error", message })
      toast.error(message)
    }
  }, [activeAction, appendLog, keepaliveSettings, keepaliveTasks, refreshStatus, status?.devices, submittingActionLabel, syncFormsFromStatus])

  const sendKeepaliveTestSms = useCallback(async (task: KeepaliveFormTask) => {
    const number = task.target_number.trim()
    const message = task.message.trim()
    const taskLabel = task.label.trim() || "保活任务"
    if (!number) { toast.error(`保活任务 ${taskLabel} 缺少目标手机号`); return }
    if (!message) { toast.error(`保活任务 ${taskLabel} 缺少短信内容`); return }
    if (!task.device_id.trim()) { toast.error(`保活任务 ${taskLabel} 缺少目标设备`); return }
    await runAction("send_test_sms", { device_id: task.device_id, number, message }, `测试保活短信 ${taskLabel}`)
  }, [runAction])

  const saveProfileSmsc = useCallback(async (profile: import("@/lib/types").Profile, preset?: ProfileSmscFormState) => {
    const currentValue = preset ?? profileSmscForms[profile.iccid] ?? { address: "", type: "145" }
    const address = currentValue.address.trim()
    const type = currentValue.type.trim() || "145"
    if (!address) { toast.error(`${profile.display_name} 缺少短信中心号码`); return }
    if (!/^\d{1,3}$/.test(type)) { toast.error(`${profile.display_name} 的短信中心类型必须是数字`); return }
    profileSmscDirtyRef.current = true
    if (preset) {
      setProfileSmscForms((current) => ({ ...current, [profile.iccid]: preset }))
    }
    await runAction(
      "save_profile_smsc",
      { device_id: profile.device_id || "", iccid: profile.iccid, smsc_address: address, smsc_type: type, apply_now: Boolean(profile.is_active) },
      profile.is_active ? `保存并应用 ${profile.display_name} 的短信中心` : `保存 ${profile.display_name} 的短信中心`,
    )
  }, [profileSmscForms, runAction])

  // Initial load
  useEffect(() => {
    void (async () => {
      const auth = await refreshAuthStatus()
      if (auth.auth_enabled && !auth.authenticated) {
        setIsLoadingStatus(false)
        return
      }
      await refreshStatus(true)
      const persistedRaw = window.localStorage.getItem(ACTIVE_ACTION_KEY)
      if (!persistedRaw) return
      try {
        const persisted = JSON.parse(persistedRaw) as PersistedAction
        setActiveAction(persisted)
        appendLog({
          time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          level: "info",
          message: `已恢复任务追踪：${persisted.label}`,
        })
        void pollAction(persisted)
      } catch {
        window.localStorage.removeItem(ACTIVE_ACTION_KEY)
      }
    })()
  }, [appendLog, pollAction, refreshAuthStatus, refreshStatus])

  // Auto-refresh
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!authStatus?.authenticated || !autoRefresh || activeAction) return
      void refreshStatus(true)
    }, 10000)
    return () => { window.clearInterval(intervalId) }
  }, [activeAction, authStatus?.authenticated, autoRefresh, refreshStatus])

  useEffect(() => {
    return () => { pollTokenRef.current += 1 }
  }, [])

  // Auto-select next notification type
  useEffect(() => {
    const usedTypes = new Set(notificationTargets.map((target) => target.type))
    const nextType =
      NOTIFICATION_CHANNEL_ORDER.find((type) => !usedTypes.has(type) && type === newNotificationType) ??
      NOTIFICATION_CHANNEL_ORDER.find((type) => !usedTypes.has(type)) ??
      "custom"
    if (nextType !== newNotificationType) setNewNotificationType(nextType)
  }, [newNotificationType, notificationTargets])

  // Cleanup expanded IDs
  useEffect(() => {
    if (!expandedKeepaliveTaskId) return
    if (!keepaliveTasks.some((task) => task.id === expandedKeepaliveTaskId)) setExpandedKeepaliveTaskId(null)
  }, [expandedKeepaliveTaskId, keepaliveTasks])

  useEffect(() => {
    if (!expandedProfileIccid) return
    if (!(status?.profiles ?? []).some((profile) => profile.iccid === expandedProfileIccid)) setExpandedProfileIccid(null)
  }, [expandedProfileIccid, status?.profiles])

  const currentSimType: "physical" | "esim" = status?.capabilities.sim_type === "physical" ? "physical" : "esim"
  const actionBusy = Boolean(activeAction || submittingActionLabel)

  const ctx: AppContextType = {
    authStatus, loginForm, setLoginForm, isLoggingIn, totpRequired, banRemaining, login, logout,
    status, isLoadingStatus, isRefreshing, autoRefresh, setAutoRefresh, refreshStatus,
    logs, activeAction, submittingActionLabel, actionBusy, appendLog, setLogs, runAction,
    switchingMode, switchSimMode,
    notificationTargets, setNotificationTargets, newNotificationType, setNewNotificationType, saveNotifications,
    keepaliveSettings, setKeepaliveSettings, keepaliveTasks, setKeepaliveTasks, expandedKeepaliveTaskId, setExpandedKeepaliveTaskId, saveKeepalive, sendKeepaliveTestSms,
    profileSmscForms, setProfileSmscForms, expandedProfileIccid, setExpandedProfileIccid, saveProfileSmsc,
    apnForm, setApnForm,
    networkCode, setNetworkCode, radioMode, setRadioMode,
    esimEnabled, currentSimType,
    notificationsDirtyRef, keepaliveDirtyRef, profileSmscDirtyRef, apnDirtyRef, networkDirtyRef, radioModeDirtyRef,
  }

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>
}

// Re-export
import type { AppContextType } from "./app-context"
export type { AppContextType }
