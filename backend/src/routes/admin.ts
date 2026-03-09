import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { prisma } from "../lib/prisma.js";
import { enqueueSyncSource } from "../lib/queue.js";
import { SourceType } from "@prisma/client";

export const adminRouter = Router();

adminRouter.use(requireAuth());

function normalizeUrl(url: string | undefined): string | null {
  if (!url || !url.trim()) return null;
  const u = url.trim();
  return u.startsWith("http") ? u : `https://${u}`;
}

adminRouter.get("/conversations", (_req, res) => {
  res.json([]);
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
