import { asc, eq, inArray } from "drizzle-orm";
import { tags, taskTags } from "~/server/database/schema";
import { useDatabase } from "~/server/database/client";
import type { TagView } from "~/shared/contracts";

export async function taskTagViewsByTaskId(taskIds: string[]) {
  const result = new Map<string, TagView[]>();
  if (!taskIds.length) return result;

  const rows = await useDatabase()
    .select({ taskId: taskTags.taskId, name: tags.name, color: tags.color })
    .from(taskTags)
    .innerJoin(tags, eq(taskTags.tagName, tags.name))
    .where(inArray(taskTags.taskId, taskIds))
    .orderBy(asc(tags.name));

  for (const { taskId, name, color } of rows) {
    const values = result.get(taskId) ?? [];
    values.push({ name, color });
    result.set(taskId, values);
  }
  return result;
}
