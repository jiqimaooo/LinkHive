import {
  CardSimIcon,
  RadioTowerIcon,
  SignalIcon,
  SendIcon,
  AlertTriangleIcon,
  ActivityIcon,
  WifiIcon,
  Clock3Icon,
} from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatRegistrationState,
  formatAccessTech,
  formatCurrentModes,
  signalVariant,
  serviceVariant,
  keepaliveRunStateLabel,
  keepaliveRunStateVariant,
  getKeepalive,
  getActiveProfile,
  friendlyActionName,
} from "@/lib/helpers"

export default function DashboardPage() {
  const {
    status, activeAction, esimEnabled,
    autoRefresh, isRefreshing, setAutoRefresh,
    refreshStatus, runAction, actionBusy,
  } = useAppContext()

  const activeProfile = getActiveProfile(status?.profiles ?? [])
  const keepalive = getKeepalive(status)
  const notifications = status?.notifications
  const configuredCount = notifications?.configured_count ?? 0
  const configuredLabels = notifications?.configured_labels ?? []
  const keepaliveEnabledCount = keepalive.tasks.filter((task) => task.enabled).length
  const activeProfileLabel = esimEnabled ? activeProfile?.display_name || "未检测到" : "普通 SIM"

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ActivityIcon}
        title="仪表盘"
        description="设备状态、短信活动和系统健康概览。"
        actions={
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="size-4 rounded"
                />
                <span className="text-muted-foreground">自动刷新</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {status?.timestamp ? `最后刷新 ${status.timestamp}` : "等待首次刷新"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { void refreshStatus(false, true) }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-sm hover:bg-muted"
            >
              <ActivityIcon className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "刷新中..." : "刷新状态"}
            </button>
          </>
        }
      />

      {status?.status_message || (status?.errors?.length ?? 0) > 0 ? (
        <div className={status?.modem_available ? "rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800" : "rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"}>
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangleIcon className="size-4" />
            {status?.status_message || "设备有告警信息"}
          </div>
          {(status?.errors ?? []).length > 0 ? (
            <p className="mt-1 text-sm">{status?.errors.join("；")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CardSimIcon} label={esimEnabled ? "当前 Profile" : "当前 SIM"} value={activeProfileLabel} hint={`手机号：${status?.modem.number || "--"}`} />
        <StatCard icon={RadioTowerIcon} label="运营商" value={status?.modem.operator_name || "--"} hint={`${status?.modem.operator_code || "--"} · ${formatRegistrationState(status?.modem.registration || "--")}`} />
        <StatCard icon={SignalIcon} label="信号与制式" value={`${status?.modem.signal || "--"}%`} hint={formatAccessTech(status?.modem.access_tech || "--")} badgeVariant={signalVariant(status?.modem.signal || "--")} />
        <StatCard icon={SendIcon} label="短信转发" value={status?.services.sms_forwarder || "--"} hint={configuredCount ? `已配置 ${configuredCount} 个渠道` : "尚未配置通知渠道"} badgeVariant={serviceVariant(status?.services.sms_forwarder || "")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MonitorIcon />
                基带状态
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant={status?.modem_available ? "default" : "destructive"}>
                  {status?.modem_available ? "在线" : "离线"}
                </Badge>
                {activeAction ? <Badge variant="outline">{friendlyActionName(activeAction.action)}</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border p-3"><span className="text-muted-foreground">接入技术</span><p className="font-medium">{formatAccessTech(status?.modem.access_tech || "--")}</p></div>
              <div className="rounded-xl border p-3"><span className="text-muted-foreground">注册状态</span><p className="font-medium">{formatRegistrationState(status?.modem.registration || "--")}</p></div>
              <div className="col-span-2 rounded-xl border p-3"><span className="text-muted-foreground">网络制式</span><p className="font-medium whitespace-pre-line">{formatCurrentModes(status?.modem.current_modes || "--")}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={actionBusy} onClick={() => { void runAction("recover_modem", {}, "重启基带") }} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-sm hover:bg-muted disabled:opacity-50">
                <RadioTowerIcon className="size-3.5" />重启基带
              </button>
              <button type="button" disabled={actionBusy} onClick={() => { void runAction("restart_sms", {}, "重启短信转发") }} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-sm hover:bg-muted disabled:opacity-50">
                <SendIcon className="size-3.5" />重启转发
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><WifiIcon />系统服务</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ServiceRow name="ModemManager" state={status?.services.modemmanager || "--"} />
            <ServiceRow name="短信转发" state={status?.services.sms_forwarder || "--"} />
            <ServiceRow name="管理页面" state={status?.services.web_admin || "--"} />
            {configuredLabels.length > 0 ? (
              <div className="rounded-xl border p-3">
                <span className="text-sm text-muted-foreground">已配置渠道</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{configuredLabels.map((l) => <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>)}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock3Icon />保活调度状态</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border p-3 text-center"><div className="text-2xl font-bold">{keepaliveEnabledCount}</div><div className="text-xs text-muted-foreground">已启用任务</div></div>
            <div className="rounded-xl border p-3 text-center"><div className="text-sm font-medium truncate">{keepalive.next_allowed_at || "当前可执行"}</div><div className="text-xs text-muted-foreground">下次可切卡</div></div>
            <div className="rounded-xl border p-3 text-center"><div className="text-lg font-medium">{keepalive.active_run ? <Badge variant={keepaliveRunStateVariant(keepalive.active_run.state)}>{keepaliveRunStateLabel(keepalive.active_run.state)}</Badge> : <Badge variant="outline">空闲</Badge>}</div><div className="text-xs text-muted-foreground">当前执行</div></div>
            <div className="rounded-xl border p-3 text-center"><div className="text-2xl font-bold">{keepalive.recent_runs.length}</div><div className="text-xs text-muted-foreground">最近记录</div></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ServiceRow({ name, state }: { name: string; state: string }) {
  return <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{name}</span><Badge variant={serviceVariant(state)}>{state}</Badge></div>
}

function MonitorIcon({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
}
