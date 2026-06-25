import { useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
  BadgeCheckIcon,
  BarChart3Icon,
  CardSimIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MessageSquareTextIcon,
  MonitorIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldCheckIcon,
  InfoIcon,
  SmartphoneIcon,
  TerminalIcon,
  SendIcon,
  SmartphoneNfcIcon,
  MenuIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/shared/logo"
import { useAppContext } from "@/hooks/app-context"

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
      { title: "基带状态", path: "/devices/modem", icon: SmartphoneIcon },
      { title: "网络设置", path: "/devices/network", icon: Settings2Icon },
    ],
  },
  {
    title: "短信管理",
    path: "/sms",
    icon: MessageSquareTextIcon,
    children: [
      { title: "收件箱", path: "/sms/inbox", icon: ScrollTextIcon },
      { title: "转发规则", path: "/sms/forwarding", icon: SendIcon },
    ],
  },
  {
    title: "SIM卡管理",
    path: "/sim-cards",
    icon: CardSimIcon,
    children: [
      { title: "eSIM Profiles", path: "/sim-cards/profiles", icon: BadgeCheckIcon },
      { title: "保活任务", path: "/sim-cards/keepalive", icon: BarChart3Icon },
    ],
  },
  {
    title: "系统设置",
    path: "/settings",
    icon: Settings2Icon,
    children: [
      { title: "模式切换", path: "/settings/mode", icon: SmartphoneNfcIcon },
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

export function Sidebar() {
  const location = useLocation()
  const { authStatus, logout, esimEnabled } = useAppContext()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // 普通SIM模式下 SIM卡管理只显示保活任务，不显示 Profiles
  const visibleMenu = MAIN_MENU.map((item) => {
    if (item.path === "/sim-cards" && !esimEnabled) {
      return { ...item, children: item.children?.filter((c) => c.path === "/sim-cards/keepalive") }
    }
    return item
  })

  const isParentActive = (item: typeof MAIN_MENU[number]) => {
    if (item.children) {
      return item.children.some((child) => location.pathname.startsWith(child.path))
    }
    return location.pathname.startsWith(item.path)
  }

  const isChildActive = (path: string) => location.pathname.startsWith(path)

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="size-9 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-5 text-slate-950">LinkHive</div>
            <div className="truncate text-xs leading-4 text-slate-500">SIM 管理平台</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NavLink
            to="/logs"
            aria-label="实时日志"
            onClick={() => setMobileMenuOpen(false)}
            className={cn(
              "flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
              location.pathname.startsWith("/logs") && "border-blue-100 bg-blue-50 text-blue-700",
            )}
          >
            <TerminalIcon className="size-4" />
          </NavLink>
          <button
            type="button"
            aria-label="退出登录"
            onClick={() => { void logout() }}
            className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <LogOutIcon className="size-4" />
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="打开菜单"
        onClick={() => setMobileMenuOpen(true)}
        className="mt-3 flex size-9 items-center justify-center text-slate-700"
      >
        <MenuIcon className="size-5" />
      </button>
    </header>

    <div
      className={cn(
        "fixed inset-0 z-40 bg-slate-950/35 opacity-0 backdrop-blur-[2px] transition-opacity lg:hidden",
        mobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none",
      )}
      onClick={() => setMobileMenuOpen(false)}
    />

    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[320px] flex-col border-r border-slate-200 bg-white px-3 py-4 shadow-[18px_0_50px_rgba(15,23,42,0.18)] transition-transform duration-200 lg:hidden",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-2">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="size-10 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold leading-6">LinkHive</div>
            <div className="truncate text-xs leading-4 text-slate-500">SIM 管理平台</div>
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
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
              {item.children && active && (
                <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        isChildActive(child.path)
                          ? "bg-blue-50/70 font-medium text-blue-700"
                          : "text-slate-500 hover:text-slate-800",
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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 text-xs font-normal text-slate-500">当前登录</div>
        <div className="truncate text-sm font-semibold text-slate-800">{authStatus?.username ?? "--"}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2.5 w-full justify-start"
          onClick={() => {
            setMobileMenuOpen(false)
            void logout()
          }}
        >
          <LogOutIcon data-icon="inline-start" />
          退出登录
        </Button>
      </div>
    </aside>

    <aside className="hidden flex-col border-r border-slate-200 bg-white/95 px-3 py-4 shadow-[8px_0_30px_rgba(15,23,42,0.04)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2">
        <Logo className="size-10 shrink-0" />
        <div className="min-w-0">
          <div className="text-lg font-semibold leading-6 truncate">LinkHive</div>
          <div className="text-xs leading-4 text-slate-500 truncate">SIM 管理平台</div>
        </div>
      </div>

      <Separator className="mt-3 lg:mt-5" />

      {/* 导航菜单 */}
      <nav className="mt-3 flex min-w-0 max-w-full gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] lg:mt-4 lg:block lg:flex-1 lg:space-y-1 lg:overflow-visible lg:pb-0">
        {visibleMenu.map((item) => {
          const active = isParentActive(item)
          return (
            <div key={item.path} className="shrink-0 lg:shrink">
              <NavLink
                to={item.path}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:min-h-0 lg:px-2.5",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
              {item.children && active && (
                <div className="ml-4 mt-1 hidden space-y-0.5 border-l border-slate-200 pl-3 lg:block">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isChildActive(child.path)
                          ? "text-blue-700 font-medium"
                          : "text-slate-500 hover:text-slate-800",
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

      {/* 用户信息 */}
      <div className="mt-auto hidden rounded-xl border border-slate-200 bg-slate-50 p-3 lg:block">
        <div className="mb-1 text-xs font-normal text-slate-500">当前登录</div>
        <div className="truncate text-sm font-semibold text-slate-800">{authStatus?.username ?? "--"}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2.5 w-full justify-start"
          onClick={() => { void logout() }}
        >
          <LogOutIcon data-icon="inline-start" />
          退出登录
        </Button>
      </div>
    </aside>
    </>
  )
}
