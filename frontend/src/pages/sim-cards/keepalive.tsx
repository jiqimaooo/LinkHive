import { Clock3Icon, PlusIcon, ChevronDownIcon, SendIcon, Trash2Icon, CalendarDaysIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { createKeepaliveTask, keepaliveRunStateLabel, keepaliveRunStateVariant, keepaliveTriggerLabel, getKeepalive } from "@/lib/helpers"

export default function KeepalivePage() {
  const { status, esimEnabled, actionBusy, keepaliveSettings, setKeepaliveSettings, keepaliveTasks, setKeepaliveTasks, expandedKeepaliveTaskId, setExpandedKeepaliveTaskId, saveKeepalive, sendKeepaliveTestSms, runAction, keepaliveDirtyRef } = useAppContext()
  const keepalive = getKeepalive(status)
  const keepaliveEnabledCount = keepalive.tasks.filter((t) => t.enabled).length

  const descText = esimEnabled
    ? "通过 cron 表达式定时自动切卡、发短信、回切，确保 SIM 卡保持活跃。"
    : "通过 cron 表达式定时自动发送短信，保持 SIM 卡活跃。无需切换 Profile。"

  const emptyText = esimEnabled
    ? "添加任务后即可按 cron 表达式自动切卡、发短信、通知并回切。"
    : "添加任务后即可按 cron 表达式定时发送短信。"

  return (
    <div className="space-y-4">
      <PageHeader title="保活任务" description={descText} />

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Clock3Icon className="size-4 text-muted-foreground" />任务配置</CardTitle>
              <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => { const nt = createKeepaliveTask(status?.profiles ?? []); keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => [...c, nt]); setExpandedKeepaliveTaskId(nt.id) }}><PlusIcon data-icon="inline-start" />添加任务</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 切卡缓冲时间 - 仅 eSIM 显示 */}
            {esimEnabled ? (
              <div className="glass-panel rounded-xl p-4">
                <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-end">
                  <div className="grid gap-2"><Label htmlFor="kg">切卡缓冲时间（秒）</Label><Input id="kg" type="number" min={30} max={1800} value={String(keepaliveSettings.queue_gap_seconds)} onChange={(e) => { keepaliveDirtyRef.current = true; const v = Number.parseInt(e.target.value, 10); setKeepaliveSettings(() => ({ queue_gap_seconds: Number.isNaN(v) ? 180 : v })) }} /></div>
                  <p className="text-sm text-muted-foreground">多个保活任务同时到点时会自动排队，下一次切卡会等待这里设置的缓冲时间。</p>
                </div>
              </div>
            ) : null}

            {keepaliveTasks.length ? <div className="flex flex-col gap-4">
              {keepaliveTasks.map((task) => {
                const saved = keepalive.tasks.find((t) => t.id === task.id)
                const profileName = esimEnabled
                  ? (saved?.profile_name || (status?.profiles ?? []).find((p) => p.iccid === task.profile_iccid)?.display_name || "待选择 Profile")
                  : null
                const isExpanded = expandedKeepaliveTaskId === task.id
                return (
                  <div key={task.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{task.label || "未命名任务"}</span>
                          {esimEnabled && profileName ? <Badge variant="outline">{profileName}</Badge> : null}
                          <Badge variant="secondary">{task.enabled ? "已启用" : "已停用"}</Badge>
                          <Badge variant="outline">{saved?.schedule_label || task.cron_expression || "--"}</Badge>
                          {saved?.next_run_label ? <Badge variant="outline">{saved.next_run_label}</Badge> : null}
                          {task.target_number ? <Badge variant="outline">{task.target_number}</Badge> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>启用</span><Switch checked={task.enabled} onCheckedChange={(ch) => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.map((t) => t.id === task.id ? { ...t, enabled: ch } : t)) }} /></div>
                          <Button type="button" size="sm" variant="outline" onClick={() => setExpandedKeepaliveTaskId(isExpanded ? null : task.id)}><ChevronDownIcon data-icon="inline-start" className={cn("transition-transform", isExpanded && "rotate-180")} />{isExpanded ? "收起设置" : "展开设置"}</Button>
                        </div>
                      </div>
                      {isExpanded ? <>
                        <p className="text-sm text-muted-foreground">未保存的修改会在保存保活配置后参与调度与手动执行。</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => { void sendKeepaliveTestSms(task) }}><SendIcon data-icon="inline-start" />测试短信</Button>
                          <Button type="button" size="sm" variant="outline" disabled={actionBusy || !saved} onClick={() => { void runAction("run_keepalive_task", { task_id: task.id, trigger: "manual" }, `执行保活 ${task.label}`) }}><SendIcon data-icon="inline-start" />立即执行</Button>
                          <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.filter((t) => t.id !== task.id)) }}><Trash2Icon data-icon="inline-start" />删除</Button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="grid gap-2"><Label htmlFor={`kn-${task.id}`}>任务名称</Label><Input id={`kn-${task.id}`} value={task.label} onChange={(e) => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.map((t) => t.id === task.id ? { ...t, label: e.target.value } : t)) }} placeholder="例如 EE 保活" /></div>
                          {/* Profile 选择 - 仅 eSIM 显示 */}
                          {esimEnabled ? (
                            <div className="grid gap-2 md:col-span-2"><Label>目标 Profile</Label><Select value={task.profile_iccid} onValueChange={(v) => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.map((t) => t.id === task.id ? { ...t, profile_iccid: v ?? "" } : t)) }}><SelectTrigger><SelectValue placeholder="选择 Profile" /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>Profiles</SelectLabel>{(status?.profiles ?? []).map((p) => <SelectItem key={p.iccid} value={p.iccid}>{p.display_name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
                          ) : null}
                          <div className={cn("grid gap-2", esimEnabled ? "md:col-span-2" : "")}><Label htmlFor={`kc-${task.id}`}>cron 表达式</Label><Input id={`kc-${task.id}`} value={task.cron_expression} onChange={(e) => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.map((t) => t.id === task.id ? { ...t, cron_expression: e.target.value } : t)) }} placeholder="例如 0 9 * * *" /><p className="text-sm text-muted-foreground">5 段 cron：分钟 小时 日 月 星期。示例：0 9 * * * = 每天 09:00。</p></div>
                          <div className={cn("grid gap-2", !esimEnabled ? "md:col-span-2" : "")}><Label htmlFor={`kt-${task.id}`}>目标号码</Label><Input id={`kt-${task.id}`} value={task.target_number} onChange={(e) => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.map((t) => t.id === task.id ? { ...t, target_number: e.target.value } : t)) }} placeholder="例如 +447000000000" /></div>
                        </div>
                        <div className="grid gap-2"><Label htmlFor={`km-${task.id}`}>短信内容</Label><Textarea id={`km-${task.id}`} value={task.message} rows={4} onChange={(e) => { keepaliveDirtyRef.current = true; setKeepaliveTasks((c) => c.map((t) => t.id === task.id ? { ...t, message: e.target.value } : t)) }} placeholder="输入保活短信内容" /></div>
                      </> : null}
                    </div>
                  </div>
                )
              })}
            </div> : <EmptyState icon={Clock3Icon} title="还没有保活任务" description={emptyText} />}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={actionBusy} onClick={() => { void saveKeepalive() }}><SendIcon data-icon="inline-start" />保存保活配置</Button>
              <Button type="button" variant="outline" disabled={!status} onClick={() => { keepaliveDirtyRef.current = false; window.location.reload() }}>恢复当前状态</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDaysIcon className="size-4 text-muted-foreground" />调度状态</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="glass-panel rounded-xl p-4 text-center"><div className="text-sm text-muted-foreground">已启用任务</div><div className="mt-2 text-2xl font-semibold">{keepaliveEnabledCount}</div></div>
              <div className="glass-panel rounded-xl p-4 text-center">
                <div className="text-sm text-muted-foreground">{esimEnabled ? "下次可切卡" : "下次执行"}</div>
                <div className="mt-2 text-sm font-medium">{keepalive.next_allowed_at || "当前可执行"}</div>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-medium">当前执行</span>{keepalive.active_run ? <Badge variant={keepaliveRunStateVariant(keepalive.active_run.state)}>{keepaliveRunStateLabel(keepalive.active_run.state)}</Badge> : <Badge variant="outline">空闲</Badge>}</div>
              {keepalive.active_run ? <div className="space-y-2 text-sm text-muted-foreground"><div>{keepalive.active_run.label}</div><div>触发：{keepaliveTriggerLabel(keepalive.active_run.trigger)}</div>{esimEnabled ? <div>Profile：{keepalive.active_run.profile_name || "--"}</div> : null}<div>计划：{keepalive.active_run.scheduled_for_label || "--"}</div><div className="whitespace-pre-wrap text-foreground/80">{keepalive.active_run.last_message || "任务已启动..."}</div></div> : <p className="text-sm text-muted-foreground">当前没有保活任务正在执行。</p>}
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-medium">排队中</span><Badge variant="secondary">{keepalive.queued_runs.length} 条</Badge></div>
              {keepalive.queued_runs.length ? keepalive.queued_runs.map((r) => <div key={r.id} className="glass-panel rounded-lg p-2.5 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.label}</span><Badge variant="outline">{keepaliveTriggerLabel(r.trigger)}</Badge></div><div className="mt-1 text-muted-foreground">{r.scheduled_for_label || "等待调度"}{esimEnabled ? ` · ${r.profile_name || "--"}` : ""}</div></div>) : <p className="text-sm text-muted-foreground">没有排队中的任务。</p>}
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-medium">最近记录</span><Badge variant="secondary">{keepalive.recent_runs.length} 条</Badge></div>
              {keepalive.recent_runs.length ? keepalive.recent_runs.map((r) => <div key={r.id} className="glass-panel rounded-lg p-2.5 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.label}</span><Badge variant={keepaliveRunStateVariant(r.state)}>{keepaliveRunStateLabel(r.state)}</Badge></div><div className="mt-1 text-muted-foreground">{r.updated_at || r.scheduled_for_label || "--"}{esimEnabled ? ` · ${r.profile_name || "--"}` : ""}</div><div className="mt-1 whitespace-pre-wrap text-foreground/80">{r.error || r.last_message || "暂无详情"}</div></div>) : <p className="text-sm text-muted-foreground">执行后会在这里保留最近记录。</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
