/**
 * BullMQ queue for background jobs. Requires REDIS_URL.
 * If REDIS_URL is not set, addJob is a no-op so the API still runs.
 */

import { Queue } from "bullmq";

const QUEUE_NAME = "sync-source";
const CONVERSATION_QUEUE_NAME = "sync-conversation-end";
let queue: Queue<SyncSourceJobData> | null = null;
let conversationQueue: Queue<SyncConversationEndJobData> | null = null;

export interface SyncSourceJobData {
  sourceId?: string;
  type?: string;
  /** Present for daily-sync-all trigger */
  _daily?: boolean;
}

export interface SyncConversationEndJobData {
  conversationId: string;
}

function getQueue(): Queue<SyncSourceJobData> | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!queue) {
    queue = new Queue<SyncSourceJobData>(QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: { attempts: 1, removeOnComplete: 100 },
    });
  }
  return queue;
}

function getConversationQueue(): Queue<SyncConversationEndJobData> | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!conversationQueue) {
    conversationQueue = new Queue<SyncConversationEndJobData>(CONVERSATION_QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: { attempts: 1, removeOnComplete: 200 },
    });
  }
  return conversationQueue;
}

export async function enqueueSyncSource(sourceId: string, type: string): Promise<void> {
  const q = getQueue();
  if (!q) return;
  await q.add("sync", { sourceId, type });
}

/** Schedule daily sync of all sources at 2:00 AM UTC. Idempotent — safe to call on worker startup. */
export async function scheduleDailySyncAll(): Promise<void> {
  const q = getQueue();
  if (!q) return;
  const repeatable = await q.getRepeatableJobs();
  const exists = repeatable.some(
    (j) => j.name === "daily-sync-all" && j.pattern === "0 2 * * *"
  );
  if (!exists) {
    await q.add("daily-sync-all", { _daily: true }, { repeat: { pattern: "0 2 * * *" } });
    console.log("[queue] Scheduled daily sync at 2:00 AM UTC");
  }
}

export async function enqueueSyncConversationEnd(conversationId: string): Promise<void> {
  const q = getConversationQueue();
  if (!q) return;
  await q.add("sync-conversation-end", { conversationId });
}

export { QUEUE_NAME, CONVERSATION_QUEUE_NAME };
