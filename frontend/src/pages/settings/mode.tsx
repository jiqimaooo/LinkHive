import { CardSimIcon, BadgeCheckIcon, LoaderCircleIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function ModeSwitchPage() {
  const { currentSimType, switchingMode, switchSimMode } = useAppContext()

  return (
    <div className="space-y-4">
      <PageHeader
        title="模式切换"
        description="切换普通 SIM 和 eSIM 工作模式。切换后相关功能会自动启用或禁用。"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">选择工作模式</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { key: "physical", label: "普通 SIM", desc: "适用于实体 SIM 卡。支持短信转发、基带控制和网络设置。", icon: CardSimIcon, features: ["短信转发", "基带控制", "网络设置", "APN配置"] },
              { key: "esim", label: "eSIM", desc: "适用于 eSIM 卡。额外支持 Profile 管理和定时保活任务。", icon: BadgeCheckIcon, features: ["全部普通SIM功能", "Profile管理", "保活任务", "短信中心配置"] },
            ] as const).map((item) => {
              const active = currentSimType === item.key
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => { void switchSimMode(item.key) }}
                  disabled={Boolean(switchingMode) || active}
                  className={cn(
                    "glass-panel flex flex-col gap-4 rounded-2xl p-5 text-left transition-all",
                    active
                      ? "glass-panel-selected ring-2 ring-blue-100"
                      : "hover:bg-white/70",
                    switchingMode && "opacity-60 cursor-wait",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        active ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-100 text-slate-600",
                      )}>
                        <Icon className="size-5" />
                      </div>
                      <div>
                        <h3 className={cn("text-base font-semibold", active ? "text-blue-700" : "text-slate-800")}>
                          {item.label}
                        </h3>
                      </div>
                    </div>
                    {switchingMode === item.key ? (
                      <LoaderCircleIcon className="size-5 animate-spin text-blue-600" />
                    ) : active ? (
                      <Badge>已启用</Badge>
                    ) : null}
                  </div>

                  <p className="text-sm text-muted-foreground">{item.desc}</p>

                  <div className="flex flex-wrap gap-1.5">
                    {item.features.map((f) => (
                      <Badge key={f} variant={active ? "secondary" : "outline"} className="text-xs">{f}</Badge>
                    ))}
                  </div>

                  {active ? (
                    <div className="text-sm font-medium text-blue-600">当前模式</div>
                  ) : (
                    <div className="text-sm text-muted-foreground">点击切换到此模式</div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
