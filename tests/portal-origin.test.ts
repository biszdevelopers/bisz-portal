import { afterEach, describe, expect, test } from "bun:test";
import {
  portalOrigin,
  portalOriginUrl,
  portalRequestOrigin,
} from "../server/utils/portal-origin";

const original = process.env.BASIS_PORTAL_ORIGIN;

afterEach(() => {
  if (original === undefined) delete process.env.BASIS_PORTAL_ORIGIN;
  else process.env.BASIS_PORTAL_ORIGIN = original;
});

describe("portal origin", () => {
  test("falls back to the local origin", () => {
    delete process.env.BASIS_PORTAL_ORIGIN;
    expect(portalOriginUrl().origin).toBe("http://localhost:4005");
    expect(portalOrigin()).toBe("http://localhost:4005");
  });

  test("normalizes trailing slashes and ignores paths in request origin", () => {
    process.env.BASIS_PORTAL_ORIGIN = "https://portal.example/workspace/";
    expect(portalOrigin()).toBe("https://portal.example/workspace");
    expect(portalRequestOrigin()).toBe("https://portal.example");
  });

  test("keeps the port", () => {
    process.env.BASIS_PORTAL_ORIGIN = "https://portal.example:8443";
    expect(portalRequestOrigin()).toBe("https://portal.example:8443");
  });
});
