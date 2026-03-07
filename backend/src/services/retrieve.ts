import { getPool } from "../db/client.js";
import { embed } from "./embeddings.js";
import { hasEmbeddings } from "./embeddings.js";

const MAX_CHUNKS = 8;
const MIN_FTS_RANK = 0.01;

export interface RetrievedChunk {
  content: string;
  title: string | null;
  url: string | null;
}

export async function retrieve(query: string): Promise<RetrievedChunk[]> {
  const pool = getPool();
  const queryTrim = query.trim();
  if (!queryTrim) return [];

  if (await hasEmbeddings()) {
    try {
      const queryEmbedding = await embed(queryTrim);
      const vectorStr = `[${queryEmbedding.join(",")}]`;
      const res = await pool.query(
        `SELECT content, title, url FROM knowledge_chunks 
         WHERE embedding IS NOT NULL 
         ORDER BY embedding <=> $1::vector 
         LIMIT $2`,
        [vectorStr, MAX_CHUNKS]
      );
      return res.rows.map((r) => ({
        content: r.content,
        title: r.title,
        url: r.url,
      }));
    } catch (_) {}
  }

  const res = await pool.query(
    `SELECT content, title, url, ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
     FROM knowledge_chunks 
     WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC 
     LIMIT $2`,
    [queryTrim.replace(/\s+/g, " ").slice(0, 500), MAX_CHUNKS]
  );

  return res.rows
    .filter((r) => Number(r.rank) >= MIN_FTS_RANK)
    .map((r) => ({
      content: r.content,
      title: r.title,
      url: r.url,
    }));
}
