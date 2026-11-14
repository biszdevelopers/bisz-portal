import { describe, expect, test } from "bun:test";
import { isCsrfExemptPath, isSameOriginRequest } from "../server/utils/csrf";

const portalOrigin = "https://portal.example";

describe("CSRF origin checks", () => {
  test("accepts same-origin and non-browser requests", () => {
    expect(
      isSameOriginRequest({
        origin: portalOrigin,
        fetchSite: "same-origin",
        portalOrigin,
      }),
    ).toBe(true);
    expect(
      isSameOriginRequest({
        origin: undefined,
        fetchSite: undefined,
        portalOrigin,
      }),
    ).toBe(true);
  });

  test("rejects cross-site and mismatched origins", () => {
    expect(
      isSameOriginRequest({
        origin: "https://evil.example",
        fetchSite: "cross-site",
        portalOrigin,
      }),
    ).toBe(false);
    expect(
      isSameOriginRequest({
        origin: portalOrigin,
        fetchSite: "cross-site",
        portalOrigin,
      }),
    ).toBe(false);
    expect(
      isSameOriginRequest({
        origin: "https://evil.example",
        fetchSite: "same-origin",
        portalOrigin,
      }),
    ).toBe(false);
  });

  test("exempts only OAuth callback paths", () => {
    expect(isCsrfExemptPath("/api/auth/callback/basis-auth")).toBe(true);
    expect(isCsrfExemptPath("/api/auth/callback/assets")).toBe(true);
    expect(isCsrfExemptPath("/api/auth/logout")).toBe(false);
    expect(isCsrfExemptPath("/api/tasks/bulk")).toBe(false);
  });
});
