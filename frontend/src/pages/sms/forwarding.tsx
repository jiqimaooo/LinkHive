import { SendIcon, PlusIcon, Trash2Icon, WifiIcon, RefreshCwIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { serviceVariant } from "@/lib/helpers"
import { NOTIFICATION_CHANNEL_DEFINITIONS, NOTIFICATION_CHANNEL_ORDER, createNotificationTarget } from "@/lib/constants"
import { notificationFieldValue } from "@/lib/helpers"
import type { ChannelKind } from "@/lib/types"

export default function SmsForwardingPage() {
  const { status, actionBusy, notificationTargets, setNotificationTargets, newNotificationType, setNewNotificationType, saveNotifications, runAction, notificationsDirtyRef } = useAppContext()
  const configuredNotifications = status?.notifications
  const configuredLabels = configuredNotifications?.configured_labels ?? []
  const configuredCount = configuredNotifications?.configured_count ?? 0
  const configuredTypes = new Set(notificationTargets.map((t) => t.type))
  const availableTypes = NOTIFICATION_CHANNEL_ORDER.filter((t) => !configuredTypes.has(t))

  return (
    <div className="space-y-4">
      <PageHeader title="短信转发规则" description="配置短信转发通知渠道，每种渠道只保留一份。" />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2"><SendIcon className="size-4 text-muted-foreground" />通知渠道</CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-72">
                <Select value={newNotificationType} onValueChange={(v) => setNewNotificationType(v as ChannelKind)} disabled={actionBusy || !availableTypes.length}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="选择渠道类型" /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectLabel>可添加渠道</SelectLabel>{availableTypes.map((t) => <SelectItem key={t} value={t}>{NOTIFICATION_CHANNEL_DEFINITIONS[t].label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" disabled={actionBusy || !availableTypes.length} onClick={() => { notificationsDirtyRef.current = true; setNotificationTargets((c) => { if (c.some((i) => i.type === newNotificationType)) return c; const n = [...c, createNotificationTarget(newNotificationType)]; return n.sort((a, b) => NOTIFICATION_CHANNEL_ORDER.indexOf(a.type) - NOTIFICATION_CHANNEL_ORDER.indexOf(b.type)) }) }}><PlusIcon data-icon="inline-start" />添加渠道</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {notificationTargets.length ? notificationTargets.map((target) => {
                const def = NOTIFICATION_CHANNEL_DEFINITIONS[target.type]
                return (
                  <div key={target.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-2"><div className="flex items-center gap-2"><Badge variant="outline">{def.label}</Badge><Badge variant="secondary">{target.enabled ? "已启用" : "已停用"}</Badge></div><p className="text-sm text-muted-foreground">{def.description}</p></div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>启用</span><Switch checked={target.enabled} onCheckedChange={(checked) => { notificationsDirtyRef.current = true; setNotificationTargets((c) => c.map((i) => i.id === target.id ? { ...i, enabled: checked } : i)) }} /></div>
                          <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => { notificationsDirtyRef.current = true; setNotificationTargets((c) => c.filter((i) => i.id !== target.id)) }}><Trash2Icon data-icon="inline-start" />删除</Button>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {def.fields.map((field) => (
                          <div key={`${target.id}-${field.key}`} className="grid gap-2"><Label htmlFor={`n-${target.id}-${field.key}`}>{field.label}</Label>
                            {field.options ? (
                              <Select value={notificationFieldValue(target, field.key)} onValueChange={(v) => { notificationsDirtyRef.current = true; setNotificationTargets((c) => c.map((i) => i.id === target.id ? { ...i, values: { ...i.values, [field.key]: v ?? "" } } : i)) }}>
                                <SelectTrigger id={`n-${target.id}-${field.key}`} className="w-full"><SelectValue placeholder={field.placeholder} /></SelectTrigger>
                                <SelectContent><SelectGroup>{field.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
                              </Select>
                            ) : (
                              <Input id={`n-${target.id}-${field.key}`} type={field.inputType ?? "text"} value={notificationFieldValue(target, field.key)} onChange={(e) => { notificationsDirtyRef.current = true; setNotificationTargets((c) => c.map((i) => i.id === target.id ? { ...i, values: { ...i.values, [field.key]: e.target.value } } : i)) }} placeholder={field.placeholder} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              }) : <EmptyState icon={SendIcon} title="还没有配置通知渠道" description="从上方选择一个渠道类型，再添加到列表里继续填写。" />}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={actionBusy} onClick={() => { void saveNotifications() }}><SendIcon data-icon="inline-start" />保存通知渠道</Button>
                <Button type="button" variant="outline" disabled={!status} onClick={() => { notificationsDirtyRef.current = false; window.location.reload() }}>恢复当前状态</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><WifiIcon className="size-4 text-muted-foreground" />服务状态</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ServiceRow name="ModemManager" state={status?.services.modemmanager || "--"} />
            <ServiceRow name="短信转发" state={status?.services.sms_forwarder || "--"} />
            <ServiceRow name="管理页面" state={status?.services.web_admin || "--"} />
            <Separator />
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">已配置渠道</span><Badge variant="secondary">{configuredCount} 个</Badge></div>
              <div className="mt-3">{configuredLabels.length ? <div className="flex flex-wrap gap-1.5">{configuredLabels.map((l) => <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>)}</div> : <p className="text-sm text-muted-foreground">还没有已配置渠道。</p>}</div>
            </div>
            <Button type="button" variant="outline" className="w-full" disabled={actionBusy} onClick={() => { void runAction("restart_sms", {}, "重启短信转发") }}><RefreshCwIcon data-icon="inline-start" />重启短信转发</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ServiceRow({ name, state }: { name: string; state: string }) {
  return <div className="glass-panel flex items-center justify-between rounded-lg px-3 py-2 text-sm"><span>{name}</span><Badge variant={serviceVariant(state)}>{state}</Badge></div>
}
