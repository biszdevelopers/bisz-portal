import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let revocationPool: Pool | undefined;

function createPool(max: number) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const instance = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    application_name: "bisz-portal",
  });
  instance.on("error", (error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Idle database client failed",
        error: error.message,
      }),
    );
  });
  return instance;
}

export function databasePool() {
  return (pool ??= createPool(Number(process.env.DATABASE_POOL_MAX ?? 10)));
}

export function revocationWritePool() {
  // Basis Auth delivers revocations during refresh, while the portal holds the session connection.
  return (revocationPool ??= createPool(2));
}

export function useDatabase() {
  return drizzle(databasePool(), { schema });
}

export async function closeDatabase() {
  const closing = Promise.all([pool?.end(), revocationPool?.end()]);
  pool = undefined;
  revocationPool = undefined;
  await closing;
}
