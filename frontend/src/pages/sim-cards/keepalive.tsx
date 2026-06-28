import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  Clock3Icon,
  Layers3Icon,
  ListChecksIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo } from "react"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAppContext } from "@/hooks/app-context"
import { createKeepaliveTask, getKeepalive, keepaliveRunStateLabel, keepaliveRunStateVariant, keepaliveTriggerLabel } from "@/lib/helpers"
import type { DeviceStatus, KeepaliveFormTask, Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

type KeepaliveMode = "direct" | "profile"

function deviceKindLabel(device?: DeviceStatus) {
  if (!device) return "未选择设备"
  return device.capabilities.esim_supported ? "eSIM 设备" : "普通 SIM"
}

function taskMode(task: KeepaliveFormTask, device?: DeviceStatus): KeepaliveMode {
  if (device?.capabilities.esim_supported && task.profile_iccid) return "profile"
  return "direct"
}

function deviceMeta(device?: DeviceStatus) {
  if (!device) return "先选择一个支持短信的设备"
  const parts = [
    device.model || device.label,
    device.iccid ? `ICCID ${device.iccid}` : "",
    device.signal_dbm || "",
  ].filter(Boolean)
  return parts.join(" · ") || device.label
}

function profileLabel(profile?: Profile) {
  if (!profile) return "未选择 Profile"
  return profile.display_name || profile.iccid || "eSIM Profile"
}

function KeepaliveModeSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: KeepaliveMode
  disabled: boolean
  onChange: (mode: KeepaliveMode) => void
}) {
  const options: Array<{ value: KeepaliveMode; title: string; description: string }> = [
    { value: "direct", title: "当前 SIM 发送", description: "普通 SIM 或当前已启用卡号" },
    { value: "profile", title: "eSIM 指定 Profile", description: "执行前切换到指定卡号" },
  ]

  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="保活发送模式">
      {options.map((option) => {
        const selected = mode === option.value
        const isDisabled = option.value === "profile" && disabled
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isDisabled}
            className={cn(
              "min-h-20 rounded-2xl border px-4 py-3 text-left transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected ? "border-blue-500 bg-blue-500/10 text-foreground" : "border-border/70 bg-background/35 hover:border-blue-300",
              isDisabled && "cursor-not-allowed opacity-45 hover:border-border/70",
            )}
            onClick={() => onChange(option.value)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{option.title}</span>
              {selected ? <CheckCircle2Icon className="size-4 text-blue-600" /> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{option.description}</p>
          </button>
        )
      })}
    </div>
  )
}

export default function KeepalivePage() {
  const {
    status,
    actionBusy,
    keepaliveSettings,
    setKeepaliveSettings,
    keepaliveTasks,
    setKeepaliveTasks,
    expandedKeepaliveTaskId,
    setExpandedKeepaliveTaskId,
    saveKeepalive,
    sendKeepaliveTestSms,
    runAction,
    keepaliveDirtyRef,
  } = useAppContext()
  const keepalive = getKeepalive(status)
  const devices = useMemo(() => status?.devices ?? [], [status?.devices])
  const profiles = useMemo(() => status?.profiles ?? [], [status?.profiles])
  const selectedTask = keepaliveTasks.find((task) => task.id === expandedKeepaliveTaskId) ?? keepaliveTasks[0]
  const selectedDevice = devices.find((device) => device.id === selectedTask?.device_id)
  const selectedDeviceProfiles = profiles.filter((profile) => !selectedTask?.device_id || profile.device_id === selectedTask.device_id)
  const selectedProfile = selectedDeviceProfiles.find((profile) => profile.iccid === selectedTask?.profile_iccid)
  const currentMode = selectedTask ? taskMode(selectedTask, selectedDevice) : "direct"
  const keepaliveEnabledCount = keepalive.tasks.filter((task) => task.enabled).length
  const localEnabledCount = keepaliveTasks.filter((task) => task.enabled).length

  const taskGroups = useMemo(() => {
    const esim = keepaliveTasks.filter((task) => {
      const device = devices.find((item) => item.id === task.device_id)
      return Boolean(device?.capabilities.esim_supported)
    }).length
    return {
      direct: keepaliveTasks.length - esim,
      esim,
    }
  }, [devices, keepaliveTasks])

  const updateTask = (taskId: string, updater: (task: KeepaliveFormTask) => KeepaliveFormTask) => {
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => current.map((task) => (task.id === taskId ? updater(task) : task)))
  }

  const addTask = () => {
    const task = createKeepaliveTask(devices, profiles)
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => [...current, task])
    setExpandedKeepaliveTaskId(task.id)
  }

  const removeTask = (taskId: string) => {
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => current.filter((task) => task.id !== taskId))
    if (expandedKeepaliveTaskId === taskId) {
      const nextTask = keepaliveTasks.find((task) => task.id !== taskId)
      setExpandedKeepaliveTaskId(nextTask?.id ?? null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="定时任务"
        description="按设备配置定时短信。普通 SIM 直接发送；eSIM 设备可选择指定 Profile，执行时先切卡再发送。"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">启用任务</span>
            <ListChecksIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 text-2xl font-semibold">{localEnabledCount}</div>
          <p className="mt-1 text-xs text-muted-foreground">已保存 {keepaliveEnabledCount} 条</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">任务类型</span>
            <Layers3Icon className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 text-2xl font-semibold">{taskGroups.direct} / {taskGroups.esim}</div>
          <p className="mt-1 text-xs text-muted-foreground">当前 SIM / eSIM Profile</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">下次可执行</span>
            <Clock3Icon className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 truncate text-sm font-semibold">{keepalive.next_allowed_at || "当前可执行"}</div>
          <p className="mt-1 text-xs text-muted-foreground">队列间隔 {keepaliveSettings.queue_gap_seconds} 秒</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3Icon className="size-4 text-muted-foreground" />
                保活任务
              </CardTitle>
              <Button type="button" size="sm" variant="outline" disabled={actionBusy || !devices.length} onClick={addTask}>
                <PlusIcon data-icon="inline-start" />
                新建
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="keepalive-gap">队列缓冲时间</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="keepalive-gap"
                  type="number"
                  min={30}
                  max={1800}
                  value={String(keepaliveSettings.queue_gap_seconds)}
                  onChange={(event) => {
                    keepaliveDirtyRef.current = true
                    const value = Number.parseInt(event.target.value, 10)
                    setKeepaliveSettings(() => ({ queue_gap_seconds: Number.isNaN(value) ? 180 : value }))
                  }}
                />
                <span className="text-sm text-muted-foreground">秒</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">多个任务同时触发时排队执行，eSIM 切卡任务会使用这个间隔。</p>
            </div>
          </CardHeader>
          <CardContent>
            {keepaliveTasks.length ? (
              <div className="space-y-2">
                {keepaliveTasks.map((task) => {
                  const device = devices.find((item) => item.id === task.device_id)
                  const saved = keepalive.tasks.find((item) => item.id === task.id)
                  const mode = taskMode(task, device)
                  const active = selectedTask?.id === task.id
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        active ? "border-blue-500 bg-blue-500/10" : "border-border/60 bg-background/25 hover:border-blue-300",
                      )}
                      onClick={() => setExpandedKeepaliveTaskId(task.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{task.label || "未命名任务"}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{device?.label || "未绑定设备"}</div>
                        </div>
                        <ChevronRightIcon className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition", active && "text-blue-600")} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant={task.enabled ? "secondary" : "outline"}>{task.enabled ? "启用" : "停用"}</Badge>
                        <Badge variant="outline">{mode === "profile" ? "eSIM Profile" : "当前 SIM"}</Badge>
                        <Badge variant={task.device_id ? "outline" : "destructive"}>{deviceKindLabel(device)}</Badge>
                      </div>
                      <div className="mt-2 truncate text-xs text-muted-foreground">{saved?.next_run_label || task.cron_expression || "未设置计划"}</div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={Clock3Icon}
                title="还没有保活任务"
                description={devices.length ? "新建任务后选择设备和发送模式。" : "当前没有可配置的短信设备。"}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SmartphoneIcon className="size-4 text-muted-foreground" />
                  任务配置
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">先选择设备，系统会根据设备能力展示普通 SIM 或 eSIM 配置。</p>
              </div>
              {selectedTask ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedTask.enabled ? "已启用" : "已停用"}</span>
                  <Switch
                    checked={selectedTask.enabled}
                    onCheckedChange={(checked) => updateTask(selectedTask.id, (task) => ({ ...task, enabled: checked }))}
                  />
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {selectedTask ? (
              <div className="space-y-5">
                <section className="glass-panel rounded-2xl p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">1. 任务类型</div>
                      <p className="mt-1 text-xs text-muted-foreground">{deviceMeta(selectedDevice)}</p>
                    </div>
                    <Badge variant={selectedDevice ? "outline" : "destructive"}>{deviceKindLabel(selectedDevice)}</Badge>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`keepalive-name-${selectedTask.id}`}>任务名称</Label>
                      <Input
                        id={`keepalive-name-${selectedTask.id}`}
                        value={selectedTask.label}
                        onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, label: event.target.value }))}
                        placeholder="例如 giffgaff 保活"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>目标设备</Label>
                      <Select
                        value={selectedTask.device_id}
                        onValueChange={(value) => updateTask(selectedTask.id, (task) => ({ ...task, device_id: value ?? "", profile_iccid: "" }))}
                      >
                        <SelectTrigger><SelectValue placeholder="选择设备" /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>设备</SelectLabel>
                            {devices.map((device) => (
                              <SelectItem key={device.id} value={device.id}>
                                {device.label} · {deviceKindLabel(device)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                <section className="glass-panel rounded-2xl p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold">2. 发送模式</div>
                    <p className="mt-1 text-xs text-muted-foreground">普通 SIM 不需要切卡；eSIM 可以指定 Profile 后再发送。</p>
                  </div>
                  <KeepaliveModeSwitch
                    mode={currentMode}
                    disabled={!selectedDevice?.capabilities.esim_supported || !selectedDeviceProfiles.length}
                    onChange={(mode) => {
                      updateTask(selectedTask.id, (task) => ({
                        ...task,
                        profile_iccid: mode === "profile" ? selectedDeviceProfiles[0]?.iccid ?? "" : "",
                      }))
                    }}
                  />
                  {selectedDevice?.capabilities.esim_supported ? (
                    <div className="mt-4 grid gap-2">
                      <Label>eSIM Profile</Label>
                      <Select
                        value={selectedTask.profile_iccid || "__current__"}
                        onValueChange={(value) => updateTask(selectedTask.id, (task) => ({ ...task, profile_iccid: value === "__current__" ? "" : value ?? "" }))}
                      >
                        <SelectTrigger><SelectValue placeholder="选择 Profile" /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Profiles</SelectLabel>
                            <SelectItem value="__current__">不切卡，使用当前 SIM</SelectItem>
                            {selectedDeviceProfiles.map((profile) => (
                              <SelectItem key={profile.iccid} value={profile.iccid}>
                                {profileLabel(profile)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-muted-foreground">
                        当前选择：{selectedTask.profile_iccid ? profileLabel(selectedProfile) : "当前已启用 SIM，不执行 Profile 切换"}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
                      当前设备按普通 SIM 处理，保活时直接从这张卡发送短信。
                    </div>
                  )}
                </section>

                <section className="glass-panel rounded-2xl p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold">3. 调度与短信</div>
                    <p className="mt-1 text-xs text-muted-foreground">配置触发时间、接收号码和发送内容。</p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`keepalive-cron-${selectedTask.id}`}>cron 表达式</Label>
                      <Input
                        id={`keepalive-cron-${selectedTask.id}`}
                        value={selectedTask.cron_expression}
                        onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, cron_expression: event.target.value }))}
                        placeholder="例如 0 9 * * *"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">5 段格式：分钟 小时 日 月 星期。`0 9 * * *` 表示每天 09:00。</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`keepalive-target-${selectedTask.id}`}>目标号码</Label>
                      <Input
                        id={`keepalive-target-${selectedTask.id}`}
                        value={selectedTask.target_number}
                        onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, target_number: event.target.value }))}
                        placeholder="例如 +447000000000"
                      />
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor={`keepalive-message-${selectedTask.id}`}>短信内容</Label>
                      <Textarea
                        id={`keepalive-message-${selectedTask.id}`}
                        value={selectedTask.message}
                        rows={4}
                        onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, message: event.target.value }))}
                        placeholder="输入保活短信内容"
                      />
                    </div>
                  </div>
                </section>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={actionBusy} onClick={() => { void sendKeepaliveTestSms(selectedTask) }}>
                      <SendIcon data-icon="inline-start" />
                      测试短信
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actionBusy || !keepalive.tasks.some((task) => task.id === selectedTask.id) || !selectedTask.device_id}
                      onClick={() => { void runAction("run_keepalive_task", { task_id: selectedTask.id, trigger: "manual", device_id: selectedTask.device_id }, `执行保活 ${selectedTask.label}`) }}
                    >
                      <RefreshCwIcon data-icon="inline-start" />
                      立即执行
                    </Button>
                    <Button type="button" variant="outline" disabled={actionBusy} onClick={() => removeTask(selectedTask.id)}>
                      <Trash2Icon data-icon="inline-start" />
                      删除任务
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={!status} onClick={() => { keepaliveDirtyRef.current = false; window.location.reload() }}>
                      恢复当前状态
                    </Button>
                    <Button type="button" disabled={actionBusy} onClick={() => { void saveKeepalive() }}>
                      <SendIcon data-icon="inline-start" />
                      保存配置
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon={Clock3Icon} title="请选择或新建任务" description="任务会按照设备能力自动区分普通 SIM 和 eSIM 配置。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDaysIcon className="size-4 text-muted-foreground" />
              运行状态
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">当前执行</span>
                {keepalive.active_run ? <Badge variant={keepaliveRunStateVariant(keepalive.active_run.state)}>{keepaliveRunStateLabel(keepalive.active_run.state)}</Badge> : <Badge variant="outline">空闲</Badge>}
              </div>
              {keepalive.active_run ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">{keepalive.active_run.label}</div>
                  <div>设备：{keepalive.active_run.device_label || "--"}</div>
                  <div>触发：{keepaliveTriggerLabel(keepalive.active_run.trigger)}</div>
                  {keepalive.active_run.profile_name ? <div>Profile：{keepalive.active_run.profile_name}</div> : null}
                  <div className="whitespace-pre-wrap text-foreground/80">{keepalive.active_run.last_message || "任务已启动..."}</div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">当前没有保活任务正在执行。</p>
              )}
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">排队中</span>
                <Badge variant="secondary">{keepalive.queued_runs.length} 条</Badge>
              </div>
              <div className="space-y-2">
                {keepalive.queued_runs.length ? keepalive.queued_runs.map((run) => (
                  <div key={run.id} className="rounded-xl border border-border/60 bg-background/25 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{run.label}</span>
                      <Badge variant="outline">{keepaliveTriggerLabel(run.trigger)}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{run.scheduled_for_label || "等待调度"} · {run.device_label || "--"}{run.profile_name ? ` · ${run.profile_name}` : ""}</div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">没有排队中的任务。</p>}
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">最近记录</span>
                <Badge variant="secondary">{keepalive.recent_runs.length} 条</Badge>
              </div>
              <div className="space-y-2">
                {keepalive.recent_runs.length ? keepalive.recent_runs.map((run) => (
                  <div key={run.id} className="rounded-xl border border-border/60 bg-background/25 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{run.label}</span>
                      <Badge variant={keepaliveRunStateVariant(run.state)}>{keepaliveRunStateLabel(run.state)}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{run.updated_at || run.scheduled_for_label || "--"} · {run.device_label || "--"}{run.profile_name ? ` · ${run.profile_name}` : ""}</div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground/80">{run.error || run.last_message || "暂无详情"}</div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">执行后会在这里保留最近记录。</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
