/**
 * Shared helpers: chunk text and insert knowledge chunks.
 * Generates embeddings when pgvector + OpenAI are available, otherwise stores without.
 */

import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";

const CHUNK_MAX_CHARS = 2000;
const CHUNK_OVERLAP = 100;
const MIN_TEXT_LENGTH = 100;
const EMBED_BATCH_SIZE = 20;

/** Check once at startup whether the embedding column exists. */
let _hasEmbeddingColumn: boolean | null = null;
async function hasEmbeddingColumn(): Promise<boolean> {
  if (_hasEmbeddingColumn !== null) return _hasEmbeddingColumn;
  try {
    const cols: { column_name: string }[] = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'KnowledgeChunk' AND column_name = 'embedding'`;
    _hasEmbeddingColumn = cols.length > 0;
  } catch {
    _hasEmbeddingColumn = false;
  }
  return _hasEmbeddingColumn;
}

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

  // Clear existing chunks for this source
  await prisma.knowledgeChunk.deleteMany({ where: { sourceId } });

  const canEmbed = (await hasEmbeddingColumn()) && !!process.env.OPENAI_API_KEY?.trim();

  if (canEmbed) {
    // Full path: generate embeddings and store with vector column
    try {
      const { generateBatch } = await import("./embeddings.js");
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
          embedding ? vecStr(embedding) : null
        );
      }
      console.log(`[chunks] Inserted ${items.length} chunks with embeddings`);
      return;
    } catch (e) {
      console.warn("[chunks] Embedding insert failed, falling back to plain insert:", (e as Error).message.slice(0, 100));
    }
  }

  // Fallback: insert without embeddings (keyword search still works)
  console.log(`[chunks] Inserting ${items.length} chunks without embeddings (pgvector not available)`);
  for (const item of items) {
    await prisma.knowledgeChunk.create({
      data: {
        sourceId,
        content: item.content,
        url: item.url ?? null,
        title: item.title ?? null,
      },
    });
  }
}
