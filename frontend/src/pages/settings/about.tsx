import { useEffect, useState } from "react"
import { DownloadIcon, ExternalLinkIcon, GitBranchIcon, GithubIcon, InfoIcon, RefreshCwIcon, ShieldCheckIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { Logo } from "@/components/shared/logo"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type LatestRelease = {
  tag_name: string
  html_url?: string
  assets?: Array<{ browser_download_url: string; size: number }>
}

export default function AboutPage() {
  const [currentVersion, setCurrentVersion] = useState("V1.0-20250621")
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [latestUrl, setLatestUrl] = useState("")
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((data: { version?: string }) => {
        if (data.version) setCurrentVersion(data.version)
      })
      .catch(() => {})
  }, [])

  const handleCheckUpdate = async () => {
    setChecking(true)
    try {
      const response = await fetch("https://api.github.com/repos/jiqimaooo/LinkHive/releases/latest")
      if (!response.ok) throw new Error("检查失败")
      const data = await response.json() as LatestRelease
      setLatestUrl(data.html_url || "")
      if (data.tag_name && data.tag_name !== currentVersion) {
        setLatestVersion(data.tag_name)
        toast.info(`新版本可用：${data.tag_name}`)
      } else {
        setLatestVersion(null)
        toast.success(`已是最新版本（${currentVersion}）`)
      }
    } catch (error) {
      const message = error instanceof TypeError && error.message === "Failed to fetch"
        ? "无法连接 GitHub，请检查网络"
        : "检查更新失败，请稍后重试"
      toast.error(message)
    } finally {
      setChecking(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setProgress(0)

    try {
      const startResponse = await fetch("/api/action/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", payload: {} }),
      })
      const { id } = await startResponse.json() as { id?: string }
      if (!id) throw new Error("启动更新失败")

      let cursor = 0
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const pollResponse = await fetch(`/api/action/${id}?cursor=${cursor}`)
        const snapshot = await pollResponse.json() as {
          state: string
          cursor: number
          events: Array<{ level: string; message: string }>
          error?: string
        }
        cursor = snapshot.cursor || 0
        for (const event of snapshot.events || []) {
          if (event.level === "error") throw new Error(event.message)
          const match = event.message.match(/下载进度：(\d+)%/)
          if (match) setProgress(parseInt(match[1], 10))
          if (event.message.includes("下载完成")) setProgress(80)
          if (event.message.includes("解压完成")) setProgress(90)
          if (event.message.includes("更新完成")) setProgress(100)
        }
        if (snapshot.state === "done" || snapshot.state === "error") {
          if (snapshot.state === "error") throw new Error(snapshot.error || "更新失败")
          setProgress(100)
          toast.success("更新完成，服务重启中，即将自动刷新...")
          setTimeout(() => window.location.reload(), 3000)
          return
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败")
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="关于" description="产品信息、版本状态、开源项目与维护者信息。" />

      <section className="glass-card overflow-hidden rounded-3xl">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_22rem] lg:items-center">
          <div className="flex items-start gap-4">
            <Logo className="size-14 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">LinkHive</h1>
                <Badge variant="secondary">SIM 管理平台</Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                面向蜂窝模块、实体 SIM 与 eSIM 的轻量管理控制台，聚合设备状态、短信、通知转发、定时任务和安全中心。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ProductPill icon={ShieldCheckIcon} label="本地部署" />
                <ProductPill icon={SparklesIcon} label="企业级控制台" />
                <ProductPill icon={GitBranchIcon} label="开源项目" />
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">当前版本</div>
            <div className="mt-2 break-all font-mono text-lg font-semibold">{currentVersion}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCheckUpdate} disabled={checking || updating}>
                <RefreshCwIcon data-icon="inline-start" className={cn(checking && "animate-spin")} />
                {checking ? "检查中..." : "检查更新"}
              </Button>
              {latestUrl ? (
                <a
                  href={latestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted"
                >
                  <ExternalLinkIcon data-icon="inline-start" className="size-3.5" />
                  Release
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCwIcon className="size-4 text-muted-foreground" />
              更新状态
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <VersionTile label="当前版本" value={currentVersion} />
              <VersionTile label="最新版本" value={latestVersion || "未检查"} active={Boolean(latestVersion)} />
            </div>

            {updating ? (
              <div className="glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">正在安装 {latestVersion || "最新版本"}</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-blue-600 transition-all duration-200 ease-out" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : latestVersion ? (
              <Button className="w-full" onClick={handleUpdate}>
                <DownloadIcon data-icon="inline-start" />
                下载并更新到 {latestVersion}
              </Button>
            ) : (
              <div className="glass-panel rounded-2xl p-4 text-sm text-muted-foreground">
                点击“检查更新”后，这里会展示是否存在新版本。更新过程会复用现有后台更新任务。
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <InfoIcon className="size-4 text-muted-foreground" />
              项目与作者
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProjectLink
              href="https://github.com/jiqimaooo/LinkHive"
              icon={GithubIcon}
              title="LinkHive"
              description="GitHub 开源仓库"
            />
            <ProjectLink
              href="https://github.com/jiqimaooo"
              icon={GithubIcon}
              title="王野"
              description="@jiqimaooo"
            />
            <div className="glass-panel rounded-2xl p-4 text-sm leading-6 text-muted-foreground">
              LinkHive 参考开源社区项目演进，面向本地部署和设备管理场景优化。开源发布时请保留相关来源说明和许可证信息。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ProductPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="glass-panel inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
      <Icon className="size-3.5 text-blue-600 dark:text-blue-300" />
      {label}
    </span>
  )
}

function VersionTile({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={cn("glass-panel rounded-2xl p-4", active && "glass-panel-selected")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 break-all font-mono text-sm font-semibold">{value}</div>
    </div>
  )
}

function ProjectLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="glass-panel flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/75 dark:hover:bg-white/10"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{description}</div>
      </div>
      <ExternalLinkIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </a>
  )
}
