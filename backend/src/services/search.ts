/**
 * Knowledge search. Tries vector search (pgvector) first, falls back to
 * curated Q&A text search + basic keyword search on KnowledgeChunks.
 */

import { prisma } from "../lib/prisma.js";

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

/**
 * Search curated Q&A pairs by keyword matching.
 * Returns Q&A formatted as knowledge chunks so the caller doesn't need to change.
 */
async function searchCuratedQA(query: string, limit: number): Promise<KnowledgeChunkWithDistance[]> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  // Use Prisma full-text-like search: find Q&A where question contains any of the key words
  const qaPairs = await prisma.curatedQA.findMany({
    where: {
      active: true,
      OR: words.slice(0, 5).map((word) => ({
        question: { contains: word, mode: "insensitive" as const },
      })),
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  // Score by how many query words match the question
  const scored = qaPairs.map((qa) => {
    const qLower = qa.question.toLowerCase();
    const matchCount = words.filter((w) => qLower.includes(w)).length;
    return { qa, score: matchCount / words.length };
  });

  // Sort by relevance score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    id: s.qa.id,
    sourceId: "curated-qa",
    content: `Q: ${s.qa.question}\nA: ${s.qa.answer}`,
    url: null,
    title: "Curated Q&A",
    createdAt: s.qa.createdAt,
    distance: 1 - s.score,
  }));
}

/**
 * Basic keyword search on KnowledgeChunks (no vector/embedding required).
 */
async function searchChunksByKeyword(query: string, limit: number): Promise<KnowledgeChunkWithDistance[]> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      OR: words.slice(0, 5).map((word) => ({
        content: { contains: word, mode: "insensitive" as const },
      })),
    },
    take: limit * 2,
    orderBy: { createdAt: "desc" },
  });

  // Score by word match density
  const scored = chunks.map((chunk) => {
    const cLower = chunk.content.toLowerCase();
    const matchCount = words.filter((w) => cLower.includes(w)).length;
    return { chunk, score: matchCount / words.length };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    id: s.chunk.id,
    sourceId: s.chunk.sourceId,
    content: s.chunk.content,
    url: s.chunk.url,
    title: s.chunk.title,
    createdAt: s.chunk.createdAt,
    distance: 1 - s.score,
  }));
}

/**
 * Main search function. Tries vector search first, falls back to keyword + Q&A.
 */
export async function searchKnowledge(query: string, topK: number = TOP_K): Promise<KnowledgeChunkWithDistance[]> {
  // Try vector search if OpenAI embeddings are available
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const { generateEmbedding } = await import("./embeddings.js");
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
      if (rows.length > 0) {
        // Also mix in top Q&A matches
        const qaPairs = await searchCuratedQA(query, 3);
        return [...qaPairs, ...rows].slice(0, topK);
      }
    } catch (e) {
      // Vector search not available (no pgvector, no embeddings, etc.)
      console.warn("[search] Vector search failed, using fallback:", (e as Error).message.slice(0, 100));
    }
  }

  // Fallback: combine Q&A search + keyword chunk search
  const [qaResults, chunkResults] = await Promise.all([
    searchCuratedQA(query, Math.ceil(topK / 2)),
    searchChunksByKeyword(query, Math.ceil(topK / 2)),
  ]);

  return [...qaResults, ...chunkResults].slice(0, topK);
}
