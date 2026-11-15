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

export async function findBasisUser(
  userId: string,
): Promise<BasisUserView | null> {
  const response = await basisInternalFetch(`/users/${encodeURIComponent(userId)}`);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `Basis Auth user validation failed with status ${response.status}`,
    );
  const { user } = responseSchema.parse(await response.json());
  if (user.disabled) return null;
  return {
    id: user.id,
    displayName: user.displayName?.trim() || "Basis user",
    image: user.hasPicture
      ? `${process.env.BASIS_AUTH_ISSUER?.replace(/\/$/, "")}/api/picture/${user.id}`
      : null,
  };
}

export async function findBasisUsers(userIds: string[]) {
  const entries = await Promise.all(
    [...new Set(userIds)].map(async (userId) => {
      try {
        return [userId, await findBasisUser(userId)] as const;
      } catch {
        return [userId, null] as const;
      }
    }),
  );
  return new Map(entries);
}
