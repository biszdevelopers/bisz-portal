export type KeysetCursor = {
  createdAt: Date;
  id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ t: createdAt.toISOString(), i: id }),
    "utf8",
  ).toString("base64url");
}

export function decodeCursor(value?: string | null): KeysetCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string")
      return null;
    if (!UUID_PATTERN.test(parsed.i)) return null;
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}
