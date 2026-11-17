import { describe, expect, test } from "bun:test";
import {
  encryptPushBytes,
  validatePushEndpoint,
} from "../server/utils/web-push";

const uaPublic =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const authSecret = "BTBZMqHH6r4Tts7J_aSIgg";
const ephemeralPrivate = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const salt = "DGv6ra1nlYgDCS1FRnbzlw";
const expected =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

describe("Web Push encryption", () => {
  test("matches RFC 8291 Appendix A", () => {
    const result = encryptPushBytes(
      Buffer.from("When I grow up, I want to be a watermelon", "utf8"),
      { p256dh: uaPublic, auth: authSecret },
      {
        salt: Buffer.from(salt, "base64url"),
        ephemeralPrivateKey: Buffer.from(ephemeralPrivate, "base64url"),
      },
    );
    expect(result.body.toString("base64url")).toBe(expected);
  });
});

describe("push endpoint allowlist", () => {
  test("accepts known browser push services", () => {
    expect(validatePushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(
      true,
    );
    expect(
      validatePushEndpoint(
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
      ),
    ).toBe(true);
    expect(validatePushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(
      validatePushEndpoint("https://wns2-abc.notify.windows.com/w/?token=1"),
    ).toBe(true);
  });

  test("rejects SSRF and non-HTTPS endpoints", () => {
    expect(validatePushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(validatePushEndpoint("https://127.0.0.1/x")).toBe(false);
    expect(validatePushEndpoint("https://evil.example/x")).toBe(false);
    expect(validatePushEndpoint("https://user:pass@fcm.googleapis.com/x")).toBe(
      false,
    );
    expect(validatePushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(
      false,
    );
  });
});
