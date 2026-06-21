import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  spinning = false,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  spinning?: boolean
  className?: string
}) {
  return (
    <div className={cn(
      "flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-white/80 px-6 text-center",
      className,
    )}>
      <Icon className={cn("size-8 text-muted-foreground", spinning && "animate-spin")} />
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
