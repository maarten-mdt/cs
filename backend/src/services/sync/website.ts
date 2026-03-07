import * as cheerio from "cheerio";

export interface WebsiteSourceConfig {
  baseUrl: string;
  maxPages?: number;
  includePaths?: string[];
  /** If true, only crawl the single URL (no following links) */
  singlePage?: boolean;
}

export async function extractTextFromHtml(html: string, url: string): Promise<{ title: string; text: string }> {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, .nav, .footer").remove();
  const title = $("title").text().trim() || $("h1").first().text().trim() || url;
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, text };
}

const FETCH_TIMEOUT_MS = 25_000;

export async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MDT-SupportBot/1.0 (compatible; +https://github.com/mdt-support)" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") throw new Error("Request timed out");
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(raw: string): string {
  let baseUrl = raw.trim().replace(/\/$/, "");
  if (!baseUrl) return baseUrl;
  try {
    new URL(baseUrl);
  } catch {
    baseUrl = `https://${baseUrl}`;
  }
  return baseUrl;
}

export async function crawlWebsite(config: WebsiteSourceConfig): Promise<{ url: string; title: string; content: string }[]> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) throw new Error("URL required");
  const singlePage = config.singlePage ?? false;
  const maxPages = singlePage ? 1 : (config.maxPages ?? 50);
  const seen = new Set<string>();
  const toVisit: string[] = [baseUrl];
  const results: { url: string; title: string; content: string }[] = [];
  let firstPageError: Error | null = null;

  while (toVisit.length > 0 && results.length < maxPages) {
    const url = toVisit.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const isFirstPage = url === baseUrl;

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      const { title, text } = await extractTextFromHtml(html, url);
      if (text.length > 50) {
        results.push({ url, title, content: text });
      } else if (isFirstPage && results.length === 0) {
        firstPageError = new Error(
          `Page returned very little text (${text.length} chars). The site may be JavaScript-only or block scraping.`
        );
      }
      if (results.length >= maxPages) break;
      if (singlePage) break;

      const sameOrigin = (href: string) => {
        try {
          const u = new URL(href, url);
          return u.origin === new URL(baseUrl).origin;
        } catch {
          return false;
        }
      };

      $("a[href]").each((_i: number, el) => {
        const href = $(el).attr("href");
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
        let full: string;
        try {
          full = new URL(href, url).href;
        } catch {
          return;
        }
        if (!sameOrigin(full) || seen.has(full)) return;
        if (config.includePaths?.length) {
          const path = new URL(full).pathname;
          if (!config.includePaths.some((p) => path.startsWith(p))) return;
        }
        toVisit.push(full);
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isFirstPage) {
        firstPageError = new Error(`Failed to fetch ${url}: ${error.message}`);
      }
      console.warn("Crawl skip", url, err);
    }
  }

  if (results.length === 0 && firstPageError) {
    throw firstPageError;
  }
  return results;
}
