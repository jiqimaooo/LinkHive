import { useEffect, useMemo, useState, type MutableRefObject } from "react"
import { useLocation } from "react-router-dom"
import {
  BadgeCheckIcon,
  CardSimIcon,
  CpuIcon,
  DownloadCloudIcon,
  MessageSquareTextIcon,
  RadioTowerIcon,
  RefreshCwIcon,
  RouterIcon,
  SendIcon,
  SettingsIcon,
  SignalIcon,
  SmartphoneIcon,
  UploadCloudIcon,
  WifiIcon,
} from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  displayValue,
  formatAccessTech,
  formatCurrentModes,
  formatOperatorName,
  formatRegistrationState,
  friendlyActionName,
  inferRadioMode,
} from "@/lib/helpers"
import type { DeviceStatus, Profile } from "@/lib/types"

const TAB_ITEMS = [
  { key: "overview", label: "概览", icon: CpuIcon },
  { key: "network", label: "网络", icon: SettingsIcon },
  { key: "esim", label: "eSIM", icon: BadgeCheckIcon },
  { key: "actions", label: "操作", icon: RouterIcon },
] as const

type TabKey = (typeof TAB_ITEMS)[number]["key"]

type NetworkForm = {
  apn: string
  username: string
  password: string
  ip_type: string
}

const RADIO_MODE_LABELS: Record<string, string> = {
  "4g_only": "仅 4G",
  "3g4g_prefer4g": "3G / 4G，优先 4G",
  "3g_only": "仅 3G",
}

const IP_TYPE_LABELS: Record<string, string> = {
  ipv4: "仅 IPv4",
  ipv6: "仅 IPv6",
  ipv4v6: "IPv4 / IPv6",
}

export default function DevicesPage() {
  const location = useLocation()
  const {
    status,
    activeAction,
    isRefreshing,
    refreshStatus,
    runAction,
    actionBusy,
    profileSmscForms,
    setProfileSmscForms,
    expandedProfileIccid,
    setExpandedProfileIccid,
    saveProfileSmsc,
    profileSmscDirtyRef,
  } = useAppContext()
  const devices = useMemo(() => status?.devices ?? [], [status?.devices])
  const [selectedDeviceId, setSelectedDeviceId] = useState("")
  const [activeTab, setActiveTab] = useState<TabKey>(() => routeTab(location.pathname))
  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? devices[0] ?? null,
    [devices, selectedDeviceId],
  )

  useEffect(() => {
    setActiveTab(routeTab(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    if (!devices.length) {
      setSelectedDeviceId("")
      return
    }
    if (!selectedDeviceId || !devices.some((device) => device.id === selectedDeviceId)) {
      setSelectedDeviceId(devices[0].id)
    }
  }, [devices, selectedDeviceId])

  return (
    <div className="space-y-5">
      <PageHeader
        title="设备管理"
        description="按设备管理蜂窝网络、短信能力和 eSIM Profiles。"
        actions={
          <>
            {activeAction ? <Badge variant="outline">{friendlyActionName(activeAction.action)}</Badge> : null}
            <button
              type="button"
              onClick={() => { void refreshStatus(false, true) }}
              disabled={isRefreshing}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground disabled:opacity-50 dark:hover:bg-white/10"
              aria-label="刷新"
            >
              <RefreshCwIcon className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            </button>
          </>
        }
      />

      {!devices.length ? (
        <div className="glass-card rounded-2xl p-10">
          <EmptyState icon={SmartphoneIcon} title="未检测到蜂窝设备" description="请确认 Quectel 模组、/dev/cdc-wdm0 或 AT 串口已就绪，然后刷新状态。" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <DeviceList devices={devices} selectedDeviceId={selectedDevice?.id ?? ""} onSelect={setSelectedDeviceId} />
          {selectedDevice ? (
            <DeviceDetail
              device={selectedDevice}
              profiles={status?.profiles ?? []}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              actionBusy={actionBusy}
              runAction={runAction}
              profileSmscForms={profileSmscForms}
              setProfileSmscForms={setProfileSmscForms}
              expandedProfileIccid={expandedProfileIccid}
              setExpandedProfileIccid={setExpandedProfileIccid}
              saveProfileSmsc={saveProfileSmsc}
              profileSmscDirtyRef={profileSmscDirtyRef}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function routeTab(pathname: string): TabKey {
  if (pathname.includes("/network")) return "network"
  if (pathname.includes("/esim")) return "esim"
  return "overview"
}

function DeviceList({ devices, selectedDeviceId, onSelect }: { devices: DeviceStatus[]; selectedDeviceId: string; onSelect: (id: string) => void }) {
  return (
    <aside className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">设备列表</div>
      {devices.map((device) => {
        const selected = device.id === selectedDeviceId
        return (
          <button
            key={device.id}
            type="button"
            onClick={() => onSelect(device.id)}
            className={cn(
              "glass-panel w-full rounded-2xl p-4 text-left transition-colors",
              selected && "glass-panel-selected",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
                <SmartphoneIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{device.label}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">IMEI {displayValue(device.imei, "--")}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant={device.registration === "home" || device.registration === "roaming" ? "default" : "outline"}>{formatRegistrationState(device.registration)}</Badge>
                  <Badge variant="outline">{formatActiveSimKind(device.active_sim_kind)}</Badge>
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </aside>
  )
}

function DeviceDetail({
  device,
  profiles,
  activeTab,
  setActiveTab,
  actionBusy,
  runAction,
  profileSmscForms,
  setProfileSmscForms,
  expandedProfileIccid,
  setExpandedProfileIccid,
  saveProfileSmsc,
  profileSmscDirtyRef,
}: {
  device: DeviceStatus
  profiles: Profile[]
  activeTab: TabKey
  setActiveTab: (tab: TabKey) => void
  actionBusy: boolean
  runAction: (action: import("@/lib/types").ActionName, payload: Record<string, unknown>, label: string) => Promise<void>
  profileSmscForms: Record<string, { address: string; type: string }>
  setProfileSmscForms: (updater: (current: Record<string, { address: string; type: string }>) => Record<string, { address: string; type: string }>) => void
  expandedProfileIccid: string | null
  setExpandedProfileIccid: (value: string | null) => void
  saveProfileSmsc: (profile: Profile, preset?: { address: string; type: string }) => Promise<void>
  profileSmscDirtyRef: MutableRefObject<boolean>
}) {
  const deviceProfiles = profiles.filter((profile) => !profile.device_id || profile.device_id === device.id)

  return (
    <section className="glass-card overflow-hidden rounded-2xl">
      <div className="border-b border-white/60 p-5 dark:border-white/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold">{device.label}</h2>
              <Badge variant={device.registration === "home" || device.registration === "roaming" ? "default" : "outline"}>
                {formatRegistrationState(device.registration)}
              </Badge>
              {device.source === "at_probe" ? <Badge variant="outline">AT 探测</Badge> : null}
              <Badge variant="outline">{formatActiveSimKind(device.active_sim_kind)}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatOperatorName(device.operator_name, device.operator_code || device.home_operator_code)} · {formatAccessTech(device.access_tech || "--")} · 信号 {displayValue(device.signal_dbm, "--")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <MiniStat label="短信" value={device.capabilities.sms_supported ? "支持" : "不支持"} />
            <MiniStat label="eSIM" value={device.capabilities.esim_supported ? "支持" : "不支持"} />
            <MiniStat label="IP" value={displayValue(device.ip_address, "--")} />
            <MiniStat label="接口" value={displayValue(device.interface_name, "--")} />
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/60 px-4 dark:border-white/10">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "border-blue-600 text-blue-700 dark:border-blue-300 dark:text-blue-200"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === "overview" ? <OverviewTab device={device} /> : null}
        {activeTab === "network" ? <NetworkTab device={device} actionBusy={actionBusy} runAction={runAction} /> : null}
        {activeTab === "esim" ? (
          <EsimTab
            device={device}
            profiles={deviceProfiles}
            actionBusy={actionBusy}
            runAction={runAction}
            profileSmscForms={profileSmscForms}
            setProfileSmscForms={setProfileSmscForms}
            expandedProfileIccid={expandedProfileIccid}
            setExpandedProfileIccid={setExpandedProfileIccid}
            saveProfileSmsc={saveProfileSmsc}
            profileSmscDirtyRef={profileSmscDirtyRef}
          />
        ) : null}
        {activeTab === "actions" ? <ActionsTab device={device} actionBusy={actionBusy} runAction={runAction} /> : null}
      </div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-xl px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  )
}

function OverviewTab({ device }: { device: DeviceStatus }) {
  const groups = [
    {
      title: "设备",
      icon: CpuIcon,
      items: [
        ["IMEI", device.imei],
        ["设备号码", device.number],
      ],
    },
    {
      title: "SIM",
      icon: CardSimIcon,
      items: [
        ["ICCID", device.iccid],
        ["IMSI", device.imsi],
        ["EID", device.eid],
        ["PIN 状态", device.pin_state || device.probe?.pin_state],
        ["当前 SIM", device.sim_label],
        ["归属运营商", formatOperatorName(device.home_operator, device.home_operator_code)],
        ["归属运营商代码", device.home_operator_code],
      ],
    },
    {
      title: "网络",
      icon: RadioTowerIcon,
      items: [
        ["运营商代码", device.operator_code],
        ["频段", device.band],
      ],
    },
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title} className="glass-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">{group.title}</h3>
            <group.icon className="size-4 text-muted-foreground" />
          </div>
          <div className="divide-y divide-white/60 dark:divide-white/10">
            {group.items.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="min-w-0 truncate text-right font-medium">{displayValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function NetworkTab({ device, actionBusy, runAction }: { device: DeviceStatus; actionBusy: boolean; runAction: (action: import("@/lib/types").ActionName, payload: Record<string, unknown>, label: string) => Promise<void> }) {
  const [networkForm, setNetworkForm] = useState<NetworkForm>({ apn: "", username: "", password: "", ip_type: "ipv4v6" })
  const [radioMode, setRadioMode] = useState("network_disabled")
  const [networkCode, setNetworkCode] = useState("")

  useEffect(() => {
    setNetworkForm({
      apn: device.connection?.apn || "",
      username: device.connection?.username || "",
      password: device.connection?.password || "",
      ip_type: device.connection?.ip_type || "ipv4v6",
    })
    setRadioMode(inferRadioMode(device.current_modes || ""))
    setNetworkCode(device.connection?.network_id || "")
  }, [device])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="glass-panel rounded-2xl p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><WifiIcon className="size-4" />APN 配置</h3>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="apn">APN</Label><Input id="apn" value={networkForm.apn} onChange={(event) => setNetworkForm((current) => ({ ...current, apn: event.target.value }))} /></div>
          <div className="grid gap-2"><Label htmlFor="apn-user">用户名</Label><Input id="apn-user" value={networkForm.username} onChange={(event) => setNetworkForm((current) => ({ ...current, username: event.target.value }))} /></div>
          <div className="grid gap-2"><Label htmlFor="apn-password">密码</Label><Input id="apn-password" type="password" value={networkForm.password} onChange={(event) => setNetworkForm((current) => ({ ...current, password: event.target.value }))} /></div>
          <div className="grid gap-2"><Label>IP 类型</Label><Select value={networkForm.ip_type} onValueChange={(value) => setNetworkForm((current) => ({ ...current, ip_type: value ?? "ipv4v6" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(IP_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <Button type="button" disabled={actionBusy} onClick={() => { void runAction("save_apn", { ...networkForm, device_id: device.id }, `保存 ${device.label} APN`) }}><SendIcon data-icon="inline-start" />应用并保存</Button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><SignalIcon className="size-4" />网络制式与选网</h3>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>网络制式</Label><Select value={radioMode} onValueChange={(value) => setRadioMode(value ?? "network_disabled")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(RADIO_MODE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" disabled={actionBusy} onClick={() => { void runAction("apply_radio_mode", { device_id: device.id, mode: radioMode }, `应用 ${device.label} 网络制式`) }}>应用制式</Button></div>
          <div className="grid gap-2"><Label htmlFor="network-code">运营商代码</Label><Input id="network-code" value={networkCode} onChange={(event) => setNetworkCode(event.target.value)} placeholder="例如 46000" /><div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" disabled={actionBusy || !networkCode.trim()} onClick={() => { void runAction("apply_network_selection", { device_id: device.id, operator_code: networkCode.trim() }, `手动选网 ${networkCode.trim()}`) }}>手动选网</Button><Button type="button" variant="outline" disabled={actionBusy} onClick={() => { void runAction("apply_network_selection", { device_id: device.id, operator_code: "" }, `恢复 ${device.label} 自动选网`) }}>自动选网</Button></div></div>
          <div className="rounded-xl border border-white/60 p-3 text-sm text-muted-foreground dark:border-white/10 whitespace-pre-wrap">{formatCurrentModes(device.current_modes || "--")}</div>
        </div>
      </div>
    </div>
  )
}

function EsimTab({
  device,
  profiles,
  actionBusy,
  runAction,
  profileSmscForms,
  setProfileSmscForms,
  expandedProfileIccid,
  setExpandedProfileIccid,
  saveProfileSmsc,
  profileSmscDirtyRef,
}: {
  device: DeviceStatus
  profiles: Profile[]
  actionBusy: boolean
  runAction: (action: import("@/lib/types").ActionName, payload: Record<string, unknown>, label: string) => Promise<void>
  profileSmscForms: Record<string, { address: string; type: string }>
  setProfileSmscForms: (updater: (current: Record<string, { address: string; type: string }>) => Record<string, { address: string; type: string }>) => void
  expandedProfileIccid: string | null
  setExpandedProfileIccid: (value: string | null) => void
  saveProfileSmsc: (profile: Profile, preset?: { address: string; type: string }) => Promise<void>
  profileSmscDirtyRef: MutableRefObject<boolean>
}) {
  const canWriteProfile = Boolean(device.capabilities.lpac_supported)

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">eSIM 识别状态</h3>
              <p className="mt-1 text-sm text-muted-foreground">用于判断实体 eSIM、空卡和写入环境是否就绪。</p>
            </div>
            <Badge variant={canWriteProfile ? "default" : "outline"}>{canWriteProfile ? "lpac 已就绪" : "lpac 未部署"}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoRow label="识别来源" value={device.source === "direct_qmi" ? "QMI 直连" : "AT / QMI 直连"} />
            <InfoRow label="AT 端口" value={displayValue(device.probe?.port, "--")} />
            <InfoRow label="PIN 状态" value={displayValue(device.pin_state || device.probe?.pin_state, "--")} />
            <InfoRow label="ICCID" value={displayValue(device.iccid, "--")} />
            <InfoRow label="IMSI" value={displayValue(device.imsi, "--")} />
            <InfoRow label="EID" value={displayValue(device.eid, "未读到")} />
          </div>
          {!canWriteProfile ? (
            <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
              当前未检测到完整的 /opt/lpac/lpac，只能识别卡本体，暂不能写入 Profile。
            </div>
          ) : null}
        </div>

        <EsimDownloadPanel device={device} actionBusy={actionBusy} runAction={runAction} canWriteProfile={canWriteProfile} />
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Profiles</h3>
            <p className="mt-1 text-sm text-muted-foreground">写入完成后，新 Profile 会出现在这里。</p>
          </div>
          <Badge variant="outline">{profiles.length} 个</Badge>
        </div>
        {!profiles.length ? (
          <div className="rounded-xl border border-dashed border-white/70 p-8 dark:border-white/10">
            <EmptyState icon={BadgeCheckIcon} title="还没有读到 eSIM Profile" description={canWriteProfile ? "可以使用右侧写入入口下载 Profile。" : "请先部署 lpac，再刷新设备状态。"} />
          </div>
        ) : (
          <div className="grid gap-3">
            {profiles.map((profile) => {
              const isCurrent = Boolean(profile.is_active)
              const expanded = expandedProfileIccid === profile.iccid
              const form = profileSmscForms[profile.iccid] ?? { address: profile.smsc_address || "", type: profile.smsc_type || "145" }
              return (
                <div key={profile.iccid} className={cn("glass-panel rounded-2xl p-4", isCurrent && "glass-panel-selected")}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold">{profile.display_name}</h3>
                        <Badge variant={isCurrent ? "default" : "outline"}>{isCurrent ? "当前使用" : "待机"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">ICCID：{profile.iccid || "--"}</p>
                      <p className="text-sm text-muted-foreground">短信中心：{profile.smsc_address ? `${profile.smsc_address},${profile.smsc_type || "145"}` : "未配置"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setExpandedProfileIccid(expanded ? null : profile.iccid)}>{expanded ? "收起设置" : "短信中心"}</Button>
                      <Button type="button" size="sm" variant={isCurrent ? "secondary" : "outline"} disabled={actionBusy || isCurrent} onClick={() => { void runAction("switch_profile", { device_id: device.id, iccid: profile.iccid }, `切换 ${device.label} 到 ${profile.display_name}`) }}>{isCurrent ? "当前使用中" : "切换到此卡"}</Button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="mt-4 grid gap-3 rounded-xl border border-white/60 p-3 dark:border-white/10 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-end">
                      <div className="grid gap-2"><Label htmlFor={`smsc-${profile.iccid}`}>SMSC 号码</Label><Input id={`smsc-${profile.iccid}`} value={form.address} onChange={(event) => { profileSmscDirtyRef.current = true; setProfileSmscForms((current) => ({ ...current, [profile.iccid]: { ...form, address: event.target.value } })) }} /></div>
                      <div className="grid gap-2"><Label htmlFor={`smsc-type-${profile.iccid}`}>类型</Label><Input id={`smsc-type-${profile.iccid}`} value={form.type} onChange={(event) => { profileSmscDirtyRef.current = true; setProfileSmscForms((current) => ({ ...current, [profile.iccid]: { ...form, type: event.target.value } })) }} /></div>
                      <Button type="button" variant="outline" disabled={actionBusy} onClick={() => { void saveProfileSmsc(profile) }}>保存</Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function EsimDownloadPanel({
  device,
  actionBusy,
  runAction,
  canWriteProfile,
}: {
  device: DeviceStatus
  actionBusy: boolean
  runAction: (action: import("@/lib/types").ActionName, payload: Record<string, unknown>, label: string) => Promise<void>
  canWriteProfile: boolean
}) {
  const [activationCode, setActivationCode] = useState("")
  const [confirmationCode, setConfirmationCode] = useState("")
  const [apduMode, setApduMode] = useState(device.source === "at_probe" ? "at" : "qmi")

  useEffect(() => {
    setApduMode(device.source === "at_probe" ? "at" : "qmi")
  }, [device.id, device.source])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <UploadCloudIcon className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">写入新 Profile</h3>
          <p className="mt-1 text-sm text-muted-foreground">使用运营商提供的 SM-DP+ 激活码下载到当前实体 eSIM。</p>
        </div>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="esim-activation-code">激活码</Label>
          <Input id="esim-activation-code" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="LPA:1$sm-dp.example.com$MATCHING-ID" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="esim-confirmation-code">确认码</Label>
          <Input id="esim-confirmation-code" value={confirmationCode} onChange={(event) => setConfirmationCode(event.target.value)} placeholder="可选" />
        </div>
        <div className="grid gap-2">
          <Label>写入通道</Label>
          <Select value={apduMode} onValueChange={(value) => setApduMode(value ?? "qmi")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qmi">QMI</SelectItem>
              <SelectItem value="at">AT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={actionBusy || !canWriteProfile || !activationCode.trim()}
          onClick={() => {
            void runAction(
              "download_esim_profile",
              {
                device_id: device.id,
                activation_code: activationCode.trim(),
                confirmation_code: confirmationCode.trim(),
                apdu_mode: apduMode,
              },
              `向 ${device.label} 写入 eSIM Profile`,
            )
          }}
        >
          <DownloadCloudIcon data-icon="inline-start" />
          下载并写入
        </Button>
      </div>
    </div>
  )
}

function ActionsTab({ device, actionBusy, runAction }: { device: DeviceStatus; actionBusy: boolean; runAction: (action: import("@/lib/types").ActionName, payload: Record<string, unknown>, label: string) => Promise<void> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ActionButton icon={RefreshCwIcon} title="重启基带" desc="重新枚举当前设备" disabled={actionBusy} onClick={() => { void runAction("recover_modem", { device_id: device.id }, `重启 ${device.label} 基带`) }} />
      <ActionButton icon={MessageSquareTextIcon} title="重启短信服务" desc="重启短信转发服务" disabled={actionBusy} onClick={() => { void runAction("restart_sms", { device_id: device.id }, "重启短信转发") }} />
      <ActionButton icon={RouterIcon} title="刷新设备" desc="重新读取 Modem 状态" disabled={actionBusy} onClick={() => { void runAction("recover_modem", { device_id: device.id }, `刷新 ${device.label}`) }} />
    </div>
  )
}

function ActionButton({ icon: Icon, title, desc, disabled, onClick }: { icon: typeof CpuIcon; title: string; desc: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="glass-panel rounded-2xl p-4 text-left transition-colors hover:bg-white/75 disabled:opacity-50 dark:hover:bg-white/10">
      <Icon className="size-5 text-muted-foreground" />
      <div className="mt-3 font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
    </button>
  )
}

function formatActiveSimKind(kind: string) {
  if (kind === "esim") return "eSIM"
  if (kind === "physical") return "普通 SIM"
  return "SIM 类型未确认"
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/60 py-2 last:border-b-0 dark:border-white/10">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  )
}
