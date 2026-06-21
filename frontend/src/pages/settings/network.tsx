import { SignalIcon, RouterIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatAccessTech, formatCurrentModes } from "@/lib/helpers"

export default function RadioNetworkPage() {
  const { radioMode, setRadioMode, networkCode, setNetworkCode, status, actionBusy, runAction, networkDirtyRef, radioModeDirtyRef } = useAppContext()

  return (
    <div className="space-y-4">
      <PageHeader icon={SignalIcon} title="网络与选网" description="配置网络制式和手动网络选择。" />

      <div className="grid gap-5 xl:grid-cols-2 max-w-2xl">
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
  )
}
