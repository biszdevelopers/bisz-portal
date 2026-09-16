export const BASIS_PORTAL_SCOPE = "bisz-portal.access"

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
