import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)} style={{ minHeight: 56 }}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <h1 className="text-xl font-semibold leading-7 text-foreground">{title}</h1>
        {description ? <p className="text-sm font-normal leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3 shrink-0">{actions}</div> : null}
    </div>
  )
}
