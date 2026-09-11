"use client"

import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LayoutDashboard,
  ListTodo,
  Search,
  ShieldAlert,
  UsersRound,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const navigation = [
  { label: "Tasks", icon: ListTodo },
  { label: "Incidents", icon: ShieldAlert, badge: "3" },
  { label: "Calendar", icon: CalendarDays },
  { label: "Groups", icon: UsersRound },
]

const metrics = [
  { label: "Open tasks", value: "24", detail: "+4 this week", icon: ListTodo },
  { label: "Active incidents", value: "3", detail: "1 needs review", icon: CircleAlert },
  { label: "Team availability", value: "86%", detail: "18 of 21 online", icon: UsersRound },
]

const activity = [
  { title: "Incident INC-204 resolved", meta: "Infrastructure · 12 min ago", tone: "success" },
  { title: "Design review moved to 3:00 PM", meta: "Product Design · 46 min ago", tone: "neutral" },
  { title: "New task assigned to you", meta: "Operations · 1 hr ago", tone: "neutral" },
]

export function DashboardShell() {
  return (
    <div className="flex min-h-screen bg-[#f7f7f4] text-foreground">
      <aside
        className="sticky top-0 flex h-screen w-[88px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar px-3 py-4"
        aria-label="Primary navigation"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href="#overview"
                aria-label="Basis Portal"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              />
            }
          >
            B
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>Basis Portal</TooltipContent>
        </Tooltip>

        <nav className="mt-7 flex min-h-0 w-full flex-1 flex-col items-center" aria-label="Workspace">
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href="#overview"
                  className={buttonVariants({ size: "icon" })}
                  aria-label="Overview"
                  aria-current="page"
                />
              }
            >
              <LayoutDashboard aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>Overview</TooltipContent>
          </Tooltip>

          <div className="my-5 h-px w-full shrink-0 bg-sidebar-border" />
          <div className="flex flex-col gap-1">
            {navigation.map((item) => {
              const Icon = item.icon

              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger
                    render={
                      <a
                        href={`#${item.label.toLowerCase()}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative text-sidebar-foreground/75")}
                        aria-label={item.label}
                      />
                    }
                  >
                    <Icon aria-hidden="true" />
                    {item.badge && (
                      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive ring-2 ring-sidebar" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {item.label}{item.badge ? ` · ${item.badge} open` : ""}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </nav>

        <div className="w-full shrink-0 border-t border-sidebar-border pt-3 text-center">
          <Tooltip>
            <TooltipTrigger className="mx-auto flex size-9 items-center justify-center rounded-full bg-[#dfe8d8] text-xs font-semibold text-[#34422d] outline-none transition-shadow hover:ring-2 hover:ring-sidebar-ring/30 focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              AM
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              <span className="font-medium">Alex Morgan</span>
              <span className="text-background/65">Workspace admin</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <main id="overview" className="min-w-0 flex-1 px-5 py-5 sm:px-8 sm:py-7 lg:px-10">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Friday, September 11</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Good morning, Alex</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Search">
              <Search aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Notifications" className="relative">
              <Bell aria-hidden="true" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive ring-2 ring-background" />
            </Button>
            <Button className="hidden sm:inline-flex">
              Create task
              <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="mx-auto mt-9 max-w-6xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
              <p className="mt-1 text-sm text-muted-foreground">A quick look at your workspace today.</p>
            </div>
            <button className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Last 7 days
            </button>
          </div>

          <section className="grid gap-4 md:grid-cols-3" aria-label="Workspace metrics">
            {metrics.map((metric) => {
              const Icon = metric.icon

              return (
                <article key={metric.label} className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{metric.label}</p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
                    </div>
                    <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-5 text-xs font-medium text-muted-foreground">{metric.detail}</p>
                </article>
              )
            })}
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <article className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold tracking-tight">Recent activity</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Updates from across your workspace.</p>
                </div>
                <Button variant="ghost" size="sm">View all</Button>
              </div>
              <div className="mt-5 divide-y">
                {activity.map((item) => (
                  <div key={item.title} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        item.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {item.tone === "success" ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.meta}</span>
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border bg-[#283129] p-5 text-white shadow-sm sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-white/60">Next up</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">Weekly operations sync</h2>
                </div>
                <CalendarDays className="size-5 text-white/60" aria-hidden="true" />
              </div>
              <p className="mt-8 text-sm text-white/70">Today · 10:30–11:15 AM</p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <div className="flex -space-x-2">
                  {["AM", "JL", "SK"].map((initials) => (
                    <span key={initials} className="flex size-8 items-center justify-center rounded-full border-2 border-[#283129] bg-[#dfe8d8] text-[10px] font-semibold text-[#34422d]">
                      {initials}
                    </span>
                  ))}
                </div>
                <Button variant="secondary" size="sm">View event</Button>
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  )
}
