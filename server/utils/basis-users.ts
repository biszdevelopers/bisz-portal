import { z } from "zod";

const responseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string().nullable(),
    disabled: z.boolean(),
    hasPicture: z.boolean(),
  }),
});

export type BasisUserView = {
  id: string;
  displayName: string;
  image: string | null;
};

const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 30_000;
const MAX_ENTRIES = 500;

type CacheEntry = {
  value: BasisUserView | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<BasisUserView | null>>();

function cached(userId: string) {
  const entry = cache.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    return undefined;
  }
  return entry.value;
}

function store(userId: string, value: BasisUserView | null) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(userId, {
    value,
    expiresAt: Date.now() + (value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
  });
}

export async function findBasisUser(
  userId: string,
): Promise<BasisUserView | null> {
  const hit = cached(userId);
  if (hit !== undefined) return hit;

  const pending = inFlight.get(userId);
  if (pending) return await pending;

  const request = (async () => {
    const baseUrl = process.env.BASIS_AUTH_INTERNAL_URL;
    const token = process.env.BASIS_AUTH_INTERNAL_TOKEN;
    if (!baseUrl || !token)
      throw new Error(
        "BASIS_AUTH_INTERNAL_URL and BASIS_AUTH_INTERNAL_TOKEN are required",
      );

    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/internal/users/${encodeURIComponent(userId)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (response.status === 404) {
      store(userId, null);
      return null;
    }
    if (!response.ok)
      throw new Error(
        `Basis Auth user validation failed with status ${response.status}`,
      );
    const { user } = responseSchema.parse(await response.json());
    if (user.disabled) {
      store(userId, null);
      return null;
    }
    const view = {
      id: user.id,
      displayName: user.displayName?.trim() || "Basis user",
      image: user.hasPicture
        ? `${process.env.BASIS_AUTH_ISSUER?.replace(/\/$/, "")}/api/picture/${user.id}`
        : null,
    };
    store(userId, view);
    return view;
  })().finally(() => {
    inFlight.delete(userId);
  });

  inFlight.set(userId, request);
  return await request;
}

export async function findBasisUsers(userIds: string[]) {
  const unique = [...new Set(userIds)];
  const entries = await Promise.all(
    unique.map(async (userId) => {
      try {
        return [userId, await findBasisUser(userId)] as const;
      } catch {
        return [userId, null] as const;
      }
    }),
  );
  return new Map(entries);
}

export function clearBasisUserCache() {
  cache.clear();
  inFlight.clear();
}
