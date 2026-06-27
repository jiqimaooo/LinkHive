import { useState } from "react"
import {
  RadioTowerIcon,
  SignalIcon,
  RouterIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  SendIcon,
  PhoneIcon,
  CpuIcon,
  SettingsIcon,
  SearchIcon,
} from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  formatRegistrationState,
  formatAccessTech,
  formatCurrentModes,
  signalVariant,
  friendlyActionName,
} from "@/lib/helpers"

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

type TabKey = "status" | "network" | "actions"

const TABS: { key: TabKey; label: string; icon: typeof CpuIcon }[] = [
  { key: "status", label: "设备状态", icon: CpuIcon },
  { key: "network", label: "网络设置", icon: SettingsIcon },
  { key: "actions", label: "设备操作", icon: RouterIcon },
]

export default function DevicesPage() {
  const {
    status, activeAction, isRefreshing,
    refreshStatus, runAction, actionBusy,
    apnForm, setApnForm, radioMode, setRadioMode,
    networkCode, setNetworkCode,
    apnDirtyRef, networkDirtyRef, radioModeDirtyRef,
  } = useAppContext()

  const [activeTab, setActiveTab] = useState<TabKey>("status")

  const device = status?.dashboard?.device
  const modem = status?.modem
  const deviceName = [device?.manufacturer, device?.model].filter(Boolean).join(" ") || "未检测到设备"
  const signalDbm = modem?.signal_dbm
  const signalDisplay = signalDbm && signalDbm !== "--" ? signalDbm : "未上报"

  return (
    <div className="space-y-5">
      <PageHeader
        title="设备管理"
        description="查看设备状态、配置网络参数和执行设备操作。"
        actions={
          <>
            {activeAction ? <Badge variant="outline">{friendlyActionName(activeAction.action)}</Badge> : null}
            <button
              type="button"
              onClick={() => { void refreshStatus(false, true) }}
              disabled={isRefreshing}
              className="inline-flex items-centerjustify-center size-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="刷新"
            >
              <RefreshCwIcon className={isRefreshing ? "animate-spin size-4" : "size-4"} />
            </button>
          </>
        }
      />

      {/* 告警提示 */}
      {status?.status_message || (status?.errors?.length ?? 0) > 0 ? (
        <div className={status?.modem_available ? "glass-panel-warning rounded-xl p-4 text-amber-800 dark:text-amber-200" : "glass-panel-danger rounded-xl p-4 text-rose-800 dark:text-rose-200"}>
          <div className="flex items-center gap-2 font-medium"><AlertTriangleIcon className="size-4" />{status?.status_message || "设备有告警信息"}</div>
          {(status?.errors ?? []).length > 0 ? <p className="mt-1 text-sm opacity-80">{status?.errors.join("；")}</p> : null}
        </div>
      ) : null}

      {/* 设备卡片 */}
      <div className="glass-card rounded-2xl border border-white/60 dark:border-white/10 overflow-hidden">
        {/* 设备标识头 */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <CpuIcon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{deviceName}</h3>
              <Badge variant={status?.modem_available ? "default" : "destructive"} className="shrink-0 rounded-full text-[0.65rem] h-5">
                {status?.modem_available ? "在线" : "离线"}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              IMEI: {device?.imei || "--"} · {formatAccessTech(modem?.access_tech || "--")} · 信号 {signalDisplay}
            </p>
          </div>
          <Badge variant={signalVariant(modem?.signal || "--")} className="h-6 rounded-full text-xs font-medium shrink-0">
            {modem?.signal || "--"}%
          </Badge>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-slate-100 dark:border-white/5 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeTab === tab.key
                  ? "border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="p-6">
          {activeTab === "status" && <StatusPanel />}
          {activeTab === "network" && (
            <NetworkPanel
              apnForm={apnForm} setApnForm={setApnForm}
              radioMode={radioMode} setRadioMode={setRadioMode}
              networkCode={networkCode} setNetworkCode={setNetworkCode}
              status={status} actionBusy={actionBusy} runAction={runAction}
              apnDirtyRef={apnDirtyRef} networkDirtyRef={networkDirtyRef} radioModeDirtyRef={radioModeDirtyRef}
            />
          )}
          {activeTab === "actions" && <ActionsPanel actionBusy={actionBusy} runAction={runAction} />}
        </div>
      </div>
    </div>
  )
}

/* ─── 设备状态面板 ─── */
function StatusPanel() {
  const { status } = useAppContext()
  const device = status?.dashboard?.device
  const modem = status?.modem

  type InfoItem = { label: string; value: string; mono?: boolean; muted?: boolean }

  const infoGroups: { title: string; icon: typeof CpuIcon; items: InfoItem[] }[] = [
    {
      title: "硬件信息",
      icon: CpuIcon,
      items: [
        { label: "厂商", value: device?.manufacturer || "--" },
        { label: "型号", value: device?.model || "--" },
        { label: "IMEI", value: device?.imei || "--", mono: true },
      ],
    },
    {
      title: "网络状态",
      icon: RadioTowerIcon,
      items: [
        { label: "运营商", value: modem?.operator_name || "--" },
        { label: "注册状态", value: formatRegistrationState(modem?.registration || "--") },
        { label: "接入技术", value: formatAccessTech(modem?.access_tech || "--") },
        { label: "网络制式", value: formatCurrentModes(modem?.current_modes || "--") },
        { label: "漫游", value: device?.roaming ? "漫游中" : "未漫游" },
      ],
    },
    {
      title: "信号与连接",
      icon: SignalIcon,
      items: [
        { label: "信号质量", value: `${modem?.signal || "--"}%` },
       { label: "信号强度", value: modem?.signal_dbm && modem.signal_dbm !== "--" ? modem.signal_dbm : "未上报" },
        { label: "APN", value: modem?.apn || "--" },
        { label: "IP 类型", value: modem?.ip_type || "--" },
        { label:"IP 地址", value: device?.ip_address || "--", mono: true },
      ],
    },
    {
      title: "语音服务",
      icon: PhoneIcon,
      items: [
        { label: "VoLTE", value: modem?.volte_supported === false ? "不支持" : modem?.volte_enabled ? "已启用" : "未启用", muted: modem?.volte_supported === false },
        { label: "VoWiFi", value: modem?.vowifi_supported === false ? "不支持" : modem?.vowifi_enabled ? "已启用" : "未启用", muted: modem?.vowifi_supported === false },
      ],
    },
  ]

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {infoGroups.map((group) => (
        <div key={group.title} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <group.icon className="size-4 text-slate-400" />
            {group.title}
          </div>
          <div className="rounded-xl border border-slate-100 dark:border-white/5 divide-y divide-slate-50 dark:divide-white/5">
            {group.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className={cn(
                  "text-sm font-medium",
                  item.muted ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100",
                  item.mono && "font-mono tabular-nums text-xs",
                )}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── 网络设置面板 ─── */
function NetworkPanel({
  apnForm, setApnForm, radioMode, setRadioMode,
  networkCode, setNetworkCode, status, actionBusy, runAction,
  apnDirtyRef, networkDirtyRef, radioModeDirtyRef,
}: {
  apnForm: any; setApnForm: any; radioMode: string; setRadioMode: any
  networkCode: string; setNetworkCode: any; status: any; actionBusy: boolean; runAction: any
  apnDirtyRef: any; networkDirtyRef: any; radioModeDirtyRef: any
}) {
  const modem = status?.modem

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* APN 配置 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <RadioTowerIcon className="size-4 text-slate-400" />
          APN 配置
        </div>
        <div className="rounded-xl border border-slate-100 dark:border-white/5 p-4 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="apn">APN</Label>
            <Input id="apn" value={apnForm.apn} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c: any) => ({ ...c, apn: e.target.value })) }} placeholder="例如 fast.t-mobile.com" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="apn-user">用户名</Label><Input id="apn-user" value={apnForm.username} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c: any) => ({ ...c, username: e.target.value })) }} placeholder="可留空" /></div>
            <div className="grid gap-2"><Label htmlFor="apn-pass">密码</Label><Input id="apn-pass" type="password" value={apnForm.password} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c: any) => ({ ...c, password: e.target.value })) }} placeholder="可留空" /></div>
          </div>
          <div className="grid gap-2 max-w-xs">
            <Label>IP 类型</Label>
            <Select value={apnForm.ip_type} onValueChange={(v) => { apnDirtyRef.current = true; setApnForm((c: any) => ({ ...c, ip_type: v ?? c.ip_type })) }}>
              <SelectTrigger className="w-full"><span className={apnForm.ip_type ? "" : "text-muted-foreground"}>{IP_TYPE_LABELS[apnForm.ip_type] || "选择 IP 类型"}</span></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>承载模式</SelectLabel><SelectItem value="ipv4">仅 IPv4</SelectItem><SelectItem value="ipv6">仅 IPv6</SelectItem><SelectItem value="ipv4v6">IPv4 / IPv6</SelectItem></SelectGroup></SelectContent>
            </Select>
          </div>
          <Button type="button" disabled={actionBusy} onClick={() => { void runAction("save_apn", apnForm, "保存 APN 配置") }} className="w-full sm:w-auto">
            <SendIcon className="size-4 mr-1.5" />应用并保存
          </Button>
        </div>
      </div>

      {/* 右侧：制式 + 选网 + IMS */}
      <div className="space-y-6">
        {/* 网络制式 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <SignalIcon className="size-4 text-slate-400" />
            网络制式
          </div>
          <div className="rounded-xl border border-slate-100 dark:border-white/5 p-4 space-y-3">
            <p className="text-sm text-slate-500">{formatAccessTech(modem?.access_tech || "--")} · {formatCurrentModes(modem?.current_modes || "--")}</p>
            <Select value={radioMode} onValueChange={(v) => { radioModeDirtyRef.current = true; setRadioMode(v ?? "4g_only") }}>
              <SelectTrigger className="w-full"><span className={radioMode ? "" : "text-muted-foreground"}>{RADIO_MODE_LABELS[radioMode] || "选择网络制式"}</span></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>网络制式</SelectLabel><SelectItem value="4g_only">仅 4G</SelectItem><SelectItem value="3g4g_prefer4g">3G / 4G，优先 4G</SelectItem><SelectItem value="3g_only">仅 3G</SelectItem></SelectGroup></SelectContent>
            </Select>
            <Button type="button" variant="outline" className="w-full" disabled={actionBusy} onClick={() => { void runAction("apply_radio_mode", { mode: radioMode }, "应用网络制式") }}>应用</Button>
          </div>
        </div>

        {/* 网络选择 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <SearchIcon className="size-4 text-slate-400" />
            网络选择
          </div>
          <div className="rounded-xl border border-slate-100 dark:border-white/5 p-4 space-y-3">
            <p className="text-sm text-slate-500">当前：{status?.connection.network_id || "自动"}</p>
            <Input value={networkCode} onChange={(e) => { networkDirtyRef.current = true; setNetworkCode(e.target.value) }} placeholder="运营商代码，例如 46000" />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={actionBusy || !networkCode.trim()} onClick={() => { void runAction("apply_network_selection", { operator_code: networkCode.trim() }, `手动选网 ${networkCode.trim()}`) }}>�动选网</Button>
              <Button type="button" variant="outline" size="sm" disabled={actionBusy} onClick={() => { void runAction("apply_network_selection", { operator_code: "" }, "恢复自动选网") }}>自动选网</Button>
            </div>
          </div>
        </div>

        {/* IMS 语音 */}
        {modem?.ims_supported ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <PhoneIcon className="size-4 text-slate-400" />
              IMS 语音
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-white/5 p-4 space-y-4">
              <div className={cn("flex items-center justify-between", modem?.volte_supported === false && "opacity-50")}>
                <div><p className="text-sm font-medium">VoLTE</p><p className="text-xs text-slate-500">{modem?.volte_supported === false ? "当前模组不支持" : "通过 LTE 网络进行语音通话"}</p></div>
                <Switch checked={modem?.volte_enabled ?? false} disabled={actionBusy || modem?.volte_supported === false} onCheckedChange={(checked) => { void runAction("apply_ims_settings", { volte_enabled: checked }, checked ? "开启 VoLTE" : "关闭 VoLTE") }} />
              </div>
              <div className={cn("flex items-center justify-between", modem?.vowifi_supported === false && "opacity-50")}>
                <div><p className="text-sm font-medium">VoWiFi</p><p className="text-xs text-slate-500">{modem?.vowifi_supported === false ? "当前模组不支持" : "通过 WiFi 网络进行语音通话"}</p></div>
                <Switch checked={modem?.vowifi_enabled ?? false} disabled={actionBusy || modem?.vowifi_supported === false} onCheckedChange={(checked) => { void runAction("apply_ims_settings", { vowifi_enabled: checked }, checked ? "开启 VoWiFi" : "关闭 VoWiFi") }} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ─── 设备操作面板 ─── */
function ActionsPanel({ actionBusy, runAction }: { actionBusy: boolean; runAction: any }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ActionCard
        icon={RouterIcon}
        title="恢复基带"
        description="执行 SIM 断电/上电并重启 ModemManager，适用于基带异常或信号丢失。"
        buttonLabel="执行恢复"
        variant="danger"
        disabled={actionBusy}
        onClick={() => { void runAction("recover_modem", {}, "恢复基带") }}
      />
      <ActionCard
        icon={SendIcon}
        title="重启短信转发"
        description="重启短信转发服务，解决短信接收或转发中断问题。"
        buttonLabel="重启服务"
        variant="default"
        disabled={actionBusy}
        onClick={() => { void runAction("restart_sms", {}, "重启短信转发") }}
      />
      <ActionCard
        icon={RefreshCwIcon}
        title="扫描设备"
        description="重新枚举 USB 设备，刷新 ModemManager 识别到的 modem 列表。"
        buttonLabel="扫描"
        variant="default"
        disabled={actionBusy}
        onClick={() => { void runAction("recover_modem", {}, "扫描设备") }}
      />
    </div>
  )
}

function ActionCard({
  icon: Icon, title, description, buttonLabel, variant, disabled, onClick,
}: {
  icon: typeof RouterIcon; title: string; description: string; buttonLabel: string
  variant: "danger" | "default"; disabled: boolean; onClick: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-white/5 p-5 flex flex-col gap-3">
      <div className={cn(
        "flex size-10 items-center justify-center rounded-lg",
        variant === "danger" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" : "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-400",
      )}>
        <Icon className="size-5" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
      </div>
      <Button
        type="button"
        variant={variant === "danger" ? "destructive" : "outline"}
        size="sm"
        className="mt-auto w-full"
        disabled={disabled}
        onClick={onClick}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}