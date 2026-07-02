import { useState, useEffect } from "react"
import { LoaderCircleIcon, ShieldCheckIcon, ArrowLeftIcon, BanIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toaster } from "sonner"

import { Logo } from "@/components/shared/logo"

const REMEMBER_KEY = "linkhive_remember"

export default function LoginPage() {
  const { loginForm, setLoginForm, isLoggingIn, totpRequired, banRemaining, login } = useAppContext()
  const [totpCode, setTotpCode] = useState("")
  const [rememberAccount, setRememberAccount] = useState(false)
  const [countdown, setCountdown] = useState(banRemaining)

  // 只记住账号。旧版本如果保存过密码，这里会在读取账号后覆盖清理。
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        const { username } = JSON.parse(saved)
        if (username) {
          setLoginForm((c) => ({ ...c, username }))
          setRememberAccount(true)
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username }))
        } else {
          localStorage.removeItem(REMEMBER_KEY)
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    setCountdown(banRemaining)
  }, [banRemaining])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown > 0 ? 1 : 0])

  const hours = Math.floor(countdown / 3600)
  const minutes = Math.floor((countdown % 3600) / 60)
  const seconds = countdown % 60

  const handleSubmit = () => {
    if (!totpRequired && rememberAccount) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: loginForm.username }))
    } else if (!rememberAccount) {
      localStorage.removeItem(REMEMBER_KEY)
    }

    if (totpRequired) {
      void login(totpCode)
    } else {
      void login()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
      <Card className="w-full max-w-md shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="gap-2">
          <Logo className="mb-3 size-14" />
          <CardTitle className="text-xl font-semibold">LinkHive</CardTitle>
          <CardDescription>登录后管理 SIM、eSIM 与短信转发。</CardDescription>
        </CardHeader>
        <CardContent>
          {countdown > 0 ? (
            <div className="glass-panel-danger rounded-xl p-4 flex items-center gap-3">
              <BanIcon className="size-5 text-rose-600 shrink-0" />
              <div>
                <div className="text-sm font-medium text-rose-800">尝试次数过多，IP 已被临时封禁</div>
                <div className="text-lg font-mono font-bold text-rose-700 mt-1">
                  {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <div className="text-xs text-rose-600 mt-1">请等待倒计时结束后再试</div>
              </div>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
              {totpRequired ? (
                <>
                  <div className="glass-panel-selected rounded-xl p-4 flex items-center gap-3">
                    <ShieldCheckIcon className="size-5 text-blue-600 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-blue-800">需要二次认证验证码</div>
                      <div className="text-xs text-blue-700">请输入认证器应用中的 6 位动态验证码</div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="login-totp">动态验证码</Label>
                    <Input id="login-totp" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="text-center text-2xl tracking-[0.3em]" maxLength={6} autoFocus />
                  </div>
                  <Button type="submit" disabled={isLoggingIn || totpCode.length !== 6} className="h-11">
                    {isLoggingIn ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
                    验证并登录
                  </Button>
                  <Button type="button" variant="ghost" className="h-9" onClick={() => { window.location.reload() }}>
                    <ArrowLeftIcon className="size-4" />返回重新登录
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="login-username">账号</Label>
                    <Input id="login-username" value={loginForm.username} onChange={(e) => setLoginForm((c) => ({ ...c, username: e.target.value }))} autoComplete="username" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="login-password">密码</Label>
                    <Input id="login-password" type="password" value={loginForm.password} onChange={(e) => setLoginForm((c) => ({ ...c, password: e.target.value }))} autoComplete="current-password" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="remember-me"
                      type="checkbox"
                      checked={rememberAccount}
                      onChange={(e) => setRememberAccount(e.target.checked)}
                      className="size-4 rounded accent-blue-600"
                    />
                    <Label htmlFor="remember-me" className="text-sm text-muted-foreground cursor-pointer">记住账号</Label>
                  </div>
                  <Button type="submit" disabled={isLoggingIn} className="h-11">
                    {isLoggingIn ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
                    登录
                  </Button>
                </>
              )}
            </form>
          )}
        </CardContent>
      </Card>
      <Toaster richColors position="top-right" />
    </div>
  )
}
