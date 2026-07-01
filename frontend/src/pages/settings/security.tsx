import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  BanIcon,
  ChevronRightIcon,
  EyeIcon,
  LaptopIcon,
  ListIcon,
  LockKeyholeIcon,
  LogOutIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { requestJson } from "@/lib/api"
import { cn } from "@/lib/utils"

type BanStatus = {
  enabled: boolean
  max_attempts: number
  lan_enabled: boolean
  ban_duration_seconds: number
  banned_ips: string[]
  banned?: Array<{ ip: string; banned_at: number; expires_at: number }>
}

type LoginDialog = "devices" | "failures" | null

type SecuritySession = {
  session_id: string
  username: string
  ip: string
  user_agent: string
  device: string
  location?: string
  login_at: string
  expires_at: number
  current?: boolean
}

type LoginFailure = {
  username: string
  ip: string
  user_agent: string
  device: string
  location?: string
  time: string
  reason: string
}

type SecurityOverview = {
  current_session_id: string
  sessions: SecuritySession[]
  recent_login: Partial<SecuritySession>
  recent_login_time?: string
  recent_login_ip?: string
  failures: LoginFailure[]
  failure_count: number
  ban_duration_seconds: number
  banned: Array<{ ip: string; banned_at: number; expires_at: number }>
}

const LOGIN_ACTIONS: Array<{
  key: Exclude<LoginDialog, null>
  title: string
  description: string
  icon: LucideIcon
}> = [
  { key: "devices", title: "登录设备", description: "当前活跃设备", icon: LaptopIcon },
  { key: "failures", title: "登录失败记录", description: "查看失败记录", icon: ShieldCheckIcon },
]

const LOGIN_DIALOG_COPY: Record<Exclude<LoginDialog, null>, { title: string; description: string }> = {
  devices: {
    title: "登录设备",
    description: "查看当前账号关联的登录设备。",
  },
  failures: {
    title: "登录失败记录",
    description: "查看最近失败登录尝试。",
  },
}

const DEFAULT_BAN_SETTINGS = { enabled: true, max_attempts: "5", lan_enabled: false, ban_duration_seconds: "1800" }
const BAN_DURATION_OPTIONS = [
  { label: "15 分钟", value: "900" },
  { label: "30 分钟", value: "1800" },
  { label: "1 小时", value: "3600" },
  { label: "24 小时", value: "86400" },
]

export default function SecurityPage() {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_url: string } | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [totpLoading, setTotpLoading] = useState(false)
  const [totpDialogOpen, setTotpDialogOpen] = useState(false)

  const [securityOverview, setSecurityOverview] = useState<SecurityOverview | null>(null)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [banStatus, setBanStatus] = useState<BanStatus>({ enabled: false, max_attempts: 5, lan_enabled: false, ban_duration_seconds: 1800, banned_ips: [] })
  const [banEnabled, setBanEnabled] = useState(DEFAULT_BAN_SETTINGS.enabled)
  const [banMaxAttempts, setBanMaxAttempts] = useState(DEFAULT_BAN_SETTINGS.max_attempts)
  const [banLanEnabled, setBanLanEnabled] = useState(DEFAULT_BAN_SETTINGS.lan_enabled)
  const [banDuration, setBanDuration] = useState(DEFAULT_BAN_SETTINGS.ban_duration_seconds)
  const [banListOpen, setBanListOpen] = useState(false)
  const [unbanLoading, setUnbanLoading] = useState<string | null>(null)
  const [loginDialog, setLoginDialog] = useState<LoginDialog>(null)
  const [logoutAllOpen, setLogoutAllOpen] = useState(false)
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)

  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword])
  const loginDialogCopy = loginDialog ? LOGIN_DIALOG_COPY[loginDialog] : null

  const loadTotpStatus = useCallback(async () => {
    try {
      const data = await requestJson<{ enabled: boolean }>("/api/auth/totp-status")
      setTotpEnabled(data.enabled)
    } catch {
      /* keep page usable */
    }
  }, [])

  const loadBanStatus = useCallback(async () => {
    try {
      const data = await requestJson<BanStatus>("/api/auth/ban-status")
      setBanStatus(data)
      setBanEnabled(data.enabled)
      setBanMaxAttempts(String(data.max_attempts))
      setBanLanEnabled(data.lan_enabled)
      setBanDuration(String(data.ban_duration_seconds || 1800))
    } catch {
      /* keep page usable */
    }
  }, [])

  const loadSecurityOverview = useCallback(async () => {
    setSecurityLoading(true)
    try {
      const data = await requestJson<SecurityOverview>("/api/auth/security-overview")
      setSecurityOverview(data)
      if (data.ban_duration_seconds) setBanDuration(String(data.ban_duration_seconds))
    } catch {
      /* keep page usable */
    } finally {
      setSecurityLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTotpStatus()
    void loadBanStatus()
    void loadSecurityOverview()
  }, [loadBanStatus, loadSecurityOverview, loadTotpStatus])

  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast.error("请输入当前密码")
      return
    }
    if (newPassword.length < 8) {
      toast.error("新密码长度至少为 8 位")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致")
      return
    }

    setIsSubmitting(true)
    try {
      await requestJson("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      })
      toast.success("密码已更新")
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改失败")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTotpSetup = async () => {
    setTotpLoading(true)
    try {
      const data = await requestJson<{ secret: string; otpauth_url: string }>("/api/auth/totp-setup", { method: "POST" })
      setTotpSetup(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成绑定密钥失败")
    } finally {
      setTotpLoading(false)
    }
  }

  const handleTotpVerify = async () => {
    if (totpCode.length !== 6) {
      toast.error("请输入 6 位验证码")
      return
    }
    setTotpLoading(true)
    try {
      await requestJson("/api/auth/totp-verify", {
        method: "POST",
        body: JSON.stringify({ code: totpCode }),
      })
      toast.success("二次验证已启用")
      setTotpEnabled(true)
      setTotpSetup(null)
      setTotpCode("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证失败")
    } finally {
      setTotpLoading(false)
    }
  }

  const handleTotpDisable = async () => {
    setTotpLoading(true)
    try {
      await requestJson("/api/auth/totp-disable", { method: "POST" })
      toast.success("二次验证已禁用")
      setTotpEnabled(false)
      setTotpSetup(null)
      setTotpCode("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "禁用失败")
    } finally {
      setTotpLoading(false)
    }
  }

  const saveBanSettings = async (overrides: Partial<typeof DEFAULT_BAN_SETTINGS>) => {
    const next = { enabled: banEnabled, max_attempts: banMaxAttempts, lan_enabled: banLanEnabled, ban_duration_seconds: banDuration, ...overrides }
    try {
      await requestJson("/api/auth/ban-settings", {
        method: "POST",
        body: JSON.stringify(next),
      })
      await loadBanStatus()
      await loadSecurityOverview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存防护策略失败")
    }
  }

  const updateMaxAttempts = (value: number) => {
    const next = String(Math.min(100, Math.max(1, value)))
    setBanMaxAttempts(next)
    void saveBanSettings({ max_attempts: next })
  }

  const handleUnban = async (ip: string) => {
    setUnbanLoading(ip)
    try {
      await requestJson("/api/auth/unban-ip", {
        method: "POST",
        body: JSON.stringify({ ip }),
      })
      toast.success(`已解除封禁 ${ip}`)
      await loadBanStatus()
      await loadSecurityOverview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "解封失败")
    } finally {
      setUnbanLoading(null)
    }
  }

  const handleClearBans = async () => {
    if (banStatus.banned_ips.length === 0) {
      toast.info("当前没有被封禁的 IP")
      return
    }
    setUnbanLoading("*")
    try {
      await Promise.all(
        banStatus.banned_ips.map((ip) =>
          requestJson("/api/auth/unban-ip", {
            method: "POST",
            body: JSON.stringify({ ip }),
          }),
        ),
      )
      toast.success("已解除全部封禁")
      await loadBanStatus()
      await loadSecurityOverview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "解除全部封禁失败")
    } finally {
      setUnbanLoading(null)
    }
  }

  const handleLogoutAll = async () => {
    setLogoutAllLoading(true)
    try {
      await requestJson("/api/auth/logout-all", { method: "POST" })
      toast.success("已注销所有设备")
      window.location.href = "/login"
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "注销设备失败")
    } finally {
      setLogoutAllLoading(false)
    }
  }

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] px-4 pb-12 pt-8 sm:-mx-6 sm:px-8 lg:mx-[-2rem] lg:my-[-1.25rem] lg:px-8 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-[28px] font-bold leading-9 text-slate-950 dark:text-slate-50">安全中心</h1>
          <p className="text-[13px] leading-5 text-[#6B7280] dark:text-slate-400">
            管理账户密码、二次认证和登录安全策略，保护您的系统安全。
          </p>
        </header>

        <SectionCard icon={ShieldCheckIcon} title="登录安全">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {LOGIN_ACTIONS.map((item) => (
              <SecurityActionButton
                key={item.key}
                icon={item.icon}
                title={item.title}
                description={item.description}
                onClick={() => setLoginDialog(item.key)}
              />
            ))}
            <SecurityActionButton
              danger
              icon={LogOutIcon}
              title="注销所有设备"
              description="强制所有设备退出登录"
              onClick={() => setLogoutAllOpen(true)}
              disabled={logoutAllLoading}
            />
            <SecurityActionButton
              danger
              icon={ShieldCheckIcon}
              title="解除全部封禁"
              description="立即解除所有封禁"
              onClick={handleClearBans}
              disabled={unbanLoading === "*"}
            />
          </div>
        </SectionCard>

        <SectionCard icon={LockKeyholeIcon} title="修改密码">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)]">
            <div className="space-y-4">
              <PasswordField id="current-password" label="当前密码" value={oldPassword} placeholder="请输入当前密码" onChange={setOldPassword} />
              <PasswordField id="new-password" label="新密码" value={newPassword} placeholder="请输入新密码" onChange={setNewPassword} />
              <PasswordField id="confirm-password" label="确认新密码" value={confirmPassword} placeholder="请再次输入新密码" onChange={setConfirmPassword} />
            </div>
            <div className="flex flex-col border-slate-200 lg:border-l lg:pl-7 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">密码强度</div>
                <div className={cn("text-xs font-semibold", passwordStrength.textClass)}>{passwordStrength.label}</div>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className={cn("h-1.5 rounded-full bg-slate-200 dark:bg-slate-800", index < passwordStrength.score && passwordStrength.barClass)}
                  />
                ))}
              </div>
              <p className="mt-5 text-[13px] leading-5 text-[#6B7280] dark:text-slate-400">
                密码长度至少 8 位，建议包含大小写字母、数字和符号。
              </p>
              <div className="mt-8 flex justify-end lg:mt-auto">
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleChangePassword}
                  className="h-10 rounded-[10px] bg-[#2563EB] px-5 text-sm hover:bg-blue-700"
                >
                  {isSubmitting ? "保存中..." : "保存密码"}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={ShieldIcon} title="二次验证（TOTP）">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-8 ring-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-900">
                <SmartphoneIcon className="size-7" />
              </div>
              <div className="min-w-0">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-6 border-emerald-200 bg-emerald-50 px-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                    !totpEnabled && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                  )}
                >
                  {totpEnabled ? "已启用" : "未启用"}
                </Badge>
                <p className="mt-3 text-sm leading-5 text-slate-900 dark:text-slate-100">
                  {totpEnabled ? "已绑定 Google Authenticator，用于登录时的二次验证。" : "尚未绑定 Authenticator，建议启用二次验证。"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTotpDialogOpen(true)}
              className="h-10 rounded-[10px] border-[#2563EB]/45 px-4 text-sm text-[#2563EB] hover:bg-blue-50 dark:border-blue-400/40 dark:text-blue-300 dark:hover:bg-blue-500/10"
            >
              <ShieldCheckIcon className="size-4" />
              管理二次验证
            </Button>
          </div>
        </SectionCard>

        <SectionCard icon={BanIcon} title="防暴力破解">
          <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
            <SettingRow title="启用防暴力破解" description="多次登录失败后自动封禁 IP，防止暴力破解">
              <Switch checked={banEnabled} onCheckedChange={(checked) => { setBanEnabled(checked); void saveBanSettings({ enabled: checked }) }} className="data-checked:bg-[#2563EB]" />
            </SettingRow>
            <SettingRow title="封禁内网 IP" description="同时封禁内网 IP（如 192.168.x.x）">
              <Switch checked={banLanEnabled} onCheckedChange={(checked) => { setBanLanEnabled(checked); void saveBanSettings({ lan_enabled: checked }) }} className="data-checked:bg-[#2563EB]" />
            </SettingRow>
            <SettingRow title="最大失败次数" description="达到此次失败次数后封禁 IP">
              <div className="flex h-9 w-[112px] items-center justify-between rounded-[10px] border border-[#E5E7EB] bg-white text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] dark:border-slate-800 dark:bg-slate-950">
                <button type="button" aria-label="减少失败次数" onClick={() => updateMaxAttempts(Number(banMaxAttempts || 1) - 1)} className="flex size-9 items-center justify-center rounded-[10px] text-slate-500 hover:bg-[#F3F4F6] dark:hover:bg-slate-900">
                  <MinusIcon className="size-4" />
                </button>
                <span className="min-w-6 text-center font-semibold text-slate-900 dark:text-slate-100">{banMaxAttempts}</span>
                <button type="button" aria-label="增加失败次数" onClick={() => updateMaxAttempts(Number(banMaxAttempts || 1) + 1)} className="flex size-9 items-center justify-center rounded-[10px] text-slate-500 hover:bg-[#F3F4F6] dark:hover:bg-slate-900">
                  <PlusIcon className="size-4" />
                </button>
              </div>
            </SettingRow>
            <SettingRow title="封禁时间" description="封禁后多长时间自动解封">
              <select
                value={banDuration}
                onChange={(event) => { setBanDuration(event.target.value); void saveBanSettings({ ban_duration_seconds: event.target.value }) }}
                className="h-9 rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                {BAN_DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </SettingRow>
            <SettingRow title="查看封禁列表" description="查看当前已被封禁的 IP 列表">
              <Button type="button" variant="outline" onClick={() => setBanListOpen(true)} className="h-9 rounded-[10px] border-[#2563EB]/45 px-3 text-sm text-[#2563EB] hover:bg-blue-50 dark:border-blue-400/40 dark:text-blue-300 dark:hover:bg-blue-500/10">
                <ListIcon className="size-4" />
                查看列表
              </Button>
            </SettingRow>
          </div>
        </SectionCard>

      </div>

      <Dialog open={loginDialog !== null} onOpenChange={(open) => !open && setLoginDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{loginDialogCopy?.title}</DialogTitle>
            <DialogDescription>{loginDialogCopy?.description}</DialogDescription>
          </DialogHeader>
          <SecurityDialogContent dialog={loginDialog} overview={securityOverview} loading={securityLoading} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLoginDialog(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认注销所有设备？</DialogTitle>
            <DialogDescription>这会让当前账号的所有已登录浏览器立即失效，包括当前设备。操作完成后需要重新登录。</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-4 text-sm leading-6 text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">
            当前记录到 {securityOverview?.sessions.length ?? 0} 个登录会话。确认后会清空会话记录并提升服务端会话版本。
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLogoutAllOpen(false)} disabled={logoutAllLoading}>取消</Button>
            <Button type="button" variant="destructive" onClick={handleLogoutAll} disabled={logoutAllLoading}>{logoutAllLoading ? "注销中..." : "注销所有设备"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={totpDialogOpen} onOpenChange={setTotpDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>管理二次验证</DialogTitle>
            <DialogDescription>{totpEnabled ? "当前账号已启用 TOTP 二次验证。" : "生成绑定密钥后，使用 Authenticator 扫码并输入验证码。"}</DialogDescription>
          </DialogHeader>
          {totpEnabled ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              登录时将要求输入认证器动态验证码。
            </div>
          ) : totpSetup ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 sm:flex-row dark:border-slate-800 dark:bg-slate-900">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(totpSetup.otpauth_url)}`} alt="TOTP QR" className="size-40 rounded-xl border border-[#E5E7EB] bg-white p-2 dark:border-slate-800" />
                <div className="min-w-0 text-sm text-[#6B7280] dark:text-slate-400">
                  <p className="font-medium text-slate-900 dark:text-slate-100">扫描二维码绑定</p>
                  <p className="mt-2 leading-6">无法扫码时，可手动输入以下密钥。</p>
                  <code className="mt-3 block truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-200">{totpSetup.secret}</code>
                </div>
              </div>
              <Input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入 6 位验证码" className="h-11 rounded-[10px] text-center text-base tracking-[0.35em]" maxLength={6} />
            </div>
          ) : (
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#6B7280] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              主页不会展示二维码或恢复码。点击生成后，绑定信息只在此弹窗中显示。
            </div>
          )}
          <DialogFooter>
            {totpEnabled ? (
              <Button type="button" variant="destructive" onClick={handleTotpDisable} disabled={totpLoading}>禁用二次验证</Button>
            ) : totpSetup ? (
              <Button type="button" onClick={handleTotpVerify} disabled={totpLoading || totpCode.length !== 6}>{totpLoading ? "验证中..." : "验证并启用"}</Button>
            ) : (
              <Button type="button" onClick={handleTotpSetup} disabled={totpLoading}>
                <RefreshCwIcon className={cn("size-4", totpLoading && "animate-spin")} />
                生成绑定密钥
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={banListOpen} onOpenChange={setBanListOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>封禁 IP 列表</DialogTitle>
            <DialogDescription>查看并解除当前被防暴力破解策略封禁的 IP。</DialogDescription>
          </DialogHeader>
          {banStatus.banned_ips.length > 0 ? (
            <ScrollArea className="max-h-72">
              <div className="space-y-2 pr-3">
                {banStatus.banned_ips.map((ip) => (
                  <div key={ip} className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                    <code className="truncate text-xs text-slate-700 dark:text-slate-300">{ip}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleUnban(ip)} disabled={unbanLoading === ip}>解除</Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm text-[#6B7280] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              暂无被封禁 IP。
            </div>
          )}
        </DialogContent>
      </Dialog>
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

function SecurityActionButton({
  icon: Icon,
  title,
  description,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[92px] min-w-0 items-center gap-3 rounded-xl border bg-white px-4 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        "focus-visible:outline-none focus-visible:ring-2 dark:bg-slate-950",
        danger
          ? "border-rose-200 text-[#EF4444] hover:bg-rose-50 focus-visible:ring-rose-500/25 dark:border-rose-500/30 dark:hover:bg-rose-950/25"
          : "border-[#E5E7EB] hover:bg-[#F3F4F6] focus-visible:ring-[#2563EB]/25 dark:border-slate-800 dark:hover:bg-slate-900",
      )}
    >
      <span className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
        danger ? "bg-rose-50 text-[#EF4444] dark:bg-rose-500/10 dark:text-rose-300" : "bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-300",
      )}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-semibold", danger ? "text-[#EF4444] dark:text-rose-300" : "text-slate-950 dark:text-slate-100")}>{title}</span>
        <span className={cn("mt-1 block truncate text-[13px]", danger ? "text-rose-500 dark:text-rose-300/80" : "text-[#6B7280] dark:text-slate-400")}>{description}</span>
      </span>
      <ChevronRightIcon className={cn("size-4 shrink-0", danger ? "text-rose-300" : "text-slate-400")} />
    </button>
  )
}

function SecurityDialogContent({ dialog, overview, loading }: { dialog: LoginDialog; overview: SecurityOverview | null; loading: boolean }) {
  if (loading) {
    return <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm text-[#6B7280] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">正在读取安全记录...</div>
  }
  if (!overview) {
    return <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm text-[#6B7280] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">暂时无法读取安全记录，请稍后刷新。</div>
  }

  if (dialog === "devices") {
    return (
      <div className="space-y-2">
        {overview.sessions.length ? overview.sessions.map((session) => (
          <SecurityRecord key={session.session_id || `${session.ip}-${session.login_at}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900 dark:text-slate-100">{session.device || "未知设备"}{session.current ? "（当前）" : ""}</div>
                <div className="mt-2 space-y-1 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
                  <div>登录 IP：{formatIpWithLocation(session.ip, session.location)}</div>
                  <div>登录时间：{formatSecurityTime(session.login_at) || "登录时间未知"}</div>
                </div>
              </div>
              <Badge variant={session.current ? "secondary" : "outline"}>{session.current ? "当前" : "在线"}</Badge>
            </div>
          </SecurityRecord>
        )) : <EmptySecurityRecord text="暂无登录设备记录。" />}
      </div>
    )
  }

  if (dialog === "failures") {
    return (
      <div className="space-y-2">
        {overview.failures.length ? overview.failures.map((failure, index) => (
          <SecurityRecord key={`${failure.ip}-${failure.time}-${index}`}>
            <div className="font-medium text-slate-900 dark:text-slate-100">{failure.device || "未知设备"}</div>
            <div className="mt-2 space-y-1 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
              <div>登录 IP：{formatIpWithLocation(failure.ip, failure.location)}</div>
              <div>登录时间：{formatSecurityTime(failure.time) || "--"}</div>
            </div>
            <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">{failure.reason || "登录失败"}</div>
          </SecurityRecord>
        )) : <EmptySecurityRecord text="暂无登录失败记录。" />}
      </div>
    )
  }

  return <EmptySecurityRecord text="暂无安全记录。" />
}

function SecurityRecord({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm dark:border-slate-800 dark:bg-slate-900">{children}</div>
}

function EmptySecurityRecord({ text }: { text: string }) {
  return <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm text-[#6B7280] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">{text}</div>
}

function formatSecurityTime(value?: string) {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString("zh-CN", { hour12: false })
}

function formatIpWithLocation(ip?: string, location?: string) {
  const value = ip || "--"
  const normalizedLocation = (location || "").trim()
  if (normalizedLocation) return `${value} · ${normalizedLocation}`
  if (isPrivateIp(value)) return `${value} · 内网`
  return `${value} · 位置未知`
}

function isPrivateIp(ip: string) {
  return (
    /^10\./.test(ip) ||
    /^127\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    /^fc/i.test(ip) ||
    /^fd/i.test(ip)
  )
}

function PasswordField({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</Label>
      <div className="relative">
        <Input id={id} type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 rounded-[10px] border-[#E5E7EB] bg-white pr-10 text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/15 dark:border-slate-800 dark:bg-slate-950" />
        <EyeIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  )
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-0.5 truncate text-[13px] text-[#6B7280] dark:text-slate-400">{description}</div>
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  )
}

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: "未输入", barClass: "", textClass: "text-[#6B7280]" }
  let score = 0
  if (password.length >= 8) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (password.length >= 12) score += 1

  if (score <= 1) return { score: Math.max(score, 1), label: "较弱", barClass: "bg-rose-300", textClass: "text-[#EF4444]" }
  if (score <= 3) return { score, label: "中等", barClass: "bg-amber-400", textClass: "text-[#F59E0B]" }
  if (score === 4) return { score, label: "强", barClass: "bg-[#22C55E]", textClass: "text-[#22C55E]" }
  return { score, label: "很强", barClass: "bg-[#16A34A]", textClass: "text-[#16A34A]" }
}
