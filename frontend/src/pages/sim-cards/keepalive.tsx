import {
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Clock3Icon,
  CopyIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAppContext } from "@/hooks/app-context"
import { createKeepaliveTask, getKeepalive, keepaliveRunStateLabel } from "@/lib/helpers"
import type { DeviceStatus, KeepaliveFormTask, Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

type TaskTypeFilter = "all" | "direct" | "profile"
type StatusFilter = "all" | "enabled" | "paused"
type KeepaliveMode = "direct" | "profile"
type SaveRequest = { taskId: string; enabled: boolean; token: number }
type MenuOption<T extends string = string> = {
  value: T
  label: string
  description?: string
  destructive?: boolean
}
type MenuAnchorRect = Pick<DOMRect, "bottom" | "left" | "right" | "width">

const PAGE_SIZE = 8
const FLOATING_MENU_SELECTOR = "[data-keepalive-floating-menu]"
const MENU_TRIGGER_SELECTOR = "[data-keepalive-menu-trigger]"
const MODAL_STEPS = [
  { id: "basic", label: "基本信息", icon: CheckCircle2Icon },
  { id: "method", label: "发送方式", icon: SendIcon },
  { id: "schedule", label: "调度规则", icon: CalendarClockIcon },
  { id: "advanced", label: "高级配置", icon: Settings2Icon },
] as const

const CRON_PRESETS = [
  { label: "每天 09:00", value: "0 9 * * *" },
  { label: "每天 18:00", value: "0 18 * * *" },
  { label: "每 6 小时", value: "0 */6 * * *" },
  { label: "每周一 09:00", value: "0 9 * * 1" },
]

function deviceKindLabel(device?: DeviceStatus) {
  if (!device) return "未选择"
  return device.capabilities.esim_supported ? "eSIM" : "普通 SIM"
}

function taskMode(task: KeepaliveFormTask, device?: DeviceStatus): KeepaliveMode {
  if (device?.capabilities.esim_supported && task.profile_iccid) return "profile"
  return "direct"
}

function profileLabel(profile?: Profile) {
  if (!profile) return "未选择 Profile"
  return profile.display_name || profile.iccid || "eSIM Profile"
}

function taskTypeLabel(mode: KeepaliveMode) {
  return mode === "profile" ? "eSIM" : "普通 SIM"
}

function nextRunLabel(task: KeepaliveFormTask, saved?: { next_run_label?: string; schedule_label?: string }) {
  return saved?.next_run_label || saved?.schedule_label || estimateCron(task.cron_expression)
}

function estimateCron(cron: string) {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return "Cron 待校验"
  const [minute, hour, , , weekday] = parts
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    if (weekday !== "*") return `周 ${weekday} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    return `每天 ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
  }
  return cron
}

function formatLastRun(taskId: string, runs: Array<{ task_id: string; updated_at: string; created_at: string; state: string }>) {
  const run = runs.find((item) => item.task_id === taskId)
  if (!run) return "暂无"
  return run.updated_at || run.created_at || keepaliveRunStateLabel(run.state)
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function SelectionCard({
  selected,
  disabled,
  title,
  description,
  onClick,
}: {
  selected: boolean
  disabled?: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-[92px] rounded-xl border bg-white p-4 text-left transition-all",
        "hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        selected ? "border-[#2563EB] ring-3 ring-blue-500/10" : "border-[#E5E7EB]",
        disabled && "cursor-not-allowed opacity-45 hover:translate-y-0 hover:shadow-none",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 size-4 rounded-full border", selected ? "border-[#2563EB] bg-[#2563EB] shadow-[inset_0_0_0_4px_white]" : "border-slate-300")} />
        <span>
          <span className="block text-sm font-semibold text-slate-950">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
        </span>
      </div>
    </button>
  )
}

function MenuPanel({
  children,
  anchorRect,
  align = "right",
  panelRef,
}: {
  children: React.ReactNode
  anchorRect: MenuAnchorRect | null
  align?: "left" | "right"
  panelRef?: React.RefObject<HTMLDivElement | null>
}) {
  if (!anchorRect) return null
  const viewportWidth = globalThis.innerWidth || 0
  const minWidth = Math.max(176, anchorRect.width)
  const left = align === "left" ? Math.min(anchorRect.left, Math.max(8, viewportWidth - minWidth - 8)) : undefined
  const right = align === "right" ? Math.max(8, viewportWidth - anchorRect.right) : undefined
  return createPortal(
    <div
      ref={panelRef}
      data-keepalive-floating-menu
      className={cn(
        "pointer-events-auto fixed z-[90] rounded-xl border border-[#E5E7EB] bg-white p-1 shadow-[0_18px_45px_rgba(15,23,42,0.14)]",
      )}
      style={{ top: anchorRect.bottom + 6, left, right, minWidth }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

function MenuItem({
  icon: Icon,
  label,
  destructive,
  onSelect,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  destructive?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition hover:bg-[#F8FAFC]",
        destructive ? "text-rose-600 hover:bg-rose-50" : "text-slate-700",
      )}
      onClick={onSelect}
    >
      {Icon ? <Icon className="size-4" /> : null}
      <span>{label}</span>
    </button>
  )
}

function SelectMenu<T extends string>({
  value,
  placeholder,
  options,
  onChange,
  className,
}: {
  value: T | ""
  placeholder: string
  options: Array<MenuOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [anchorRect, setAnchorRect] = useState<MenuAnchorRect | null>(null)
  const selected = options.find((option) => option.value === value)
  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (selectRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true)
  }, [open])
  useEffect(() => {
    if (!open) return
    const updateAnchor = () => setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null)
    updateAnchor()
    window.addEventListener("resize", updateAnchor)
    window.addEventListener("scroll", updateAnchor, true)
    return () => {
      window.removeEventListener("resize", updateAnchor)
      window.removeEventListener("scroll", updateAnchor, true)
    }
  }, [open])
  return (
    <div ref={selectRef} data-keepalive-menu-trigger className={cn("relative", className)} onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3 text-left text-sm text-slate-900 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-slate-400")}>{selected?.label || placeholder}</span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <MenuPanel anchorRect={anchorRect} align="left" panelRef={panelRef}>
          <div className="max-h-72 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#F8FAFC]",
                  option.value === value ? "bg-blue-50 text-[#2563EB]" : option.destructive ? "text-rose-600" : "text-slate-700",
                )}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span className="font-medium">{option.label}</span>
                {option.description ? <span className="mt-0.5 text-xs text-slate-500">{option.description}</span> : null}
              </button>
            ))}
          </div>
        </MenuPanel>
      ) : null}
    </div>
  )
}

function isFloatingMenuTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(FLOATING_MENU_SELECTOR))
}

export default function KeepalivePage() {
  const {
    status,
    actionBusy,
    keepaliveSettings,
    setKeepaliveSettings,
    keepaliveTasks,
    setKeepaliveTasks,
    saveKeepalive,
    runAction,
    keepaliveDirtyRef,
  } = useAppContext()
  const keepalive = getKeepalive(status)
  const devices = useMemo(() => status?.devices ?? [], [status?.devices])
  const profiles = useMemo(() => status?.profiles ?? [], [status?.profiles])
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [typeFilter, setTypeFilter] = useState<TaskTypeFilter>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [modalTaskId, setModalTaskId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<(typeof MODAL_STEPS)[number]["id"]>("basic")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [saveRequest, setSaveRequest] = useState<SaveRequest | null>(null)
  const [pendingSaveToken, setPendingSaveToken] = useState(0)
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null)
  const [taskMenuAnchor, setTaskMenuAnchor] = useState<MenuAnchorRect | null>(null)
  const [batchMenuOpen, setBatchMenuOpen] = useState(false)
  const [batchMenuAnchor, setBatchMenuAnchor] = useState<MenuAnchorRect | null>(null)
  const modalScrollRef = useRef<HTMLDivElement | null>(null)
  const selectedTask = keepaliveTasks.find((task) => task.id === modalTaskId) ?? null
  const selectedDevice = devices.find((device) => device.id === selectedTask?.device_id)
  const selectedDeviceProfiles = profiles.filter((profile) => !selectedTask?.device_id || profile.device_id === selectedTask.device_id)
  const selectedMode = selectedTask ? taskMode(selectedTask, selectedDevice) : "direct"
  const deviceOptions = useMemo(
    () => devices.map((device) => ({
      value: device.id,
      label: device.label || device.id,
      description: deviceKindLabel(device),
    })),
    [devices],
  )
  const profileOptions = useMemo(
    () => selectedDeviceProfiles.map((profile) => ({
      value: profile.iccid,
      label: profileLabel(profile),
      description: profile.iccid,
    })),
    [selectedDeviceProfiles],
  )

  const savedTaskMap = useMemo(() => new Map(keepalive.tasks.map((task) => [task.id, task])), [keepalive.tasks])

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return keepaliveTasks.filter((task) => {
      const device = devices.find((item) => item.id === task.device_id)
      const mode = taskMode(task, device)
      if (statusFilter === "enabled" && !task.enabled) return false
      if (statusFilter === "paused" && task.enabled) return false
      if (typeFilter !== "all" && typeFilter !== mode) return false
      if (!normalizedQuery) return true
      return [task.label, task.target_number, task.cron_expression, device?.label].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery))
    })
  }, [devices, keepaliveTasks, query, statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE))
  const visibleTasks = filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every((task) => selectedIds.includes(task.id))

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, typeFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (!saveRequest) return
    const task = keepaliveTasks.find((item) => item.id === saveRequest.taskId)
    if (!task || task.enabled !== saveRequest.enabled) return
    setSaveRequest(null)
    void saveKeepalive()
  }, [keepaliveTasks, saveKeepalive, saveRequest])

  useEffect(() => {
    if (!pendingSaveToken) return
    setPendingSaveToken(0)
    void saveKeepalive()
  }, [pendingSaveToken, saveKeepalive])

  useEffect(() => {
    if (!openTaskMenuId && !batchMenuOpen) return
    const closeMenus = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest(FLOATING_MENU_SELECTOR) || target.closest(MENU_TRIGGER_SELECTOR))
      ) {
        return
      }
      setOpenTaskMenuId(null)
      setTaskMenuAnchor(null)
      setBatchMenuOpen(false)
      setBatchMenuAnchor(null)
    }
    document.addEventListener("pointerdown", closeMenus, true)
    return () => document.removeEventListener("pointerdown", closeMenus, true)
  }, [batchMenuOpen, openTaskMenuId])

  useEffect(() => {
    const scroller = modalScrollRef.current
    if (!selectedTask || !scroller) return
    const handleScroll = () => {
      const scrollerTop = scroller.getBoundingClientRect().top
      const isAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8
      let active: (typeof MODAL_STEPS)[number]["id"] = MODAL_STEPS[0].id
      if (isAtBottom) {
        setCurrentStep(MODAL_STEPS[MODAL_STEPS.length - 1].id)
        return
      }
      for (const step of MODAL_STEPS) {
        const section = scroller.querySelector<HTMLElement>(`#${step.id}`)
        if (!section) continue
        if (section.getBoundingClientRect().top - scrollerTop <= 72) active = step.id
      }
      setCurrentStep(active)
    }
    handleScroll()
    scroller.addEventListener("scroll", handleScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", handleScroll)
  }, [selectedTask])

  const updateTask = (taskId: string, updater: (task: KeepaliveFormTask) => KeepaliveFormTask) => {
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => current.map((task) => (task.id === taskId ? updater(task) : task)))
  }

  const openNewTask = () => {
    const task = createKeepaliveTask(devices, profiles)
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => [...current, task])
    setModalTaskId(task.id)
    setCurrentStep("basic")
    setAdvancedOpen(false)
  }

  const openTask = (taskId: string) => {
    setModalTaskId(taskId)
    setCurrentStep("basic")
    setAdvancedOpen(false)
  }

  const duplicateTask = (task: KeepaliveFormTask) => {
    const id = `keepalive-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => [...current, { ...task, id, label: `${task.label || "未命名任务"} 副本`, enabled: false }])
    setModalTaskId(id)
  }

  const deleteTasks = (taskIds: string[]) => {
    if (!taskIds.length) return
    keepaliveDirtyRef.current = true
    setKeepaliveTasks((current) => current.filter((task) => !taskIds.includes(task.id)))
    setSelectedIds((current) => current.filter((id) => !taskIds.includes(id)))
    if (taskIds.includes(modalTaskId ?? "")) setModalTaskId(null)
    setPendingSaveToken(Date.now())
  }

  const toggleTaskSelection = (taskId: string, checked?: boolean) => {
    setSelectedIds((current) => {
      const selected = current.includes(taskId)
      const shouldSelect = checked ?? !selected
      if (shouldSelect && !selected) return [...current, taskId]
      if (!shouldSelect && selected) return current.filter((id) => id !== taskId)
      return current
    })
  }

  const scrollToStep = (stepId: (typeof MODAL_STEPS)[number]["id"]) => {
    setCurrentStep(stepId)
    modalScrollRef.current?.querySelector(`#${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const persistTask = (enabled: boolean) => {
    if (!selectedTask) return
    setSaveRequest({ taskId: selectedTask.id, enabled, token: Date.now() })
    updateTask(selectedTask.id, (task) => ({ ...task, enabled }))
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-[#F8FAFC] p-6 md:-m-6 md:p-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">定时任务</h1>
            <p className="mt-2 text-sm text-slate-500">按照设定时间自动发送短信，支持普通 SIM 和 eSIM Profile。</p>
          </div>
          <Button type="button" size="lg" onClick={openNewTask} disabled={!devices.length || actionBusy} className="h-10 bg-[#2563EB] px-4 shadow-[0_8px_20px_rgba(37,99,235,0.22)] hover:bg-blue-600">
            <PlusIcon data-icon="inline-start" />
            新建任务
          </Button>
        </header>

        <main className="rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 lg:w-[360px]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称" className="h-11 rounded-xl border-[#E5E7EB] bg-[#F8FAFC] pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SelectMenu<StatusFilter>
                value={statusFilter}
                placeholder="全部状态"
                className="w-[132px]"
                options={[{ value: "all", label: "全部状态" }, { value: "enabled", label: "启用" }, { value: "paused", label: "暂停" }]}
                onChange={setStatusFilter}
              />
              <SelectMenu<TaskTypeFilter>
                value={typeFilter}
                placeholder="全部类型"
                className="w-[148px]"
                options={[{ value: "all", label: "全部类型" }, { value: "direct", label: "普通 SIM" }, { value: "profile", label: "eSIM" }]}
                onChange={setTypeFilter}
              />
              <div data-keepalive-menu-trigger onClick={(event) => event.stopPropagation()}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={!selectedIds.length || actionBusy}
                  className="h-11 rounded-xl border-[#E5E7EB]"
                  onClick={(event) => {
                    setBatchMenuAnchor(event.currentTarget.getBoundingClientRect())
                    setBatchMenuOpen((open) => !open)
                  }}
                >
                  <SlidersHorizontalIcon data-icon="inline-start" />
                  批量操作
                </Button>
                {batchMenuOpen ? (
                  <MenuPanel anchorRect={batchMenuAnchor}>
                    <MenuItem icon={Trash2Icon} label={`删除选中的 ${selectedIds.length} 条任务`} destructive onSelect={() => { setBatchMenuOpen(false); setBatchMenuAnchor(null); deleteTasks(selectedIds) }} />
                  </MenuPanel>
                ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F8FAFC] text-xs font-medium text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-slate-300 accent-[#2563EB]"
                      checked={allVisibleSelected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const ids = visibleTasks.map((task) => task.id)
                        setSelectedIds((current) => event.target.checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id)))
                      }}
                    />
                  </th>
                  <th className="px-4 py-3">任务名称</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">目标设备</th>
                  <th className="px-4 py-3">下次执行</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">最后执行时间</th>
                  <th className="w-[160px] px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {visibleTasks.length ? visibleTasks.map((task) => {
                  const device = devices.find((item) => item.id === task.device_id)
                  const mode = taskMode(task, device)
                  const saved = savedTaskMap.get(task.id)
                  const selected = selectedIds.includes(task.id)
                  return (
                    <tr
                      key={task.id}
                      className={cn("cursor-pointer bg-white transition-colors hover:bg-[#F8FAFC]", selected && "bg-blue-50/60")}
                      onClick={() => toggleTaskSelection(task.id)}
                      onDoubleClick={() => openTask(task.id)}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300 accent-[#2563EB]"
                          checked={selected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => toggleTaskSelection(task.id, event.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-950">{task.label || "未命名任务"}</div>
                        <div className="mt-1 max-w-[280px] truncate text-xs text-slate-500">{task.target_number || "未设置目标号码"}</div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={mode === "profile" ? "secondary" : "outline"} className="rounded-full">{taskTypeLabel(mode)}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-700">{device?.label || "未绑定设备"}</div>
                        <div className="mt-1 text-xs text-slate-500">{deviceKindLabel(device)}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{nextRunLabel(task, saved)}</td>
                      <td className="px-4 py-4">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", task.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                          <span className={cn("size-1.5 rounded-full", task.enabled ? "bg-emerald-500" : "bg-slate-400")} />
                          {task.enabled ? "启用" : "暂停"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{formatLastRun(task.id, keepalive.recent_runs)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" disabled={actionBusy || !saved} title="运行" onClick={(event) => { event.stopPropagation(); void runAction("run_keepalive_task", { task_id: task.id, trigger: "manual", device_id: task.device_id }, `执行保活 ${task.label}`) }}>
                            <PlayIcon className="size-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" title="编辑" onClick={(event) => { event.stopPropagation(); openTask(task.id) }}>
                            <Settings2Icon className="size-4" />
                          </Button>
                          <div data-keepalive-menu-trigger onClick={(event) => event.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title="更多"
                              onClick={(event) => {
                                setTaskMenuAnchor(event.currentTarget.getBoundingClientRect())
                                setOpenTaskMenuId((id) => id === task.id ? null : task.id)
                              }}
                            >
                              <MoreHorizontalIcon className="size-4" />
                            </Button>
                            {openTaskMenuId === task.id ? (
                              <MenuPanel anchorRect={taskMenuAnchor}>
                                <MenuItem icon={CopyIcon} label="复制任务" onSelect={() => { setOpenTaskMenuId(null); setTaskMenuAnchor(null); duplicateTask(task) }} />
                                <MenuItem icon={Trash2Icon} label="删除任务" destructive onSelect={() => { setOpenTaskMenuId(null); setTaskMenuAnchor(null); deleteTasks([task.id]) }} />
                              </MenuPanel>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <Clock3Icon className="mx-auto size-8 text-slate-300" />
                      <div className="mt-3 font-medium text-slate-900">暂无定时任务</div>
                      <p className="mt-1 text-sm text-slate-500">点击右上角新建任务，配置自动发送短信计划。</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#E5E7EB] px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>已选择 {selectedIds.length} 条，共 {filteredTasks.length} 条任务</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="min-w-20 text-center">{page} / {totalPages}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open) setModalTaskId(null) }}>
        <DialogContent
          className="max-h-[80vh] max-w-[980px] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
          onInteractOutside={(event) => {
            if (isFloatingMenuTarget(event.target)) event.preventDefault()
          }}
        >
          {selectedTask ? (
            <div className="grid max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto]">
              <DialogHeader className="mb-0 border-b border-[#E5E7EB] px-6 py-5">
                <DialogTitle className="text-xl">{savedTaskMap.has(selectedTask.id) ? "编辑定时任务" : "新建定时任务"}</DialogTitle>
                <DialogDescription>配置任务名称、发送方式、调度规则和高级参数。</DialogDescription>
              </DialogHeader>

              <div className="grid min-h-0 md:grid-cols-[184px_minmax(0,1fr)]">
                <aside className="hidden border-r border-[#E5E7EB] bg-[#F8FAFC] p-4 md:block">
                  <nav className="space-y-1">
                    {MODAL_STEPS.map((step, index) => {
                      const Icon = step.icon
                      const active = currentStep === step.id
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => scrollToStep(step.id)}
                          className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition", active ? "bg-white font-medium text-[#2563EB] shadow-sm" : "text-slate-600 hover:bg-white/80")}
                        >
                          <Icon className="size-4" />
                          <span>{index + 1}. {step.label}</span>
                        </button>
                      )
                    })}
                  </nav>
                </aside>

                <div ref={modalScrollRef} className="min-h-0 space-y-8 overflow-y-auto bg-[#F8FAFC] p-6">
                  <Section id="basic" title="基本信息" description="命名任务并选择发送设备。">
                    <div className="grid items-start gap-4 md:grid-cols-2">
                      <div className="grid grid-rows-[auto_44px_16px] gap-2">
                        <Label htmlFor={`task-name-${selectedTask.id}`}>任务名称</Label>
                        <Input id={`task-name-${selectedTask.id}`} className="h-11 rounded-xl border-[#E5E7EB]" value={selectedTask.label} maxLength={50} onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, label: event.target.value }))} placeholder="例如 giffgaff 定时发送" />
                        <div className="leading-4 text-right text-xs text-slate-400">{selectedTask.label.length}/50</div>
                      </div>
                      <div className="grid grid-rows-[auto_44px_16px] gap-2">
                        <Label>目标设备</Label>
                        <SelectMenu
                          value={selectedTask.device_id}
                          placeholder="选择设备"
                          options={deviceOptions}
                          onChange={(value) => updateTask(selectedTask.id, (task) => ({ ...task, device_id: value, profile_iccid: "" }))}
                        />
                        <div aria-hidden className="min-h-4" />
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label>描述（可选）</Label>
                        <Input className="h-11 rounded-xl border-[#E5E7EB]" placeholder="用于备注任务用途，当前版本不会保存到后端" />
                      </div>
                    </div>
                  </Section>

                  <Section id="method" title="发送方式" description="选择直接使用当前 SIM，或在发送前自动切换 eSIM Profile。">
                    <div className="grid gap-3 md:grid-cols-2">
                      <SelectionCard selected={selectedMode === "direct"} title="当前 SIM" description="使用当前插入或当前启用的 SIM 发送。" onClick={() => updateTask(selectedTask.id, (task) => ({ ...task, profile_iccid: "" }))} />
                      <SelectionCard selected={selectedMode === "profile"} disabled={!selectedDevice?.capabilities.esim_supported || !selectedDeviceProfiles.length} title="eSIM Profile" description="发送前自动切换指定 Profile。" onClick={() => updateTask(selectedTask.id, (task) => ({ ...task, profile_iccid: selectedDeviceProfiles[0]?.iccid ?? "" }))} />
                    </div>
                    {selectedMode === "profile" ? (
                      <div className="mt-5 grid gap-2">
                        <Label>Profile 选择器</Label>
                        <SelectMenu
                          value={selectedTask.profile_iccid}
                          placeholder="选择 Profile"
                          options={profileOptions}
                          onChange={(value) => updateTask(selectedTask.id, (task) => ({ ...task, profile_iccid: value }))}
                        />
                      </div>
                    ) : null}
                  </Section>

                  <Section id="schedule" title="调度规则" description="设置 Cron 表达式、目标号码和短信内容。">
                    <div className="grid gap-5">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="grid gap-2">
                          <Label htmlFor={`task-cron-${selectedTask.id}`}>Cron 表达式</Label>
                          <Input id={`task-cron-${selectedTask.id}`} className="h-11 rounded-xl border-[#E5E7EB]" value={selectedTask.cron_expression} onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, cron_expression: event.target.value }))} placeholder="例如 0 9 * * *" />
                        </div>
                        <div className="grid gap-2">
                          <Label>常用表达式</Label>
                          <SelectMenu
                            value=""
                            placeholder="快速选择"
                            options={CRON_PRESETS}
                            onChange={(value) => updateTask(selectedTask.id, (task) => ({ ...task, cron_expression: value }))}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm text-slate-500">下一次执行时间：<span className="font-medium text-slate-900">{nextRunLabel(selectedTask, savedTaskMap.get(selectedTask.id))}</span></div>
                      <div className="grid gap-2">
                        <Label htmlFor={`task-target-${selectedTask.id}`}>目标号码</Label>
                        <Input id={`task-target-${selectedTask.id}`} className="h-11 rounded-xl border-[#E5E7EB]" value={selectedTask.target_number} onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, target_number: event.target.value }))} placeholder="多个号码用逗号分隔" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`task-message-${selectedTask.id}`}>短信内容</Label>
                        <Textarea id={`task-message-${selectedTask.id}`} className="min-h-[132px] rounded-xl border-[#E5E7EB]" maxLength={500} value={selectedTask.message} onChange={(event) => updateTask(selectedTask.id, (task) => ({ ...task, message: event.target.value }))} placeholder="请输入短信内容" />
                        <div className="text-right text-xs text-slate-400">{selectedTask.message.length} / 500</div>
                      </div>
                    </div>
                  </Section>

                  <Section id="advanced" title="高级配置" description="普通用户无需展开，默认参数已适合大多数场景。">
                    <button type="button" className="flex w-full items-center justify-between rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-medium text-slate-900 hover:bg-[#F8FAFC]" onClick={() => setAdvancedOpen((value) => !value)}>
                      <span className="flex items-center gap-2"><ChevronsUpDownIcon className="size-4 text-slate-400" />高级配置</span>
                      <Badge variant="outline">{advancedOpen ? "已展开" : "默认折叠"}</Badge>
                    </button>
                    {advancedOpen ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] px-4 py-3">
                          <div><div className="text-sm font-medium">启用保活</div><div className="text-xs text-slate-500">跟随任务启用状态</div></div>
                          <Switch checked={selectedTask.enabled} onCheckedChange={(checked) => updateTask(selectedTask.id, (task) => ({ ...task, enabled: checked }))} />
                        </div>
                        <div className="grid gap-2">
                          <Label>队列间隔</Label>
                          <Input type="number" min={30} max={1800} className="h-11 rounded-xl border-[#E5E7EB]" value={String(keepaliveSettings.queue_gap_seconds)} onChange={(event) => { keepaliveDirtyRef.current = true; const value = Number.parseInt(event.target.value, 10); setKeepaliveSettings(() => ({ queue_gap_seconds: Number.isNaN(value) ? 180 : value })) }} />
                        </div>
                        <div className="grid gap-2"><Label>最大重试次数</Label><Input className="h-11 rounded-xl border-[#E5E7EB]" value="3" readOnly /></div>
                        <div className="grid gap-2"><Label>超时时间</Label><Input className="h-11 rounded-xl border-[#E5E7EB]" value="120 秒" readOnly /></div>
                        <div className="grid gap-2"><Label>执行优先级</Label><Input className="h-11 rounded-xl border-[#E5E7EB]" value="普通" readOnly /></div>
                      </div>
                    ) : null}
                  </Section>
                </div>
              </div>

              <DialogFooter className="mt-0 border-t border-[#E5E7EB] px-6 py-4">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" className="justify-start" onClick={() => setModalTaskId(null)}>取消</Button>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" disabled={actionBusy} onClick={() => persistTask(false)}>
                      <PauseCircleIcon data-icon="inline-start" />
                      保存草稿
                    </Button>
                    <Button type="button" disabled={actionBusy} className="bg-[#2563EB] hover:bg-blue-600" onClick={() => persistTask(true)}>
                      <SendIcon data-icon="inline-start" />
                      保存并启用
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
