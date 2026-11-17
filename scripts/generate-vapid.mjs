import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const uncompressed = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(publicJwk.x, "base64url"),
  Buffer.from(publicJwk.y, "base64url"),
]);
const privateBytes = Buffer.from(privateJwk.d, "base64url");

if (uncompressed.length !== 65 || privateBytes.length !== 32) {
  throw new Error("Unexpected VAPID key sizes");
}

console.log("Add these values to your environment (keep the private key secret):\n");
console.log(`NUXT_VAPID_PUBLIC_KEY=${uncompressed.toString("base64url")}`);
console.log(`NUXT_VAPID_PRIVATE_KEY=${privateBytes.toString("base64url")}`);
console.log("NUXT_VAPID_SUBJECT=mailto:operations@example.com");
