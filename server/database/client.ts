import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;

export function databasePool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
      application_name: "bisz-portal",
    });
    pool.on("error", (error) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Idle database client failed",
          error: error.message,
        }),
      );
    });
  }
  return pool;
}

export function useDatabase() {
  return drizzle(databasePool(), { schema });
}

export async function closeDatabase() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
