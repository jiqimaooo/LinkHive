import { useState } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2Icon, KeyRoundIcon, MonitorSmartphoneIcon, ShieldCheckIcon, UserCircleIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppContext } from "@/hooks/app-context"
import { requestJson } from "@/lib/api"

export default function ProfilePage() {
  const { authStatus, status } = useAppContext()
  const username = authStatus?.username || "admin"
  const [newUsername, setNewUsername] = useState(username)
  const [saving, setSaving] = useState(false)

  const saveUsername = async () => {
    const value = newUsername.trim()
    if (!value || value.length < 2) {
      toast.error("用户名不能少于 2 位")
      return
    }
    setSaving(true)
    try {
      await requestJson("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ new_username: value }),
      })
      toast.success("用户名已更新，刷新后会同步到顶部菜单")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存用户名失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="个人中心" description="查看当前登录信息、账号资料和常用安全入口。" />

      <section className="glass-card overflow-hidden rounded-3xl">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-2xl font-semibold uppercase text-white shadow-sm dark:bg-white dark:text-slate-950">
              {username.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{username}</h1>
                <Badge variant={authStatus?.authenticated ? "secondary" : "outline"}>{authStatus?.authenticated ? "已登录" : "未登录"}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">LinkHive 控制台账户</p>
            </div>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 md:min-w-[24rem]">
            <ProfileMetric label="认证状态" value={authStatus?.auth_enabled ? "已启用" : "未启用"} />
            <ProfileMetric label="最后同步" value={status?.timestamp || "--"} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCircleIcon className="size-4 text-muted-foreground" />
              账号信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-username">用户名</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="profile-username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
                <Button type="button" disabled={saving || newUsername.trim() === username} onClick={saveUsername}>
                  {saving ? "保存中..." : "保存用户名"}
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">这里只修改账号名称；密码和二次认证请到安全设置管理。</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoTile icon={CheckCircle2Icon} label="登录会话" value="当前浏览器会话有效" />
              <InfoTile icon={MonitorSmartphoneIcon} label="设备概览" value={`${status?.devices?.length ?? 0} 台设备可见`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-4 text-muted-foreground" />
              安全入口
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/settings/security" className="glass-panel flex items-center justify-between rounded-2xl p-4 transition-colors hover:bg-white/75 dark:hover:bg-white/10">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-200">
                  <KeyRoundIcon className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">密码与二次认证</div>
                  <div className="mt-1 text-xs text-muted-foreground">修改密码、启用 TOTP 和防暴力破解</div>
                </div>
              </div>
              <Badge variant="outline">进入</Badge>
            </Link>
            <div className="glass-panel rounded-2xl p-4">
              <div className="text-sm font-semibold">登录信息</div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">账号</span>
                  <span className="font-medium">{username}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">认证</span>
                  <span className="font-medium">{authStatus?.auth_enabled ? "密码认证" : "未启用密码认证"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">状态</span>
                  <span className="font-medium">{authStatus?.authenticated ? "在线" : "离线"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

function InfoTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <Icon className="size-5 text-blue-600 dark:text-blue-300" />
      <div className="mt-3 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{value}</div>
    </div>
  )
}
