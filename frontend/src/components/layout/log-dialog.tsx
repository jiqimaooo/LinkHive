import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIcon,
  ClockIcon,
  RefreshCwIcon,
  Trash2Icon,
  TerminalSquareIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppContext } from "@/hooks/app-context"
import { requestJson } from "@/lib/api"
import { friendlyActionName, levelClassName } from "@/lib/helpers"
import type { ActionEvent, SystemLogEntry, SystemLogsPayload } from "@/lib/types"
import { cn } from "@/lib/utils"

const RETENTION_OPTIONS = [1, 3, 7, 14, 30, 90]

export function LogDialog() {
  const { logs, setLogs, activeAction } = useAppContext()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"operations" | "system">("operations")
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([])
  const [systemEnabled, setSystemEnabled] = useState(false)
  const [retentionDays, setRetentionDays] = useState(7)
  const [loadingSystemLogs, setLoadingSystemLogs] = useState(false)
  const [savingSystemLogs, setSavingSystemLogs] = useState(false)

  const loadSystemLogs = useCallback(async () => {
    setLoadingSystemLogs(true)
    try {
      const payload = await requestJson<SystemLogsPayload>("/api/system-logs")
      setSystemEnabled(payload.enabled)
      setRetentionDays(payload.retention_days)
      setSystemLogs(payload.logs)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取系统日志失败")
    } finally {
      setLoadingSystemLogs(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadSystemLogs()
  }, [loadSystemLogs, open])

  const operationSummary = useMemo(() => {
    if (activeAction) return friendlyActionName(activeAction.action)
    return "空闲"
  }, [activeAction])

  const saveSystemLogSettings = async (enabled: boolean, days = retentionDays) => {
    setSavingSystemLogs(true)
    try {
      const payload = await requestJson<SystemLogsPayload>("/api/system-logs", {
        method: "POST",
        body: JSON.stringify({ enabled, retention_days: days }),
      })
      setSystemEnabled(payload.enabled)
      setRetentionDays(payload.retention_days)
      setSystemLogs(payload.logs)
      toast.success(payload.enabled ? "系统日志记录已开启" : "系统日志记录已关闭")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存系统日志设置失败")
    } finally {
      setSavingSystemLogs(false)
    }
  }

  const clearSystemLogs = async () => {
    if (!window.confirm("确认清空系统日志？清空后无法恢复。")) return
    setSavingSystemLogs(true)
    try {
      const payload = await requestJson<SystemLogsPayload>("/api/system-logs", {
        method: "POST",
        body: JSON.stringify({ action: "clear" }),
      })
      setSystemEnabled(payload.enabled)
      setRetentionDays(payload.retention_days)
      setSystemLogs(payload.logs)
      toast.success("系统日志已清空")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清空系统日志失败")
    } finally {
      setSavingSystemLogs(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="打开日志"
          className="flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <TerminalSquareIcon className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(78vh,720px)] max-w-[min(960px,calc(100vw-2rem))] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 pb-4 pt-5 dark:border-white/10">
          <div className="flex items-start justify-between gap-4 pr-9">
            <div>
              <DialogTitle>实时日志</DialogTitle>
              <DialogDescription>查看操作执行过程，也可以开启系统日志记录关键后台事件。</DialogDescription>
            </div>
            <Badge variant="outline" className="mt-0.5 shrink-0">{operationSummary}</Badge>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "operations" | "system")} className="min-h-0 flex-1 gap-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3 dark:border-white/10">
            <TabsList>
              <TabsTrigger value="operations">
                <ActivityIcon className="size-4" />
                操作日志
              </TabsTrigger>
              <TabsTrigger value="system">
                <TerminalSquareIcon className="size-4" />
                系统日志
              </TabsTrigger>
            </TabsList>

            {tab === "operations" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setLogs([])} disabled={!logs.length}>
                <Trash2Icon data-icon="inline-start" />
                清空
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm dark:border-white/10 dark:bg-slate-950/40">
                  <Switch
                    size="sm"
                    checked={systemEnabled}
                    disabled={savingSystemLogs}
                    onCheckedChange={(checked) => { void saveSystemLogSettings(checked) }}
                    className="data-checked:bg-[#2563EB]"
                  />
                  自动记录
                </label>
                <label className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
                  <ClockIcon className="size-3.5" />
                  <select
                    value={retentionDays}
                    disabled={savingSystemLogs}
                    onChange={(event) => {
                      const days = Number(event.target.value)
                      setRetentionDays(days)
                      void saveSystemLogSettings(systemEnabled, days)
                    }}
                    className="bg-transparent text-sm font-medium text-slate-800 outline-none dark:text-slate-100"
                  >
                    {RETENTION_OPTIONS.map((days) => (
                      <option key={days} value={days}>保留 {days} 天</option>
                    ))}
                  </select>
                </label>
                <Button type="button" size="sm" variant="outline" onClick={() => { void loadSystemLogs() }} disabled={loadingSystemLogs}>
                  <RefreshCwIcon data-icon="inline-start" className={cn(loadingSystemLogs && "animate-spin")} />
                  刷新
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { void clearSystemLogs() }} disabled={savingSystemLogs || !systemLogs.length}>
                  <Trash2Icon data-icon="inline-start" />
                  清空
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="operations" className="min-h-0 flex-1 px-6 py-5">
            <LogPanel
              emptyText="暂无操作日志，执行切卡、发短信、保存配置等操作后会显示进度。"
              entries={logs.map((event, index) => ({ ...event, id: `operation-${index}`, source: "operation" }))}
            />
          </TabsContent>

          <TabsContent value="system" className="min-h-0 flex-1 px-6 py-5">
            <LogPanel
              emptyText={systemEnabled ? "暂无系统日志，后续关键后台事件会自动记录。" : "系统日志记录未开启，打开开关后开始记录关键后台事件。"}
              entries={systemLogs}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function LogPanel({
  entries,
  emptyText,
}: {
  entries: Array<(ActionEvent | SystemLogEntry) & { source?: string; id?: string }>
  emptyText: string
}) {
  return (
    <ScrollArea className="h-full rounded-2xl border border-slate-200 bg-slate-950/95 shadow-inner dark:border-white/10">
      <div className="flex min-h-full flex-col gap-2 p-3 font-mono text-sm">
        {entries.length ? entries.map((line, index) => (
          <div key={line.id || `${line.time}-${index}`} className="grid grid-cols-[82px_88px_1fr] gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <span className="text-slate-400">{line.time}</span>
            <span className="truncate text-xs text-slate-500">{line.source || "operation"}</span>
            <span className={cn("whitespace-pre-wrap break-words", levelClassName(line.level))}>{line.message}</span>
          </div>
        )) : (
          <div className="flex h-full min-h-[18rem] items-center justify-center px-6 text-center text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
