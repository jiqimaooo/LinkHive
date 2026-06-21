import {
  RadioTowerIcon,
  SendIcon,
  RouterIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
} from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatRegistrationState,
  formatAccessTech,
  formatCurrentModes,
  signalVariant,
  serviceVariant,
  friendlyActionName,
  getActiveProfile,
} from "@/lib/helpers"

export default function ModemStatusPage() {
  const {
    status, activeAction, isRefreshing, esimEnabled,
    refreshStatus, runAction, actionBusy,
  } = useAppContext()

  const activeProfile = getActiveProfile(status?.profiles ?? [])
  const notifications = status?.notifications
  const configuredCount = notifications?.configured_count ?? 0
  const activeProfileLabel = esimEnabled ? activeProfile?.display_name || "未检测到" : "普通 SIM"

  return (
    <div className="space-y-4">
      <PageHeader
        title="基带状态"
        description="查看实时基带信息、信号强度和设备控制。"
        actions={
          <>
            {activeAction ? <Badge variant="outline">{friendlyActionName(activeAction.action)}</Badge> : null}
            <button
              type="button"
              onClick={() => { void refreshStatus(false, true) }}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="刷新"
            >
              <RefreshCwIcon className={isRefreshing ? "animate-spin size-4" : "size-4"} />
            </button>
          </>
        }
      />

      {status?.status_message || (status?.errors?.length ?? 0) > 0 ? (
        <div className={status?.modem_available ? "rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800" : "rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"}>
          <div className="flex items-center gap-2 font-medium"><AlertTriangleIcon className="size-4" />{status?.status_message || "设备有告警信息"}</div>
          {(status?.errors ?? []).length > 0 ? <p className="mt-1 text-sm">{status?.errors.join("；")}</p> : null}
        </div>
      ) : null}

      {/* 设备状态概览 */}
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
        <h3 className="text-xs font-medium text-[#64748b] mb-4">设备状态概览</h3>
        <div className="grid grid-cols-4 divide-x divide-[#f1f5f9]">
          <div className="px-4 first:pl-0 last:pr-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748b]">{esimEnabled ? "当前 Profile" : "当前 SIM"}</span>
            <span className="text-base font-semibold text-[#0f172a]">{activeProfileLabel}</span>
            <span className="text-sm text-[#64748b]">手机号：{status?.modem.number || "--"}</span>
          </div>
          <div className="px-4 first:pl-0 last:pr-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748b]">运营商</span>
            <span className="text-base font-semibold text-[#0f172a]">{status?.modem.operator_name || "--"}</span>
            <span className="text-sm text-[#64748b]">{status?.modem.operator_code || "--"} · {formatRegistrationState(status?.modem.registration || "--")}</span>
          </div>
          <div className="px-4 first:pl-0 last:pr-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748b]">信号状态</span>
            <span className="text-base font-semibold text-[#0f172a]">{formatAccessTech(status?.modem.access_tech || "--")}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#64748b]">信号强度</span>
              <Badge variant={signalVariant(status?.modem.signal || "--")} className="h-5 rounded-full text-[0.688rem] font-medium">{status?.modem.signal || "--"}%</Badge>
            </div>
          </div>
          <div className="px-4 first:pl-0 last:pr-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748b]">短信转发</span>
            <div className="flex items-center gap-2">
              <Badge variant={serviceVariant(status?.services.sms_forwarder || "")} className="h-5 rounded-full text-[0.688rem] font-medium">{status?.services.sms_forwarder || "--"}</Badge>
            </div>
            <span className="text-sm text-[#64748b]">{configuredCount ? `已配置 ${configuredCount} 个渠道` : "未配置"}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><RadioTowerIcon className="size-4" />基带详情</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailItem label="状态" value={status?.modem.state || "--"} />
              <DetailItem label="注册" value={formatRegistrationState(status?.modem.registration || "--")} />
              <DetailItem label="接入技术" value={formatAccessTech(status?.modem.access_tech || "--")} />
              <DetailItem label="信号" value={`${status?.modem.signal || "--"}%`} />
              <DetailItem label="运营商" value={`${status?.modem.operator_name || "--"} (${status?.modem.operator_code || "--"})`} />
              <DetailItem label="APN" value={status?.modem.apn || "--"} />
              <div className="col-span-2"><DetailItem label="制式" value={formatCurrentModes(status?.modem.current_modes || "--")} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><SettingsIcon />设备控制</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <button type="button" disabled={actionBusy} onClick={() => { void runAction("recover_modem", {}, "重启基带") }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">
              <RouterIcon className="size-4" />重启基带
            </button>
            <button type="button" disabled={actionBusy} onClick={() => { void runAction("restart_sms", {}, "重启短信转发") }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
              <SendIcon className="size-4" />重启短信转发
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-2.5"><span className="text-xs text-muted-foreground">{label}</span><p className="text-sm font-medium whitespace-pre-line">{value}</p></div>
}

function SettingsIcon({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
}
