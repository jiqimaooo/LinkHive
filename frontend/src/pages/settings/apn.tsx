import { RadioTowerIcon, SendIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ApnSettingsPage() {
  const { apnForm, setApnForm, status, actionBusy, runAction, apnDirtyRef } = useAppContext()

  return (
    <div className="space-y-4">
      <PageHeader icon={RadioTowerIcon} title="APN配置" description="配置接入点名称和承载参数。" />

      <Card className="border-slate-200 bg-white max-w-2xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><RadioTowerIcon className="size-4 text-muted-foreground" />APN参数</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2"><Label htmlFor="apn">APN</Label><Input id="apn" value={apnForm.apn} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, apn: e.target.value })) }} placeholder="例如 fast.t-mobile.com" /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="apn-user">用户名</Label><Input id="apn-user" value={apnForm.username} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, username: e.target.value })) }} placeholder="可留空" /></div>
            <div className="grid gap-2"><Label htmlFor="apn-pass">密码</Label><Input id="apn-pass" type="password" value={apnForm.password} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, password: e.target.value })) }} placeholder="可留空" /></div>
          </div>
          <div className="grid gap-2 md:max-w-xs">
            <Label>IP 类型</Label>
            <Select value={apnForm.ip_type} onValueChange={(v) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, ip_type: v ?? c.ip_type })) }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="选择 IP 类型" /></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>承载模式</SelectLabel><SelectItem value="ipv4">IPv4</SelectItem><SelectItem value="ipv6">IPv6</SelectItem><SelectItem value="ipv4v6">IPv4 / IPv6</SelectItem></SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={actionBusy} onClick={() => { void runAction("save_apn", apnForm, "保存 APN 配置") }}><SendIcon data-icon="inline-start" />应用并保存</Button>
            <Button type="button" variant="outline" disabled={!status} onClick={() => { apnDirtyRef.current = false; window.location.reload() }}>恢复当前状态</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
