import { NavLink, useLocation } from "react-router-dom"
import {
  BarChart3Icon,
  LayoutDashboardIcon,
  MessageSquareTextIcon,
  MonitorIcon,
  Settings2Icon,
  ShieldCheckIcon,
  InfoIcon,
  TerminalIcon,
  SendIcon,
  XIcon,
  UserCircleIcon,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/shared/logo"

const MAIN_MENU = [
  {
    title: "仪表盘",
    path: "/dashboard",
    icon: LayoutDashboardIcon,
  },
  {
    title: "设备管理",
    path: "/devices",
    icon: MonitorIcon,
    children: [
      { title: "设备列表", path: "/devices", icon: MonitorIcon },
    ],
  },
  {
    title: "短信",
    path: "/sms",
    icon: MessageSquareTextIcon,
    children: [
      { title: "短信", path: "/sms", icon: MessageSquareTextIcon },
      { title: "通知转发", path: "/sms/forwarding", icon: SendIcon },
      { title: "定时任务", path: "/sms/tasks", icon: BarChart3Icon },
    ],
  },
  {
    title: "系统设置",
    path: "/settings",
    icon: Settings2Icon,
    children: [
      { title: "个人中心", path: "/settings/profile", icon: UserCircleIcon },
      { title: "安全设置", path: "/settings/security", icon: ShieldCheckIcon },
      { title: "关于", path: "/settings/about", icon: InfoIcon },
    ],
  },
  {
    title: "实时日志",
    path: "/logs",
    icon: TerminalIcon,
  },
]

export function Sidebar({
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (value: boolean) => void
}) {
  const location = useLocation()
  const visibleMenu = MAIN_MENU

  const isParentActive = (item: typeof MAIN_MENU[number]) => {
    if (item.children) {
      return item.children.some((child) => location.pathname.startsWith(child.path))
    }
    return location.pathname.startsWith(item.path)
  }

  const isChildActive = (path: string) => {
    if (path === "/sms" || path === "/settings/profile" || path === "/devices") return location.pathname === path
    return location.pathname.startsWith(path)
  }

  return (
    <>
    <div
      className={cn(
        "fixed inset-0 z-40 bg-slate-950/35 opacity-0 backdrop-blur-[2px] transition-opacity lg:hidden",
        mobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none",
      )}
      onClick={() => setMobileMenuOpen(false)}
    />

    <aside
      className={cn(
        "glass-card fixed inset-y-0 left-0 z-[60] flex w-[82vw] max-w-[320px] flex-col rounded-none border-r border-white/65 px-3 py-4 shadow-[18px_0_50px_rgba(15,23,42,0.18)] transition-transform duration-200 lg:hidden",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-2">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="size-10 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold leading-6">LinkHive</div>
          </div>
        </div>
        <button
          type="button"
          aria-label="收起菜单"
          onClick={() => setMobileMenuOpen(false)}
          className="flex size-9 shrink-0 items-center justify-center text-slate-500"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <Separator className="mt-5" />

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto pb-4">
        {visibleMenu.map((item) => {
          const active = isParentActive(item)
          return (
            <div key={item.path}>
              <NavLink
                to={item.path}
                onClick={() => {
                  if (!item.children) setMobileMenuOpen(false)
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-50",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
              {item.children && active && (
                <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-white/10">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        isChildActive(child.path)
                          ? "bg-blue-50/70 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
                      )}
                    >
                      <child.icon className="size-3.5 shrink-0" />
                      <span className="truncate">{child.title}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>

    <aside className="hidden flex-col border-r border-white/65 bg-white/62 px-3 py-4 shadow-[8px_0_30px_rgba(15,23,42,0.04)] backdrop-blur-xl backdrop-saturate-150 lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto dark:border-white/10 dark:bg-slate-950/42 dark:shadow-[8px_0_30px_rgba(0,0,0,0.18)]">
      {/* 导航菜单 */}
      <nav className="flex min-w-0 max-w-full gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] lg:block lg:flex-1 lg:space-y-1 lg:overflow-visible lg:pb-0">
        {visibleMenu.map((item) => {
          const active = isParentActive(item)
          return (
            <div key={item.path} className="shrink-0 lg:shrink">
              <NavLink
                to={item.path}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:min-h-0 lg:px-2.5",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-50",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
              {item.children && active && (
                <div className="ml-4 mt-1 hidden space-y-0.5 border-l border-slate-200 pl-3 lg:block dark:border-white/10">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isChildActive(child.path)
                          ? "font-medium text-blue-700 dark:text-blue-200"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
                      )}
                    >
                      <child.icon className="size-3.5 shrink-0" />
                      <span className="truncate">{child.title}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
    </>
  )
}
