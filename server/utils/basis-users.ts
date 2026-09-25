import { z } from "zod"

const responseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string().nullable(),
    disabled: z.boolean(),
    hasPicture: z.boolean(),
  }),
})

export type BasisUserView = { id: string, displayName: string, image: string | null }

export async function findBasisUser(userId: string): Promise<BasisUserView | null> {
  const baseUrl = process.env.BASIS_AUTH_INTERNAL_URL
  const token = process.env.BASIS_AUTH_INTERNAL_TOKEN
  if (!baseUrl || !token) throw new Error("BASIS_AUTH_INTERNAL_URL and BASIS_AUTH_INTERNAL_TOKEN are required")

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/users/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Basis Auth user validation failed with status ${response.status}`)
  const { user } = responseSchema.parse(await response.json())
  if (user.disabled) return null
  return {
    id: user.id,
    displayName: user.displayName?.trim() || "Basis user",
    image: user.hasPicture ? `${process.env.BASIS_AUTH_ISSUER?.replace(/\/$/, "")}/api/picture/${user.id}` : null,
  }
}
