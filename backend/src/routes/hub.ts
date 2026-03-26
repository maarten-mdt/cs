/**
 * Agent Hub API routes — the internal Zendesk replacement.
 * All routes require authentication (Google OAuth, @mdttac.com).
 */

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { cacheGet, cacheSet, cacheDel, TTL } from "../lib/redis.js";
import {
  ConversationStatus,
  MessageRole,
  Channel,
  Priority,
  CallDirection,
  CallStatus,
  CallSource,
} from "@prisma/client";

export const hubRouter = Router();

// All hub routes require auth
hubRouter.use(requireAuth());

// ─── Types ─────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
}

function getUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

// ─── GET /bootstrap — single bulk load on login ────────────────────

hubRouter.get("/bootstrap", async (req: Request, res: Response) => {
  const user = getUser(req);
  const cacheKey = `hub:bootstrap:${user.id}`;

  // Check cache (30s TTL)
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return res.json(cached);

  const [conversations, agents, cannedResponses, counts] = await Promise.all([
    // Last 50 open/pending/escalated tickets
    prisma.conversation.findMany({
      where: { status: { in: ["BOT", "OPEN", "PENDING", "ESCALATED"] } },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        customer: { select: { id: true, email: true, name: true, phone: true } },
        tags: { include: { tag: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    }),

    // All agents
    prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, avatarUrl: true, lastLoginAt: true },
    }),

    // All canned responses
    prisma.cannedResponse.findMany({ orderBy: { shortcut: "asc" } }),

    // Counts
    Promise.all([
      prisma.conversation.count({ where: { status: "OPEN" } }),
      prisma.conversation.count({ where: { status: "PENDING" } }),
      prisma.conversation.count({ where: { assignedToId: user.id, status: { in: ["OPEN", "PENDING", "ESCALATED"] } } }),
      prisma.conversation.count({ where: { priority: "URGENT", status: { in: ["OPEN", "PENDING", "ESCALATED"] } } }),
      prisma.conversation.count({ where: { status: "BOT" } }),
    ]),
  ]);

  const result = {
    conversations: conversations.map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      status: c.status,
      priority: c.priority,
      channel: c.channel,
      subject: c.subject,
      storeRegion: c.storeRegion,
      assignedTo: c.assignedTo,
      customer: c.customer,
      tags: c.tags.map((ct) => ct.tag),
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt ?? c.updatedAt,
      createdAt: c.createdAt,
    })),
    agents,
    cannedResponses,
    counts: {
      open: counts[0],
      pending: counts[1],
      mine: counts[2],
      urgent: counts[3],
      bot: counts[4],
    },
    currentAgent: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };

  await cacheSet(cacheKey, result, TTL.BOOTSTRAP);
  res.json(result);
});

// ─── GET /conversations — paginated list with filters ──────────────

hubRouter.get("/conversations", async (req: Request, res: Response) => {
  const user = getUser(req);
  const {
    status,
    channel,
    priority,
    assignedTo,
    tag,
    search,
    cursor,
    limit: rawLimit,
    view,
  } = req.query;

  const limit = Math.min(Number(rawLimit) || 50, 100);

  // Build where clause
  const where: Record<string, unknown> = {};

  // Predefined views
  if (view === "mine") {
    where.assignedToId = user.id;
    where.status = { in: ["OPEN", "PENDING", "ESCALATED"] };
  } else if (view === "unassigned") {
    where.assignedToId = null;
    where.status = { in: ["OPEN", "PENDING", "BOT"] };
  } else if (view === "urgent") {
    where.priority = "URGENT";
    where.status = { in: ["OPEN", "PENDING", "ESCALATED"] };
  } else {
    // Custom filters
    if (status) {
      const statuses = String(status).split(",").filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (channel) where.channel = String(channel);
    if (priority) where.priority = String(priority);
    if (assignedTo) {
      where.assignedToId = assignedTo === "none" ? null : String(assignedTo);
    }
    if (tag) {
      where.tags = { some: { tag: { name: String(tag) } } };
    }
  }

  // Text search on subject or customer email/name
  if (search && String(search).trim()) {
    const s = String(search).trim();
    where.OR = [
      { subject: { contains: s, mode: "insensitive" } },
      { customer: { email: { contains: s, mode: "insensitive" } } },
      { customer: { name: { contains: s, mode: "insensitive" } } },
      { sessionId: { contains: s } },
    ];
  }

  // Cursor-based pagination
  if (cursor) {
    where.id = { lt: String(cursor) };
  }

  const conversations = await prisma.conversation.findMany({
    where: where as any,
    orderBy: { lastMessageAt: "desc" },
    take: limit + 1, // +1 to detect if there's a next page
    include: {
      customer: { select: { id: true, email: true, name: true, phone: true } },
      tags: { include: { tag: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  });

  const hasMore = conversations.length > limit;
  const items = hasMore ? conversations.slice(0, limit) : conversations;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({
    conversations: items.map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      status: c.status,
      priority: c.priority,
      channel: c.channel,
      subject: c.subject,
      storeRegion: c.storeRegion,
      assignedTo: c.assignedTo,
      customer: c.customer,
      tags: c.tags.map((ct) => ct.tag),
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt ?? c.updatedAt,
      createdAt: c.createdAt,
    })),
    nextCursor,
    hasMore,
  });
});

// ─── GET /conversations/:id — full ticket detail ───────────────────

hubRouter.get("/conversations/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const cacheKey = `conversation:${id}`;

  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return res.json(cached);

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      customer: true,
      tags: { include: { tag: true } },
      assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          feedback: true,
        },
      },
      phoneCalls: {
        orderBy: { startedAt: "desc" },
        include: {
          agent: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const result = {
    ...conversation,
    tags: conversation.tags.map((ct) => ct.tag),
  };

  await cacheSet(cacheKey, result, TTL.CONVERSATION);
  res.json(result);
});

// ─── PATCH /conversations/:id — update status, priority, assignment ─

hubRouter.patch("/conversations/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, priority, assignedToId, subject, snoozedUntil } = req.body;

  const data: Record<string, unknown> = {};
  if (status && Object.values(ConversationStatus).includes(status)) {
    data.status = status;
    if (status === "RESOLVED") data.resolvedAt = new Date();
    if (status === "ESCALATED") data.escalatedAt = new Date();
  }
  if (priority && Object.values(Priority).includes(priority)) data.priority = priority;
  if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
  if (subject !== undefined) data.subject = subject;
  if (snoozedUntil !== undefined) {
    data.snoozedUntil = snoozedUntil ? new Date(snoozedUntil) : null;
    if (snoozedUntil) data.status = "SNOOZED";
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: data as any,
    include: {
      customer: { select: { id: true, email: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  // Invalidate caches
  await cacheDel(`conversation:${id}`);
  await cacheDel(`hub:bootstrap:${getUser(req).id}`);

  res.json(conversation);
});

// ─── PATCH /conversations/bulk — bulk operations ───────────────────

hubRouter.patch("/conversations/bulk", async (req: Request, res: Response) => {
  const { ids, action, value } = req.body;

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return res.status(400).json({ error: "ids must be an array of 1-50 conversation IDs" });
  }
  if (!action || !["resolve", "assign", "priority", "tag", "status"].includes(action)) {
    return res.status(400).json({ error: "action must be one of: resolve, assign, priority, tag, status" });
  }

  let updated = 0;

  switch (action) {
    case "resolve":
      ({ count: updated } = await prisma.conversation.updateMany({
        where: { id: { in: ids } },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      }));
      break;
    case "assign":
      ({ count: updated } = await prisma.conversation.updateMany({
        where: { id: { in: ids } },
        data: { assignedToId: value || null },
      }));
      break;
    case "priority":
      if (!Object.values(Priority).includes(value)) {
        return res.status(400).json({ error: "Invalid priority value" });
      }
      ({ count: updated } = await prisma.conversation.updateMany({
        where: { id: { in: ids } },
        data: { priority: value },
      }));
      break;
    case "status":
      if (!Object.values(ConversationStatus).includes(value)) {
        return res.status(400).json({ error: "Invalid status value" });
      }
      ({ count: updated } = await prisma.conversation.updateMany({
        where: { id: { in: ids } },
        data: { status: value },
      }));
      break;
    case "tag":
      // Add a tag to all conversations
      const tag = await prisma.tag.findUnique({ where: { name: value } });
      if (!tag) return res.status(404).json({ error: "Tag not found" });
      for (const cid of ids) {
        await prisma.conversationTag.upsert({
          where: { conversationId_tagId: { conversationId: cid, tagId: tag.id } },
          create: { conversationId: cid, tagId: tag.id },
          update: {},
        });
      }
      updated = ids.length;
      break;
  }

  // Invalidate caches
  for (const id of ids) {
    await cacheDel(`conversation:${id}`);
  }

  res.json({ updated });
});

// ─── POST /conversations/:id/reply — agent sends reply ─────────────

hubRouter.post("/conversations/:id/reply", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content, isInternal } = req.body;
  const user = getUser(req);

  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required" });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  // Create the message
  const message = await prisma.message.create({
    data: {
      conversationId: id,
      role: isInternal ? MessageRole.SYSTEM : MessageRole.AGENT,
      content: content.trim(),
      channel: conversation.channel,
      senderAgentId: user.id,
      isInternal: !!isInternal,
    },
  });

  // Update conversation
  const updateData: Record<string, unknown> = {
    lastMessageAt: new Date(),
  };
  // If replying to a BOT conversation, move to OPEN
  if (conversation.status === "BOT") {
    updateData.status = "OPEN";
  }
  // If unassigned, auto-assign to replying agent
  if (!conversation.assignedToId) {
    updateData.assignedToId = user.id;
  }

  await prisma.conversation.update({
    where: { id },
    data: updateData as any,
  });

  // Invalidate cache
  await cacheDel(`conversation:${id}`);

  res.json({
    id: message.id,
    role: message.role,
    content: message.content,
    isInternal: message.isInternal,
    senderAgentId: message.senderAgentId,
    createdAt: message.createdAt,
  });
});

// ─── Tags CRUD ─────────────────────────────────────────────────────

hubRouter.get("/tags", async (_req: Request, res: Response) => {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { conversations: true } } },
  });
  res.json(tags);
});

hubRouter.post("/tags", async (req: Request, res: Response) => {
  const { name, color } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const tag = await prisma.tag.create({
    data: { name: name.trim(), color: color || "#6B7280" },
  });
  res.status(201).json(tag);
});

hubRouter.delete("/tags/:id", async (req: Request, res: Response) => {
  await prisma.tag.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// Add/remove tags from conversations
hubRouter.post("/conversations/:id/tags", async (req: Request, res: Response) => {
  const { tagId } = req.body;
  if (!tagId) return res.status(400).json({ error: "tagId is required" });

  const ct = await prisma.conversationTag.upsert({
    where: { conversationId_tagId: { conversationId: req.params.id, tagId } },
    create: { conversationId: req.params.id, tagId },
    update: {},
    include: { tag: true },
  });
  await cacheDel(`conversation:${req.params.id}`);
  res.status(201).json(ct.tag);
});

hubRouter.delete("/conversations/:id/tags/:tagId", async (req: Request, res: Response) => {
  const { id, tagId } = req.params;
  await prisma.conversationTag.deleteMany({
    where: { conversationId: id, tagId },
  });
  await cacheDel(`conversation:${id}`);
  res.json({ success: true });
});

// ─── Canned Responses CRUD ─────────────────────────────────────────

hubRouter.get("/canned-responses", async (_req: Request, res: Response) => {
  const cached = await cacheGet<unknown>("cannedResponses:all");
  if (cached) return res.json(cached);

  const responses = await prisma.cannedResponse.findMany({ orderBy: { shortcut: "asc" } });
  await cacheSet("cannedResponses:all", responses, TTL.CANNED_RESPONSES);
  res.json(responses);
});

hubRouter.post("/canned-responses", async (req: Request, res: Response) => {
  const { shortcut, title, content, category } = req.body;
  if (!shortcut || !title || !content) {
    return res.status(400).json({ error: "shortcut, title, and content are required" });
  }
  const response = await prisma.cannedResponse.create({
    data: {
      shortcut: shortcut.trim(),
      title: title.trim(),
      content: content.trim(),
      category: category || null,
      createdBy: getUser(req).email,
    },
  });
  await cacheDel("cannedResponses:all");
  res.status(201).json(response);
});

hubRouter.put("/canned-responses/:id", async (req: Request, res: Response) => {
  const { shortcut, title, content, category } = req.body;
  const response = await prisma.cannedResponse.update({
    where: { id: req.params.id },
    data: {
      ...(shortcut && { shortcut: shortcut.trim() }),
      ...(title && { title: title.trim() }),
      ...(content && { content: content.trim() }),
      ...(category !== undefined && { category: category || null }),
    },
  });
  await cacheDel("cannedResponses:all");
  res.json(response);
});

hubRouter.delete("/canned-responses/:id", async (req: Request, res: Response) => {
  await prisma.cannedResponse.delete({ where: { id: req.params.id } });
  await cacheDel("cannedResponses:all");
  res.json({ success: true });
});

// ─── Phone Call Logging (Chunk 3E) ─────────────────────────────────

// Log call against a conversation
hubRouter.post("/conversations/:id/calls", async (req: Request, res: Response) => {
  const { id: conversationId } = req.params;
  const user = getUser(req);
  const {
    direction,
    status,
    phoneFrom,
    phoneTo,
    startedAt,
    answeredAt,
    endedAt,
    durationSeconds,
    summary,
    outcome,
    followUpRequired,
    followUpNote,
  } = req.body;

  // Validation
  if (!summary || typeof summary !== "string" || summary.trim().length < 10) {
    return res.status(400).json({ error: "summary is required (min 10 characters)" });
  }
  if (!startedAt) {
    return res.status(400).json({ error: "startedAt is required" });
  }
  if (!direction || !Object.values(CallDirection).includes(direction)) {
    return res.status(400).json({ error: "direction must be INBOUND or OUTBOUND" });
  }
  if (!status || !Object.values(CallStatus).includes(status)) {
    return res.status(400).json({ error: "status must be COMPLETED, MISSED, VOICEMAIL, or NO_ANSWER" });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const call = await prisma.phoneCall.create({
    data: {
      conversationId,
      customerId: conversation.customerId,
      agentId: user.id,
      direction,
      status,
      phoneFrom: phoneFrom || "",
      phoneTo: phoneTo || "",
      startedAt: new Date(startedAt),
      answeredAt: answeredAt ? new Date(answeredAt) : null,
      endedAt: endedAt ? new Date(endedAt) : null,
      durationSeconds: durationSeconds ?? null,
      summary: summary.trim(),
      outcome: outcome || null,
      followUpRequired: !!followUpRequired,
      followUpNote: followUpNote || null,
      source: "MANUAL",
    },
    include: {
      agent: { select: { id: true, name: true, email: true } },
    },
  });

  // Add system message to conversation thread
  const dirLabel = direction === "INBOUND" ? "Inbound" : "Outbound";
  const durLabel = durationSeconds ? `${durationSeconds}s` : "N/A";
  await prisma.message.create({
    data: {
      conversationId,
      role: MessageRole.SYSTEM,
      content: `📞 ${dirLabel} call logged by ${user.name || user.email} — ${durLabel}\nSummary: ${summary.trim()}`,
    },
  });

  // Update lastMessageAt
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  await cacheDel(`conversation:${conversationId}`);
  res.status(201).json(call);
});

// List calls for a conversation
hubRouter.get("/conversations/:id/calls", async (req: Request, res: Response) => {
  const calls = await prisma.phoneCall.findMany({
    where: { conversationId: req.params.id },
    orderBy: { startedAt: "desc" },
    include: {
      agent: { select: { id: true, name: true, email: true } },
    },
  });
  res.json(calls);
});

// Log call against a customer (not linked to a ticket)
hubRouter.post("/customers/:id/calls", async (req: Request, res: Response) => {
  const { id: customerId } = req.params;
  const user = getUser(req);
  const {
    direction,
    status,
    phoneFrom,
    phoneTo,
    startedAt,
    answeredAt,
    endedAt,
    durationSeconds,
    summary,
    outcome,
    followUpRequired,
    followUpNote,
  } = req.body;

  if (!summary || typeof summary !== "string" || summary.trim().length < 10) {
    return res.status(400).json({ error: "summary is required (min 10 characters)" });
  }
  if (!startedAt) return res.status(400).json({ error: "startedAt is required" });
  if (!direction || !Object.values(CallDirection).includes(direction)) {
    return res.status(400).json({ error: "direction must be INBOUND or OUTBOUND" });
  }
  if (!status || !Object.values(CallStatus).includes(status)) {
    return res.status(400).json({ error: "status must be COMPLETED, MISSED, VOICEMAIL, or NO_ANSWER" });
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const call = await prisma.phoneCall.create({
    data: {
      customerId,
      agentId: user.id,
      direction,
      status,
      phoneFrom: phoneFrom || "",
      phoneTo: phoneTo || "",
      startedAt: new Date(startedAt),
      answeredAt: answeredAt ? new Date(answeredAt) : null,
      endedAt: endedAt ? new Date(endedAt) : null,
      durationSeconds: durationSeconds ?? null,
      summary: summary.trim(),
      outcome: outcome || null,
      followUpRequired: !!followUpRequired,
      followUpNote: followUpNote || null,
      source: "MANUAL",
    },
    include: {
      agent: { select: { id: true, name: true, email: true } },
    },
  });

  res.status(201).json(call);
});

// List calls for a customer
hubRouter.get("/customers/:id/calls", async (req: Request, res: Response) => {
  const calls = await prisma.phoneCall.findMany({
    where: { customerId: req.params.id },
    orderBy: { startedAt: "desc" },
    include: {
      agent: { select: { id: true, name: true, email: true } },
      conversation: { select: { id: true, sessionId: true, subject: true } },
    },
  });
  res.json(calls);
});

// ─── Phone Webhook Stub (future: RingCentral / Aircall) ───────────
// NOTE: This is mounted under /api/hub but the webhook should also be
// accessible at /api/webhooks/phone/:provider (public, no auth).
// The public route is registered separately in index.ts.

hubRouter.post("/webhooks/phone/:provider", async (req: Request, res: Response) => {
  const { provider } = req.params;

  if (!["ringcentral", "aircall"].includes(provider)) {
    return res.status(400).json({ error: "Unsupported provider" });
  }

  // TODO: Parse provider payload and upsert PhoneCall record
  // TODO: Match call to customer via phoneFrom/phoneTo using Customer.phone
  // TODO: Match to agent via provider's agent ID → User lookup
  // TODO: Generate AI summary from transcript if available
  // TODO: Emit Socket.io 'call_logged' event to connected agents

  console.log(`[webhook/phone/${provider}] Received payload:`, JSON.stringify(req.body).slice(0, 500));

  // Store raw body for future implementation
  // When implementing, create PhoneCall with source = provider, rawWebhookData = req.body

  res.json({ received: true });
});

// ─── Call Analytics ────────────────────────────────────────────────

hubRouter.get("/analytics/calls", async (req: Request, res: Response) => {
  const { period } = req.query;
  const now = new Date();
  let since: Date;

  if (period === "month") {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    // Default: this week (Monday)
    const day = now.getDay();
    since = new Date(now);
    since.setDate(now.getDate() - ((day + 6) % 7));
    since.setHours(0, 0, 0, 0);
  }

  const calls = await prisma.phoneCall.findMany({
    where: { startedAt: { gte: since } },
    include: { agent: { select: { id: true, name: true } } },
  });

  // Calls by agent
  const byAgent = new Map<string, { name: string; count: number; totalDuration: number }>();
  let totalDuration = 0;
  let missedCount = 0;
  let followUpCount = 0;
  const byHour = new Array(24).fill(0);

  for (const call of calls) {
    const agentKey = call.agentId;
    const existing = byAgent.get(agentKey) || { name: call.agent.name || "Unknown", count: 0, totalDuration: 0 };
    existing.count++;
    existing.totalDuration += call.durationSeconds ?? 0;
    byAgent.set(agentKey, existing);

    totalDuration += call.durationSeconds ?? 0;
    if (call.status === "MISSED" || call.status === "NO_ANSWER") missedCount++;
    if (call.followUpRequired) followUpCount++;
    byHour[call.startedAt.getHours()]++;
  }

  res.json({
    totalCalls: calls.length,
    averageDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0,
    missedRate: calls.length > 0 ? Math.round((missedCount / calls.length) * 100) : 0,
    followUpRate: calls.length > 0 ? Math.round((followUpCount / calls.length) * 100) : 0,
    byAgent: Array.from(byAgent.entries()).map(([id, data]) => ({
      agentId: id,
      agentName: data.name,
      callCount: data.count,
      totalDuration: data.totalDuration,
      avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
    })),
    byHour,
    period: period === "month" ? "month" : "week",
    since: since.toISOString(),
  });
});
