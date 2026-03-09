/**
 * Shopify products sync: paginate via Link rel=next, one KnowledgeChunk per product.
 * Uses SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN.
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { insertKnowledgeChunks } from "./knowledgeChunks.js";

const SHOPIFY_VERSION = "2024-01";
const FETCH_TIMEOUT_MS = 15000;

function getStoreUrl(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is required");
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return base.replace(/\/$/, "");
}

function getHeaders(): HeadersInit {
  const token = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("SHOPIFY_ACCESS_TOKEN is required");
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1].trim() : null;
}

export async function syncShopifyProducts(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "SHOPIFY") {
    throw new Error("Source not found or not a Shopify source");
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  const baseUrl = getStoreUrl();
  let url: string | null = `${baseUrl}/admin/api/${SHOPIFY_VERSION}/products.json?limit=250`;
  const items: { content: string; url: string | null; title: string }[] = [];

  try {
    while (url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal, headers: getHeaders() });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Shopify API HTTP ${res.status}: ${body || res.statusText}`);
      }
      const json = (await res.json()) as {
        products?: {
          id: number;
          handle?: string;
          title?: string;
          body_html?: string;
          variants?: { title?: string }[];
        }[];
      };
      const products = json.products ?? [];
      for (const p of products) {
        const title = p.title ?? "";
        const body = (p.body_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const variantTitles = (p.variants ?? []).map((v) => v.title ?? "").filter(Boolean).join(", ");
        const content = [title, body, variantTitles].filter(Boolean).join("\n");
        if (content.length < 10) continue;
        const slug = p.handle ?? String(p.id);
        const productUrl = `${baseUrl}/products/${slug}`;
        items.push({ content, url: productUrl, title });
      }
      url = parseNextLink(res.headers.get("link"));
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: message },
    });
  }
}
