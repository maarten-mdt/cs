/**
 * Shopify products sync: paginate via Link rel=next, one KnowledgeChunk per product.
 * Supports multi-store via storeRegion (CA | US | INT).
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { insertKnowledgeChunks } from "./knowledgeChunks.js";
import { getShopifyCredentials, SHOPIFY_VERSION, type StoreRegion } from "../lib/shopifyConfig.js";

const FETCH_TIMEOUT_MS = 15000;

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1].trim() : null;
}

/** Fetch a single product by handle from Shopify. Returns null if not found or credentials missing. */
export async function fetchProduct(
  handle: string,
  storeRegion: StoreRegion = "CA"
): Promise<{
  title: string;
  description: string;
  url: string;
  variants: { title: string; price: string; available: boolean }[];
} | null> {
  try {
    const { storeUrl, headers } = await getShopifyCredentials(storeRegion);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `${storeUrl}/admin/api/${SHOPIFY_VERSION}/products.json?handle=${encodeURIComponent(handle)}&limit=1`,
      { signal: controller.signal, headers }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      products?: {
        handle?: string;
        title?: string;
        body_html?: string;
        variants?: { title?: string; price?: string; available?: boolean }[];
      }[];
    };
    const p = json.products?.[0];
    if (!p) return null;
    const description = (p.body_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      title: p.title ?? handle,
      description,
      url: `${storeUrl}/products/${p.handle ?? handle}`,
      variants: (p.variants ?? []).map((v) => ({
        title: v.title ?? "",
        price: v.price ?? "",
        available: v.available !== false,
      })),
    };
  } catch (e) {
    console.warn("[shopify] fetchProduct failed:", (e as Error).message);
    return null;
  }
}

export async function syncShopifyProducts(sourceId: string, storeRegion: StoreRegion = "CA"): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "SHOPIFY") {
    throw new Error("Source not found or not a Shopify source");
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  const { storeUrl, headers } = await getShopifyCredentials(storeRegion);
  let url: string | null = `${storeUrl}/admin/api/${SHOPIFY_VERSION}/products.json?limit=250`;
  const items: { content: string; url: string | null; title: string }[] = [];

  try {
    while (url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal, headers });
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
        const productUrl = `${storeUrl}/products/${slug}`;
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
