import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { prisma } from "../lib/prisma.js";
import { enqueueSyncSource } from "../lib/queue.js";
import { getConfig, saveConfig, getConfigFromDb } from "../lib/config.js";
import { SourceType, ConversationStatus, type Prisma, Role } from "@prisma/client";
import { getOrdersByEmail } from "../services/orders.js";
import { getShopifyCredentials, hasShopifyCredentials } from "../lib/shopifyConfig.js";

export const adminRouter = Router();

adminRouter.use(requireAuth());

function normalizeUrl(url: string | undefined): string | null {
  if (!url || !url.trim()) return null;
  const u = url.trim();
  return u.startsWith("http") ? u : `https://${u}`;
}

// --- Conversations (Chunk 9) ---

adminRouter.get("/conversations", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const status = req.query.status as string | undefined;
    const topic = req.query.topic as string | undefined;
    const search = (req.query.search as string)?.trim();

    const where: Prisma.ConversationWhereInput = {};
    if (status && Object.values(ConversationStatus).includes(status as ConversationStatus)) {
      where.status = status as ConversationStatus;
    }
    if (topic) where.topic = { contains: topic, mode: "insensitive" };
    if (search) {
      where.OR = [
        { customer: { email: { contains: search, mode: "insensitive" } } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [list, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { name: true, email: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    const items = list.map((c) => ({
      id: c.id,
      customerName: c.customer?.name ?? null,
      customerEmail: c.customer?.email ?? null,
      topic: c.topic,
      status: c.status,
      messageCount: c._count.messages,
      sentiment: c.sentiment,
      createdAt: c.createdAt,
      resolvedAt: c.resolvedAt,
    }));
    res.json({ items, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

adminRouter.get("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    res.json(conversation);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// --- Customers (Chunk 9) ---

adminRouter.get("/customers", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const search = (req.query.search as string)?.trim();

    const where: Prisma.CustomerWhereInput = {
      conversations: { some: {} },
    };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [list, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { conversations: true } } },
      }),
      prisma.customer.count({ where }),
    ]);

    const items = list.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      totalSpend: c.totalSpend,
      orderCount: c.orderCount,
      conversationCount: c._count.conversations,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      shopifyId: c.shopifyId,
      mergedIntoId: c.mergedIntoId,
    }));
    res.json({ items, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list customers" });
  }
});

adminRouter.get("/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        mergedFrom: { select: { id: true, email: true, name: true } },
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, topic: true, status: true, createdAt: true },
        },
      },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    let orders: Awaited<ReturnType<typeof getOrdersByEmail>> | null = null;
    const customerRegion = (customer.storeRegion ?? "CA") as import("../lib/shopifyConfig.js").StoreRegion;
    if (customer.email && (await hasShopifyCredentials(customerRegion))) {
      try {
        orders = await getOrdersByEmail(customer.email, customerRegion);
      } catch {
        orders = [];
      }
    }

    let shopifyCustomerAdminUrl: string | null = null;
    if (customer.shopifyId && (await hasShopifyCredentials(customerRegion))) {
      try {
        const { storeUrl } = await getShopifyCredentials(customerRegion);
        const domain = storeUrl.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/i, "");
        shopifyCustomerAdminUrl = `https://admin.shopify.com/store/${domain}/customers/${customer.shopifyId}`;
      } catch {
        // credentials not configured for this region
      }
    }

    res.json({
      ...customer,
      orders: orders ?? null,
      shopifyCustomerAdminUrl,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load customer" });
  }
});

adminRouter.post("/customers/:id/merge", async (req, res) => {
  try {
    const { id: mergeToId } = req.params;
    const { mergeFromId } = req.body as { mergeFromId?: string };
    if (!mergeFromId || typeof mergeFromId !== "string" || !mergeFromId.trim()) {
      return res.status(400).json({ error: "mergeFromId is required" });
    }
    const fromId = mergeFromId.trim();
    if (fromId === mergeToId) {
      return res.status(400).json({ error: "Cannot merge customer into themselves" });
    }

    const [mergeTo, mergeFrom] = await Promise.all([
      prisma.customer.findUnique({ where: { id: mergeToId } }),
      prisma.customer.findUnique({ where: { id: fromId } }),
    ]);
    if (!mergeTo) return res.status(404).json({ error: "Target customer not found" });
    if (!mergeFrom) return res.status(404).json({ error: "Source customer not found" });
    if (mergeFrom.mergedIntoId) return res.status(400).json({ error: "Source customer is already merged" });

    await prisma.$transaction(async (tx) => {
      await tx.conversation.updateMany({
        where: { customerId: fromId },
        data: { customerId: mergeToId },
      });
      await tx.customer.update({
        where: { id: fromId },
        data: { mergedIntoId: mergeToId },
      });
      const toUpdate: { shopifyId?: string; hubspotId?: string; zendeskId?: string } = {};
      if (mergeFrom.shopifyId && !mergeTo.shopifyId) toUpdate.shopifyId = mergeFrom.shopifyId;
      if (mergeFrom.hubspotId && !mergeTo.hubspotId) toUpdate.hubspotId = mergeFrom.hubspotId;
      if (mergeFrom.zendeskId && !mergeTo.zendeskId) toUpdate.zendeskId = mergeFrom.zendeskId;
      if (Object.keys(toUpdate).length > 0) {
        await tx.customer.update({ where: { id: mergeToId }, data: toUpdate });
      }
    });
    const updated = await prisma.customer.findUnique({
      where: { id: mergeToId },
      include: { _count: { select: { conversations: true } } },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to merge customers" });
  }
});

// --- Knowledge sources (Chunk 6) ---

adminRouter.post("/sources", async (req, res) => {
  try {
    const { name, type, url: rawUrl, maxPages } = req.body as {
      name?: string;
      type?: string;
      url?: string;
      maxPages?: number;
    };
    if (!name || !type) {
      return res.status(400).json({ error: "name and type are required" });
    }
    const sourceType = type.toUpperCase() as SourceType;
    if (!Object.values(SourceType).includes(sourceType)) {
      return res.status(400).json({ error: "Invalid type" });
    }
    let url: string | undefined;
    if (rawUrl != null && String(rawUrl).trim()) {
      const u = String(rawUrl).trim();
      url = normalizeUrl(u) ?? (u.startsWith("http") ? u : `https://${u}`);
    }
    const source = await prisma.knowledgeSource.create({
      data: {
        name: String(name).trim(),
        type: sourceType,
        url,
        maxPages: typeof maxPages === "number" ? Math.min(50_000, Math.max(1, maxPages)) : 500,
      },
    });
    if (source.type === "WEBSITE" && source.url) await enqueueSyncSource(source.id, "website");
    else if (source.type === "ZENDESK") await enqueueSyncSource(source.id, "zendesk");
    else if (source.type === "GOOGLE_DRIVE" && source.url) await enqueueSyncSource(source.id, "google_drive");
    else if (source.type === "GOOGLE_SHEETS" && source.url) await enqueueSyncSource(source.id, "google_sheets");
    else if (source.type === "SHOPIFY") await enqueueSyncSource(source.id, "shopify");
    res.status(201).json(source);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create source" });
  }
});

adminRouter.get("/sources", async (_req, res) => {
  try {
    const sources = await prisma.knowledgeSource.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(sources);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list sources" });
  }
});

adminRouter.get("/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const source = await prisma.knowledgeSource.findUnique({
      where: { id },
      include: {
        chunks: { take: 20, orderBy: { createdAt: "asc" }, select: { id: true, content: true, url: true, title: true, createdAt: true } },
      },
    });
    if (!source) return res.status(404).json({ error: "Source not found" });
    res.json(source);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load source" });
  }
});

adminRouter.post("/sources/:id/sync", async (req, res) => {
  try {
    const { id } = req.params;
    const source = await prisma.knowledgeSource.findUnique({ where: { id } });
    if (!source) return res.status(404).json({ error: "Source not found" });
    await enqueueSyncSource(source.id, source.type.toLowerCase());
    res.json({ ok: true, message: "Sync job enqueued" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to enqueue sync" });
  }
});

adminRouter.patch("/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, maxPages, url: rawUrl } = req.body as { name?: string; maxPages?: number; url?: string };
    const data: { name?: string; maxPages?: number; url?: string | null } = {};
    if (name !== undefined) data.name = String(name).trim();
    if (typeof maxPages === "number") data.maxPages = Math.min(50_000, Math.max(1, maxPages));
    if (rawUrl !== undefined) {
      const s = String(rawUrl).trim();
      data.url = s === "" ? null : (normalizeUrl(s) ?? (s.startsWith("http") ? s : `https://${s}`));
    }
    const source = await prisma.knowledgeSource.update({ where: { id }, data });
    res.json(source);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") return res.status(404).json({ error: "Source not found" });
    console.error(e);
    res.status(500).json({ error: "Failed to update source" });
  }
});

adminRouter.delete("/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.knowledgeSource.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") return res.status(404).json({ error: "Source not found" });
    console.error(e);
    res.status(500).json({ error: "Failed to delete source" });
  }
});

// --- Knowledge: system prompt & suggested questions (Chunk 10) ---

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for MDT (Modular Driven Technologies). You help customers with product questions, orders, compatibility, and installation. Be concise and friendly. Use line breaks between paragraphs and use markdown-style lists (- or 1. 2.) when listing steps or items so the reply is easy to read.`;

adminRouter.get("/knowledge/system-prompt", async (_req, res) => {
  try {
    const value = await getConfigFromDb("SYSTEM_PROMPT");
    res.json({ systemPrompt: value ?? DEFAULT_SYSTEM_PROMPT });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load system prompt" });
  }
});

adminRouter.put("/knowledge/system-prompt", async (req, res) => {
  try {
    const { systemPrompt } = req.body as { systemPrompt?: string };
    const value = typeof systemPrompt === "string" ? systemPrompt : DEFAULT_SYSTEM_PROMPT;
    await saveConfig("SYSTEM_PROMPT", value);
    res.json({ systemPrompt: value });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save system prompt" });
  }
});

const DEFAULT_SUGGESTED_QUESTIONS = ["Where is my order?", "Is this compatible with my rifle?", "How do I install the chassis?"];

adminRouter.get("/knowledge/suggested-questions", async (_req, res) => {
  try {
    const raw = await getConfigFromDb("SUGGESTED_QUESTIONS");
    let questions: string[] = DEFAULT_SUGGESTED_QUESTIONS;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) questions = parsed.slice(0, 10);
      } catch {}
    }
    res.json({ questions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load suggested questions" });
  }
});

adminRouter.put("/knowledge/suggested-questions", async (req, res) => {
  try {
    const { questions } = req.body as { questions?: unknown };
    const arr = Array.isArray(questions) ? questions.filter((x) => typeof x === "string").slice(0, 10) : DEFAULT_SUGGESTED_QUESTIONS;
    await saveConfig("SUGGESTED_QUESTIONS", JSON.stringify(arr));
    res.json({ questions: arr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save suggested questions" });
  }
});

// --- Analytics (Chunk 10) ---

adminRouter.get("/analytics/summary", async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(String(req.query.days), 10) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [conversations, resolved, escalated] = await Promise.all([
      prisma.conversation.count({ where: { createdAt: { gte: since } } }),
      prisma.conversation.count({ where: { status: "RESOLVED", updatedAt: { gte: since } } }),
      prisma.conversation.count({ where: { status: "ESCALATED", escalatedAt: { gte: since } } }),
    ]);

    const withMessages = await prisma.conversation.findMany({
      where: { createdAt: { gte: since } },
      include: { _count: { select: { messages: true } } },
    });
    const totalMessages = withMessages.reduce((s, c) => s + c._count.messages, 0);
    const avgMessages = conversations > 0 ? Math.round((totalMessages / conversations) * 10) / 10 : 0;
    const deflectionRate = conversations > 0 ? Math.round((1 - escalated / conversations) * 1000) / 10 : 0;

    const topics = await prisma.conversation.groupBy({
      by: ["topic"],
      where: { createdAt: { gte: since }, topic: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });
    const topTopics = topics.map((t) => ({ topic: t.topic || "(none)", count: t._count.id }));

    const daily = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt")::date::text as day, count(*)::bigint as count
      FROM "Conversation"
      WHERE "createdAt" >= ${since}
      GROUP BY date_trunc('day', "createdAt")::date
      ORDER BY day
    `;
    const dailyVolume = daily.map((d) => ({ date: d.day, count: Number(d.count) }));

    res.json({
      totalConversations: conversations,
      resolvedCount: resolved,
      escalatedCount: escalated,
      deflectionRate,
      avgMessages,
      topTopics,
      dailyVolume,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// --- Connections (Chunk 10): get/set config, test ---

const CONNECTION_KEYS: Record<string, string[]> = {
  shopify: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ACCESS_TOKEN"],
  shopify_ca: ["SHOPIFY_CA_DOMAIN", "SHOPIFY_CA_CLIENT_ID", "SHOPIFY_CA_CLIENT_SECRET", "SHOPIFY_CA_TOKEN"],
  shopify_us: ["SHOPIFY_US_DOMAIN", "SHOPIFY_US_CLIENT_ID", "SHOPIFY_US_CLIENT_SECRET", "SHOPIFY_US_TOKEN"],
  shopify_int: ["SHOPIFY_INT_DOMAIN", "SHOPIFY_INT_CLIENT_ID", "SHOPIFY_INT_CLIENT_SECRET", "SHOPIFY_INT_TOKEN"],
  zendesk: ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
  hubspot: ["HUBSPOT_API_KEY"],
  acumatica: ["ACUMATICA_API_URL", "ACUMATICA_USERNAME", "ACUMATICA_PASSWORD"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_DRIVE_ACCESS_TOKEN"],
  firecrawl: ["FIRECRAWL_API_KEY"],
  widget: ["CHAT_WIDGET_ORIGIN", "WIDGET_GREETING", "WIDGET_HOSTNAME_REGION_MAP"],
};

const NO_MASK_KEYS = new Set([
  "CHAT_WIDGET_ORIGIN", "WIDGET_GREETING", "WIDGET_HOSTNAME_REGION_MAP",
  "ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ACUMATICA_API_URL",
]);

function mask(s: string, key?: string): string {
  if (key && NO_MASK_KEYS.has(key)) return s;
  if (!s || s.length < 8) return "••••";
  return s.slice(0, 4) + "••••" + s.slice(-2);
}

adminRouter.get("/connections", async (_req, res) => {
  try {
    const integrations: Record<string, { configured: boolean; keys?: Record<string, string> }> = {};
    for (const [name, keys] of Object.entries(CONNECTION_KEYS)) {
      const values: Record<string, string> = {};
      for (const key of keys) {
        const v = getConfig(key);
        values[key] = v && v.trim() ? mask(v, key) : "";
      }
      integrations[name] = { configured: keys.every((k) => getConfig(k)?.trim()), keys: values };
    }
    res.json({ integrations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load connections" });
  }
});

adminRouter.put("/connections", async (req, res) => {
  try {
    const { integration, values } = req.body as { integration?: string; values?: Record<string, string> };
    if (!integration || !CONNECTION_KEYS[integration]) {
      return res.status(400).json({ error: "Invalid integration" });
    }
    const keys = CONNECTION_KEYS[integration];
    const toSave = values ?? {};
    for (const key of keys) {
      if (key in toSave && typeof toSave[key] === "string") {
        await saveConfig(key, toSave[key].trim());
      }
    }
    const integrations: Record<string, { configured: boolean }> = {};
    integrations[integration] = { configured: keys.every((k) => getConfig(k)?.trim()) };
    res.json({ integrations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save connection" });
  }
});

adminRouter.post("/connections/test", async (req, res) => {
  try {
    const { integration } = req.body as { integration?: string };
    if (!integration || !CONNECTION_KEYS[integration]) {
      return res.status(400).json({ error: "Invalid integration" });
    }
    let message: string;
    try {
      if (integration === "shopify") {
        // Legacy single-store test
        const domain = getConfig("SHOPIFY_STORE_DOMAIN")?.trim();
        const token = getConfig("SHOPIFY_ACCESS_TOKEN")?.trim();
        if (!domain || !token) throw new Error("Store domain and access token are required");
        const url = (domain.startsWith("http") ? domain : `https://${domain}`).replace(/\/$/, "");
        const r = await fetch(`${url}/admin/api/2025-01/shop.json`, {
          headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        message = "Connected successfully";
      } else if (integration === "shopify_ca" || integration === "shopify_us" || integration === "shopify_int") {
        // Multi-store test using OAuth or static token via getShopifyCredentials
        const regionMap: Record<string, import("../lib/shopifyConfig.js").StoreRegion> = { shopify_ca: "CA", shopify_us: "US", shopify_int: "INT" };
        const region = regionMap[integration];
        const creds = await getShopifyCredentials(region);
        const r = await fetch(`${creds.storeUrl}/admin/api/2025-01/shop.json`, { headers: creds.headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        const shop = (await r.json()) as { shop?: { name?: string } };
        message = `Connected to ${shop.shop?.name || creds.storeUrl}`;
      } else if (integration === "zendesk") {
        const sub = getConfig("ZENDESK_SUBDOMAIN")?.trim();
        const email = getConfig("ZENDESK_EMAIL")?.trim();
        const token = getConfig("ZENDESK_API_TOKEN")?.trim();
        if (!sub || !email || !token) throw new Error("Subdomain, email, and API token are required");
        const clean = sub.replace(/\.zendesk\.com$/i, "");
        const r = await fetch(`https://${clean}.zendesk.com/api/v2/users/me.json`, {
          headers: { Authorization: `Basic ${Buffer.from(`${email}/token:${token}`).toString("base64")}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        message = "Connected successfully";
      } else if (integration === "hubspot") {
        const key = getConfig("HUBSPOT_API_KEY")?.trim();
        if (!key) throw new Error("API key is required");
        const r = await fetch("https://api.hubapi.com/account-info/v3/details", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        message = "Connected successfully";
      } else if (integration === "anthropic") {
        const key = getConfig("ANTHROPIC_API_KEY")?.trim();
        if (!key) throw new Error("API key is required");
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] }),
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
        }
        message = "Connected successfully";
      } else if (integration === "firecrawl") {
        const key = getConfig("FIRECRAWL_API_KEY")?.trim();
        if (!key) throw new Error("API key is required");
        const r = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "test", limit: 1 }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        message = "Connected successfully";
      } else if (integration === "widget") {
        const origin = getConfig("CHAT_WIDGET_ORIGIN")?.trim();
        if (!origin) throw new Error("CHAT_WIDGET_ORIGIN is required");
        message = "Widget configured — origin: " + origin;
      } else if (integration === "acumatica" || integration === "google") {
        message = "Test not implemented for this integration";
      } else {
        message = "Unknown integration";
      }
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: message });
    }
    res.json({ ok: true, message });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to test connection" });
  }
});

// --- Review (Daily improvement) ---

// GET /review/feedback — thumbs-down messages with conversation context
adminRouter.get("/review/feedback", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const ratingFilter = req.query.rating as string || "down";
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.messageFeedback.findMany({
        where: { rating: ratingFilter },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          message: {
            include: {
              conversation: {
                include: {
                  customer: { select: { id: true, email: true, name: true } },
                  messages: { orderBy: { createdAt: "asc" }, take: 20 },
                },
              },
            },
          },
        },
      }),
      prisma.messageFeedback.count({ where: { rating: ratingFilter } }),
    ]);

    // For each feedback item, find the user question that preceded the bot response
    const result = items.map((fb) => {
      const msgs = fb.message.conversation.messages;
      const botIdx = msgs.findIndex((m) => m.id === fb.messageId);
      const userMsg = botIdx > 0 ? msgs[botIdx - 1] : null;
      return {
        id: fb.id,
        rating: fb.rating,
        comment: fb.comment,
        createdAt: fb.createdAt,
        messageId: fb.messageId,
        botResponse: fb.message.content,
        userQuestion: userMsg?.role === "USER" ? userMsg.content : null,
        conversationId: fb.message.conversationId,
        customer: fb.message.conversation.customer,
      };
    });

    res.json({ items: result, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load feedback" });
  }
});

// GET /review/discrepancies — open discrepancies with AI suggestions
adminRouter.get("/review/discrepancies", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const status = (req.query.status as string) || "open";
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.discrepancy.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.discrepancy.count({ where: { status } }),
    ]);

    res.json({ items, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load discrepancies" });
  }
});

// PUT /review/discrepancies/:id — resolve or dismiss
adminRouter.put("/review/discrepancies/:id", async (req, res) => {
  try {
    const { status, resolution } = req.body as { status?: string; resolution?: string };
    if (!status || !["resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "status must be 'resolved' or 'dismissed'" });
    }
    const user = req.user as { email?: string } | undefined;
    const updated = await prisma.discrepancy.update({
      where: { id: req.params.id },
      data: {
        status,
        resolution: resolution?.trim() || null,
        resolvedBy: user?.email || null,
      },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update discrepancy" });
  }
});

// GET /review/qa — list curated Q&A pairs
adminRouter.get("/review/qa", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.curatedQA.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.curatedQA.count(),
    ]);

    res.json({ items, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load Q&A" });
  }
});

// POST /review/qa — add curated Q&A pair
adminRouter.post("/review/qa", async (req, res) => {
  try {
    const { question, answer, source } = req.body as { question?: string; answer?: string; source?: string };
    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ error: "question and answer are required" });
    }
    const user = req.user as { email?: string } | undefined;
    const qa = await prisma.curatedQA.create({
      data: {
        question: question.trim(),
        answer: answer.trim(),
        source: source?.trim() || "admin_review",
        addedBy: user?.email || null,
      },
    });
    // Embed into knowledge base
    await embedCuratedQA(qa.id, qa.question, qa.answer);
    res.json(qa);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create Q&A" });
  }
});

// PUT /review/qa/:id — edit curated Q&A
adminRouter.put("/review/qa/:id", async (req, res) => {
  try {
    const { question, answer, active } = req.body as { question?: string; answer?: string; active?: boolean };
    const data: Record<string, unknown> = {};
    if (question?.trim()) data.question = question.trim();
    if (answer?.trim()) data.answer = answer.trim();
    if (typeof active === "boolean") data.active = active;
    const qa = await prisma.curatedQA.update({ where: { id: req.params.id }, data });
    // Re-embed if content changed
    if (question || answer) {
      await embedCuratedQA(qa.id, qa.question, qa.answer);
    }
    res.json(qa);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update Q&A" });
  }
});

// DELETE /review/qa/:id
adminRouter.delete("/review/qa/:id", async (req, res) => {
  try {
    await prisma.curatedQA.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete Q&A" });
  }
});

// POST /review/correct — correct a bad bot response (creates CuratedQA from it)
adminRouter.post("/review/correct", async (req, res) => {
  try {
    const { messageId, correctedAnswer, question } = req.body as {
      messageId?: string;
      correctedAnswer?: string;
      question?: string;
    };
    if (!messageId?.trim() || !correctedAnswer?.trim() || !question?.trim()) {
      return res.status(400).json({ error: "messageId, question, and correctedAnswer are required" });
    }
    const user = req.user as { email?: string } | undefined;
    const qa = await prisma.curatedQA.create({
      data: {
        question: question.trim(),
        answer: correctedAnswer.trim(),
        source: `corrected_message:${messageId}`,
        addedBy: user?.email || null,
      },
    });
    await embedCuratedQA(qa.id, qa.question, qa.answer);
    res.json(qa);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save correction" });
  }
});

// GET /review/stats — summary for review page header
adminRouter.get("/review/stats", async (_req, res) => {
  try {
    const [thumbsDown, thumbsUp, openDiscrepancies, totalQA] = await Promise.all([
      prisma.messageFeedback.count({ where: { rating: "down" } }),
      prisma.messageFeedback.count({ where: { rating: "up" } }),
      prisma.discrepancy.count({ where: { status: "open" } }),
      prisma.curatedQA.count({ where: { active: true } }),
    ]);
    res.json({ thumbsDown, thumbsUp, openDiscrepancies, totalQA });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load review stats" });
  }
});

/** Embed a curated Q&A pair into the knowledge base so RAG can find it. */
async function embedCuratedQA(qaId: string, question: string, answer: string): Promise<void> {
  try {
    const { generateEmbedding } = await import("../services/embeddings.js");
    // Find or create the "curated-qa" knowledge source
    let source = await prisma.knowledgeSource.findFirst({ where: { type: "MANUAL", name: "Curated Q&A" } });
    if (!source) {
      source = await prisma.knowledgeSource.create({
        data: { name: "Curated Q&A", type: "MANUAL", status: "SYNCED" },
      });
    }
    const content = `Q: ${question}\nA: ${answer}`;
    const embedding = await generateEmbedding(content);
    const vecStr = "[" + embedding.join(",") + "]";
    const chunkId = `qa-${qaId}`;
    // Upsert: delete old chunk for this QA if exists, then insert
    await prisma.$executeRawUnsafe(`DELETE FROM "KnowledgeChunk" WHERE id = $1`, chunkId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "KnowledgeChunk" (id, "sourceId", content, url, title, "createdAt", embedding)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6::vector)`,
      chunkId,
      source.id,
      content,
      null,
      `Curated: ${question.slice(0, 80)}`,
      vecStr
    );
    // Update source chunk count
    const count = await prisma.knowledgeChunk.count({ where: { sourceId: source.id } });
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: { chunkCount: count, lastSyncedAt: new Date() },
    });
  } catch (e) {
    console.warn("[embedCuratedQA] Failed:", (e as Error).message);
  }
}

// --- Settings (Chunk 10): ADMIN only ---

adminRouter.get("/users", requireAuth([Role.ADMIN]), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
    });
    res.json(users);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list users" });
  }
});

adminRouter.post("/users/invite", requireAuth([Role.ADMIN]), async (req, res) => {
  try {
    const { email, name, role } = req.body as { email?: string; name?: string; role?: string };
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }
    const r = (role?.toUpperCase() || "SUPPORT") as Role;
    if (!Object.values(Role).includes(r)) return res.status(400).json({ error: "Invalid role" });
    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) return res.status(400).json({ error: "User already exists with this email" });
    const user = await prisma.user.create({
      data: { email: email.trim().toLowerCase(), name: name?.trim() || null, role: r },
    });
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      message: "User created. They can sign in with Google using this email (ensure ALLOWED_EMAIL_DOMAIN allows their domain).",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to invite user" });
  }
});

adminRouter.patch("/users/:id", requireAuth([Role.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body as { name?: string; role?: string };
    const data: { name?: string | null; role?: Role } = {};
    if (name !== undefined) data.name = name?.trim() || null;
    if (role !== undefined) {
      const r = role?.toUpperCase() as Role;
      if (!Object.values(Role).includes(r)) return res.status(400).json({ error: "Invalid role" });
      data.role = r;
    }
    const user = await prisma.user.update({ where: { id }, data });
    res.json(user);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") return res.status(404).json({ error: "User not found" });
    console.error(e);
    res.status(500).json({ error: "Failed to update user" });
  }
});

adminRouter.delete("/users/:id", requireAuth([Role.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") return res.status(404).json({ error: "User not found" });
    console.error(e);
    res.status(500).json({ error: "Failed to delete user" });
  }
});
