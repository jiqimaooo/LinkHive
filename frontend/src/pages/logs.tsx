import { TerminalSquareIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { levelClassName, friendlyActionName } from "@/lib/helpers"

export default function LogsPage() {
  const { logs, setLogs, activeAction } = useAppContext()

  return (
    <div className="space-y-4">
      <PageHeader
        title="实时日志"
        description="所有操作的实时执行日志，页面关闭后重新打开也会恢复追踪。"
        actions={<div className="flex items-center gap-2">{activeAction ? <Badge variant="outline" className="border-sky-400/40 text-sky-600">{friendlyActionName(activeAction.action)}</Badge> : <Badge variant="outline">空闲</Badge>}<Button type="button" size="sm" variant="outline" onClick={() => setLogs([])}>清空日志</Button></div>}
      />

      <Card className="border-slate-200 bg-white h-[calc(100vh-16rem)] flex flex-col">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TerminalSquareIcon className="size-4" />执行日志<Badge variant="outline" className="ml-1">{logs.length}</Badge></CardTitle></CardHeader>
        <CardContent className="flex-1 min-h-0 pb-4">
          <ScrollArea className="h-full rounded-xl border border-slate-200 bg-slate-950/95">
            <div className="flex min-h-full flex-col gap-2 p-3 font-mono text-sm">
              {logs.length ? logs.map((line, i) => <div key={`${line.time}-${i}`} className="grid grid-cols-[80px_1fr] gap-3"><span className="text-slate-400">{line.time}</span><span className={cn("whitespace-pre-wrap break-words", levelClassName(line.level))}>{line.message}</span></div>) : <div className="flex h-full min-h-[12rem] items-center justify-center text-slate-500">暂无日志，点任意操作后这里会实时显示执行进度。</div>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
