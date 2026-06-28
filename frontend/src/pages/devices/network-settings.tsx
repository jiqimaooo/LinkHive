import { RadioTowerIcon, SignalIcon, RouterIcon, SendIcon, PhoneIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select"
import { formatAccessTech, formatCurrentModes } from "@/lib/helpers"

const RADIO_MODE_LABELS: Record<string, string> = {
  network_disabled: "禁用蜂窝数据",
  "4g_only": "仅 4G",
  "3g4g_prefer4g": "3G / 4G，优先 4G",
  "3g_only": "仅 3G",
}

const IP_TYPE_LABELS: Record<string, string> = {
  ipv4: "仅 IPv4",
  ipv6: "仅 IPv6",
  ipv4v6: "IPv4 / IPv6",
}

export default function NetworkSettingsPage() {
  const { apnForm, setApnForm, radioMode, setRadioMode, networkCode, setNetworkCode, status, actionBusy, runAction, apnDirtyRef, networkDirtyRef, radioModeDirtyRef } = useAppContext()

  return (
    <div className="space-y-4">
      <PageHeader title="网络设置" description="配置 APN、网络制式和手动选网。" />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
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
                <SelectTrigger className="w-full">
                  <span className={apnForm.ip_type ? "" : "text-muted-foreground"}>{IP_TYPE_LABELS[apnForm.ip_type] || "选择 IP 类型"}</span>
                </SelectTrigger>
                <SelectContent><SelectGroup><SelectLabel>承载模式</SelectLabel><SelectItem value="ipv4">仅 IPv4</SelectItem><SelectItem value="ipv6">仅 IPv6</SelectItem><SelectItem value="ipv4v6">IPv4 / IPv6</SelectItem></SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={actionBusy} onClick={() => { void runAction("save_apn", apnForm, "保存 APN 配置") }}><SendIcon data-icon="inline-start" />应用并保存</Button>
              <Button type="button" variant="outline" disabled={!status} onClick={() => { apnDirtyRef.current = false; networkDirtyRef.current = false; radioModeDirtyRef.current = false; window.location.reload() }}>恢复当前状态</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><SignalIcon className="size-4 text-muted-foreground" />网络制式</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{`${formatAccessTech(status?.modem.access_tech || "--")}\n${formatCurrentModes(status?.modem.current_modes || "--")}`}</p>
              <Select value={radioMode} onValueChange={(v) => { radioModeDirtyRef.current = true; setRadioMode(v ?? "network_disabled") }}>
                <SelectTrigger className="w-full">
                  <span className={radioMode ? "" : "text-muted-foreground"}>{RADIO_MODE_LABELS[radioMode] || "选择网络制式"}</span>
                </SelectTrigger>
                <SelectContent><SelectGroup><SelectLabel>网络制式</SelectLabel><SelectItem value="network_disabled">禁用蜂窝数据</SelectItem><SelectItem value="4g_only">仅 4G</SelectItem><SelectItem value="3g4g_prefer4g">3G / 4G，优先 4G</SelectItem><SelectItem value="3g_only">仅 3G</SelectItem></SelectGroup></SelectContent>
              </Select>
              <Button type="button" variant="outline" className="w-full" disabled={actionBusy} onClick={() => { void runAction("apply_radio_mode", { mode: radioMode }, "应用网络制式") }}>应用</Button>
            </CardContent>
          </Card>

          <Card>
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

          {status?.modem.ims_supported ? (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><PhoneIcon className="size-4 text-muted-foreground" />IMS 语音</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">控制 VoLTE 和 VoWiFi 开关，修改后将通过直连基带重新检测状态。</p>
                {status?.modem.volte_supported !== false ? (
              <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>VoLTE</Label>
                      <p className="text-xs text-muted-foreground">通过 LTE 网络进行语音通话</p>
                    </div>
                    <Switch
                      checked={status?.modem.volte_enabled ?? false}
                      disabled={actionBusy}
                      onCheckedChange={(checked) => { void runAction("apply_ims_settings", { volte_enabled: checked }, checked ? "开启 VoLTE" : "关闭 VoLTE") }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between opacity-50">
                    <div className="space-y-0.5">
                      <Label>VoLTE</Label>
                      <p className="text-xs text-muted-foreground">当前模组不支持</p>
                    </div>
                    <Switch checked={false} disabled />
                  </div>
                )}
                {status?.modem.vowifi_supported !== false ? (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>VoWiFi</Label>
                      <p className="text-xs text-muted-foreground">通过 WiFi 网络进行语音通话</p>
                    </div>
                    <Switch
                      checked={status?.modem.vowifi_enabled ?? false}
                      disabled={actionBusy}
                      onCheckedChange={(checked) => { void runAction("apply_ims_settings", { vowifi_enabled: checked }, checked ? "开启 VoWiFi" : "关闭 VoWiFi") }}
                    />
                  </div>
             ) : (
                  <div className="flex items-center justify-between opacity-50">
                    <div className="space-y-0.5">
                      <Label>VoWiFi</Label>
                      <p className="text-xs text-muted-foreground">当前模组不支持</p>
                    </div>
                    <Switch checked={false} disabled />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
