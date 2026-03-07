import { getPool } from "../../db/client.js";
import { hasEmbeddings, embedMany } from "../embeddings.js";
import { crawlWebsite } from "./website.js";
import { fetchHelpCenterArticles } from "./zendesk.js";
import { fetchShopifyProductsAsChunks } from "./shopify-products.js";

export type SourceType = "website" | "zendesk" | "shopify_products" | "manual";

export async function runSync(
  sourceId: string,
  type: SourceType,
  config: Record<string, unknown>
): Promise<{ chunksAdded: number; error?: string }> {
  const pool = getPool();
  let chunks: { url: string; title: string; content: string }[] = [];

  try {
    if (type === "website") {
      const baseUrl = (config.baseUrl as string) || "";
      const maxPages = (config.maxPages as number) || 50;
      if (!baseUrl) throw new Error("baseUrl required");
      chunks = await crawlWebsite({ baseUrl, maxPages });
    } else if (type === "zendesk") {
      chunks = await fetchHelpCenterArticles({
        locale: config.locale as string | undefined,
        maxArticles: (config.maxArticles as number) || 200,
      });
    } else if (type === "shopify_products") {
      chunks = await fetchShopifyProductsAsChunks();
    } else {
      throw new Error(`Unknown source type: ${type}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE data_sources SET last_synced_at = NOW(), last_sync_status = 'failed', last_sync_error = $1, updated_at = NOW() WHERE id = $2`,
      [msg, sourceId]
    );
    return { chunksAdded: 0, error: msg };
  }

  await pool.query(`DELETE FROM knowledge_chunks WHERE source_id = $1`, [
    sourceId,
  ]);

  const useEmbeddings = hasEmbeddings();
  const texts = chunks.map((c) => (c.title ? `${c.title}\n\n${c.content}` : c.content));
  let embeddings: number[][] = [];
  if (useEmbeddings && texts.length > 0) {
    try {
      const batchSize = 50;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        embeddings.push(...(await embedMany(batch)));
      }
    } catch (_) {
      embeddings = [];
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const content = texts[i];
    const embedding = embeddings[i];
    if (embedding?.length) {
      await pool.query(
        `INSERT INTO knowledge_chunks (source_id, content, title, url, metadata, embedding)
         VALUES ($1, $2, $3, $4, '{}', $5::vector)`,
        [sourceId, content, c.title || null, c.url || null, `[${embedding.join(",")}]`]
      );
    } else {
      await pool.query(
        `INSERT INTO knowledge_chunks (source_id, content, title, url, metadata)
         VALUES ($1, $2, $3, $4, '{}')`,
        [sourceId, content, c.title || null, c.url || null]
      );
    }
  }

  await pool.query(
    `UPDATE data_sources SET last_synced_at = NOW(), last_sync_status = 'success', last_sync_error = NULL, updated_at = NOW() WHERE id = $1`,
    [sourceId]
  );

  return { chunksAdded: chunks.length };
}
