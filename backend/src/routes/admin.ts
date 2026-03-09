import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { prisma } from "../lib/prisma.js";
import { enqueueSyncSource } from "../lib/queue.js";
import { SourceType, ConversationStatus, type Prisma } from "@prisma/client";
import { getOrdersByEmail } from "../services/orders.js";

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
    if (customer.email && process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN) {
      try {
        orders = await getOrdersByEmail(customer.email);
      } catch {
        orders = [];
      }
    }

    let shopifyCustomerAdminUrl: string | null = null;
    if (customer.shopifyId && process.env.SHOPIFY_STORE_DOMAIN) {
      const domain = process.env.SHOPIFY_STORE_DOMAIN.trim().replace(/\.myshopify\.com$/i, "");
      shopifyCustomerAdminUrl = `https://admin.shopify.com/store/${domain}/customers/${customer.shopifyId}`;
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
