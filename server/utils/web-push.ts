import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";

export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];

function isIpLiteral(hostname: string) {
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":") ||
    hostname.startsWith("[")
  );
}

export function validatePushEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port && url.port !== "443") return false;
  if (url.username || url.password) return false;
  if (isIpLiteral(url.hostname)) return false;
  if (url.hash) return false;
  const host = url.hostname.toLowerCase();
  return (
    PUSH_HOSTS.includes(host) ||
    host.endsWith(".notify.windows.com")
  );
}

export function decodePushKey(value: string, expectedBytes: number) {
  const buffer = Buffer.from(value, "base64url");
  if (buffer.length !== expectedBytes) return null;
  return buffer;
}

export function sealPushSecret(value: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pushTokenKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function unsealPushSecret(value: string, userId: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid push secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    pushTokenKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function pushTokenKey() {
  const explicit = useRuntimeConfig().pushTokenKey;
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== 32)
      throw new Error("NUXT_PUSH_TOKEN_KEY must encode 32 bytes");
    return key;
  }
  const password =
    process.env.NUXT_SESSION_PASSWORD ?? useRuntimeConfig().appSecret;
  if (!password) throw new Error("NUXT_APP_SECRET or NUXT_SESSION_PASSWORD is required");
  return createHash("sha256")
    .update("bisz-portal:push-subscriptions:v1\0")
    .update(password)
    .digest();
}

function vapidKeys() {
  const config = useRuntimeConfig();
  const publicKey = Buffer.from(config.vapidPublicKey, "base64url");
  const privateKey = Buffer.from(config.vapidPrivateKey, "base64url");
  if (publicKey.length !== 65)
    throw new Error("NUXT_VAPID_PUBLIC_KEY must be an uncompressed P-256 key");
  if (privateKey.length !== 32)
    throw new Error("NUXT_VAPID_PRIVATE_KEY must be a 32-byte key");
  if (!config.vapidSubject)
    throw new Error("NUXT_VAPID_SUBJECT is required");
  return {
    publicKey,
    privateKey,
    subject: config.vapidSubject,
    privateKeyObject: createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        d: privateKey.toString("base64url"),
        x: publicKey.subarray(1, 33).toString("base64url"),
        y: publicKey.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    }),
  };
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function vapidAuthorization(endpoint: string) {
  const keys = vapidKeys();
  const audience = new URL(endpoint).origin;
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: keys.subject,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: keys.privateKeyObject,
    dsaEncoding: "ieee-p1363",
  });
  const jwt = `${header}.${payload}.${base64url(signature)}`;
  return `vapid t=${jwt}, k=${keys.publicKey.toString("base64url")}`;
}

function hkdf(
  ikm: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number,
) {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

export function encryptPushPayload(
  payload: PushPayload,
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  options: { salt?: Buffer; ephemeralPrivateKey?: Buffer } = {},
) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8");
  if (encoded.length > 4096 - 128)
    throw new Error("Push payload is too large");
  return encryptPushBytes(encoded, subscription, options);
}

export function encryptPushBytes(
  content: Buffer,
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  options: { salt?: Buffer; ephemeralPrivateKey?: Buffer } = {},
) {
  const userPublic = decodePushKey(subscription.p256dh, 65);
  const authSecret = decodePushKey(subscription.auth, 16);
  if (!userPublic || !authSecret)
    throw new Error("Invalid push subscription keys");

  const salt = options.salt ?? randomBytes(16);
  let ephemeral;
  let asPublic: Buffer;
  if (options.ephemeralPrivateKey) {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(options.ephemeralPrivateKey);
    asPublic = ecdh.getPublicKey();
    ephemeral = createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        d: options.ephemeralPrivateKey.toString("base64url"),
        x: asPublic.subarray(1, 33).toString("base64url"),
        y: asPublic.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    });
  } else {
    const generated = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    ephemeral = generated.privateKey;
    const exported = createPublicKey(ephemeral).export({ format: "jwk" });
    asPublic = Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(exported.x ?? "", "base64url"),
      Buffer.from(exported.y ?? "", "base64url"),
    ]);
  }

  const sharedSecret = diffieHellman({
    privateKey: ephemeral,
    publicKey: createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: userPublic.subarray(1, 33).toString("base64url"),
        y: userPublic.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    }),
  });

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    userPublic,
    asPublic,
  ]);
  const ikm = hkdf(sharedSecret, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);

  const plaintext = Buffer.concat([content, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const idLength = Buffer.from([asPublic.length]);
  const body = Buffer.concat([
    salt,
    recordSize,
    idLength,
    asPublic,
    ciphertext,
    tag,
  ]);

  return { body, salt, cek, nonce, asPublic };
}

const PUSH_TTL_SECONDS = 3600;

export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
  urgency: "very-low" | "low" | "normal" | "high" = "normal",
) {
  const { body } = encryptPushPayload(payload, subscription);
  return await fetch(subscription.endpoint, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: urgency,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
}

export const webPushInternals = {
  hkdf,
  base64url,
  vapidKeys,
  PUSH_HOSTS,
};
