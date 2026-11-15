import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let revocationPool: Pool | undefined;

function createPool(max: number) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new Pool({ connectionString, max });
}

export function databasePool() {
  return pool ??= createPool(10);
}

export function revocationWritePool() {
  // Basis Auth delivers revocations during refresh, while the portal holds the session connection.
  return revocationPool ??= createPool(2);
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
