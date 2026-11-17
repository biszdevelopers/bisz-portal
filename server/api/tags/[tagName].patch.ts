import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { tagColorSchema, tagNameSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { tags, taskTags } from "~/server/database/schema";

const schema = z
  .object({
    name: tagNameSchema.optional(),
    color: tagColorSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one tag field is required",
  );

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tags.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const current = decodeURIComponent(getRouterParam(event, "tagName") ?? "");
  const body = await parseBody(event, schema);
  if (body instanceof APIError) return apiResult(event, body);
  if (body.name && body.name !== current) {
    const deleteAccess = await requirePortalPermission(
      event,
      PortalPermissions.BiszPortal.Tags.delete,
    );
    if (deleteAccess instanceof APIError) return apiResult(event, deleteAccess);
  }

  const db = useDatabase();
  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, current))
    .limit(1);
  if (!existing)
    return apiResult(
      event,
      new APIError("not_found", "Tag not found", 404, "not_found"),
    );

  if (body.name && body.name !== current) {
    const [conflict] = await db
      .select({ name: tags.name })
      .from(tags)
      .where(eq(tags.name, body.name))
      .limit(1);
    if (conflict)
      return apiResult(
        event,
        new APIError("tag_exists", "That tag already exists", 409, "tag_exists"),
      );
    await db.transaction(async (transaction) => {
      await transaction.insert(tags).values({
        name: body.name!,
        color: body.color ?? existing.color,
        creatorId: auth.user.id,
      });
      await transaction
        .update(taskTags)
        .set({ tagName: body.name! })
        .where(eq(taskTags.tagName, current));
      await transaction.delete(tags).where(eq(tags.name, current));
    });
    return apiResult(
      event,
      new APIResponse({
        tag: { name: body.name, color: body.color ?? existing.color },
      }),
    );
  }

  if (body.color) {
    await db
      .update(tags)
      .set({ color: body.color })
      .where(eq(tags.name, current));
  }
  return apiResult(
    event,
    new APIResponse({
      tag: { name: current, color: body.color ?? existing.color },
    }),
  );
});
