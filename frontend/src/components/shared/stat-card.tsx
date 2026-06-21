import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  badgeVariant,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  trend?: { value: number; label: string }
  badgeVariant?: "default" | "secondary" | "destructive" | "outline"
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-background/70 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        {badgeVariant ? <Badge variant={badgeVariant}>{value}</Badge> : null}
      </div>
      {!badgeVariant ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">{value}</span>
          {trend ? (
            <span className={cn(
              "text-xs font-medium",
              trend.value >= 0 ? "text-emerald-600" : "text-rose-600",
            )}>
              {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
            </span>
          ) : null}
        </div>
      ) : null}
      {hint ? (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{hint}</p>
      ) : null}
    </div>
  )
}
