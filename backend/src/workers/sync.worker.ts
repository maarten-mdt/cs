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
import { syncShopifyProducts } from "../services/shopify.js";
import {
  QUEUE_NAME,
  CONVERSATION_QUEUE_NAME,
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

async function runSync(sourceId: string, type: string): Promise<void> {
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
  if (t === "shopify") {
    await syncShopifyProducts(sourceId);
    return;
  }
  throw new Error(`Unknown sync type: ${type}`);
}

const worker = new Worker<SyncSourceJobData>(
  QUEUE_NAME,
  async (job) => {
    const { sourceId, type } = job.data;
    try {
      await runSync(sourceId, type);
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

console.log("Sync worker started (sources + conversation-end). Waiting for jobs...");
