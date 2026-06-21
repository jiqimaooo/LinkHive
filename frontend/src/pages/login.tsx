import { useState } from "react"
import { LoaderCircleIcon, ShieldCheckIcon, ArrowLeftIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toaster } from "sonner"

export default function LoginPage() {
  const { loginForm, setLoginForm, isLoggingIn, totpRequired, login } = useAppContext()
  const [totpCode, setTotpCode] = useState("")

  const handleSubmit = () => {
    if (totpRequired) {
      void login(totpCode)
    } else {
      void login()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
      <Card className="w-full max-w-md border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="gap-2">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-200">LH</div>
          <CardTitle className="text-xl font-semibold">LinkHive</CardTitle>
          <CardDescription>登录后管理 SIM、eSIM 与短信转发。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
            {totpRequired ? (
              <>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
                  <ShieldCheckIcon className="size-5 text-blue-600 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-blue-800">需要二次认证验证码</div>
                    <div className="text-xs text-blue-700">请输入认证器应用中的 6 位动态验证码</div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="login-totp">动态验证码</Label>
                  <Input
                    id="login-totp"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="text-center text-2xl tracking-[0.3em]"
                    maxLength={6}
                    autoFocus
                  />
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
                <Button type="submit" disabled={isLoggingIn} className="h-11">
                  {isLoggingIn ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
                  登录
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
      <Toaster richColors position="top-right" />
    </div>
  )
}
