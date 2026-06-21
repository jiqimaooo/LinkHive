import { useState, useEffect, useCallback } from "react"
import { ShieldCheckIcon, KeyRoundIcon, RefreshCwIcon, BanIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppContext } from "@/hooks/app-context"
import { requestJson } from "@/lib/api"

type BanStatus = { enabled: boolean; max_attempts: number; lan_enabled: boolean; banned_ips: string[] }

export default function SecurityPage() {
  const { authStatus } = useAppContext()
  const [newUsername, setNewUsername] = useState(authStatus?.username ?? "")
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_url: string } | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [totpLoading, setTotpLoading] = useState(false)

  const [banStatus, setBanStatus] = useState<BanStatus>({ enabled: false, max_attempts: 5, lan_enabled: false, banned_ips: [] })
  const [banEnabled, setBanEnabled] = useState(false)
  const [banMaxAttempts, setBanMaxAttempts] = useState("5")
  const [banLanEnabled, setBanLanEnabled] = useState(false)
  const [banLoading, setBanLoading] = useState(false)
  const [unbanLoading, setUnbanLoading] = useState<string | null>(null)

  const loadTotpStatus = useCallback(async () => {
    try { const data = await requestJson<{ enabled: boolean }>("/api/auth/totp-status"); setTotpEnabled(data.enabled) } catch { /* */ }
  }, [])

  const loadBanStatus = useCallback(async () => {
    try {
      const data = await requestJson<BanStatus>("/api/auth/ban-status")
      setBanStatus(data); setBanEnabled(data.enabled); setBanMaxAttempts(String(data.max_attempts)); setBanLanEnabled(data.lan_enabled)
    } catch { /* */ }
  }, [])

  useEffect(() => { void loadTotpStatus(); void loadBanStatus() }, [loadTotpStatus, loadBanStatus])

  const handleChangePassword = async () => {
    if (!newUsername.trim() && !newPassword) { toast.error("请至少修改用户名或密码"); return }
    if (newUsername.trim() && newUsername.trim().length < 2) { toast.error("用户名不能少于 2 位"); return }
    if (newPassword && !oldPassword) { toast.error("修改密码需要输入旧密码"); return }
    if (newPassword && newPassword.length < 4) { toast.error("新密码不能少于 4 位"); return }
    if (newPassword && newPassword !== confirmPassword) { toast.error("两次输入的新密码不一致"); return }
    setIsSubmitting(true)
    try {
      await requestJson("/api/auth/change-password", { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_username: newUsername.trim(), new_password: newPassword }) })
      toast.success("账户信息已修改"); setNewUsername(newUsername.trim() || newUsername); setOldPassword(""); setNewPassword(""); setConfirmPassword("")
    } catch (error) { toast.error(error instanceof Error ? error.message : "修改失败") }
    finally { setIsSubmitting(false) }
  }

  const handleTotpSetup = async () => { setTotpLoading(true); try { const d = await requestJson<{ secret: string; otpauth_url: string }>("/api/auth/totp-setup", { method: "POST" }); setTotpSetup(d) } catch (e) { toast.error(e instanceof Error ? e.message : "失败") } finally { setTotpLoading(false) } }
  const handleTotpVerify = async () => { if (!totpCode || totpCode.length !== 6) { toast.error("请输入 6 位验证码"); return }; setTotpLoading(true); try { await requestJson("/api/auth/totp-verify", { method: "POST", body: JSON.stringify({ code: totpCode }) }); toast.success("已启用"); setTotpSetup(null); setTotpCode(""); setTotpEnabled(true) } catch (e) { toast.error(e instanceof Error ? e.message : "失败") } finally { setTotpLoading(false) } }
  const handleTotpDisable = async () => { setTotpLoading(true); try { await requestJson("/api/auth/totp-disable", { method: "POST" }); toast.success("已禁用"); setTotpEnabled(false); setTotpSetup(null); setTotpCode("") } catch (e) { toast.error(e instanceof Error ? e.message : "失败") } finally { setTotpLoading(false) } }

  const handleBanSave = async () => {
    setBanLoading(true)
    try {
      await requestJson("/api/auth/ban-settings", { method: "POST", body: JSON.stringify({ enabled: banEnabled, max_attempts: banMaxAttempts, lan_enabled: banLanEnabled }) })
      toast.success("配置已保存")
      void loadBanStatus()
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败") }
    finally { setBanLoading(false) }
  }

  const handleUnban = async (ip: string) => {
    setUnbanLoading(ip)
    try { await requestJson("/api/auth/unban-ip", { method: "POST", body: JSON.stringify({ ip }) }); toast.success(`已解封 ${ip}`); void loadBanStatus() }
    catch (e) { toast.error(e instanceof Error ? e.message : "解封失败") }
    finally { setUnbanLoading(null) }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="安全设置" description="管理账户密码、二次认证和防暴力破解。" />

      <div className="flex flex-col xl:flex-row gap-4">
        <div className="space-y-4 max-w-lg w-full">
          {/* 修改密码 */}
          <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRoundIcon className="size-4 text-muted-foreground" />修改账户</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2"><Label htmlFor="new-username">用户名</Label><Input id="new-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="留空则不修改" /></div>
          <Separator />
          <div className="grid gap-2"><Label htmlFor="old-pw">旧密码</Label><Input id="old-pw" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="修改密码时需输入" /></div>
          <Separator />
          <div className="grid gap-2"><Label htmlFor="new-pw">新密码</Label><Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 4 位" /></div>
          <div className="grid gap-2"><Label htmlFor="confirm-pw">确认新密码</Label><Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" /></div>
          <Button onClick={handleChangePassword} disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存修改"}</Button>
        </CardContent>
      </Card>

      {/* 二次认证 */}
      <Card className="border-slate-200 bg-white max-w-lg">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheckIcon className="size-4 text-muted-foreground" />二次认证{totpEnabled ? <Badge className="h-5 text-[0.688rem]">已启用</Badge> : <Badge variant="outline" className="h-5 text-[0.688rem]">未启用</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">基于时间的一次性密码（TOTP）。使用 Google Authenticator 等应用扫码绑定。</p>
          {totpEnabled ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-800">已启用，登录时需要动态验证码。</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleTotpDisable} disabled={totpLoading}>禁用二次认证</Button>
            </div>
          ) : totpSetup ? (
            <div className="rounded-xl border p-4 space-y-4">
              <div className="text-sm font-medium">扫码绑定并验证</div>
              <div className="flex items-center gap-4">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpSetup.otpauth_url)}`} alt="TOTP QR" className="size-40 rounded-xl border" />
                <div className="text-sm text-muted-foreground space-y-1"><p>扫描二维码</p><p>或手动输入：</p><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{totpSetup.secret}</code></div>
              </div>
              <div className="flex items-center gap-2">
                <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入应用生成的 6 位验证码" className="w-36 text-center text-lg tracking-widest" maxLength={6} />
                <Button onClick={handleTotpVerify} disabled={totpLoading || totpCode.length !== 6}>验证并启用</Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleTotpSetup} disabled={totpLoading}><RefreshCwIcon className={totpLoading ? "animate-spin" : ""} />生成绑定密钥</Button>
          )}
        </CardContent>
      </Card>
        </div>

        <div className="max-w-lg w-full">
          {/* 防暴力破解 */}
          <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BanIcon className="size-4 text-muted-foreground" />防暴力破解{banStatus.enabled ? <Badge className="h-5 text-[0.688rem]">已启用</Badge> : <Badge variant="outline" className="h-5 text-[0.688rem]">未启用</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">多次登录失败后自动封禁 IP，防止公网暴露时被暴力破解。</p>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div><div className="text-sm font-medium">启用防暴力破解</div><div className="text-xs text-muted-foreground">开启后，连续登录失败的 IP 将被自动封禁</div></div>
            <Switch checked={banEnabled} onCheckedChange={setBanEnabled} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ban-max">最大尝试次数</Label>
            <Input id="ban-max" type="number" min={1} max={100} value={banMaxAttempts} onChange={(e) => setBanMaxAttempts(e.target.value)} className="w-24" />
            <p className="text-xs text-muted-foreground">24 小时内连续失败达到此次数后封禁 IP</p>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div><div className="text-sm font-medium">内网生效</div><div className="text-xs text-muted-foreground">开启后，内网 IP（192.168.x.x 等）也会被封禁。默认关闭</div></div>
            <Switch checked={banLanEnabled} onCheckedChange={setBanLanEnabled} />
          </div>
          <Button onClick={handleBanSave} disabled={banLoading}>保存配置</Button>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium mb-2">已封禁 IP（{banStatus.banned_ips.length} 个）</div>
            {banStatus.banned_ips.length > 0 ? (
              <ScrollArea className="max-h-48">
                <div className="space-y-1.5">
                  {banStatus.banned_ips.map((ip) => (
                    <div key={ip} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <code className="text-xs">{ip}</code>
                      <Button type="button" size="xs" variant="outline" onClick={() => handleUnban(ip)} disabled={unbanLoading === ip}>
                        <Trash2Icon className="size-3" />解封
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-xs text-muted-foreground">暂无被封禁 IP</p>
            )}
          </div>
        </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
