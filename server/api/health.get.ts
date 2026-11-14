import { sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";

export default defineEventHandler(async (event) => {
  let database = false;
  try {
    await useDatabase().execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  setResponseStatus(event, database ? 200 : 503);
  return {
    status: database ? "ok" : "unavailable",
    database,
    time: new Date().toISOString(),
  };
});
