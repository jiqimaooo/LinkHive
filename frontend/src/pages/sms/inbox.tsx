import { useEffect, useMemo, useState } from "react"
import {
  MessageCircleIcon,
  MessageSquarePlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SmartphoneIcon,
  XIcon,
} from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAppContext } from "@/hooks/app-context"
import type { SmsItem } from "@/lib/types"
import { cn } from "@/lib/utils"

type LocalOutgoingMessage = {
  id: string
  device_id: string
  number: string
  text: string
  timestamp: string
  state_label: string
}

type DraftConversation = {
  key: string
  device_id: string
  number: string
}

type ChatMessage = {
  id: string
  key: string
  direction: "inbound" | "outbound"
  device_id: string
  number: string
  text: string
  timestamp: string
  state_label: string
}

type Conversation = {
  key: string
  device_id: string
  number: string
  title: string
  deviceLabel: string
  lastText: string
  lastTime: string
  messageCount: number
  unreadCount: number
  messages: ChatMessage[]
}

export default function SmsInboxPage() {
  const { status, runAction, actionBusy, refreshStatus, isRefreshing } = useAppContext()
  const [searchText, setSearchText] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [composerText, setComposerText] = useState("")
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ device_id: "", number: "", message: "" })
  const [localMessages, setLocalMessages] = useState<LocalOutgoingMessage[]>([])
  const [draftConversations, setDraftConversations] = useState<DraftConversation[]>([])

  const devices = useMemo(() => status?.devices ?? [], [status?.devices])
  const smsList = useMemo(() => status?.sms ?? [], [status?.sms])
  const defaultDeviceId = devices.find((device) => device.capabilities.sms_supported)?.id || devices[0]?.id || ""

  const conversations = useMemo(() => {
    const deviceLabel = (deviceId?: string) => devices.find((device) => device.id === deviceId)?.label || "当前设备"
    const map = new Map<string, Conversation>()

    const ensureConversation = (deviceId: string, number: string) => {
      const key = conversationKey(deviceId, number)
      const existing = map.get(key)
      if (existing) return existing
      const conversation: Conversation = {
        key,
        device_id: deviceId,
        number,
        title: number || "未知号码",
        deviceLabel: deviceLabel(deviceId),
        lastText: "还没有消息",
        lastTime: "",
        messageCount: 0,
        unreadCount: 0,
        messages: [],
      }
      map.set(key, conversation)
      return conversation
    }

    const appendMessage = (message: ChatMessage) => {
      const conversation = ensureConversation(message.device_id, message.number)
      conversation.messages.push(message)
      conversation.messageCount += 1
      if (message.direction === "inbound") conversation.unreadCount += 1
    }

    for (const sms of smsList) {
      const deviceId = sms.device_id || defaultDeviceId
      appendMessage({
        id: smsKey(sms),
        key: conversationKey(deviceId, sms.number),
        direction: "inbound",
        device_id: deviceId,
        number: sms.number,
        text: sms.text || "空短信",
        timestamp: sms.timestamp,
        state_label: sms.state_label,
      })
    }

    for (const outgoing of localMessages) {
      appendMessage({
        id: outgoing.id,
        key: conversationKey(outgoing.device_id, outgoing.number),
        direction: "outbound",
        device_id: outgoing.device_id,
        number: outgoing.number,
        text: outgoing.text,
        timestamp: outgoing.timestamp,
        state_label: outgoing.state_label,
      })
    }

    for (const draft of draftConversations) {
      ensureConversation(draft.device_id, draft.number)
    }

    for (const conversation of map.values()) {
      conversation.messages.sort((a, b) => messageTime(a.timestamp) - messageTime(b.timestamp))
      const last = conversation.messages[conversation.messages.length - 1]
      if (last) {
        conversation.lastText = last.text
        conversation.lastTime = last.timestamp
      }
    }

    return Array.from(map.values()).sort((a, b) => messageTime(b.lastTime) - messageTime(a.lastTime))
  }, [defaultDeviceId, devices, draftConversations, localMessages, smsList])

  const filteredConversations = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) return conversations
    return conversations.filter((conversation) => {
      return (
        conversation.title.toLowerCase().includes(keyword) ||
        conversation.deviceLabel.toLowerCase().includes(keyword) ||
        conversation.messages.some((message) => message.text.toLowerCase().includes(keyword))
      )
    })
  }, [conversations, searchText])

  const selectedConversation = conversations.find((conversation) => conversation.key === selectedKey) ?? filteredConversations[0] ?? null

  useEffect(() => {
    if (!selectedConversation) {
      if (selectedKey !== null) setSelectedKey(null)
      return
    }
    if (selectedKey !== selectedConversation.key) setSelectedKey(selectedConversation.key)
  }, [selectedConversation, selectedKey])

  const selectedDeviceId = selectedConversation?.device_id || defaultDeviceId
  const selectedNumber = selectedConversation?.number || ""

  const submitMessage = (number: string, message: string, deviceId: string, closeDialog = false) => {
    const cleanNumber = number.trim()
    const cleanMessage = message.trim()
    if (!cleanNumber || !cleanMessage || !deviceId) return
    const outgoing: LocalOutgoingMessage = {
      id: `local-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      device_id: deviceId,
      number: cleanNumber,
      text: cleanMessage,
      timestamp: new Date().toLocaleString("zh-CN", { hour12: false }),
      state_label: "已提交",
    }
    setLocalMessages((current) => [...current, outgoing])
    setDraftConversations((current) => {
      const key = conversationKey(deviceId, cleanNumber)
      return current.some((item) => item.key === key) ? current : [...current, { key, device_id: deviceId, number: cleanNumber }]
    })
    setSelectedKey(conversationKey(deviceId, cleanNumber))
    void runAction("send_test_sms", { device_id: deviceId, number: cleanNumber, message: cleanMessage }, `发送短信到 ${cleanNumber}`)
    if (closeDialog) setNewOpen(false)
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">短信</h1>
          <p className="mt-1 text-sm text-muted-foreground">按号码聚合会话，查看连续对话并通过现有短信通道发送回复。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isRefreshing} onClick={() => { void refreshStatus(false) }}>
            <RefreshCwIcon data-icon="inline-start" className={cn(isRefreshing && "animate-spin")} />
            刷新
          </Button>
          <Button type="button" onClick={() => {
            setNewForm({ device_id: defaultDeviceId, number: "", message: "" })
            setNewOpen(true)
          }}>
            <MessageSquarePlusIcon data-icon="inline-start" />
            新建短信
          </Button>
        </div>
      </section>

      <section className="glass-card grid min-h-[36rem] flex-1 overflow-hidden rounded-3xl lg:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-white/65 bg-white/42 lg:border-b-0 lg:border-r dark:border-white/10 dark:bg-slate-950/24">
          <div className="border-b border-white/70 p-4 dark:border-white/10">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索号码、设备或短信内容"
                className="h-10 rounded-2xl bg-white/70 pl-9 dark:bg-slate-950/45"
              />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1.5 p-3">
              {filteredConversations.length ? filteredConversations.map((conversation) => {
                const active = conversation.key === selectedConversation?.key
                return (
                  <button
                    key={conversation.key}
                    type="button"
                    onClick={() => setSelectedKey(conversation.key)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                      active
                        ? "border-blue-300 bg-blue-50/90 shadow-sm dark:border-blue-400/35 dark:bg-blue-500/15"
                        : "border-transparent hover:bg-white/70 dark:hover:bg-white/8",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        active ? "bg-blue-600 text-white" : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950",
                      )}>
                        {conversation.title.slice(-2) || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold">{conversation.title}</div>
                          <span className="shrink-0 text-[0.68rem] text-muted-foreground">{shortTime(conversation.lastTime)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <SmartphoneIcon className="size-3.5 shrink-0" />
                          <span className="truncate">{conversation.deviceLabel}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{conversation.lastText}</p>
                      </div>
                    </div>
                  </button>
                )
              }) : <ConversationListSkeleton searchText={searchText} />}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex min-h-[32rem] min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/70 px-5 py-4 dark:border-white/10">
            {selectedConversation ? (
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{selectedConversation.title}</h2>
                    <Badge variant="outline">{selectedConversation.messageCount} 条</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{selectedConversation.deviceLabel} · {selectedConversation.device_id}</p>
                </div>
              ) : <EmptyConversationHeader />}
          </div>

          {selectedConversation ? (
            <>
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex min-h-full flex-col gap-3 px-5 py-5">
                  {selectedConversation.messages.length ? selectedConversation.messages.map((message) => (
                    <div key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[min(34rem,86%)] rounded-3xl px-4 py-3 shadow-sm",
                        message.direction === "outbound"
                          ? "rounded-br-lg bg-blue-600 text-white"
                          : "glass-panel rounded-bl-lg text-slate-900 dark:text-slate-100",
                      )}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>
                        <div className={cn(
                          "mt-2 flex items-center justify-end gap-2 text-[0.68rem]",
                          message.direction === "outbound" ? "text-blue-100" : "text-muted-foreground",
                        )}>
                          <span>{message.state_label}</span>
                          <span>{message.timestamp || "--"}</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-1 items-center justify-center">
                      <EmptyState icon={MessageCircleIcon} title="新会话" description="输入内容后会通过选定设备发送第一条短信。" />
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="border-t border-white/70 p-4 dark:border-white/10">
                <div className="glass-panel flex items-end gap-3 rounded-3xl p-2">
                  <Textarea
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                    rows={2}
                    placeholder={`发送到 ${selectedNumber || "目标号码"}`}
                    className="min-h-12 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault()
                        submitMessage(selectedNumber, composerText, selectedDeviceId)
                        setComposerText("")
                      }
                    }}
                  />
                  <Button
                    type="button"
                    className="mb-0.5 shrink-0 rounded-2xl"
                    disabled={actionBusy || !composerText.trim() || !selectedNumber || !selectedDeviceId}
                    onClick={() => {
                      submitMessage(selectedNumber, composerText, selectedDeviceId)
                      setComposerText("")
                    }}
                  >
                    <SendIcon data-icon="inline-start" />
                    发送
                  </Button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">按 Cmd/Ctrl + Enter 快速发送。</div>
              </div>
            </>
          ) : (
            <EmptyConversationPane />
          )}
        </main>
      </section>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建短信</DialogTitle>
            <DialogDescription>选择发送设备，输入号码和短信内容。发送动作复用当前短信接口。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>发送设备</Label>
              <Select value={newForm.device_id || defaultDeviceId} onValueChange={(value) => setNewForm((form) => ({ ...form, device_id: value ?? "" }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择设备" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>设备</SelectLabel>
                    {devices.map((device) => <SelectItem key={device.id} value={device.id}>{device.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-sms-number">目标号码</Label>
              <Input id="new-sms-number" value={newForm.number} onChange={(event) => setNewForm((form) => ({ ...form, number: event.target.value }))} placeholder="例如 +447000000000" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-sms-message">短信内容</Label>
              <Textarea id="new-sms-message" value={newForm.message} onChange={(event) => setNewForm((form) => ({ ...form, message: event.target.value }))} rows={4} placeholder="输入要发送的短信内容" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              <XIcon data-icon="inline-start" />
              取消
            </Button>
            <Button
              disabled={actionBusy || !newForm.number.trim() || !newForm.message.trim() || !(newForm.device_id || defaultDeviceId)}
              onClick={() => {
                submitMessage(newForm.number, newForm.message, newForm.device_id || defaultDeviceId, true)
                setNewForm({ device_id: newForm.device_id || defaultDeviceId, number: "", message: "" })
              }}
            >
              <SendIcon data-icon="inline-start" />
              发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function conversationKey(deviceId: string, number: string) {
  return `${deviceId || "default"}::${(number || "unknown").trim()}`
}

function smsKey(sms: SmsItem) {
  return `${sms.device_id || "default"}:${sms.id}:${sms.timestamp}`
}

function messageTime(timestamp: string) {
  if (!timestamp) return 0
  const parsed = Date.parse(timestamp.replace(/\//g, "-"))
  return Number.isNaN(parsed) ? 0 : parsed
}

function shortTime(timestamp: string) {
  if (!timestamp) return "新建"
  const parts = timestamp.split(/\s+/)
  return parts[1]?.slice(0, 5) || parts[0] || "--"
}

function ConversationListSkeleton({ searchText }: { searchText: string }) {
  return (
    <div className="space-y-3 p-1">
      <div className="rounded-2xl border border-dashed border-white/70 bg-white/36 px-4 py-5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
        {searchText ? "没有匹配的短信会话。" : "暂无短信，会话会在收到或发送短信后自动出现。"}
      </div>
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-2xl border border-white/55 bg-white/34 px-3 py-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-slate-200/80 dark:bg-slate-800" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-24 rounded-full bg-slate-200/80 dark:bg-slate-800" />
              <div className="h-3 w-32 rounded-full bg-slate-100/90 dark:bg-slate-800/70" />
              <div className="h-3 w-full rounded-full bg-slate-100/90 dark:bg-slate-800/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyConversationHeader() {
  return (
    <div className="min-w-0">
      <div className="h-5 w-28 rounded-full bg-slate-200/80 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-44 rounded-full bg-slate-100/90 dark:bg-slate-800/70" />
    </div>
  )
}

function EmptyConversationPane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-end gap-3 px-5 py-5">
        <div className="max-w-[72%] rounded-3xl rounded-bl-lg bg-white/52 px-4 py-3 dark:bg-white/8">
          <div className="h-3 w-40 rounded-full bg-slate-200/80 dark:bg-slate-800" />
          <div className="mt-3 h-3 w-56 rounded-full bg-slate-100/90 dark:bg-slate-800/70" />
        </div>
        <div className="ml-auto max-w-[72%] rounded-3xl rounded-br-lg bg-blue-600/18 px-4 py-3 dark:bg-blue-400/14">
          <div className="h-3 w-48 rounded-full bg-blue-200/80 dark:bg-blue-900/70" />
        </div>
      </div>
      <div className="border-t border-white/70 p-4 dark:border-white/10">
        <div className="glass-panel flex items-center justify-between rounded-3xl p-3">
          <span className="text-sm text-muted-foreground">选择会话或新建短信后开始发送。</span>
          <SendIcon className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}
