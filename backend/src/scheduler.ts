import cron from "node-cron";
import { getPool } from "./db/client.js";
import { runSync, type SourceType } from "./services/sync/run.js";

export function startDailySync(): void {
  cron.schedule("0 2 * * *", async () => {
    console.log("Running daily sync for all sources...");
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, type, config FROM data_sources WHERE type != 'manual'`
    );
    for (const row of result.rows) {
      try {
        await runSync(row.id, row.type as SourceType, row.config || {});
        console.log(`Synced: ${row.name}`);
      } catch (err) {
        console.error(`Daily sync failed for ${row.name}:`, err);
      }
    }
    console.log("Daily sync complete.");
  });
  console.log("Daily sync scheduled (2:00 AM every day)");
}
