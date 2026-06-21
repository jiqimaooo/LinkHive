import type { ReactNode } from "react"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="size-5" />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </CardHeader>
    </Card>
  )
}
