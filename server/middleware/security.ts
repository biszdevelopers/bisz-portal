import { randomBytes } from "node:crypto";
import { getHeader, setResponseHeaders } from "h3";
import { isCsrfExemptPath, isSameOriginRequest } from "~/server/utils/csrf";
import { portalRequestOrigin } from "~/server/utils/portal-origin";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function safeOrigin(value: string | undefined, fallback: string) {
  try {
    return new URL(value ?? fallback).origin;
  } catch {
    return fallback;
  }
}

export default defineEventHandler((event) => {
  const path = event.path;
  const method = event.method.toUpperCase();
  const origin = getHeader(event, "origin");
  const fetchSite = getHeader(event, "sec-fetch-site");
  const portalOrigin = portalRequestOrigin();

  if (
    path.startsWith("/api/") &&
    unsafeMethods.has(method) &&
    !isCsrfExemptPath(path)
  ) {
    const sameOrigin = isSameOriginRequest({
      origin,
      fetchSite,
      portalOrigin,
    });
    if (!sameOrigin) {
      setResponseStatus(event, 403);
      return {
        status: 403,
        code: "forbidden",
        error: "forbidden",
        error_description: "Cross-origin changes are not allowed",
      };
    }
  }

  const nonce = randomBytes(16).toString("base64");
  (event.context as Record<string, unknown>).cspNonce = nonce;
  const assetsOrigin = safeOrigin(
    process.env.NUXT_PUBLIC_BISZ_ASSETS_API_URL,
    "http://localhost:5000",
  );
  const authOrigin = safeOrigin(process.env.BASIS_AUTH_ISSUER, portalOrigin);
  const https = portalOrigin.startsWith("https://");

  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), notifications=(self), payment=(), usb=()",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (path.startsWith("/api/")) headers["Cache-Control"] = "no-store";
  if (https)
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains";

  if (process.env.NODE_ENV === "production") {
    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https: ${authOrigin} ${assetsOrigin}`,
      "font-src 'self'",
      `connect-src 'self' ${assetsOrigin}`,
      `media-src 'self' blob: ${assetsOrigin}`,
      `frame-src 'self' blob: ${assetsOrigin}`,
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
  }

  setResponseHeaders(event, headers);
});
