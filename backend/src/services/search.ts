/**
 * Vector search over KnowledgeChunk. Uses pgvector <=> (cosine distance).
 * Requires embedding column (vector(1536)) and OPENAI_API_KEY for query embedding.
 */

import { prisma } from "../lib/prisma.js";
import { generateEmbedding } from "./embeddings.js";

const TOP_K = 14;

export interface KnowledgeChunkWithDistance {
  id: string;
  sourceId: string;
  content: string;
  url: string | null;
  title: string | null;
  createdAt: Date;
  distance?: number;
}

export async function searchKnowledge(query: string, topK: number = TOP_K): Promise<KnowledgeChunkWithDistance[]> {
  const embedding = await generateEmbedding(query);
  const vecStr = "[" + embedding.join(",") + "]";
  const rows = await prisma.$queryRawUnsafe<KnowledgeChunkWithDistance[]>(
    `SELECT id, "sourceId", content, url, title, "createdAt",
            (embedding <=> $1::vector) as distance
     FROM "KnowledgeChunk"
     WHERE embedding IS NOT NULL
     ORDER BY distance ASC
     LIMIT $2`,
    vecStr,
    topK
  );
  return rows;
}
