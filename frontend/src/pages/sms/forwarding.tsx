import {
  BellIcon,
  CheckCircle2Icon,
  Disc3Icon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  Settings2Icon,
  Trash2Icon,
  WebhookIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAppContext } from "@/hooks/app-context"
import { NOTIFICATION_CHANNEL_DEFINITIONS, NOTIFICATION_CHANNEL_ORDER, buildNotificationUrl, createNotificationTarget } from "@/lib/constants"
import { notificationChannelLabel, notificationFieldValue } from "@/lib/helpers"
import type { ChannelKind, NotificationChannelField, NotificationFormTarget } from "@/lib/types"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "enabled" | "disabled"

const CHANNEL_ICONS: Record<ChannelKind, typeof BellIcon> = {
  telegram: SendIcon,
  bark: BellIcon,
  gotify: MessageCircleIcon,
  ntfy: Disc3Icon,
  discord: MessageCircleIcon,
  custom: WebhookIcon,
}

const CHANNEL_COLORS: Record<ChannelKind, string> = {
  telegram: "bg-sky-500 text-white",
  bark: "bg-violet-500 text-white",
  gotify: "bg-emerald-500 text-white",
  ntfy: "bg-cyan-500 text-white",
  discord: "bg-indigo-500 text-white",
  custom: "bg-teal-500 text-white",
}

const PRIMARY_FIELD_KEYS: Record<ChannelKind, string[]> = {
  telegram: ["bot_token", "chat_id"],
  bark: ["device_key", "server_url"],
  gotify: ["server_url", "token"],
  ntfy: ["server_url", "topic"],
  discord: ["webhook_id", "webhook_token"],
  custom: ["custom_label", "url"],
}

function displayChannelLabel(type: ChannelKind, target?: NotificationFormTarget) {
  if (type === "custom") return target?.values.custom_label?.trim() || "Webhook"
  return NOTIFICATION_CHANNEL_DEFINITIONS[type].label
}

function displayChannelDescription(type: ChannelKind) {
  if (type === "custom") return "通过 HTTP Webhook 或 Apprise URL 推送通知。"
  return NOTIFICATION_CHANNEL_DEFINITIONS[type].description
}

function isSecretField(field?: NotificationChannelField) {
  if (!field) return false
  return field.inputType === "password" || /token|key|secret/i.test(field.key)
}

function maskValue(value: string) {
  if (!value.trim()) return "未填写"
  return "••••••••••••••••"
}

function compactMaskValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.length <= 4) return "****"
  return `${trimmed.slice(0, 2)}${"*".repeat(Math.min(8, Math.max(4, trimmed.length - 4)))}${trimmed.slice(-2)}`
}

function displayFieldValue(target: NotificationFormTarget, field: NotificationChannelField) {
  const value = notificationFieldValue(target, field.key)
  if (isSecretField(field)) return maskValue(value)
  return value.trim() || "未填写"
}

function isTargetComplete(target: NotificationFormTarget) {
  const definition = NOTIFICATION_CHANNEL_DEFINITIONS[target.type]
  return definition.fields.every((field) => !field.required || notificationFieldValue(target, field.key).trim())
}

function statusLabel(target: NotificationFormTarget) {
  if (!isTargetComplete(target)) return "配置不完整"
  return target.enabled ? "已启用" : "未启用"
}

function statusClassName(target: NotificationFormTarget) {
  if (!isTargetComplete(target)) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
  if (target.enabled) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
}

function formatUpdatedAt(timestamp?: string) {
  if (!timestamp) return "未上报"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
}

function ChannelLogo({ type }: { type: ChannelKind }) {
  const Icon = CHANNEL_ICONS[type]
  return (
    <div className={cn("flex size-10 items-center justify-center rounded-xl shadow-[0_8px_22px_rgba(15,23,42,0.12)]", CHANNEL_COLORS[type])}>
      <Icon className="size-5" />
    </div>
  )
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-[10px] px-3 text-sm font-medium transition",
        active ? "bg-white text-slate-950 shadow-sm ring-1 ring-[#E5E7EB]" : "text-slate-500 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  )
}

export default function SmsForwardingPage() {
  const {
    status,
    actionBusy,
    notificationTargets,
    saveNotifications,
    runAction,
    submittingActionLabel,
    notificationsDirtyRef,
  } = useAppContext()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<NotificationFormTarget | null>(null)
  const [createTarget, setCreateTarget] = useState<NotificationFormTarget | null>(null)
  const [hiddenUnsavedTargetIds, setHiddenUnsavedTargetIds] = useState<Set<string>>(() => new Set())
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const configuredTypes = useMemo(() => new Set(notificationTargets.map((target) => target.type)), [notificationTargets])
  const availableTypes = NOTIFICATION_CHANNEL_ORDER.filter((type) => !configuredTypes.has(type))
  const editingTarget = createTarget ?? editTarget
  const isCreatingTarget = Boolean(createTarget)
  const deleteTarget = notificationTargets.find((target) => target.id === deleteTargetId) ?? null
  const updatedAt = formatUpdatedAt(status?.timestamp)
  const savingNotifications = submittingActionLabel === "保存通知渠道"

  const resetEditor = useCallback(() => {
    setCreateTarget(null)
    setEditTarget(null)
    setEditingTargetId(null)
    notificationsDirtyRef.current = false
  }, [notificationsDirtyRef])

  const closeEditor = useCallback(() => {
    resetEditor()
  }, [resetEditor])

  useEffect(() => {
    if (!editTarget || !editingTargetId) return
    if (notificationTargets.some((target) => target.id === editingTargetId)) return
    closeEditor()
  }, [closeEditor, editingTargetId, editTarget, notificationTargets])

  const visibleTargets = notificationTargets.filter((target) => {
    if (hiddenUnsavedTargetIds.has(target.id)) return false
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      const haystack = [
        displayChannelLabel(target.type, target),
        displayChannelDescription(target.type),
        statusLabel(target),
        ...Object.values(target.values),
      ].join(" ").toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (statusFilter === "enabled") return target.enabled
    if (statusFilter === "disabled") return !target.enabled
    return true
  })

  const updateTarget = (targetId: string, updater: (target: NotificationFormTarget) => NotificationFormTarget) => {
    setCreateTarget((current) => (current?.id === targetId ? updater(current) : current))
    setEditTarget((current) => (current?.id === targetId ? updater(current) : current))
  }

  const openEditor = (targetId: string) => {
    const target = notificationTargets.find((item) => item.id === targetId)
    if (!target) return
    setCreateTarget(null)
    setEditTarget({ ...target, values: { ...target.values } })
    setEditingTargetId(targetId)
  }

  const openCreateEditor = (type: ChannelKind) => {
    if (configuredTypes.has(type)) return
    const target = createNotificationTarget(type)
    setHiddenUnsavedTargetIds((current) => new Set(current).add(target.id))
    setEditTarget(null)
    setCreateTarget(target)
    setEditingTargetId(null)
    setAddModalOpen(false)
  }

  const persistTargets = async (nextTargets: NotificationFormTarget[]) => {
    const saved = await saveNotifications(nextTargets)
    if (saved) {
      notificationsDirtyRef.current = false
    }
    return saved
  }

  const toggleTarget = (targetId: string, checked: boolean) => {
    const target = notificationTargets.find((item) => item.id === targetId)
    if (!target) return
    if (checked && !isTargetComplete(target)) {
      openEditor(targetId)
      return
    }
    const nextTargets = notificationTargets.map((item) => (item.id === targetId ? { ...item, enabled: checked } : item))
    void persistTargets(nextTargets)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const nextTargets = notificationTargets.filter((target) => target.id !== deleteTarget.id)
    const saved = await persistTargets(nextTargets)
    if (saved) setDeleteTargetId(null)
  }

  const saveAndCloseEditor = async () => {
    if (!editingTarget) return
    const nextTargets = isCreatingTarget
      ? [...notificationTargets, editingTarget]
      : notificationTargets.map((target) => (target.id === editingTargetId ? editingTarget : target))
    const saved = await persistTargets(nextTargets)
    if (saved) {
      if (isCreatingTarget) {
        setHiddenUnsavedTargetIds((current) => {
          const next = new Set(current)
          next.delete(editingTarget.id)
          return next
        })
      }
      resetEditor()
    }
  }

  const testEditingTarget = () => {
    if (!editingTarget || !isTargetComplete(editingTarget)) return
    const url = buildNotificationUrl(editingTarget)
    void runAction(
      "test_notification",
      {
        target: {
          id: editingTarget.id,
          label: notificationChannelLabel(editingTarget),
          url,
          enabled: true,
          type: editingTarget.type,
        },
      },
      `测试通知 ${displayChannelLabel(editingTarget.type, editingTarget)}`,
    )
  }

  const filteredEmpty = notificationTargets.length > 0 && visibleTargets.length === 0
  const resetFilters = () => {
    setSearchQuery("")
    setStatusFilter("all")
  }

  const saveButtonLabel = savingNotifications ? "保存中..." : "保存配置"

  const renderContent = () => {
    if (visibleTargets.length) {
      return (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleTargets.map((target) => (
            <ChannelCard
              key={target.id}
              target={target}
              updatedAt={updatedAt}
              actionBusy={actionBusy}
              onToggle={(checked) => toggleTarget(target.id, checked)}
              onEdit={() => openEditor(target.id)}
              onDelete={() => setDeleteTargetId(target.id)}
            />
          ))}
          {availableTypes.length ? <AddChannelCard disabled={actionBusy} onClick={() => setAddModalOpen(true)} /> : null}
        </div>
      )
    }
    if (filteredEmpty) {
      return <EmptyNotifications title="没有匹配的通知渠道" description="调整搜索关键词或筛选条件后再试。" actionLabel="清除筛选" onClick={resetFilters} disabled={actionBusy} />
    }
    return <EmptyNotifications title="添加通知渠道" description="支持 Telegram、Bark、Webhook、Email 等通知方式" actionLabel="立即添加" onClick={() => setAddModalOpen(true)} disabled={actionBusy || !availableTypes.length} />
  }

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] px-4 pb-12 pt-8 sm:-mx-6 sm:px-8 lg:mx-[-2rem] lg:my-[-1.25rem] lg:px-8 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-[28px] font-bold leading-9 text-slate-950 dark:text-slate-50">通知转发</h1>
            <p className="mt-1 text-[13px] leading-5 text-[#6B7280] dark:text-slate-400">配置短信通知渠道，每种渠道仅保留一份配置。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={actionBusy || !availableTypes.length} className="h-10 rounded-[10px] bg-[#2563EB] px-4 shadow-[0_8px_20px_rgba(37,99,235,0.22)] hover:bg-blue-600" onClick={() => setAddModalOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              添加渠道
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 rounded-xl border-[#E5E7EB] pl-9"
              placeholder="搜索渠道、状态或配置字段"
            />
          </div>
          <div className="flex w-fit rounded-xl bg-slate-100 p-1">
            <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>全部</FilterButton>
            <FilterButton active={statusFilter === "enabled"} onClick={() => setStatusFilter("enabled")}>已启用</FilterButton>
            <FilterButton active={statusFilter === "disabled"} onClick={() => setStatusFilter("disabled")}>已禁用</FilterButton>
          </div>
        </div>

        {renderContent()}
      </div>

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-[560px] rounded-2xl border border-[#E5E7EB] bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <DialogHeader className="mb-0 border-b border-[#E5E7EB] px-6 py-5">
            <DialogTitle>请选择通知渠道</DialogTitle>
            <DialogDescription>每种渠道仅保留一份配置。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 p-6">
            {availableTypes.length ? availableTypes.map((type) => (
              <button
                key={type}
                type="button"
                className="flex items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left transition hover:-translate-y-px hover:border-blue-200 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                onClick={() => openCreateEditor(type)}
              >
                <ChannelLogo type={type} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-950">{displayChannelLabel(type)}</span>
                  <span className="mt-1 block truncate text-sm text-slate-500">{displayChannelDescription(type)}</span>
                </span>
                <span className="size-4 rounded-full border border-slate-300" />
              </button>
            )) : (
              <div className="rounded-2xl border border-dashed border-[#E5E7EB] p-8 text-center text-sm text-slate-500">所有通知渠道都已添加。</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingTarget)} onOpenChange={(open) => {
        if (!open) closeEditor()
      }}>
        <DialogContent className="max-h-[80vh] max-w-[980px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          {editingTarget ? (
            <div className="grid max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto]">
              <DialogHeader className="mb-0 border-b border-[#E5E7EB] px-6 py-5">
                <DialogTitle>{isCreatingTarget ? "新增" : "编辑"} {displayChannelLabel(editingTarget.type, editingTarget)}</DialogTitle>
                <DialogDescription>{displayChannelDescription(editingTarget.type)}</DialogDescription>
              </DialogHeader>
              <div className="grid min-h-0 md:grid-cols-[184px_minmax(0,1fr)]">
                <aside className="hidden border-r border-[#E5E7EB] bg-[#F8FAFC] p-4 md:block">
                  <nav className="space-y-1">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm font-medium text-[#2563EB] shadow-sm"
                    >
                      <Settings2Icon className="size-4" />
                      基础配置
                    </button>
                  </nav>
                </aside>
                <div className="min-h-0 overflow-y-auto bg-[#F8FAFC] p-6">
                  <ConfigFields target={editingTarget} actionBusy={actionBusy} onChange={updateTarget} onTest={testEditingTarget} />
                </div>
              </div>
              <DialogFooter className="mt-0 border-t border-[#E5E7EB] px-6 py-4">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" className="justify-start" disabled={actionBusy} onClick={() => closeEditor()}>取消</Button>
                  <Button type="button" disabled={actionBusy} className="bg-[#2563EB] hover:bg-blue-600" onClick={() => { void saveAndCloseEditor() }}>
                    {savingNotifications ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <CheckCircle2Icon data-icon="inline-start" />}
                    {saveButtonLabel}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}>
        <DialogContent className="max-w-[420px] rounded-2xl border border-[#E5E7EB] bg-white p-0">
          {deleteTarget ? (
            <>
              <DialogHeader className="mb-0 border-b border-[#E5E7EB] px-6 py-5">
                <DialogTitle>确认删除 {displayChannelLabel(deleteTarget.type, deleteTarget)}？</DialogTitle>
                <DialogDescription>删除后配置无法恢复。</DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-0 px-6 py-4">
                <Button type="button" variant="ghost" disabled={actionBusy} onClick={() => setDeleteTargetId(null)}>取消</Button>
                <Button type="button" variant="destructive" disabled={actionBusy} onClick={() => { void confirmDelete() }}>
                  {savingNotifications ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <Trash2Icon data-icon="inline-start" />}
                  确认删除
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChannelCard({
  target,
  updatedAt,
  actionBusy,
  onToggle,
  onEdit,
  onDelete,
}: {
  target: NotificationFormTarget
  updatedAt: string
  actionBusy: boolean
  onToggle: (checked: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const definition = NOTIFICATION_CHANNEL_DEFINITIONS[target.type]
  const fieldKeys = PRIMARY_FIELD_KEYS[target.type]
  const fields = fieldKeys.map((key) => definition.fields.find((field) => field.key === key)).filter(Boolean) as NotificationChannelField[]
  const label = displayChannelLabel(target.type, target)

  return (
    <article className="group flex min-h-[296px] flex-col rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-px hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ChannelLogo type={target.type} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-950">{label}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusClassName(target))}>{statusLabel(target)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{displayChannelDescription(target.type)}</p>
          </div>
        </div>
        <Switch checked={target.enabled} disabled={actionBusy} onCheckedChange={onToggle} className="data-[state=checked]:bg-[#2563EB]" />
      </div>

      <div className="mt-6 grid gap-3">
        {fields.map((field) => (
          <div key={field.key}>
            <div className="text-xs font-medium text-slate-500">{field.label}</div>
            <div className="mt-1 h-11 truncate rounded-xl bg-[#F8FAFC] px-3 py-3 text-sm text-slate-800">{displayFieldValue(target, field)}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2Icon className="size-3.5 shrink-0" />
          <span className="truncate">更新时间：{updatedAt}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" disabled={actionBusy} title="编辑" className="rounded-[10px] border-[#E5E7EB]" onClick={onEdit}>
            <Settings2Icon className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" disabled={actionBusy} title="删除" className="rounded-[10px] border-[#E5E7EB]" onClick={onDelete}>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

function AddChannelCard({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[296px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#D1D5DB] bg-white p-6 text-center transition hover:-translate-y-px hover:border-blue-200 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-[#D1D5DB] disabled:hover:shadow-none"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-[#F8FAFC] text-slate-700">
        <PlusIcon className="size-7" />
      </span>
      <span className="mt-4 font-semibold text-slate-950">添加渠道</span>
      <span className="mt-2 max-w-60 text-sm leading-6 text-slate-500">支持 Telegram、Bark、Webhook、Email 等通知方式</span>
    </button>
  )
}

function EmptyNotifications({
  title,
  description,
  actionLabel,
  onClick,
  disabled,
}: {
  title: string
  description: string
  actionLabel: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#D1D5DB] bg-white px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-[#F8FAFC] text-slate-700">
        <PlusIcon className="size-8" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      <Button type="button" disabled={disabled} className="mt-6 rounded-[10px] bg-[#2563EB] hover:bg-blue-600" onClick={onClick}>
        <PlusIcon data-icon="inline-start" />
        {actionLabel}
      </Button>
    </div>
  )
}

function ConfigFields({
  target,
  actionBusy,
  onChange,
  onTest,
}: {
  target: NotificationFormTarget
  actionBusy: boolean
  onChange: (targetId: string, updater: (target: NotificationFormTarget) => NotificationFormTarget) => void
  onTest: () => void
}) {
  const definition = NOTIFICATION_CHANNEL_DEFINITIONS[target.type]
  const fields = definition.fields
  const complete = isTargetComplete(target)
  const hasValidUrl = Boolean(buildNotificationUrl(target).trim())

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">基础配置</h3>
          <p className="mt-1 text-sm text-slate-500">填写渠道发送所需的参数。</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={actionBusy || !complete || !hasValidUrl}
          className="h-9 shrink-0 rounded-[10px] border-[#E5E7EB] bg-white px-3 text-sm"
          onClick={onTest}
        >
          <SendIcon data-icon="inline-start" />
          测试发送
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={`${target.id}-${field.key}`} className="grid gap-2">
            <Label htmlFor={`n-${target.id}-${field.key}`}>{field.label}</Label>
            {field.options ? (
              <select
                id={`n-${target.id}-${field.key}`}
                className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                value={notificationFieldValue(target, field.key)}
                onChange={(event) => onChange(target.id, (current) => ({ ...current, values: { ...current.values, [field.key]: event.target.value } }))}
              >
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <MaskedInputField target={target} field={field} onChange={onChange} />
            )}
          </div>
        ))}
      </div>
      {complete && !hasValidUrl ? <p className="mt-4 text-sm text-amber-700">当前配置无法生成有效通知地址，请检查服务器地址或 URL 格式。</p> : null}
    </section>
  )
}

function MaskedInputField({
  target,
  field,
  onChange,
}: {
  target: NotificationFormTarget
  field: NotificationChannelField
  onChange: (targetId: string, updater: (target: NotificationFormTarget) => NotificationFormTarget) => void
}) {
  const shouldMask = isSecretField(field) || field.key === "chat_id"
  const [visible, setVisible] = useState(false)
  const rawValue = notificationFieldValue(target, field.key)
  const maskedValue = compactMaskValue(rawValue)
  const hidden = shouldMask && !visible

  return (
    <div className="relative">
      <Input
        id={`n-${target.id}-${field.key}`}
        type={shouldMask ? "text" : field.inputType ?? "text"}
        className={cn("h-11 rounded-xl border-[#E5E7EB]", shouldMask ? "pr-10 font-mono tracking-normal" : "")}
        value={hidden ? maskedValue : rawValue}
        readOnly={hidden}
        onChange={(event) => {
          if (hidden) return
          onChange(target.id, (current) => ({ ...current, values: { ...current.values, [field.key]: event.target.value } }))
        }}
        placeholder={field.placeholder}
      />
      {shouldMask ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={() => setVisible((current) => !current)}
          title={visible ? "隐藏" : "显示"}
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      ) : null}
      {hidden && rawValue ? (
        <button
          type="button"
          className="absolute inset-y-0 left-0 right-10 cursor-text rounded-l-xl"
          aria-label={`显示${field.label}`}
          onClick={() => setVisible(true)}
        />
      ) : null}
    </div>
  )
}
