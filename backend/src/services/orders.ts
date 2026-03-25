/**
 * Live order lookup via Shopify API. Optional Acumatica for inventory.
 * Never cached — always calls Shopify in real time.
 * Supports multi-store via storeRegion (CA | US | INT).
 */

import { getShopifyCredentials, SHOPIFY_VERSION, type StoreRegion } from "../lib/shopifyConfig.js";

export interface OrderItem {
  name: string;
  sku: string;
  qtyOrdered: number;
  qtyShipped: number;
  qtyOnHand: number;
}

export type ShippingStatus = "SHIPPED" | "PARTIAL" | "PENDING_STOCK" | "BACKORDERED";

export interface Order {
  orderNumber: string;
  email: string;
  orderDate: string;
  status: string;
  items: OrderItem[];
  trackingNumber?: string;
  trackingUrl?: string;
  carrierName?: string;
  shippingStatus: ShippingStatus;
  expectedShipDate?: string;
}

async function getVariantInventoryQuantity(variantId: number, storeRegion: StoreRegion): Promise<number> {
  const { storeUrl, headers } = getShopifyCredentials(storeRegion);
  const res = await fetch(
    `${storeUrl}/admin/api/${SHOPIFY_VERSION}/variants/${variantId}.json?fields=inventory_quantity`,
    { headers }
  );
  if (!res.ok) return 0;
  const data = (await res.json()) as { variant?: { inventory_quantity?: number } };
  return data.variant?.inventory_quantity ?? 0;
}

async function getAcumaticaInventory(sku: string): Promise<number | null> {
  const base = process.env.ACUMATICA_API_URL?.replace(/\/$/, "");
  const user = process.env.ACUMATICA_USERNAME;
  const pass = process.env.ACUMATICA_PASSWORD;
  if (!base || !user || !pass) return null;
  try {
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const res = await fetch(`${base}/inventory?sku=${encodeURIComponent(sku)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { quantity?: number };
    return typeof data.quantity === "number" ? data.quantity : null;
  } catch {
    return null;
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toOrderItem(
  line: {
    name: string;
    sku: string;
    quantity: number;
    variant_id: number | null;
    fulfillable_quantity?: number;
  },
  fulfilledQty: number,
  inventoryQty: number
): OrderItem {
  return {
    name: line.name,
    sku: line.sku || "",
    qtyOrdered: line.quantity,
    qtyShipped: fulfilledQty,
    qtyOnHand: inventoryQty,
  };
}

export async function getOrderByNumber(orderNumber: string, storeRegion: StoreRegion = "CA"): Promise<Order | null> {
  const { storeUrl, headers } = getShopifyCredentials(storeRegion);
  const name = orderNumber.replace(/^#/, "").trim();
  const res = await fetch(
    `${storeUrl}/admin/api/${SHOPIFY_VERSION}/orders.json?name=${encodeURIComponent(name)}&status=any&limit=1`,
    { headers }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { orders?: unknown[] };
  const raw = data.orders?.[0] as RawShopifyOrder | undefined;
  if (!raw) return null;
  return rawOrderToOrder(raw, storeRegion);
}

export async function getOrdersByEmail(email: string, storeRegion: StoreRegion = "CA"): Promise<Order[]> {
  const { storeUrl, headers } = getShopifyCredentials(storeRegion);
  const res = await fetch(
    `${storeUrl}/admin/api/${SHOPIFY_VERSION}/orders.json?email=${encodeURIComponent(email)}&status=any&limit=5`,
    { headers }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { orders?: RawShopifyOrder[] };
  const list = data.orders ?? [];
  const out: Order[] = [];
  for (const raw of list) {
    try {
      out.push(await rawOrderToOrder(raw, storeRegion));
    } catch {
      // skip bad order
    }
  }
  return out;
}

interface RawShopifyOrder {
  name: string;
  email: string | null;
  created_at: string;
  fulfillment_status: string | null;
  line_items: {
    name: string;
    sku: string;
    quantity: number;
    variant_id: number | null;
    fulfillable_quantity?: number;
  }[];
  fulfillments?: {
    status: string;
    tracking_number: string | null;
    tracking_urls: string[] | null;
    tracking_company: string | null;
    line_items: { quantity: number }[];
  }[];
}

async function rawOrderToOrder(raw: RawShopifyOrder, storeRegion: StoreRegion): Promise<Order> {
  const fulfillments = raw.fulfillments ?? [];
  const firstFulfillment = fulfillments[0];
  let trackingNumber: string | undefined;
  let trackingUrl: string | undefined;
  let carrierName: string | undefined;
  if (firstFulfillment) {
    trackingNumber = firstFulfillment.tracking_number ?? undefined;
    trackingUrl = firstFulfillment.tracking_urls?.[0] ?? undefined;
    carrierName = firstFulfillment.tracking_company ?? undefined;
  }

  const totalFulfilled = fulfillments.reduce((sum, f) => sum + (f.line_items?.reduce((s, i) => s + i.quantity, 0) ?? 0), 0);
  const totalOrdered = raw.line_items.reduce((s, i) => s + i.quantity, 0);

  const items: OrderItem[] = [];
  let remainingFulfilled = totalFulfilled;
  for (const line of raw.line_items) {
    const fulfilledForLine = Math.min(line.quantity, Math.max(0, remainingFulfilled));
    remainingFulfilled -= fulfilledForLine;
    let qtyOnHand = 0;
    if (process.env.ACUMATICA_API_URL) {
      const acu = await getAcumaticaInventory(line.sku || "");
      if (acu !== null) qtyOnHand = acu;
      else if (line.variant_id) qtyOnHand = await getVariantInventoryQuantity(line.variant_id, storeRegion);
    } else if (line.variant_id) {
      qtyOnHand = await getVariantInventoryQuantity(line.variant_id, storeRegion);
    }
    items.push(toOrderItem(line, fulfilledForLine, qtyOnHand));
  }

  const allFulfilled = totalFulfilled >= totalOrdered;
  const orderDate = new Date(raw.created_at);
  const enoughInventory = items.every((i) => i.qtyOnHand >= i.qtyOrdered - i.qtyShipped);

  let shippingStatus: ShippingStatus;
  let expectedShipDate: string | undefined;
  if (allFulfilled) {
    shippingStatus = "SHIPPED";
  } else if (totalFulfilled > 0) {
    shippingStatus = "PARTIAL";
  } else if (enoughInventory) {
    shippingStatus = "PENDING_STOCK";
    expectedShipDate = formatDate(addDays(new Date(), 2));
  } else {
    shippingStatus = "BACKORDERED";
    expectedShipDate = formatDate(addDays(orderDate, 70));
  }

  return {
    orderNumber: raw.name,
    email: raw.email ?? "",
    orderDate: raw.created_at.slice(0, 10),
    status: raw.fulfillment_status ?? "unfulfilled",
    items,
    trackingNumber,
    trackingUrl,
    carrierName,
    shippingStatus,
    expectedShipDate,
  };
}
