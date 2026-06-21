import { createContext, useContext, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import type { ActionEvent, ActionName, ApnFormState, AuthStatus, KeepaliveFormTask, KeepaliveSettings, NotificationFormTarget, PersistedAction, ProfileSmscFormState, StatusData } from "@/lib/types"
import type { ChannelKind } from "@/lib/types"

export type AppContextType = {
  // Auth
  authStatus: AuthStatus | null
  loginForm: { username: string; password: string }
  setLoginForm: (updater: (current: { username: string; password: string }) => { username: string; password: string }) => void
  isLoggingIn: boolean
  login: () => Promise<void>
  logout: () => Promise<void>

  // Status
  status: StatusData | null
  isLoadingStatus: boolean
  isRefreshing: boolean
  autoRefresh: boolean
  setAutoRefresh: (value: boolean) => void
  refreshStatus: (silent?: boolean, refreshProfiles?: boolean) => Promise<void>

  // Actions
  logs: ActionEvent[]
  activeAction: PersistedAction | null
  submittingActionLabel: string | null
  actionBusy: boolean
  appendLog: (event: ActionEvent) => void
  setLogs: Dispatch<SetStateAction<ActionEvent[]>>
  runAction: (action: ActionName, payload: Record<string, unknown>, label: string) => Promise<void>

  // SIM Mode
  switchingMode: "physical" | "esim" | null
  switchSimMode: (simType: "physical" | "esim") => Promise<void>

  // Notifications
  notificationTargets: NotificationFormTarget[]
  setNotificationTargets: (updater: (current: NotificationFormTarget[]) => NotificationFormTarget[]) => void
  newNotificationType: ChannelKind
  setNewNotificationType: (value: ChannelKind) => void
  saveNotifications: () => Promise<void>

  // Keepalive
  keepaliveSettings: KeepaliveSettings
  setKeepaliveSettings: (updater: (current: KeepaliveSettings) => KeepaliveSettings) => void
  keepaliveTasks: KeepaliveFormTask[]
  setKeepaliveTasks: (updater: (current: KeepaliveFormTask[]) => KeepaliveFormTask[]) => void
  expandedKeepaliveTaskId: string | null
  setExpandedKeepaliveTaskId: (value: string | null) => void
  saveKeepalive: () => Promise<void>
  sendKeepaliveTestSms: (task: KeepaliveFormTask) => Promise<void>

  // Profiles
  profileSmscForms: Record<string, ProfileSmscFormState>
  setProfileSmscForms: (updater: (current: Record<string, ProfileSmscFormState>) => Record<string, ProfileSmscFormState>) => void
  expandedProfileIccid: string | null
  setExpandedProfileIccid: (value: string | null) => void
  saveProfileSmsc: (profile: import("@/lib/types").Profile, preset?: ProfileSmscFormState) => Promise<void>

  // APN
  apnForm: ApnFormState
  setApnForm: (updater: (current: ApnFormState) => ApnFormState) => void

  // Network
  networkCode: string
  setNetworkCode: (value: string) => void
  radioMode: string
  setRadioMode: (value: string) => void

  // Shell panel
  shellPanelOpen: boolean
  setShellPanelOpen: (value: boolean) => void

  // Derived
  esimEnabled: boolean
  currentSimType: "physical" | "esim"

  // Dirty refs
  notificationsDirtyRef: MutableRefObject<boolean>
  keepaliveDirtyRef: MutableRefObject<boolean>
  profileSmscDirtyRef: MutableRefObject<boolean>
  apnDirtyRef: MutableRefObject<boolean>
  networkDirtyRef: MutableRefObject<boolean>
  radioModeDirtyRef: MutableRefObject<boolean>
}

export const AppContext = createContext<AppContextType | null>(null)

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppContext must be used within AppProvider")
  return ctx
}
