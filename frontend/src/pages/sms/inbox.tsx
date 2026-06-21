import { useState } from "react"
import { MessageSquareTextIcon, SendIcon, SearchIcon, XIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export default function SmsInboxPage() {
  const { status, runAction, actionBusy } = useAppContext()
  const [searchText, setSearchText] = useState("")
  const [selectedSms, setSelectedSms] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendForm, setSendForm] = useState({ number: "", message: "" })

  const smsList = status?.sms ?? []
  const filtered = searchText.trim() ? smsList.filter((sms) => sms.number.includes(searchText) || sms.text.toLowerCase().includes(searchText.toLowerCase())) : smsList
  const selected = smsList.find((sms) => sms.id === selectedSms) ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        title="短信收件箱"
        description="查看收到的短信，支持中文和 Base64 文本自动还原。"
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => setSendOpen(true)} disabled={actionBusy}>
              <SendIcon data-icon="inline-start" />发送短信
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={actionBusy || !smsList.length} onClick={() => { void runAction("resend_last_sms", {}, "重发最后一条短信") }}>
              重发最后一条
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="border-slate-200 bg-white h-[calc(100vh-16rem)] flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2"><MessageSquareTextIcon className="size-4" />消息列表<Badge variant="outline" className="ml-1">{smsList.length}</Badge></CardTitle>
              <div className="relative w-64"><SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" /><Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="搜索号码或内容..." className="pl-8 h-8 text-sm" /></div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pb-4">
            <ScrollArea className="h-full rounded-xl border">
              <div className="flex flex-col gap-2 p-3">
                {filtered.length ? filtered.map((sms) => (
                  <button key={`${sms.id}-${sms.timestamp}`} type="button" onClick={() => setSelectedSms(sms.id === selectedSms ? null : sms.id)} className={cn("rounded-xl border p-3 text-left transition-colors hover:bg-muted/50", selectedSms === sms.id ? "border-blue-300 bg-blue-50/80" : "border-border/70 bg-white/90")}>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{sms.number || "未知号码"}</span><Badge variant="secondary" className="text-xs">{sms.state_label}</Badge><Badge variant="outline" className="text-xs">{sms.timestamp}</Badge></div>
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{sms.text || "空短信"}</p>
                  </button>
                )) : <EmptyState icon={MessageSquareTextIcon} title="暂无消息" description={searchText ? "没有匹配的消息。" : "收到短信后会自动出现在这里。"} />}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white h-[calc(100vh-16rem)] flex flex-col">
          <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">消息详情</CardTitle>{selected ? <Button type="button" variant="ghost" size="icon-xs" onClick={() => setSelectedSms(null)}><XIcon className="size-3.5" /></Button> : null}</div></CardHeader>
          <CardContent className="flex-1 min-h-0">
            {selected ? (
              <div className="space-y-3">
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">发件人</div><div className="font-medium">{selected.number || "未知号码"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">状态</div><Badge variant="secondary" className="mt-1">{selected.state_label}</Badge></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">时间</div><div className="text-sm">{selected.timestamp}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">内容</div><p className="mt-1 text-sm whitespace-pre-wrap break-words leading-6">{selected.text || "空短信"}</p></div>
              </div>
            ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">选择一条消息查看详情</div>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发送短信</DialogTitle>
            <DialogDescription>输入目标号码和短信内容，通过当前基带发送。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="send-number">目标号码</Label>
              <Input
                id="send-number"
                value={sendForm.number}
                onChange={(e) => setSendForm((f) => ({ ...f, number: e.target.value }))}
                placeholder="例如 +447000000000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="send-message">短信内容</Label>
              <Textarea
                id="send-message"
                value={sendForm.message}
                onChange={(e) => setSendForm((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                placeholder="输入要发送的短信内容..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>取消</Button>
            <Button
              disabled={actionBusy || !sendForm.number.trim() || !sendForm.message.trim()}
              onClick={() => {
                void runAction("send_test_sms", { number: sendForm.number.trim(), message: sendForm.message }, `发送短信到 ${sendForm.number.trim()}`)
                setSendOpen(false)
                setSendForm({ number: "", message: "" })
              }}
            >
              <SendIcon data-icon="inline-start" />发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
