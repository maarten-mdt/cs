import { getConnectionConfig } from "../connections.js";

export interface ZendeskSourceConfig {
  locale?: string;
  maxArticles?: number;
}

export async function fetchHelpCenterArticles(
  config: ZendeskSourceConfig
): Promise<{ url: string; title: string; content: string }[]> {
  const c = await getConnectionConfig("zendesk");
  const subdomain = c?.subdomain || process.env.ZENDESK_SUBDOMAIN;
  const email = c?.email || process.env.ZENDESK_EMAIL;
  const token = c?.apiToken || process.env.ZENDESK_API_TOKEN;
  if (!subdomain || !email || !token) throw new Error("Zendesk not configured. Set in Connections.");
  const authHeader = `Basic ${Buffer.from(`${email}/token:${token}`).toString("base64")}`;

  const locale = config.locale ?? "en-us";
  const maxArticles = config.maxArticles ?? 10000;
  const results: { url: string; title: string; content: string }[] = [];
  let page = 1;
  const perPage = 100;

  while (results.length < maxArticles) {
    const res = await fetch(
      `https://${subdomain}.zendesk.com/api/v2/help_center/${locale}/articles.json?page=${page}&per_page=${perPage}`,
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) throw new Error(`Zendesk API ${res.status}`);
    const data = await res.json();
    const articles = data.articles || [];
    if (articles.length === 0) break;

    for (const a of articles) {
      const content = stripHtml(a.body || "");
      if (content.length > 20) {
        results.push({
          url: a.html_url || a.url || "",
          title: a.title || "Untitled",
          content: `${a.title}\n\n${content}`,
        });
      }
      if (results.length >= maxArticles) break;
    }
    if (articles.length < perPage) break;
    page++;
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
