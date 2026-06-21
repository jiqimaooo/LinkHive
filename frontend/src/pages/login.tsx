import { LoaderCircleIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toaster } from "sonner"

export default function LoginPage() {
  const { loginForm, setLoginForm, isLoggingIn, login } = useAppContext()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
      <Card className="w-full max-w-md border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="gap-2">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-200">
            LH
          </div>
          <CardTitle className="text-xl font-semibold">LinkHive</CardTitle>
          <CardDescription>登录后管理 SIM、eSIM 与短信转发。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void login()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="login-username">账号</Label>
              <Input
                id="login-username"
                value={loginForm.username}
                onChange={(event) => {
                  setLoginForm((current) => ({ ...current, username: event.target.value }))
                }}
                autoComplete="username"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">密码</Label>
              <Input
                id="login-password"
                type="password"
                value={loginForm.password}
                onChange={(event) => {
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={isLoggingIn} className="h-11">
              {isLoggingIn ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
      <Toaster richColors position="top-right" />
    </div>
  )
}
