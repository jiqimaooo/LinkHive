import { useState } from "react"
import { ExternalLinkIcon, RefreshCwIcon, DownloadIcon } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

const VERSION = `v${__APP_VERSION__}`

export default function AboutPage() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleCheckUpdate = async () => {
    try {
      const res = await fetch("https://api.github.com/repos/jiqimaooo/LinkHive/releases/latest")
      if (!res.ok) throw new Error("检查失败")
      const data = await res.json() as { tag_name: string; assets: Array<{ browser_download_url: string; size: number }> }
      const latest = data.tag_name
      if (latest !== VERSION) {
        setLatestVersion(latest)
        toast.info(`新版本可用：${latest}`)
      } else {
        setLatestVersion(null)
        toast.success(`已是最新版本（${VERSION}）`)
      }
    } catch {
      toast.error("检查更新失败，请稍后重试")
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setProgress(0)

    try {
      // 启动后端更新任务
      const startRes = await fetch("/api/action/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", payload: {} }),
      })
      const { id } = await startRes.json()
      if (!id) throw new Error("启动更新失败")

      // 轮询进度
      let cursor = 0
      while (true) {
        await new Promise((r) => setTimeout(r, 1000))
        const pollRes = await fetch(`/api/action/${id}?cursor=${cursor}`)
        const snapshot = await pollRes.json() as {
          state: string; cursor: number; events: Array<{ level: string; message: string }>
          error?: string; status?: unknown
        }
        cursor = snapshot.cursor
        for (const evt of snapshot.events) {
          if (evt.level === "error") throw new Error(evt.message)
          // 解析下载进度
          const match = evt.message.match(/下载进度：(\d+)%/)
          if (match) setProgress(parseInt(match[1], 10))
          // 检查更新步骤
          if (evt.message.includes("下载完成")) setProgress(80)
          if (evt.message.includes("解压完成")) setProgress(90)
          if (evt.message.includes("更新完成")) setProgress(100)
        }
        if (snapshot.state === "done") {
          setProgress(100)
          toast.success("更新完成，即将刷新页面")
          setTimeout(() => window.location.reload(), 1500)
          return
        }
        if (snapshot.state === "error") {
          throw new Error(snapshot.error || "更新失败")
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败")
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="关于" description="LinkHive - SIM 与 eSIM 管理平台" />

      <Card className="border-slate-200 bg-white max-w-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCwIcon className="size-4 text-muted-foreground" />版本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <span className="text-sm text-muted-foreground">当前版本</span>
            <span className="text-sm font-mono font-medium">{VERSION}</span>
          </div>

          {updating ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>正在安装 {latestVersion}...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : latestVersion ? (
            <Button className="w-full" onClick={handleUpdate}>
              <DownloadIcon className="size-4" />下载并更新到 {latestVersion}
            </Button>
          ) : (
            <Button variant="outline" className="w-full" onClick={handleCheckUpdate}>
              <RefreshCwIcon className="size-4" />检查更新
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">开源与作者</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <a
            href="https://github.com/jiqimaooo"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/50 transition-colors"
          >
            <img src="https://github.com/jiqimaooo.png" alt="作者头像" className="size-10 rounded-full" />
            <div>
              <div className="text-sm font-medium">王野</div>
              <div className="text-xs text-muted-foreground">@jiqimaooo</div>
            </div>
            <ExternalLinkIcon className="size-3 text-muted-foreground ml-auto" />
          </a>
          <a
            href="https://github.com/jiqimaooo/LinkHive"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-slate-100">
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium">LinkHive</div>
              <div className="text-xs text-muted-foreground">项目已开源</div>
            </div>
            <ExternalLinkIcon className="size-3 text-muted-foreground ml-auto" />
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
