import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const { execSync } = await import("child_process");

const migrationDir = resolve(__dirname, "prisma/migrations/20250308000000_add_users");
const sqlFile = resolve(migrationDir, "migration.sql");

console.log("Applying migration SQL (User table + Role enum)...");
execSync(`npx prisma db execute --file "${sqlFile}"`, { stdio: "inherit", env: process.env });

console.log("Marking migration as applied...");
execSync("npx prisma migrate resolve --applied 20250308000000_add_users", {
  stdio: "inherit",
  env: process.env,
});

console.log("Done. Database is baselined.");
