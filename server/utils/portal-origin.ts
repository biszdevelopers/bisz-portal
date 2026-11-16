const fallbackOrigin = "http://localhost:4005";

export function portalOriginUrl(): URL {
  try {
    return new URL(process.env.BASIS_PORTAL_ORIGIN ?? fallbackOrigin);
  } catch {
    return new URL(fallbackOrigin);
  }
}

/** Full public origin, including any base path, without a trailing slash. */
export function portalOrigin() {
  return portalOriginUrl().href.replace(/\/$/, "");
}

/** Browser origin (scheme + host + port) used for CSRF, CSP, and cookie checks. */
export function portalRequestOrigin() {
  return portalOriginUrl().origin;
}
