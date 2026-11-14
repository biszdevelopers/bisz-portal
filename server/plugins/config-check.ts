import { createECDH } from "node:crypto";

const required = [
  "DATABASE_URL",
  "BASIS_AUTH_ISSUER",
  "BASIS_AUTH_CLIENT_ID",
  "BASIS_AUTH_CLIENT_SECRET",
  "BASIS_AUTH_RESOURCE",
  "BASIS_AUTH_INTERNAL_URL",
  "BASIS_AUTH_INTERNAL_TOKEN",
  "BASIS_PORTAL_ORIGIN",
];

export default defineNitroPlugin(() => {
  const production = process.env.NODE_ENV === "production";
  const missing = required.filter((name) => !process.env[name]?.trim());
  const problems: string[] = [];

  if (missing.length) problems.push(`missing ${missing.join(", ")}`);
  const appSecret =
    process.env.NUXT_APP_SECRET ?? process.env.NUXT_SESSION_PASSWORD;
  if (!appSecret) problems.push("missing NUXT_APP_SECRET");
  else if (appSecret.length < 32)
    problems.push("NUXT_APP_SECRET must be at least 32 characters");
  if (process.env.BASIS_PORTAL_ORIGIN) {
    try {
      const url = new URL(process.env.BASIS_PORTAL_ORIGIN);
      const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if (production && url.protocol !== "https:" && !local)
        problems.push("BASIS_PORTAL_ORIGIN must use HTTPS");
    } catch {
      problems.push("BASIS_PORTAL_ORIGIN is not a valid URL");
    }
  }

  const publicKey = process.env.NUXT_VAPID_PUBLIC_KEY;
  const privateKey = process.env.NUXT_VAPID_PRIVATE_KEY;
  if (Boolean(publicKey) !== Boolean(privateKey))
    problems.push("NUXT_VAPID_PUBLIC_KEY and NUXT_VAPID_PRIVATE_KEY must be set together");
  const publicBytes = publicKey
    ? Buffer.from(publicKey, "base64url")
    : null;
  const privateBytes = privateKey
    ? Buffer.from(privateKey, "base64url")
    : null;
  if (publicBytes && publicBytes.length !== 65)
    problems.push("NUXT_VAPID_PUBLIC_KEY must be an uncompressed P-256 key");
  if (privateBytes && privateBytes.length !== 32)
    problems.push("NUXT_VAPID_PRIVATE_KEY must be 32 bytes");
  if (publicBytes?.length === 65 && privateBytes?.length === 32) {
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(privateBytes);
      if (!ecdh.getPublicKey().equals(publicBytes))
        problems.push("NUXT_VAPID_PUBLIC_KEY does not match the private key");
    } catch {
      problems.push("NUXT_VAPID keys are not a valid P-256 pair");
    }
  }
  if (
    process.env.BASIS_ASSETS_TOKEN_KEY &&
    Buffer.from(process.env.BASIS_ASSETS_TOKEN_KEY, "base64").length !== 32
  ) {
    problems.push("BASIS_ASSETS_TOKEN_KEY must encode 32 bytes");
  }

  if (!problems.length) return;
  const message = `Portal configuration problems: ${problems.join("; ")}`;
  if (production) throw new Error(message);
  console.warn(message);
});
