export const BASIS_PORTAL_SCOPE = "noesis.access"

export function requiredEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function basisAuthIssuer() {
  return requiredEnvironment("BASIS_AUTH_ISSUER").replace(/\/$/, "")
}

export function basisPortalAudience() {
  return requiredEnvironment("BASIS_AUTH_RESOURCE")
}

export function basisPortalOrigin() {
  return (process.env.BASIS_PORTAL_ORIGIN ?? "http://localhost:4005").replace(/\/$/, "")
}
