/**
 * BullMQ worker for sync-source jobs. Run as a separate process:
 *   REDIS_URL=redis://... node dist/workers/sync.worker.js
 * Or: npm run worker (from backend directory)
 */

import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/workers -> project root is ../../../ (CustomerSupportbot)
loadEnv({ path: path.resolve(__dirname, "../../../.env") });
import { Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { crawlWebsite } from "../services/crawler.js";
import { syncZendeskArticles } from "../services/zendesk.js";
import { syncGoogleDriveFolder } from "../services/googledrive.js";
import { syncGoogleSheets } from "../services/googlesheets.js";
import { syncShopifyProducts } from "../services/shopify.js";
import { syncRedditSource } from "../services/reddit.js";
import { detectDiscrepancies } from "../services/discrepancy.js";
import type { StoreRegion } from "../lib/shopifyConfig.js";
import {
  QUEUE_NAME,
  CONVERSATION_QUEUE_NAME,
  enqueueSyncSource,
  scheduleDailySyncAll,
  type SyncSourceJobData,
  type SyncConversationEndJobData,
} from "../lib/queue.js";
import { syncConversationEnd } from "../services/customers.js";
import { SyncStatus } from "@prisma/client";

const url = process.env.REDIS_URL?.trim();
if (!url) {
  console.error("REDIS_URL is required for the sync worker. Exiting.");
  process.exit(1);
}

/** Derive storeRegion from source name convention (e.g. "Shopify Products (US)") or job data. */
function detectStoreRegion(sourceName: string, jobRegion?: string): StoreRegion {
  if (jobRegion && ["CA", "US", "INT"].includes(jobRegion.toUpperCase())) {
    return jobRegion.toUpperCase() as StoreRegion;
  }
  const upper = sourceName.toUpperCase();
  if (upper.includes("INT")) return "INT";
  if (upper.includes("US")) return "US";
  return "CA";
}

async function runSync(sourceId: string, type: string, storeRegion?: string): Promise<void> {
  const t = type.toLowerCase();
  if (t === "website") {
    await crawlWebsite(sourceId);
    return;
  }
  if (t === "zendesk") {
    await syncZendeskArticles(sourceId);
    return;
  }
  if (t === "google_drive" || t === "googledrive") {
    await syncGoogleDriveFolder(sourceId);
    return;
  }
  if (t === "google_sheets" || t === "googlesheets") {
    await syncGoogleSheets(sourceId);
    return;
  }
  if (t === "reddit") {
    await syncRedditSource(sourceId);
    // Run discrepancy detection after Reddit sync
    try {
      await detectDiscrepancies(sourceId);
    } catch (e) {
      console.warn("[worker] Discrepancy detection failed:", (e as Error).message);
    }
    return;
  }
  if (t === "shopify") {
    const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId }, select: { name: true } });
    const region = detectStoreRegion(source?.name ?? "", storeRegion);
    await syncShopifyProducts(sourceId, region);
    return;
  }
  throw new Error(`Unknown sync type: ${type}`);
}

const worker = new Worker<SyncSourceJobData & { sourceId?: string; type?: string; storeRegion?: string }>(
  QUEUE_NAME,
  async (job) => {
    if (job.name === "daily-sync-all") {
      const sources = await prisma.knowledgeSource.findMany({
        where: { type: { not: "MANUAL" } },
        select: { id: true, type: true, url: true },
      });
      for (const s of sources) {
        const needsUrl = ["WEBSITE", "GOOGLE_DRIVE", "GOOGLE_SHEETS"].includes(s.type);
        if (needsUrl && !s.url?.trim()) continue;
        const typeKey = s.type.toLowerCase();
        await enqueueSyncSource(s.id, typeKey);
      }
      console.log(`[worker] Daily sync: enqueued ${sources.length} sources`);
      return;
    }
    const { sourceId, type, storeRegion } = job.data;
    if (!sourceId || !type) throw new Error("Missing sourceId or type");
    try {
      await runSync(sourceId, type, storeRegion);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: SyncStatus.FAILED, errorMessage: message },
      });
      throw err;
    }
  },
  {
    connection: { url, maxRetriesPerRequest: null },
    concurrency: 1,
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} (source ${job.data.sourceId}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err?.message);
});

const conversationWorker = new Worker<SyncConversationEndJobData>(
  CONVERSATION_QUEUE_NAME,
  async (job) => {
    await syncConversationEnd(job.data.conversationId);
  },
  { connection: { url, maxRetriesPerRequest: null }, concurrency: 2 }
);

conversationWorker.on("failed", (job, err) => {
  console.error(`Conversation job ${job?.id} failed:`, err?.message);
});

scheduleDailySyncAll().catch((e) => console.warn("[worker] Could not schedule daily sync:", (e as Error).message));

console.log("Sync worker started (sources + conversation-end). Daily sync at 2:00 AM UTC.");
