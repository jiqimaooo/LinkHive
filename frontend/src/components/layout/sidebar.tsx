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
  SmartphoneIcon,
  TerminalIcon,
  SendIcon,
  SmartphoneNfcIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
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
    <aside className="flex flex-col border-r border-slate-200 bg-white/95 px-3 py-4 shadow-[8px_0_30px_rgba(15,23,42,0.04)] h-screen sticky top-0 overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-200">
          LH
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold leading-6 truncate">LinkHive</div>
          <div className="text-xs leading-4 text-slate-500 truncate">SIM 管理平台</div>
        </div>
      </div>

      <Separator className="mt-5" />

      {/* 导航菜单 */}
      <nav className="mt-4 flex-1 space-y-1">
        {visibleMenu.map((item) => {
          const active = isParentActive(item)
          return (
            <div key={item.path}>
              <NavLink
                to={item.path}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
              {item.children && active && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
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
      <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
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
  )
}
