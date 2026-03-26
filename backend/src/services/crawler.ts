/**
 * Website crawler: BFS from root URL, extract text, chunk, embed, store.
 * Uses CRAWLER_USER_AGENT when set. Fails fast on first-page 403/timeout.
 */

import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";

const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; MDTBot/1.0; +https://mdttac.com)";
const FETCH_TIMEOUT_MS = 15000;
const MIN_TEXT_LENGTH = 100;
const CHUNK_MAX_CHARS = 2000;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH_SIZE = 20;

function getHeaders(): Record<string, string> {
  return {
    "User-Agent": process.env.CRAWLER_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
}

function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    return "https://" + u;
  }
  return u;
}

function resolveUrl(base: string, href: string): string | null {
  try {
    const b = new URL(base);
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.origin !== b.origin) return null;
    return u.href;
  } catch {
    return null;
  }
}

function extractText($: cheerio.CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("nav, footer, header, script, style, aside").remove();
  let text = clone.text();
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function chunkText(text: string, maxChars: number, overlap: number): { content: string }[] {
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

export async function crawlWebsite(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
  });
  if (!source || source.type !== "WEBSITE") {
    throw new Error("Source not found or not a website");
  }
  let url = source.url?.trim();
  if (!url) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: "No URL set" },
    });
    return;
  }
  url = normalizeUrl(url);
  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { url, status: SyncStatus.SYNCING, errorMessage: null },
  });

  const headers = getHeaders();
  const rootUrl = new URL(url);
  const preloaded = new Map<string, string>();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers, redirect: "follow" });
    clearTimeout(timeout);
    if (res.status >= 400) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    preloaded.set(url, await res.text());
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : "Request failed";
    const errorMessage =
      message.includes("403") || message.includes("timeout") || message.includes("abort")
        ? `${message} — site may be blocking the crawler. Set CRAWLER_USER_AGENT in .env and whitelist it in Cloudflare WAF if applicable.`
        : message;
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage },
    });
    return;
  }

  const queue: string[] = [url];
  const visited = new Set<string>([url]);
  const insertQueue: { content: string; url: string; title: string }[] = [];
  const maxPages = Math.min(Math.max(1, source.maxPages), 50_000);
  const limit = pLimit(3);
  let crawledCount = 0;

  while (queue.length > 0 && crawledCount < maxPages) {
    const batch = queue.splice(0, 10);
    await Promise.all(
      batch.map((href) =>
        limit(async () => {
          if (crawledCount >= maxPages) return;
          let html: string | undefined = preloaded.get(href);
          if (!html) {
            try {
              const c = new AbortController();
              const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
              const res = await fetch(href, { signal: c.signal, headers, redirect: "follow" });
              clearTimeout(t);
              if (res.status >= 400) return;
              html = await res.text();
            } catch {
              return;
            }
          }
          crawledCount++;
          const $ = cheerio.load(html);
          const title = $("title").text().trim() || new URL(href).pathname || href;
          const text = extractText($);
          if (text.length >= MIN_TEXT_LENGTH) {
            const chunks = chunkText(text, CHUNK_MAX_CHARS, CHUNK_OVERLAP);
            for (const ch of chunks) {
              insertQueue.push({ content: ch.content, url: href, title });
            }
          }
          $("a[href]").each((_, el) => {
            const hrefAttr = $(el).attr("href");
            if (!hrefAttr || /^(mailto|tel|#)/i.test(hrefAttr) || hrefAttr.toLowerCase().endsWith(".pdf")) return;
            const resolved = resolveUrl(href, hrefAttr);
            if (resolved && !visited.has(resolved)) {
              try {
                const u = new URL(resolved);
                if (u.hostname === rootUrl.hostname) {
                  visited.add(resolved);
                  queue.push(resolved);
                }
              } catch {}
            }
          });
        })
      )
    );
  }

  if (insertQueue.length === 0) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: {
        status: SyncStatus.FAILED,
        errorMessage: `Crawl found ${crawledCount} pages but extracted 0 content chunks. Pages may be JavaScript-rendered or behind authentication.`,
      },
    });
    return;
  }

  const { insertKnowledgeChunks } = await import("./knowledgeChunks.js");
  await insertKnowledgeChunks(sourceId, insertQueue);

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: {
      status: SyncStatus.SYNCED,
      chunkCount: insertQueue.length,
      lastSyncedAt: new Date(),
      errorMessage: null,
    },
  });
}
