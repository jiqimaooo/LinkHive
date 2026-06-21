import { RadioTowerIcon, SignalIcon, RouterIcon, SendIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatAccessTech, formatCurrentModes } from "@/lib/helpers"

export default function NetworkSettingsPage() {
  const { apnForm, setApnForm, radioMode, setRadioMode, networkCode, setNetworkCode, status, actionBusy, runAction, apnDirtyRef, networkDirtyRef, radioModeDirtyRef } = useAppContext()

  return (
    <div className="space-y-4">
      <PageHeader icon={SignalIcon} title="网络设置" description="配置 APN、网络制式和手动选网。" />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><RadioTowerIcon className="size-4 text-muted-foreground" />APN配置</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="apn">APN</Label>
              <Input id="apn" value={apnForm.apn} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, apn: e.target.value })) }} placeholder="例如 fast.t-mobile.com" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="apn-username">用户名</Label><Input id="apn-username" value={apnForm.username} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, username: e.target.value })) }} placeholder="可留空" /></div>
              <div className="grid gap-2"><Label htmlFor="apn-password">密码</Label><Input id="apn-password" type="password" value={apnForm.password} onChange={(e) => { apnDirtyRef.current = true; setApnForm((c) => ({ ...c, password: e.target.value })) }} placeholder="可留空" /></div>
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
              <Button type="button" variant="outline" disabled={!status} onClick={() => { apnDirtyRef.current = false; networkDirtyRef.current = false; radioModeDirtyRef.current = false; window.location.reload() }}>恢复当前状态</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="border-slate-200 bg-white">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><SignalIcon className="size-4 text-muted-foreground" />网络制式</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{`${formatAccessTech(status?.modem.access_tech || "--")}\n${formatCurrentModes(status?.modem.current_modes || "--")}`}</p>
              <Select value={radioMode} onValueChange={(v) => { radioModeDirtyRef.current = true; setRadioMode(v ?? "3g4g_prefer4g") }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择网络制式" /></SelectTrigger>
                <SelectContent><SelectGroup><SelectLabel>网络制式</SelectLabel><SelectItem value="4g_only">仅 4G</SelectItem><SelectItem value="3g4g_prefer4g">3G / 4G，优先 4G</SelectItem><SelectItem value="3g_only">仅 3G</SelectItem></SelectGroup></SelectContent>
              </Select>
              <Button type="button" variant="outline" className="w-full" disabled={actionBusy} onClick={() => { void runAction("apply_radio_mode", { mode: radioMode }, "应用网络制式") }}>应用</Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><RouterIcon className="size-4 text-muted-foreground" />网络选择</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">当前：{status?.connection.network_id || "自动"}</p>
              <Input value={networkCode} onChange={(e) => { networkDirtyRef.current = true; setNetworkCode(e.target.value) }} placeholder="例如 46000" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={actionBusy || !networkCode.trim()} onClick={() => { void runAction("apply_network_selection", { operator_code: networkCode.trim() }, `手动选网 ${networkCode.trim()}`) }}>手动选网</Button>
                <Button type="button" variant="outline" disabled={actionBusy} onClick={() => { void runAction("apply_network_selection", { operator_code: "" }, "恢复自动选网") }}>自动选网</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
