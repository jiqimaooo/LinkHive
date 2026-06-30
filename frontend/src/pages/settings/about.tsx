import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  BadgeCheckIcon,
  BoxesIcon,
  ChevronRightIcon,
  Clock3Icon,
  Code2Icon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GithubIcon,
  Globe2Icon,
  HardDriveIcon,
  LanguagesIcon,
  Layers3Icon,
  RefreshCwIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Logo } from "@/components/shared/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAppContext } from "@/hooks/app-context"
import { cn } from "@/lib/utils"

type LatestRelease = {
  tag_name: string
  html_url?: string
}

type AuthStatusWithVersion = {
  version?: string
}

type UpdateState = "idle" | "latest" | "available" | "failed"

const GITHUB_URL = "https://github.com/jiqimaooo/LinkHive"
const RELEASES_URL = "https://github.com/jiqimaooo/LinkHive/releases"
const AUTHOR_URL = "https://github.com/jiqimaooo"
const LICENSE_URL = "https://github.com/jiqimaooo/LinkHive/blob/main/LICENSE"

export default function AboutPage() {
  const { status, currentSimType } = useAppContext()
  const [currentVersion, setCurrentVersion] = useState("V1.0-20250621")
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [latestUrl, setLatestUrl] = useState(RELEASES_URL)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [updateState, setUpdateState] = useState<UpdateState>("idle")
  const [lastCheckedAt, setLastCheckedAt] = useState("")

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((data: AuthStatusWithVersion) => {
        if (data.version) setCurrentVersion(data.version)
      })
      .catch(() => {})
  }, [])

  const displayedLatestVersion = latestVersion || (updateState === "latest" ? currentVersion : "--")

  const systemRows = useMemo(
    () => [
      { icon: ServerIcon, title: "部署方式", value: "本地部署" },
      { icon: Code2Icon, title: "运行环境", value: "Linux / Python / React" },
      { icon: Layers3Icon, title: "系统架构", value: "前后端分离" },
      { icon: LanguagesIcon, title: "语言", value: "简体中文" },
      { icon: DatabaseIcon, title: "数据库", value: "SQLite" },
      { icon: RocketIcon, title: "启动时间", value: "--" },
      { icon: TimerIcon, title: "运行时长", value: "--" },
      { icon: BadgeCheckIcon, title: "版本号", value: currentVersion },
      { icon: CpuIcon, title: "CPU 架构", value: "--" },
      { icon: HardDriveIcon, title: "SIM 模式", value: currentSimType === "physical" ? "实体 SIM" : "eSIM" },
    ],
    [currentSimType, currentVersion],
  )

  const handleCheckUpdate = async () => {
    setChecking(true)
    try {
      const response = await fetch("https://api.github.com/repos/jiqimaooo/LinkHive/releases/latest")
      if (!response.ok) throw new Error("检查失败")
      const data = (await response.json()) as LatestRelease
      const nextVersion = data.tag_name || currentVersion
      setLatestUrl(data.html_url || RELEASES_URL)
      setLastCheckedAt(new Date().toLocaleString("zh-CN", { hour12: false }))
      if (nextVersion !== currentVersion) {
        setLatestVersion(nextVersion)
        setUpdateState("available")
        toast.info(`发现新版本：${nextVersion}`)
        return
      }
      setLatestVersion(null)
      setUpdateState("latest")
      toast.success("已是最新版本")
    } catch (error) {
      setUpdateState("failed")
      const message = error instanceof TypeError && error.message === "Failed to fetch"
        ? "无法连接 GitHub，请检查网络"
        : "检查更新失败，请稍后重试"
      toast.error(message)
    } finally {
      setChecking(false)
    }
  }

  const handleUpdate = async () => {
    if (!latestVersion) return
    setUpdating(true)
    setProgress(0)

    try {
      const startResponse = await fetch("/api/action/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", payload: {} }),
      })
      const { id } = (await startResponse.json()) as { id?: string }
      if (!id) throw new Error("启动更新失败")

      let cursor = 0
      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        const pollResponse = await fetch(`/api/action/${id}?cursor=${cursor}`)
        const snapshot = (await pollResponse.json()) as {
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
          window.setTimeout(() => window.location.reload(), 3000)
          return
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败")
      setUpdating(false)
    }
  }

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] px-4 pb-12 pt-8 sm:-mx-6 sm:px-8 lg:mx-[-2rem] lg:my-[-1.25rem] lg:px-8 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-[28px] font-bold leading-9 text-slate-950 dark:text-slate-50">关于</h1>
          <p className="text-[13px] leading-5 text-[#6B7280] dark:text-slate-400">
            了解 LinkHive 的产品信息、版本状态、开源项目和声明信息。
          </p>
        </header>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,.05)] dark:border-slate-800 dark:bg-slate-950">
          <div className="grid min-h-[170px] gap-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
            <div className="flex min-w-0 items-start gap-5">
              <Logo className="size-16 shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[28px] font-bold leading-9 text-slate-950 dark:text-slate-50">LinkHive</h2>
                  <Badge variant="outline" className="h-6 rounded-full border-[#E5E7EB] bg-[#F8FAFC] px-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    SIM 管理平台
                  </Badge>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6B7280] dark:text-slate-400">
                  LinkHive 是运行于 Linux 的 4G/5G Modem 管理平台，提供设备管理、短信收发、通知转发、定时任务、安全管理等能力。
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <FeatureBadge icon={BoxesIcon}>模块化架构</FeatureBadge>
                  <FeatureBadge icon={ServerIcon}>多设备管理</FeatureBadge>
                  <FeatureBadge icon={GithubIcon}>开源友好</FeatureBadge>
                  <FeatureBadge icon={ShieldCheckIcon}>安全可靠</FeatureBadge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 shadow-[0_1px_2px_rgba(0,0,0,.05)] dark:border-slate-800 dark:bg-slate-900">
              <VersionLine label="当前版本" value={currentVersion} />
              <div className="my-3 h-px bg-[#E5E7EB] dark:bg-slate-800" />
              <VersionLine label="最新版本" value={displayedLatestVersion} />
              <Button
                type="button"
                variant="outline"
                onClick={handleCheckUpdate}
                disabled={checking || updating}
                className="mt-4 h-[38px] w-full rounded-[10px] border-[#E5E7EB] bg-white text-sm hover:bg-[#F3F4F6] dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
              >
                <RefreshCwIcon className={cn("size-4", checking && "animate-spin")} />
                {checking ? "检查中..." : "检查更新"}
              </Button>
            </div>
          </div>
        </section>

      <SectionCard icon={RefreshCwIcon} title="版本信息">
        <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
          <InfoRow title="当前版本" value={currentVersion} />
          <InfoRow title="最新版本" value={displayedLatestVersion} />
          <InfoRow title="更新状态" value={<UpdateBadge state={updateState} />} />
          <InfoRow title="最后检查时间" value={lastCheckedAt || "--"} />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {updating ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">正在安装 {latestVersion}</span>
                <span className="text-[#6B7280] dark:text-slate-400">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-[#2563EB] transition-all duration-200 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <a
              href={latestUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-[#F3F4F6] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <ExternalLinkIcon className="size-4" />
              Release 页面
            </a>
          )}
          <div className="flex justify-end gap-3">
            {latestVersion ? (
              <Button type="button" onClick={handleUpdate} disabled={updating} className="h-[38px] rounded-[10px] bg-[#2563EB] px-4 text-sm hover:bg-blue-700">
                <DownloadIcon className="size-4" />
                安装更新
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={handleCheckUpdate} disabled={checking || updating} className="h-[38px] rounded-[10px] text-sm">
              <RefreshCwIcon className={cn("size-4", checking && "animate-spin")} />
              检查更新
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={GithubIcon} title="项目与作者">
        <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
          <ProjectLink href={GITHUB_URL} icon={GithubIcon} title="GitHub" description="LinkHive 开源仓库" />
          <ProjectLink href={RELEASES_URL} icon={Globe2Icon} title="项目主页" description="版本发布与安装包" />
          <ProjectLink href={AUTHOR_URL} icon={ExternalLinkIcon} title="作者主页" description="@jiqimaooo" />
        </div>
      </SectionCard>

      <SectionCard icon={ServerIcon} title="系统信息">
        <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
          {systemRows.map((row) => (
            <SystemRow key={row.title} icon={row.icon} title={row.title} value={row.value} />
          ))}
          <SystemRow icon={Clock3Icon} title="最后同步" value={status?.timestamp || "--"} />
        </div>
      </SectionCard>

      <SectionCard icon={ShieldCheckIcon} title="开源许可证">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-300">
              <ShieldCheckIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">开源许可证</div>
              <p className="mt-1 text-[13px] leading-5 text-[#6B7280] dark:text-slate-400">
                本项目基于 MIT License 开源。
              </p>
            </div>
          </div>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[38px] shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-[#F3F4F6] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            查看许可证
            <ExternalLinkIcon className="size-4" />
          </a>
        </div>
      </SectionCard>
      </div>
    </div>
  )
}

function SectionCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,.05)] dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-5 flex items-center gap-2.5">
        <Icon className="size-4 text-[#2563EB]" />
        <h2 className="text-lg font-semibold leading-7 text-slate-950 dark:text-slate-50">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function FeatureBadge({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,.05)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      <Icon className="size-3.5 text-[#2563EB]" />
      {children}
    </span>
  )
}

function VersionLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] text-[#6B7280] dark:text-slate-400">{label}</div>
      <div className="mt-1 break-all text-sm font-semibold text-slate-950 dark:text-slate-100">{value}</div>
    </div>
  )
}

function InfoRow({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2.5">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="min-w-0 text-right text-sm text-slate-700 dark:text-slate-300">{value}</div>
    </div>
  )
}

function UpdateBadge({ state }: { state: UpdateState }) {
  if (state === "available") {
    return <Badge className="h-6 rounded-full bg-amber-50 px-2 text-xs text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300">发现新版本</Badge>
  }
  if (state === "latest") {
    return <Badge className="h-6 rounded-full bg-emerald-50 px-2 text-xs text-[#22C55E] dark:bg-emerald-500/10 dark:text-emerald-300">已是最新版本</Badge>
  }
  if (state === "failed") {
    return <Badge className="h-6 rounded-full bg-rose-50 px-2 text-xs text-[#EF4444] dark:bg-rose-500/10 dark:text-rose-300">检查失败</Badge>
  }
  return <Badge variant="outline" className="h-6 rounded-full px-2 text-xs">未检查</Badge>
}

function ProjectLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-14 items-center gap-4 py-2.5 transition-colors hover:bg-[#F3F4F6] dark:hover:bg-slate-900"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[#6B7280] dark:text-slate-400">{description}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-slate-400" />
    </a>
  )
}

function SystemRow({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-300">
          <Icon className="size-4" />
        </span>
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
      </div>
      <div className="min-w-0 truncate text-right text-sm text-slate-700 dark:text-slate-300">{value}</div>
    </div>
  )
}
