import { inArray } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import { taskMembers } from "~/server/database/schema";
import { findBasisUsers } from "~/server/utils/basis-users";
import type { TaskMemberView } from "~/shared/contracts";

export async function taskMemberViewsByTaskId(taskIds: string[]) {
  const result = new Map<string, TaskMemberView[]>();
  if (!taskIds.length) return result;

  const rows = await useDatabase()
    .select()
    .from(taskMembers)
    .where(inArray(taskMembers.taskId, taskIds));
  const users = await findBasisUsers(rows.map((row) => row.userId));
  for (const row of rows) {
    const user = users.get(row.userId);
    if (!user) continue;
    const members = result.get(row.taskId) ?? [];
    members.push({
      userId: user.id,
      displayName: user.displayName,
      image: user.image,
      role: "assignee",
    });
    result.set(row.taskId, members);
  }
  return result;
}
