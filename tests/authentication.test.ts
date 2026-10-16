import { describe, expect, test } from "bun:test";
import {
  BASIS_PORTAL_AUTHORIZATION_SCOPES,
  BASIS_PORTAL_SCOPE,
} from "../server/utils/basis-auth";

describe("portal authorization request", () => {
  test("requests identity, offline access, and the portal resource scope", () => {
    expect(BASIS_PORTAL_AUTHORIZATION_SCOPES).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      BASIS_PORTAL_SCOPE,
    ]);
  });
});
