import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { ConversationStatus, MessageRole } from "@prisma/client";

export const chatRouter = Router();

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for MDT (Modular Driven Technologies). You help customers with product questions, orders, compatibility, and installation. Be concise and friendly.`;

// POST /api/chat/message — public, stream AI response via SSE
chatRouter.post("/api/chat/message", async (req: Request, res: Response) => {
  const { sessionId, message, pageUrl } = req.body ?? {};

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "AI is not configured" });
  }

  try {
    const conversation = await prisma.conversation.upsert({
      where: { sessionId: sessionId.trim() },
      create: {
        sessionId: sessionId.trim(),
        pageUrl: pageUrl ?? null,
      },
      update: pageUrl ? { pageUrl } : {},
    });

    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    recentMessages.reverse();

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: (message as string).trim(),
      },
    });

    const messagesForClaude: { role: "user" | "assistant"; content: string }[] = [
      ...recentMessages
        .filter((m) => m.role !== MessageRole.SYSTEM)
        .map((m) => ({
          role: m.role === MessageRole.ASSISTANT ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
      { role: "user" as const, content: (message as string).trim() },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const anthropic = new Anthropic({ apiKey });
    let fullText = "";

    const stream = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: messagesForClaude,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta && typeof delta === "object" && "text" in delta && typeof (delta as { text: string }).text === "string") {
          const text = (delta as { text: string }).text;
          fullText += text;
          res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
          res.flushHeaders?.();
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done", conversationId: conversation.id })}\n\n`);
    res.flushHeaders?.();

    if (fullText) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: fullText,
        },
      });
    }

    res.end();
  } catch (err) {
    console.error("[chat/message]", err);
    const message = err instanceof Error ? err.message : "An error occurred";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      res.end();
    }
  }
});

// GET /api/chat/session — return conversationId for session (find or create)
chatRouter.get("/api/chat/session", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId;
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  const conversation = await prisma.conversation.upsert({
    where: { sessionId: sessionId.trim() },
    create: { sessionId: sessionId.trim() },
    update: {},
  });
  res.json({ conversationId: conversation.id });
});

// POST /api/chat/escalate — create Zendesk ticket if configured, set ESCALATED
chatRouter.post("/api/chat/escalate", async (req: Request, res: Response) => {
  const { conversationId, reason } = req.body ?? {};

  if (!conversationId || typeof conversationId !== "string" || !conversationId.trim()) {
    return res.status(400).json({ error: "conversationId is required" });
  }

  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;
  const hasZendesk = subdomain && email && token;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId.trim() },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const transcript = conversation.messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join("\n\n");
  const subject = reason && String(reason).trim() ? String(reason).trim() : "Support escalation from chat";
  const body = (reason ? `Reason: ${reason}\n\n` : "") + "--- Conversation transcript ---\n\n" + transcript;

  let ticketId: number | null = null;
  let ticketUrl: string | null = null;

  if (hasZendesk) {
    try {
      const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
      const response = await fetch(
        `https://${subdomain}.zendesk.com/api/v2/tickets.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            ticket: {
              subject,
              comment: { body },
            },
          }),
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Zendesk API: ${response.status} ${errText}`);
      }
      const data = (await response.json()) as { ticket?: { id?: number; url?: string } };
      ticketId = data.ticket?.id ?? null;
      ticketUrl = data.ticket?.url ?? (ticketId ? `https://${subdomain}.zendesk.com/agent/tickets/${ticketId}` : null);
    } catch (e) {
      console.error("Zendesk ticket creation failed:", e);
      // Still escalate conversation; return success with message
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: ConversationStatus.ESCALATED,
      escalatedAt: new Date(),
      ...(ticketId != null && { zendeskTicketId: String(ticketId) }),
    },
  });

  if (hasZendesk && ticketId != null) {
    return res.json({ success: true, ticketId, ticketUrl });
  }
  return res.json({
    success: true,
    ticketId: null,
    message: "Ticket submitted — our team will be in touch.",
  });
});
