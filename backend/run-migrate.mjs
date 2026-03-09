import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load root .env (parent of backend) so DATABASE_URL is set
config({ path: resolve(__dirname, "../.env") });

const { execSync } = await import("child_process");
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
