import { z } from "zod";
import { basisInternalFetch } from "~/server/utils/basis-internal";

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

const POSITIVE_TTL_MS = 5 * 60_000;
const NEGATIVE_TTL_MS = 30_000;
const MAX_ENTRIES = 2_000;
const MAX_PARALLEL_LOOKUPS = 6;

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
    const response = await basisInternalFetch(
      `/users/${encodeURIComponent(userId)}`,
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
  const entries = new Map<string, BasisUserView | null>();
  const queue = [...unique];

  // Auth has no batch endpoint yet. Cap parallel lookups so a large task page
  // does not open hundreds of internal requests at once.
  const workers = Array.from(
    { length: Math.min(MAX_PARALLEL_LOOKUPS, queue.length) },
    async () => {
      while (queue.length) {
        const userId = queue.shift();
        if (!userId) break;
        try {
          entries.set(userId, await findBasisUser(userId));
        } catch {
          entries.set(userId, null);
        }
      }
    },
  );
  await Promise.all(workers);
  return entries;
}

export function clearBasisUserCache() {
  cache.clear();
  inFlight.clear();
}
