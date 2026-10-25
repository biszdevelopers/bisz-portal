import { describe, expect, test } from "bun:test";
import {
  BASIS_PORTAL_AUTHORIZATION_SCOPES,
  BASIS_PORTAL_SCOPE,
} from "../server/utils/basis-auth";
import {
  AssetsIdentityMismatchError,
  requireMatchingAssetsUser,
} from "../server/utils/assets-auth";

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

describe("Assets authorization identity", () => {
  test("accepts the same user as the active portal session", () => {
    expect(() => requireMatchingAssetsUser("user-1", "user-1")).not.toThrow();
  });

  test("rejects a code exchanged for a different or missing user", () => {
    expect(() => requireMatchingAssetsUser("user-2", "user-1"))
      .toThrow(AssetsIdentityMismatchError);
    expect(() => requireMatchingAssetsUser(undefined, "user-1"))
      .toThrow(AssetsIdentityMismatchError);
  });
});
