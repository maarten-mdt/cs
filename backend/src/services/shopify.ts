import { getConnectionConfig } from "./connections.js";

export interface ShopifyConfig {
  shop: string;
  accessToken: string;
}

async function getConfig(): Promise<ShopifyConfig | null> {
  const c = await getConnectionConfig("shopify");
  if (!c?.shop || !c?.accessToken) return null;
  return { shop: String(c.shop).replace(/\.myshopify\.com$/, ""), accessToken: c.accessToken };
}

export async function getOrder(orderId: string): Promise<object | null> {
  const config = await getConfig();
  if (!config) return null;

  const url = `https://${config.shop}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.order;
}

export async function getOrdersByEmail(email: string): Promise<object[]> {
  const config = await getConfig();
  if (!config) return [];

  const url = `https://${config.shop}.myshopify.com/admin/api/2024-01/orders.json?status=any&email=${encodeURIComponent(email)}&limit=10`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.orders || [];
}

export async function searchProducts(query: string): Promise<object[]> {
  const config = await getConfig();
  if (!config) return [];

  const url = `https://${config.shop}.myshopify.com/admin/api/2024-01/products.json?limit=10`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const products = data.products || [];
  const q = query.toLowerCase();
  return products.filter(
    (p: { title?: string; body_html?: string }) =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.body_html || "").toLowerCase().includes(q)
  );
}
