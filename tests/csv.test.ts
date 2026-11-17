import { describe, expect, test } from "bun:test";
import {
  createApp,
  createRouter,
  defineEventHandler,
  setResponseHeader,
  setResponseStatus,
  toWebHandler,
} from "h3";
import { csvCell, csvHeader, csvRow } from "../server/utils/csv";
import { portalCapabilities } from "../server/utils/authorization";
import { PortalPermissions } from "../shared/permissions";

describe("CSV export", () => {
  test("requires both read and CSV export permission on every download route", async () => {
    const { ExportCSV, Incidents, Tasks, Users } = PortalPermissions.BiszPortal;
    const autoImports = { defineEventHandler, setResponseHeader, setResponseStatus };
    const globals = globalThis as Record<string, unknown>;
    const previousGlobals = Object.fromEntries(
      Object.keys(autoImports).map((name) => [name, globals[name]]),
    );

    try {
      Object.assign(globals, autoImports);
      const routes = [
        [
          "users",
          Users.read,
          (await import("../server/api/users/export.csv.get")).default,
        ],
        [
          "tasks",
          Tasks.read,
          (await import("../server/api/tasks/export.csv.get")).default,
        ],
        [
          "incidents",
          Incidents.read,
          (await import("../server/api/incidents/export.csv.get")).default,
        ],
      ] as const;
      const router = createRouter();
      for (const [resource, , handler] of routes) {
        router.get(`/api/${resource}/export.csv`, handler);
      }

      let permissions: string[] = [];
      const app = createApp()
        .use((event) => {
          event.context.portalAuthenticated = { claims: { permissions } };
        })
        .use(router);
      const handle = toWebHandler(app);

      for (const [resource, read] of routes) {
        for (const grants of [[read], [ExportCSV.create]]) {
          permissions = grants;
          const response = await handle(
            new Request(`http://localhost/api/${resource}/export.csv`),
          );
          expect(response.status).toBe(403);
          expect(await response.json()).toMatchObject({ error: "forbidden" });
        }
      }

      expect(
        portalCapabilities([Users.read, Tasks.read, Incidents.read]).exportCsvCreate,
      ).toBe(false);
      expect(portalCapabilities(["BiszPortal.ExportCSV.create"]).exportCsvCreate).toBe(true);
    } finally {
      Object.assign(globals, previousGlobals);
    }
  });

  test("quotes cells and doubles embedded quotes", () => {
    expect(csvCell('a "quoted" value')).toBe('"a ""quoted"" value"');
    expect(csvRow(["a", 1, null])).toBe('"a","1",""\r\n');
  });

  test("neutralizes spreadsheet formula injection", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("\"'=SUM(A1:A2)\"");
    expect(csvCell("+cmd")).toBe("\"'+cmd\"");
    expect(csvCell("-1+2")).toBe("\"'-1+2\"");
    expect(csvCell("@user")).toBe("\"'@user\"");
  });

  test("writes a header row", () => {
    expect(csvHeader(["a", "b"])).toBe('"a","b"\r\n');
  });
});
