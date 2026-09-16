"use client"

import { useEffect, useState } from "react"

type User = {
  id: string
  name: string | null
  email: string | null
}

type ApiState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: User }

export function CurrentUser() {
  const [state, setState] = useState<ApiState>({ status: "loading" })

  useEffect(() => {
    const controller = new AbortController()

    async function loadUser() {
      try {
        const response = await fetch("/api/me", { signal: controller.signal })
        const body = (await response.json()) as {
          user?: User
          error_description?: string
        }

        if (!response.ok || !body.user) {
          setState({ status: "error", message: body.error_description ?? "Unable to load the current user" })
          return
        }

        setState({ status: "ready", user: body.user })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        setState({ status: "error", message: "Unable to load the current user" })
      }
    }

    void loadUser()
    return () => controller.abort()
  }, [])

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading your Basis profile…</p>
  }

  if (state.status === "error") {
    return <p className="text-sm text-destructive">{state.message}. Sign in again if your session expired.</p>
  }

  return (
    <>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Current signed-in user</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Hello, {state.user.name ?? "User"}</h1>
      </div>
      <dl className="grid max-w-xl gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">User ID</dt>
          <dd className="mt-1 break-all text-sm font-medium">{state.user.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</dt>
          <dd className="mt-1 break-all text-sm font-medium">{state.user.email ?? "Not provided"}</dd>
        </div>
      </dl>
    </>
  )
}
