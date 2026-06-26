import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  CpuIcon,
  CreditCardIcon,
  MessageSquareIcon,
  NetworkIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SignalIcon,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { useAppContext } from "@/hooks/app-context"
import { cn } from "@/lib/utils"
import {
  displayValue,
  formatAccessTech,
  formatBytes,
  formatOperatorName,
  formatRegistrationState,
  getActiveProfile,
  normalizeTrafficSamples,
} from "@/lib/helpers"

const CARD_CLASS = "glass-card rounded-xl p-4 sm:p-6"
const MUTED_TEXT = "text-slate-500 dark:text-slate-400"
type StatusTone = "success" | "warning" | "danger" | "muted"
type KpiStatus = { label: string; state: StatusTone }
type OverviewRow = {
  label: string
  value: string
  mono?: boolean
  preserveLineBreaks?: boolean
}

export default function DashboardPage() {
  const {
    status, esimEnabled,
    autoRefresh, isRefreshing, setAutoRefresh,
    refreshStatus,
  } = useAppContext()

  const activeProfile = getActiveProfile(status?.profiles ?? [])
  const dashboard = status?.dashboard
  const device = dashboard?.device
  const traffic = dashboard?.traffic
  const trafficRows = normalizeTrafficSamples(traffic?.samples ?? [])
  const hasTrafficRows = trafficRows.length > 1 && trafficRows.some((row) => row.total > 0)
  const networkType = formatAccessTech(device?.network_type || status?.modem.access_tech || "--")
  const networkConnection = networkConnectionStatus(status)
  const signalValue = displayValue(status?.modem.signal, "0")
  const signalDisplayValue = displaySignalValue(status?.modem.signal_dbm)
  const simLabel = displayValue(device?.sim_label || (esimEnabled ? activeProfile?.display_name : "普通 SIM"))
  const operatorName = formatOperatorName(device?.operator || status?.modem.operator_name, status?.modem.operator_code)
  const homeOperatorName = displayValue(device?.home_operator)
  const homeOperatorCode = displayValue(device?.home_operator_code, "未上报")
  const operatorHelper = [displayValue(status?.modem.operator_code), device?.roaming ? "漫游" : ""].filter(Boolean).join(" · ")
  const smsReadableCount = status?.sms_storage?.readable_count ?? status?.sms.length ?? 0
  const deviceOverviewRows: OverviewRow[] = [
    { label: "设备型号", value: displayValue(compactDeviceName(device?.manufacturer, device?.model)) },
    { label: "厂商", value: displayValue(device?.manufacturer) },
    { label: "型号", value: displayValue(device?.model) },
    { label: "IMEI", value: displayValue(device?.imei), mono: true },
    { label: "基带状态", value: formatModemState(status?.modem.state || "--") },
    { label: "设备号码", value: displayValue(status?.modem.number), mono: true },
  ]
  const simOverviewRows: OverviewRow[] = [
    { label: esimEnabled ? "当前 Profile" : "当前 SIM", value: simLabel },
    { label: "ICCID", value: displayValue(device?.iccid), mono: true },
    { label: "归属运营商", value: homeOperatorName },
    { label: "归属运营商代码", value: homeOperatorCode, mono: true },
    { label: "SIM 类型", value: formatSimType(status?.capabilities.sim_type, esimEnabled) },
    { label: "eSIM 管理", value: formatEnabledState(status?.capabilities.esim_management_enabled) },
  ]
  const networkOverviewRows: OverviewRow[] = [
    { label: "当前运营商", value: operatorName },
    { label: "运营商代码", value: displayValue(status?.modem.operator_code), mono: true },
    { label: "网络制式", value: networkType },
    { label: "信号强度", value: signalDisplayValue },
    { label: "注册状态", value: formatRegistrationState(status?.modem.registration || "--") },
    { label: "漫游状态", value: device?.roaming ? "漫游" : "未漫游" },
  ]

  return (
    <div className="min-h-dvh px-0 py-0 text-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-slate-950 sm:text-[32px] dark:text-slate-50">仪表盘</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">蜂窝网络、SIM、短信与系统服务的实时运行概览。</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <label className="glass-panel flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm text-slate-600 sm:justify-start dark:text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="size-4 rounded border-[#CBD5E1] accent-[#2563EB]"
              />
              自动刷新
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => { void refreshStatus(false, true) }}
              disabled={isRefreshing}
            >
              <RefreshCwIcon className={cn("size-4", isRefreshing && "animate-spin")} />
              刷新
            </Button>
          </div>
        </header>

        {status?.status_message || (status?.errors?.length ?? 0) > 0 ? (
          <section className={cn(
            "rounded-xl p-4 text-sm",
            status?.modem_available ? "glass-panel-warning text-amber-900 dark:text-amber-100" : "glass-panel-danger text-rose-900 dark:text-rose-100",
          )}>
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangleIcon className="size-4" />
              {status?.status_message || "设备有告警信息"}
            </div>
            {(status?.errors ?? []).length > 0 ? (
              <p className="mt-2 leading-6">{status?.errors.join("；")}</p>
            ) : null}
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={NetworkIcon} label="网络制式" value={networkType} helper={networkType} status={networkConnection} />
          <KpiCard icon={SignalIcon} label="信号强度" value={signalDisplayValue} helper={signalQualityLabel(Number.parseInt(signalValue, 10))} />
          <KpiCard icon={ShieldCheckIcon} label="运营商" value={operatorName} helper={operatorHelper} />
          <KpiCard icon={ActivityIcon} label="原运营商" value={homeOperatorName} helper={homeOperatorCode} />
          <KpiCard icon={BarChart3Icon} label="今日流量" value={formatBytes(traffic?.today_total_bytes)} helper={`上行 ${formatBytes(traffic?.today_upload_bytes)} / 下行 ${formatBytes(traffic?.today_download_bytes)}`} />
          <KpiCard icon={MessageSquareIcon} label="短信数量" value={`${smsReadableCount}`} helper="当前可读取短信" />
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader title="设备状态概览" description="按设备、SIM 与网络拆分关键只读信息。" />
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <OverviewGroup icon={CpuIcon} title="设备" rows={deviceOverviewRows} />
            <OverviewGroup icon={CreditCardIcon} title="SIM" rows={simOverviewRows} />
            <OverviewGroup icon={NetworkIcon} title="网络" rows={networkOverviewRows} />
          </div>
        </section>

        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <SectionHeader title="流量趋势" description="统计 LinkHive 本次运行期内观察到的蜂窝接口上传、下载与总流量。" />
            <div className="grid grid-cols-3 gap-3 text-right">
              <TrafficMetric icon={ArrowUpIcon} label="上传" value={formatBytes(traffic?.today_upload_bytes)} tone="upload" />
              <TrafficMetric icon={ArrowDownIcon} label="下载" value={formatBytes(traffic?.today_download_bytes)} tone="download" />
              <TrafficMetric icon={BarChart3Icon} label="总流量" value={formatBytes(traffic?.today_total_bytes)} tone="total" />
            </div>
          </div>

          <div className="glass-panel mt-5 h-[240px] rounded-xl p-3 sm:mt-6 sm:h-[320px] sm:p-4">
            {hasTrafficRows ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficRows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="currentColor" className="text-slate-200 dark:text-white/10" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} unit=" MB" width={64} />
                  <Tooltip
                    cursor={{ stroke: "#CBD5E1", strokeWidth: 1 }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }}
                    formatter={(value, name) => [`${value} MB`, chartSeriesLabel(String(name))]}
                    labelFormatter={(label) => `时间 ${label}`}
                  />
                  <Line type="monotone" dataKey="download" stroke="#2563EB" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="upload" stroke="#059669" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="total" stroke="#0F172A" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <BarChart3Icon className="mb-3 size-9 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">等待流量采样</p>
                <p className="mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">刷新几次状态或等待自动刷新后，这里会显示本次运行期内的上传、下载与总流量趋势。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function KpiCard({
  className,
  icon: Icon,
  label,
  value,
  helper,
  status,
}: {
  className?: string
  icon: typeof ActivityIcon
  label: string
  value: string
  helper?: string
  status?: KpiStatus
}) {
  return (
    <div className={cn(CARD_CLASS, "min-h-[116px] sm:min-h-[140px]", className)}>
      <div className="mb-3 flex items-center justify-between sm:mb-5">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <Icon className="size-4 text-slate-400 dark:text-slate-500" />
      </div>
      <div className="truncate text-lg font-semibold leading-7 text-slate-950 tabular-nums sm:text-xl sm:leading-8 dark:text-slate-50">{value}</div>
      {status ? (
        <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
          <StatusDot state={status.state} />
          <span className="truncate">{status.label}</span>
        </p>
      ) : (
        <p className="mt-2 truncate text-xs leading-5 text-slate-500 dark:text-slate-400">{helper}</p>
      )}
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold leading-7 text-slate-950 dark:text-slate-50">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  )
}

function OverviewGroup({ icon: Icon, title, rows }: { icon: typeof ActivityIcon; title: string; rows: OverviewRow[] }) {
  return (
    <div className="glass-panel min-w-0 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold leading-6 text-slate-950 dark:text-slate-50">{title}</h3>
        <span className="glass-panel flex size-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400">
          <Icon className="size-4" />
        </span>
      </div>
      <dl className="mt-4 divide-y divide-white/60">
        {rows.map((row) => (
          <OverviewItem key={row.label} {...row} />
        ))}
      </dl>
    </div>
  )
}

function OverviewItem({
  label,
  value,
  mono = false,
  preserveLineBreaks = false,
}: OverviewRow) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
      <dt className={cn("text-xs font-medium leading-5", MUTED_TEXT)}>{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm font-medium leading-5 text-slate-900 dark:text-slate-100",
          mono && "font-mono tabular-nums",
          preserveLineBreaks ? "whitespace-pre-line break-words" : "truncate",
        )}
        title={preserveLineBreaks ? undefined : value}
      >
        {value}
      </dd>
    </div>
  )
}

function TrafficMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ArrowUpIcon
  label: string
  value: string
  tone: "upload" | "download" | "total"
}) {
  const toneClass = {
    upload: "text-[#059669]",
    download: "text-[#2563EB]",
    total: "text-slate-900 dark:text-slate-100",
  }[tone]
  return (
    <div className="min-w-0 sm:min-w-[92px]">
      <div className={cn("mb-1 flex items-center justify-end gap-1 text-xs font-medium", toneClass)}>
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  )
}

function StatusDot({ state }: { state: StatusTone }) {
  const className = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    muted: "bg-slate-300",
  }[state]
  return <span className={cn("inline-block size-2 rounded-full", className)} />
}

function networkConnectionStatus(status: {
  modem_available: boolean
  modem: { registration: string; state: string }
} | null | undefined): KpiStatus {
  if (!status?.modem_available) return { label: "未连接", state: "danger" }

  const registration = status.modem.registration.trim().toLowerCase()
  const modemState = status.modem.state.trim().toLowerCase()
  if (["home", "roaming", "registered"].includes(registration) || ["registered", "connected"].includes(modemState)) {
    return { label: "已连接", state: "success" }
  }
  if (["searching", "registering"].includes(registration) || ["searching", "connecting", "registering", "enabling"].includes(modemState)) {
    return { label: "连接中", state: "warning" }
  }
  if (registration === "denied" || ["failed", "locked"].includes(modemState)) {
    return { label: registration === "denied" ? "注册被拒" : "连接异常", state: "danger" }
  }
  if (registration === "disabled" || ["disabled", "disabling"].includes(modemState)) {
    return { label: "已禁用", state: "muted" }
  }
  return { label: "未连接", state: "danger" }
}

function signalQualityLabel(signal: number) {
  if (!Number.isFinite(signal) || signal <= 0) return "未检测到信号"
  if (signal >= 75) return "信号优秀"
  if (signal >= 50) return "信号良好"
  if (signal >= 25) return "信号较弱"
  return "信号很弱"
}

function displaySignalValue(signalDbm: string | null | undefined) {
  const normalizedDbm = String(signalDbm ?? "").trim()
  if (normalizedDbm && normalizedDbm !== "--") return normalizedDbm
  return "未上报"
}

function formatModemState(state: string) {
  const normalized = state.trim().toLowerCase()
  const labels: Record<string, string> = {
    registered: "已注册",
    connected: "已连接",
    connecting: "连接中",
    registering: "注册中",
    searching: "搜索中",
    enabled: "已启用",
    enabling: "启用中",
    disabled: "已禁用",
    disabling: "禁用中",
    locked: "已锁定",
    failed: "异常",
  }
  return labels[normalized] || displayValue(state)
}

function formatSimType(simType: string | null | undefined, esimEnabled: boolean) {
  const normalized = String(simType ?? "").trim().toLowerCase()
  if (normalized === "physical") return "普通 SIM"
  if (normalized === "esim") return "eSIM"
  return esimEnabled ? "eSIM" : "普通 SIM"
}

function formatEnabledState(enabled: boolean | null | undefined) {
  return enabled ? "已启用" : "未启用"
}

function compactDeviceName(manufacturer?: string, model?: string) {
  return [manufacturer, model].map((item) => item?.trim()).filter(Boolean).join(" ")
}

function chartSeriesLabel(name: string) {
  if (name === "download") return "下载流量"
  if (name === "upload") return "上传流量"
  if (name === "total") return "总流量"
  return name
}
