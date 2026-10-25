import { decodeJwt } from "jose";

const prefix = "bisz-assets-access:";

export function readAssetsBrowserToken(userId: string) {
  if (!import.meta.client) return null;
  try {
    const token = sessionStorage.getItem(`${prefix}${userId}`);
    if (!token) return null;
    const claims = decodeJwt(token);
    if (claims.sub === userId && typeof claims.exp === "number" && claims.exp * 1000 > Date.now() + 60_000)
      return token;
  } catch { /* A malformed or unavailable storage entry is not a connection. */ }
  clearAssetsBrowserToken(userId);
  return null;
}

export function saveAssetsBrowserToken(userId: string, token: string) {
  if (!import.meta.client) return;
  const claims = decodeJwt(token);
  if (claims.sub !== userId || typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now())
    throw new Error("Invalid Assets access token");
  sessionStorage.setItem(`${prefix}${userId}`, token);
}

export function clearAssetsBrowserToken(userId: string) {
  if (!import.meta.client) return;
  try { sessionStorage.removeItem(`${prefix}${userId}`); } catch { /* Storage may be disabled. */ }
}

export function clearAllAssetsBrowserTokens() {
  if (!import.meta.client) return;
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be disabled. */ }
}
