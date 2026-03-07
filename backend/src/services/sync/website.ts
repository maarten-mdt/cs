import * as cheerio from "cheerio";

export interface WebsiteSourceConfig {
  baseUrl: string;
  maxPages?: number;
  includePaths?: string[];
}

export async function extractTextFromHtml(html: string, url: string): Promise<{ title: string; text: string }> {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, .nav, .footer").remove();
  const title = $("title").text().trim() || $("h1").first().text().trim() || url;
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, text };
}

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MDT-SupportBot/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function crawlWebsite(config: WebsiteSourceConfig): Promise<{ url: string; title: string; content: string }[]> {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const maxPages = config.maxPages ?? 50;
  const seen = new Set<string>();
  const toVisit: string[] = [baseUrl];
  const results: { url: string; title: string; content: string }[] = [];

  while (toVisit.length > 0 && results.length < maxPages) {
    const url = toVisit.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      const { title, text } = await extractTextFromHtml(html, url);
      if (text.length > 50) {
        results.push({ url, title, content: text });
      }
      if (results.length >= maxPages) break;

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
      console.warn("Crawl skip", url, err);
    }
  }

  return results;
}
