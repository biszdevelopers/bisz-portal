import { createECDH } from "node:crypto";

const required = [
  "DATABASE_URL",
  "BASIS_AUTH_ISSUER",
  "BASIS_AUTH_CLIENT_ID",
  "BASIS_AUTH_CLIENT_SECRET",
  "BASIS_AUTH_RESOURCE",
  "BASIS_AUTH_INTERNAL_URL",
  "BASIS_AUTH_RESOURCE_SECRET",
  "BASIS_PORTAL_ORIGIN",
];

function isLocalHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function checkUrl(
  label: string,
  value: string | undefined,
  problems: string[],
  production: boolean,
) {
  if (!value?.trim()) return;
  try {
    const url = new URL(value);
    if (production && url.protocol !== "https:" && !isLocalHost(url.hostname))
      problems.push(`${label} must use HTTPS`);
  } catch {
    problems.push(`${label} is not a valid URL`);
  }
}

export default defineNitroPlugin(() => {
  const production = process.env.NODE_ENV === "production";
  const problems: string[] = [];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);

  const appSecret =
    process.env.NUXT_APP_SECRET ?? process.env.NUXT_SESSION_PASSWORD;
  if (!appSecret) problems.push("missing NUXT_APP_SECRET");
  else if (appSecret.length < 32)
    problems.push("NUXT_APP_SECRET must be at least 32 characters");

  checkUrl(
    "BASIS_PORTAL_ORIGIN",
    process.env.BASIS_PORTAL_ORIGIN,
    problems,
    production,
  );
  checkUrl("BASIS_AUTH_ISSUER", process.env.BASIS_AUTH_ISSUER, problems, production);
  checkUrl(
    "BASIS_AUTH_INTERNAL_URL",
    process.env.BASIS_AUTH_INTERNAL_URL,
    problems,
    production,
  );

  if (process.env.BASIS_PORTAL_ORIGIN) {
    try {
      const url = new URL(process.env.BASIS_PORTAL_ORIGIN);
      if (url.pathname !== "/" && url.pathname !== "")
        problems.push("BASIS_PORTAL_ORIGIN must not include a path");
      if (url.search || url.hash)
        problems.push("BASIS_PORTAL_ORIGIN must not include a query or fragment");
    } catch {
      // reported by checkUrl
    }
  }

  const assetsServer = process.env.BISZ_ASSETS_API_URL;
  const assetsPublic = process.env.NUXT_PUBLIC_BISZ_ASSETS_API_URL;
  checkUrl("BISZ_ASSETS_API_URL", assetsServer, problems, production);
  checkUrl(
    "NUXT_PUBLIC_BISZ_ASSETS_API_URL",
    assetsPublic,
    problems,
    production,
  );
  if (Boolean(assetsServer?.trim()) !== Boolean(assetsPublic?.trim()))
    problems.push(
      "BISZ_ASSETS_API_URL and NUXT_PUBLIC_BISZ_ASSETS_API_URL must be set together",
    );

  const publicKey = process.env.NUXT_VAPID_PUBLIC_KEY;
  const privateKey = process.env.NUXT_VAPID_PRIVATE_KEY;
  if (Boolean(publicKey) !== Boolean(privateKey))
    problems.push(
      "NUXT_VAPID_PUBLIC_KEY and NUXT_VAPID_PRIVATE_KEY must be set together",
    );
  const publicBytes = publicKey ? Buffer.from(publicKey, "base64url") : null;
  const privateBytes = privateKey ? Buffer.from(privateKey, "base64url") : null;
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
  if (publicKey && !process.env.NUXT_VAPID_SUBJECT?.trim())
    problems.push("NUXT_VAPID_SUBJECT is required when push is configured");
  if (process.env.NUXT_PUBLIC_PUSH_ENABLED === "true" && !publicKey)
    problems.push("NUXT_PUBLIC_PUSH_ENABLED requires VAPID keys");
  if (
    process.env.NUXT_PUSH_TOKEN_KEY &&
    Buffer.from(process.env.NUXT_PUSH_TOKEN_KEY, "base64").length !== 32
  ) {
    problems.push("NUXT_PUSH_TOKEN_KEY must encode 32 bytes");
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
