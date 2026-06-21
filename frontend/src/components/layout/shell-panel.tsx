import { ChevronDownIcon, LoaderCircleIcon, TerminalSquareIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { levelClassName } from "@/lib/helpers"
import { useAppContext } from "@/hooks/app-context"

export function ShellPanel() {
  const { logs, setLogs, activeAction, submittingActionLabel, shellPanelOpen, setShellPanelOpen } = useAppContext()
  const shellActionLabel = activeAction?.label || submittingActionLabel

  if (!shellPanelOpen) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
        <Button type="button" size="icon" variant="secondary" aria-label="展开日志面板" className="pointer-events-auto h-10 w-14 translate-y-1/2 rounded-t-full rounded-b-none border border-slate-700 bg-slate-900 text-slate-100 shadow-lg hover:bg-slate-800" onClick={() => { setShellPanelOpen(true) }}>
          <ChevronDownIcon className="size-5 rotate-180" />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <Card className="relative border-slate-800 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur">
          <Button type="button" size="icon" variant="secondary" aria-label="收起日志面板" className="absolute left-1/2 top-0 h-10 w-14 -translate-x-1/2 -translate-y-1/2 rounded-t-full rounded-b-none border border-slate-700 bg-slate-900 text-slate-100 shadow-lg hover:bg-slate-800" onClick={() => { setShellPanelOpen(false) }}>
            <ChevronDownIcon className="size-5" />
          </Button>
          <CardHeader className="pb-3 pt-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2 text-slate-50"><TerminalSquareIcon />Shell 执行面板</CardTitle>
                <CardDescription className="text-slate-400">每个任务都会把当前步骤同步到这里，页面关闭后重新打开也会尝试恢复追踪。</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {shellActionLabel ? <Badge variant="outline" className="border-sky-400/40 text-sky-200"><LoaderCircleIcon data-icon="inline-start" className="animate-spin" />{shellActionLabel}</Badge> : <Badge variant="outline" className="border-slate-700 text-slate-300">空闲</Badge>}
                <Button type="button" size="sm" variant="ghost" className="text-slate-100 hover:bg-slate-800 hover:text-white" onClick={() => { setLogs([]) }}>清空日志</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <ScrollArea className="h-[18rem] rounded-xl border border-slate-800 bg-slate-950/80">
              <div className="flex min-h-full flex-col gap-2 p-3 font-mono text-sm">
                {logs.length ? logs.map((line, i) => <div key={`${line.time}-${i}`} className="grid grid-cols-[80px_1fr] gap-3"><span className="text-slate-400">{line.time}</span><span className={cn("whitespace-pre-wrap break-words", levelClassName(line.level))}>{line.message}</span></div>) : <div className="flex h-full min-h-[12rem] items-center justify-center text-slate-500">暂无任务日志，点任意操作后这里会实时显示执行进度。</div>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
