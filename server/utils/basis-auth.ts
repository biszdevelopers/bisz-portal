import { portalOrigin } from "~/server/utils/portal-origin";

export const BASIS_PORTAL_SCOPE = "noesis.access";
export const BASIS_PORTAL_AUTHORIZATION_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  BASIS_PORTAL_SCOPE,
] as const;

export function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function basisAuthIssuer() {
  return requiredEnvironment("BASIS_AUTH_ISSUER").replace(/\/$/, "");
}

export function basisPortalAudience() {
  return requiredEnvironment("BASIS_AUTH_RESOURCE");
}

export function basisPortalOrigin() {
  return portalOrigin();
}
