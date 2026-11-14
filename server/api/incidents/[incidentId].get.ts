import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { getIncidentView } from "~/server/services/incidents";
import {
  commentAccess,
  listComments,
  resolveCommentTarget,
} from "~/server/services/comments";
import { listActivity } from "~/server/services/activity";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Incidents.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const incidentId = getRouterParam(event, "incidentId") ?? "";
  const incident = await getIncidentView(auth, incidentId);
  if (!incident)
    return apiResult(
      event,
      new APIError("not_found", "Incident not found", 404, "not_found"),
    );

  const target = await resolveCommentTarget({ incidentId });
  const commentsPage = target
    ? await listComments(
        auth,
        target,
        await commentAccess(auth, target),
        { limit: 20 },
      )
    : { comments: [], nextCursor: null };
  const activityPage = await listActivity({
    projectIds: [incident.projectId],
    incidentId,
    limit: 30,
  });

  return apiResult(
    event,
    new APIResponse({
      incident: {
        ...incident,
        comments: commentsPage.comments,
        activity: activityPage.activity,
      },
      commentsNextCursor: commentsPage.nextCursor,
      activityNextCursor: activityPage.nextCursor,
    }),
  );
});
