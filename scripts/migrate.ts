import { migrate } from "drizzle-orm/node-postgres/migrator"
import { closeDatabase, useDatabase } from "../server/database/client"

try {
  await migrate(useDatabase(), { migrationsFolder: "drizzle" })
  console.info("Portal database migrations applied.")
} finally {
  await closeDatabase()
}
