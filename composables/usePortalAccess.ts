import type { PortalCapabilities } from "~/shared/permissions"
import { emptyPortalCapabilities } from "~/shared/permissions"

type MeResponse = {
  user: { id: string, name: string | null, image: string | null }
  capabilities: PortalCapabilities
  status: number
}

export function usePortalAccess() {
  const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined
  const request = useFetch<MeResponse>("/api/me", { key: "portal-me", headers })
  return {
    ...request,
    capabilities: computed(() => request.data.value?.capabilities ?? emptyPortalCapabilities),
  }
}
