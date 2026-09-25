import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://bisz_portal:bisz_portal@localhost:5432/bisz_portal",
  },
  strict: true,
  verbose: true,
})
