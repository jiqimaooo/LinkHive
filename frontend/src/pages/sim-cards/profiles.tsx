import { CardSimIcon, BadgeCheckIcon, ChevronDownIcon, ArrowRightIcon, SendIcon, LoaderCircleIcon } from "lucide-react"
import { useAppContext } from "@/hooks/app-context"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export default function ProfilesPage() {
  const { status, isLoadingStatus, esimEnabled, profileSmscForms, setProfileSmscForms, expandedProfileIccid, setExpandedProfileIccid, saveProfileSmsc, runAction, actionBusy, activeAction, profileSmscDirtyRef } = useAppContext()
  const profiles = status?.profiles ?? []
  const profileCountLabel = esimEnabled ? `${profiles.length} 个` : "已禁用"

  return (
    <div className="space-y-4">
      <PageHeader title="eSIM Profiles" description={esimEnabled ? "管理 eSIM Profiles 和短信中心配置。" : "当前为普通 SIM 模式，eSIM 管理功能已禁用。"} actions={<Badge variant="outline" className="h-8">{profileCountLabel}</Badge>} />

      <Card className="border-slate-200 bg-white h-[calc(100vh-16rem)] flex flex-col">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CardSimIcon className="size-4" />Profiles</CardTitle></CardHeader>
        <CardContent className="flex-1 min-h-0 pb-4">
          <ScrollArea className="h-full rounded-xl border">
            <div className="flex flex-col gap-3 p-3">
              {isLoadingStatus ? <EmptyState icon={LoaderCircleIcon} title="正在读取设备状态" description="首次加载会顺带读取 eSIM、短信和基带信息。" spinning />
              : !esimEnabled ? <EmptyState icon={CardSimIcon} title="普通 SIM 模式" description="此模式只保留短信转发、基带状态和网络设置，eSIM Profiles 与切卡功能已禁用。" />
              : profiles.length ? profiles.map((profile) => {
                  const isCurrent = Boolean(profile.is_active)
                  const isSwitching = activeAction?.action === "switch_profile" && activeAction.target === profile.iccid
                  const isExpanded = expandedProfileIccid === profile.iccid
                  const smscForm = profileSmscForms[profile.iccid] ?? { address: profile.smsc_address || "", type: profile.smsc_type || "145" }
                  const isGiffgaff = `${profile.display_name} ${profile.provider_name || ""}`.toLowerCase().includes("giffgaff")
                  return (
                    <div key={profile.iccid} className={cn("rounded-2xl border p-4 shadow-sm transition-colors", isCurrent ? "border-sky-300 bg-sky-50/80" : "border-border/70 bg-white/90")}>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2"><h3 className="text-base font-medium">{profile.display_name}</h3>{isCurrent ? <Badge><BadgeCheckIcon data-icon="inline-start" />当前使用</Badge> : <Badge variant="outline">待机</Badge>}</div>
                            <p className="text-sm text-muted-foreground">手机号：{isCurrent ? status?.modem.number || "--" : "--"}</p>
                            <p className="text-sm text-muted-foreground">短信中心：{profile.smsc_address ? `${profile.smsc_address},${profile.smsc_type || "145"}` : "未配置"}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setExpandedProfileIccid(isExpanded ? null : profile.iccid)}><ChevronDownIcon data-icon="inline-start" className={cn("transition-transform", isExpanded && "rotate-180")} />{isExpanded ? "收起设置" : "展开设置"}</Button>
                            <Button type="button" size="sm" variant={isCurrent ? "secondary" : "default"} disabled={actionBusy || isCurrent} onClick={() => { void runAction("switch_profile", { iccid: profile.iccid }, `切换到 ${profile.display_name}`) }}>{isSwitching ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <ArrowRightIcon data-icon="inline-start" />}{isCurrent ? "当前使用中" : "切换到此卡"}</Button>
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><span>ICCID：{profile.iccid || "--"}</span><span>状态：{profile.state || (isCurrent ? "enabled" : "--")}</span></div>
                        {isExpanded ? (
                          <div className="rounded-2xl border bg-background/70 p-3">
                            <div className="mb-3 flex flex-col gap-1"><h4 className="text-sm font-medium">短信中心配置</h4><p className="text-sm text-muted-foreground">绑定 SMSC，切换卡后自动重新应用。</p></div>
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem]">
                              <div className="grid gap-2"><Label htmlFor={`sa-${profile.iccid}`}>SMSC 号码</Label><Input id={`sa-${profile.iccid}`} value={smscForm.address} onChange={(e) => { profileSmscDirtyRef.current = true; setProfileSmscForms((c) => ({ ...c, [profile.iccid]: { ...(c[profile.iccid] ?? { address: "", type: "145" }), address: e.target.value } })) }} placeholder={isGiffgaff ? "+447802002606" : "例如 +447802002606"} /></div>
                              <div className="grid gap-2"><Label htmlFor={`st-${profile.iccid}`}>类型</Label><Input id={`st-${profile.iccid}`} value={smscForm.type} onChange={(e) => { profileSmscDirtyRef.current = true; setProfileSmscForms((c) => ({ ...c, [profile.iccid]: { ...(c[profile.iccid] ?? { address: "", type: "145" }), type: e.target.value } })) }} placeholder="145" /></div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => { void saveProfileSmsc(profile) }}><SendIcon data-icon="inline-start" />{isCurrent ? "保存并应用" : "保存关联"}</Button>
                              {isGiffgaff ? <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => { void saveProfileSmsc(profile, { address: "+447802002606", type: "145" }) }}>套用 giffgaff SMSC</Button> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                }) : <EmptyState icon={CardSimIcon} title="还没有读到 Profile" description="检查 lpac-switch 是否可用，或者先点一次刷新状态。" />}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
