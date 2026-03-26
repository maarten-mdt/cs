/**
 * Firecrawl integration: scrapes specific URLs AND searches the web.
 *
 * The URL field accepts a mix of:
 *   - Direct URLs: https://snipershide.com/shooting/threads/mdt-chassis.123/
 *   - Search queries: "MDT chassis review" (anything without http)
 *
 * One entry per line or comma-separated.
 * URLs are scraped directly. Search queries use Firecrawl's /search endpoint.
 *
 * Requires FIRECRAWL_API_KEY env var.
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { insertKnowledgeChunks, chunkText, type KnowledgeChunkItem } from "./knowledgeChunks.js";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";
const MAX_RESULTS_PER_QUERY = 20;
const MIN_CONTENT_LENGTH = 100;

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set. Add it on the Connections page.");
  return key;
}

/** Split input into URLs and search queries. */
function parseEntries(urlField: string): { urls: string[]; queries: string[] } {
  const lines = urlField
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const urls: string[] = [];
  const queries: string[] = [];

  for (const line of lines) {
    if (line.startsWith("http://") || line.startsWith("https://")) {
      urls.push(line);
    } else {
      queries.push(line);
    }
  }

  return { urls, queries };
}

/** Scrape a single URL via Firecrawl's /scrape endpoint. */
async function firecrawlScrape(url: string, apiKey: string): Promise<{ title?: string; content: string; url: string } | null> {
  const res = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[firecrawl] Scrape failed for ${url}: HTTP ${res.status} ${body.slice(0, 100)}`);
    return null;
  }

  const data = await res.json() as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string } } };
  if (!data.success || !data.data?.markdown) return null;

  return {
    title: data.data.metadata?.title || undefined,
    content: data.data.markdown.trim(),
    url,
  };
}

/** Search the web via Firecrawl's /search endpoint. */
async function firecrawlSearch(query: string, apiKey: string): Promise<{ title?: string; content: string; url: string }[]> {
  const res = await fetch(`${FIRECRAWL_API}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: MAX_RESULTS_PER_QUERY,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[firecrawl] Search failed for "${query}": HTTP ${res.status} ${body.slice(0, 100)}`);
    return [];
  }

  const data = await res.json() as { success?: boolean; data?: { url?: string; title?: string; markdown?: string; description?: string }[] };
  if (!data.success || !data.data) return [];

  return data.data
    .filter((r) => r.url && (r.markdown || r.description))
    .map((r) => ({
      title: r.title || undefined,
      content: (r.markdown || r.description || "").trim(),
      url: r.url!,
    }));
}

/**
 * Sync a Firecrawl source: scrape URLs + run search queries,
 * collect results, chunk, and store as knowledge.
 */
export async function syncFirecrawlSource(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "FIRECRAWL") {
    throw new Error("Source not found or not a Firecrawl source");
  }
  if (!source.url?.trim()) {
    throw new Error("Add URLs or search queries (one per line or comma-separated)");
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  const { urls, queries } = parseEntries(source.url);
  if (urls.length === 0 && queries.length === 0) {
    throw new Error("No URLs or search queries found");
  }

  const apiKey = getApiKey();
  const items: KnowledgeChunkItem[] = [];
  const seenUrls = new Set<string>();

  try {
    // 1. Scrape direct URLs
    for (const url of urls) {
      console.log(`[firecrawl] Scraping: ${url}`);
      const result = await firecrawlScrape(url, apiKey);
      if (!result || result.content.length < MIN_CONTENT_LENGTH) continue;
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      // Chunk long pages
      if (result.content.length > 2000) {
        const chunks = chunkText(result.content);
        for (const chunk of chunks) {
          items.push({ content: chunk.content, url: result.url, title: result.title });
        }
      } else {
        items.push({ content: result.content, url: result.url, title: result.title });
      }
    }
    if (urls.length > 0) {
      console.log(`[firecrawl] Scraped ${urls.length} URLs → ${items.length} chunks`);
    }

    // 2. Run search queries
    for (const query of queries) {
      console.log(`[firecrawl] Searching: "${query}"`);
      const results = await firecrawlSearch(query, apiKey);
      console.log(`[firecrawl] Got ${results.length} results for "${query}"`);

      for (const r of results) {
        if (seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        if (r.content.length < MIN_CONTENT_LENGTH) continue;

        // Chunk long pages
        if (r.content.length > 2000) {
          const chunks = chunkText(r.content);
          for (const chunk of chunks) {
            items.push({ content: chunk.content, url: r.url, title: r.title });
          }
        } else {
          items.push({ content: r.content, url: r.url, title: r.title });
        }
      }
    }

    if (items.length === 0) {
      console.log("[firecrawl] No content found");
    }

    await insertKnowledgeChunks(sourceId, items);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: {
        status: SyncStatus.SYNCED,
        chunkCount: items.length,
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    });
    console.log(`[firecrawl] Done: ${items.length} chunks from ${urls.length} URLs + ${queries.length} searches`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[firecrawl] Sync failed:", message);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: message },
    });
  }
}
