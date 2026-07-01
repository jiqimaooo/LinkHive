import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ChevronDownIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SunIcon,
} from "lucide-react"

import { Logo } from "@/components/shared/logo"
import { LogDialog } from "@/components/layout/log-dialog"
import { useAppContext } from "@/hooks/app-context"
import { serviceStateLabel, serviceStateTone } from "@/lib/helpers"
import { cn } from "@/lib/utils"

type ThemeMode = "light" | "dark"
type ServiceTone = "success" | "warning" | "danger" | "muted"

const THEME_STORAGE_KEY = "linkhive-theme"

const STATUS_META: Record<Exclude<ServiceTone, "muted">, { label: string; className: string }> = {
  success: { label: "系统正常", className: "bg-emerald-500" },
  warning: { label: "系统处理中", className: "bg-amber-500" },
  danger: { label: "系统异常", className: "bg-rose-500" },
}

export function TopNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { authStatus, isRefreshing, logout, refreshStatus, status } = useAppContext()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const services = useMemo(() => [
    { name: "基带通信", state: status?.services.modemmanager || "unknown", description: "QMI / AT 直连状态读取" },
    { name: "短信转发服务", state: status?.services.sms_forwarder || "unknown", description: "短信监听、转发与通知渠道" },
    { name: "Web 管理服务", state: status?.services.web_admin || "unknown", description: "LinkHive 控制台与 API" },
  ], [status?.services.modemmanager, status?.services.sms_forwarder, status?.services.web_admin])

  const aggregateTone = getAggregateTone(services.map((service) => service.state))
  const statusMeta = STATUS_META[aggregateTone]
  const username = authStatus?.username ?? "linkhive"

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/45 bg-white/38 backdrop-blur-md backdrop-saturate-125 dark:border-white/10 dark:bg-slate-950/28">
      <div className="flex h-16 min-w-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="打开菜单"
            onClick={onOpenMenu}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 lg:hidden dark:text-slate-200 dark:hover:bg-white/10"
          >
            <MenuIcon className="size-5" />
          </button>
          <Logo className="size-8 shrink-0 sm:size-9" />
          <div className="truncate text-base font-semibold leading-5 text-slate-950 dark:text-slate-50">LinkHive</div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="group/status relative">
            <button
              type="button"
              aria-label={statusMeta.label}
              className="flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-900/5 focus-visible:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-300 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
            >
              <span className={cn("size-2.5 rounded-full shadow-[0_0_0_4px_rgba(16,185,129,0.12)]", statusMeta.className)} />
            </button>
            <div className="pointer-events-none absolute right-0 top-full mt-2 w-[18rem] translate-y-1 opacity-0 transition duration-150 group-hover/status:pointer-events-auto group-hover/status:translate-y-0 group-hover/status:opacity-100 group-focus-within/status:pointer-events-auto group-focus-within/status:translate-y-0 group-focus-within/status:opacity-100">
              <div className="floating-surface rounded-xl p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="font-semibold">{statusMeta.label}</div>
                  <span className={cn("size-2 rounded-full", statusMeta.className)} />
                </div>
                <div className="space-y-2">
                  {services.map((service) => (
                    <div key={service.name} className="floating-panel flex items-start justify-between gap-3 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{service.name}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{service.description}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                        <span className={cn("size-1.5 rounded-full", serviceDotClass(serviceStateTone(service.state)))} />
                        {serviceStateLabel(service.state)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {status?.timestamp ? `最后更新 ${status.timestamp}` : "等待状态同步"}
                </div>
              </div>
            </div>
          </div>

          <LogDialog />

          <button
            type="button"
            aria-label="刷新状态"
            onClick={() => { void refreshStatus(false, true) }}
            disabled={isRefreshing}
            className="hidden size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 sm:flex dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCwIcon className={cn("size-4", isRefreshing && "animate-spin")} />
          </button>

          <button
            type="button"
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到暗黑模式"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            className="flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-300 dark:hover:bg-white/10"
          >
            {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </button>

          <div className="relative">
            <button
              type="button"
              aria-label="打开用户菜单"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
              className="flex h-10 min-w-0 items-center gap-2 rounded-lg px-2 text-slate-700 transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white dark:bg-slate-100 dark:text-slate-950">
                {username.slice(0, 1)}
              </span>
              <span className="hidden max-w-[8rem] truncate text-xs font-medium sm:block">{username}</span>
              <ChevronDownIcon className={cn("size-3.5 shrink-0 transition-transform", userMenuOpen && "rotate-180")} />
            </button>

            {userMenuOpen ? (
              <div className="floating-surface absolute right-0 top-full mt-2 w-48 rounded-xl p-1.5 text-sm">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 transition-colors hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
                  onClick={() => {
                    setUserMenuOpen(false)
                    navigate("/settings/security")
                  }}
                >
                  <ShieldCheckIcon className="size-4 text-slate-500 dark:text-slate-400" />
                  安全中心
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-300"
                  onClick={() => {
                    setUserMenuOpen(false)
                    void logout()
                  }}
                >
                  <LogOutIcon className="size-4" />
                  退出
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light"
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "dark" || stored === "light") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getAggregateTone(states: string[]): Exclude<ServiceTone, "muted"> {
  const normalized = states.map((state) => state.trim().toLowerCase())
  if (normalized.some((state) => ["failed", "inactive", "deactivating", "unknown", "", "--"].includes(state))) {
    return "danger"
  }
  if (normalized.some((state) => ["activating", "reloading"].includes(state))) {
    return "warning"
  }
  return "success"
}

function serviceDotClass(tone: ServiceTone) {
  if (tone === "success") return "bg-emerald-500"
  if (tone === "warning") return "bg-amber-500"
  if (tone === "danger") return "bg-rose-500"
  return "bg-slate-400"
}
