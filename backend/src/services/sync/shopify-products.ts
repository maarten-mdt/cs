import { getConnectionConfig } from "../connections.js";

export async function fetchShopifyProductsAsChunks(): Promise<
  { url: string; title: string; content: string }[]
> {
  const c = await getConnectionConfig("shopify");
  const shop = c?.shop || process.env.SHOPIFY_SHOP;
  const token = c?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shop || !token) throw new Error("Shopify not configured. Set in Connections.");

  const base = `https://${String(shop).replace(/\.myshopify\.com$/, "")}.myshopify.com`;
  const results: { url: string; title: string; content: string }[] = [];
  let pageInfo: string | null = null;

  do {
    const url: string = pageInfo
      ? `https://${shop.replace(/\.myshopify\.com$/, "")}.myshopify.com/admin/api/2024-01/products.json?limit=50&page_info=${pageInfo}`
      : `https://${shop.replace(/\.myshopify\.com$/, "")}.myshopify.com/admin/api/2024-01/products.json?limit=50`;
    const res: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Shopify API ${res.status}`);
    const data = await res.json();
    const products = data.products || [];

    for (const p of products) {
      const body = (p.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const variants = (p.variants || [])
        .map((v: { title?: string; sku?: string }) => `${v.title || ""} ${v.sku || ""}`.trim())
        .filter(Boolean);
      const content = [
        p.title,
        p.body_html ? body : "",
        p.vendor ? `Vendor: ${p.vendor}` : "",
        variants.length ? `Variants: ${variants.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (content.length > 10) {
        results.push({
          url: `${base}/products/${p.handle || p.id}`,
          title: p.title || "Product",
          content,
        });
      }
    }

    const link: string | null = res.headers.get("link");
    const nextMatch = link?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
    pageInfo = nextMatch
      ? new URL(nextMatch[1]).searchParams.get("page_info")
      : null;
  } while (pageInfo);

  return results;
}
