/**
 * Shared helpers: chunk text and insert knowledge chunks with embeddings.
 * Used by Zendesk, Google Drive, and Shopify sync (crawler has its own flow).
 */

import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";
import { generateBatch } from "./embeddings.js";

const CHUNK_MAX_CHARS = 2000;
const CHUNK_OVERLAP = 100;
const MIN_TEXT_LENGTH = 100;
const EMBED_BATCH_SIZE = 20;

export function chunkText(text: string, maxChars = CHUNK_MAX_CHARS, overlap = CHUNK_OVERLAP): { content: string }[] {
  const chunks: { content: string }[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length >= MIN_TEXT_LENGTH) chunks.push({ content: slice });
    if (end >= text.length) break;
    start += maxChars - overlap;
  }
  return chunks;
}

export interface KnowledgeChunkItem {
  content: string;
  url?: string | null;
  title?: string | null;
}

export async function insertKnowledgeChunks(
  sourceId: string,
  items: KnowledgeChunkItem[]
): Promise<void> {
  if (items.length === 0) return;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for embeddings. Set it in .env.");
  }
  await prisma.knowledgeChunk.deleteMany({ where: { sourceId } });
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBED_BATCH_SIZE).map((c) => c.content);
    const embeddings = await generateBatch(batch);
    allEmbeddings.push(...embeddings);
  }
  const vecStr = (emb: number[]) => "[" + emb.join(",") + "]";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const embedding = allEmbeddings[i];
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "KnowledgeChunk" (id, "sourceId", content, url, title, "createdAt", embedding)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6::vector)`,
      id,
      sourceId,
      item.content,
      item.url ?? null,
      item.title ?? null,
      embedding ? vecStr(embedding) : ""
    );
  }
}
