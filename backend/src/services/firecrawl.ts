/**
 * Firecrawl integration: uses /search endpoint to find and scrape MDT-related
 * content across the web (Reddit, forums, blogs, YouTube) in one API call.
 *
 * Requires FIRECRAWL_API_KEY env var.
 * Source URL field contains comma-separated search queries, e.g.:
 *   "MDT chassis review,MDT ESS compatibility,MDT ACC install"
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { insertKnowledgeChunks, type KnowledgeChunkItem } from "./knowledgeChunks.js";

const FIRECRAWL_API = "https://api.firecrawl.dev/v2";
const MAX_RESULTS_PER_QUERY = 20;
const MIN_CONTENT_LENGTH = 100;

interface FirecrawlSearchResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

interface FirecrawlSearchResponse {
  success: boolean;
  data?: {
    web?: FirecrawlSearchResult[];
  };
}

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return key;
}

/**
 * Parse search queries from the source URL field.
 * Accepts comma-separated queries or one per line.
 */
function parseQueries(urlField: string): string[] {
  return urlField
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function firecrawlSearch(
  query: string,
  apiKey: string,
  limit: number = MAX_RESULTS_PER_QUERY
): Promise<FirecrawlSearchResult[]> {
  const res = await fetch(`${FIRECRAWL_API}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl API HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as FirecrawlSearchResponse;
  if (!data.success) {
    throw new Error("Firecrawl search returned success: false");
  }

  return data.data?.web ?? [];
}

/**
 * Sync a Firecrawl source: run each search query, collect results,
 * and store as knowledge chunks with embeddings.
 */
export async function syncFirecrawlSource(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "FIRECRAWL") {
    throw new Error("Source not found or not a Firecrawl source");
  }
  if (!source.url?.trim()) {
    throw new Error("Firecrawl source requires search queries in URL field (comma-separated)");
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  const queries = parseQueries(source.url);
  if (queries.length === 0) {
    throw new Error("No valid search queries found in URL field");
  }

  const apiKey = getApiKey();
  const items: KnowledgeChunkItem[] = [];
  const seenUrls = new Set<string>();

  try {
    for (const query of queries) {
      console.log(`[firecrawl] Searching: "${query}"`);

      const results = await firecrawlSearch(query, apiKey);
      console.log(`[firecrawl] Got ${results.length} results for "${query}"`);

      for (const r of results) {
        if (!r.url || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);

        // Use markdown content if available, fall back to description
        const content = r.markdown?.trim() || r.description?.trim() || "";
        if (content.length < MIN_CONTENT_LENGTH) continue;

        // Truncate very long pages to keep chunks manageable
        const truncated = content.length > 5000 ? content.slice(0, 5000) + "\n\n[content truncated]" : content;

        items.push({
          content: truncated,
          url: r.url,
          title: r.title ?? query,
        });
      }
    }

    if (items.length === 0) {
      console.log("[firecrawl] No results found across all queries");
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
    console.log(`[firecrawl] Synced ${items.length} pages from ${queries.length} queries`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[firecrawl] Sync failed:", message);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: message },
    });
  }
}
