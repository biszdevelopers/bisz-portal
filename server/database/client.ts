import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

let pool: Pool | undefined

export function databasePool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error("DATABASE_URL is required")
    pool = new Pool({ connectionString, max: 10 })
  }
  return pool
}

export function useDatabase() {
  return drizzle(databasePool(), { schema })
}

export async function closeDatabase() {
  if (!pool) return
  await pool.end()
  pool = undefined
}
