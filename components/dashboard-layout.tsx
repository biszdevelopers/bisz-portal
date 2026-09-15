"use client"

import type { ReactNode } from "react"
import Link, { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  ShieldAlert,
  UsersRound,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Incidents", href: "/incidents", icon: ShieldAlert, badge: "3" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Groups", href: "/groups", icon: UsersRound },
]

function NavigationProgress() {
  const { pending } = useLinkStatus()

  return (
    <span
      className={cn("navigation-progress", pending && "is-pending")}
      aria-hidden="true"
    />
  )
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-[#f7f7f4] text-foreground">
      <aside
        className="sticky top-0 flex h-screen w-20 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-4"
        aria-label="Primary navigation"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href="/"
                prefetch={false}
                aria-label="DevClub Portal"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              />
            }
          >
            B
            <NavigationProgress />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>DevClub Portal</TooltipContent>
        </Tooltip>

        <nav className="mt-7 flex min-h-0 w-full flex-1 flex-col items-center" aria-label="Workspace">
          {navigation.map((item, index) => {
            const Icon = item.icon
            const isActive = pathname === item.href

            return (
              <div
                key={item.href}
                className={cn(
                  "flex w-full flex-col items-center",
                  index === 1 ? "mt-5 border-t border-sidebar-border pt-5" : index > 1 && "mt-1"
                )}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        href={item.href}
                        prefetch={false}
                        className={cn(
                          buttonVariants({ variant: isActive ? "default" : "ghost", size: "icon" }),
                          "relative",
                          !isActive && "text-sidebar-foreground/75"
                        )}
                        aria-label={item.label}
                        aria-current={isActive ? "page" : undefined}
                      />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <NavigationProgress />
                    {item.badge && (
                      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive ring-2 ring-sidebar" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {item.label}{item.badge ? ` · ${item.badge} open` : ""}
                  </TooltipContent>
                </Tooltip>
              </div>
            )
          })}
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

      <main className="min-w-0 flex-1 px-5 py-5 sm:px-8 sm:py-7 lg:px-10">
        {children}
      </main>
    </div>
  )
}
