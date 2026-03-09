import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { ConversationStatus, MessageRole } from "@prisma/client";
import { getOrderByNumber, getOrdersByEmail } from "../services/orders.js";
import { searchKnowledge } from "../services/search.js";
import {
  identifyCustomer,
  linkConversationToCustomer,
} from "../services/customers.js";
import { enqueueSyncConversationEnd } from "../lib/queue.js";
import { getConfig, getConfigFromDb } from "../lib/config.js";

export const chatRouter = Router();

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for MDT (Modular Driven Technologies). You help customers with product questions, orders, compatibility, and installation. Be concise and friendly. Use line breaks between paragraphs and use markdown-style lists (- or 1. 2.) when listing steps or items so the reply is easy to read.`;

const getOrderInfoTool = {
  name: "get_order_info" as const,
  description: "Look up a customer order by order number or email. Use order_number for a specific order (e.g. #1234), or email to get the customer's last 5 orders.",
  input_schema: {
    type: "object" as const,
    properties: {
      order_number: { type: "string" as const, description: "Order number (e.g. #1234 or 1234)" },
      email: { type: "string" as const, description: "Customer email address" },
    },
    minProperties: 1,
  },
};

const searchKnowledgeTool = {
  name: "search_knowledge" as const,
  description: "Search the knowledge base (website/docs) for information. Use when the user asks about products, compatibility, installation, or general support topics.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const, description: "Search query" },
    },
    required: ["query"],
  },
};

async function executeGetOrderInfo(input: { order_number?: string; email?: string }): Promise<unknown> {
  try {
    if (input.order_number != null && String(input.order_number).trim()) {
      const order = await getOrderByNumber(String(input.order_number).trim());
      if (!order) return { found: false, message: "No order found with that number." };
      return { found: true, order };
    }
    if (input.email != null && String(input.email).trim()) {
      const orders = await getOrdersByEmail(String(input.email).trim());
      return { found: orders.length > 0, orders };
    }
    return { found: false, message: "Provide either order_number or email." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Order lookup failed.";
    return { found: false, error: message };
  }
}

async function executeSearchKnowledge(input: { query?: string }): Promise<unknown> {
  try {
    const q = input.query != null ? String(input.query).trim() : "";
    if (!q) return { chunks: [], message: "Query is required." };
    const chunks = await searchKnowledge(q, 14);
    return {
      chunks: chunks.map((c) => ({ title: c.title, url: c.url, content: c.content })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed.";
    return { chunks: [], error: message };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageParam = any;

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const ORDER_NUMBER_REGEX = /\b\d{10,}\b/;

async function tryIdentifyAndLinkConversation(
  conversationId: string,
  messageText: string
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { customerId: true },
  });
  if (!conv) return;
  if (conv.customerId) return;

  let email: string | null = null;
  const emailMatch = messageText.match(EMAIL_REGEX);
  if (emailMatch) {
    email = emailMatch[0].trim().toLowerCase();
  }
  if (!email && ORDER_NUMBER_REGEX.test(messageText)) {
    const orderNumMatch = messageText.match(ORDER_NUMBER_REGEX);
    if (orderNumMatch) {
      try {
        const order = await getOrderByNumber(orderNumMatch[0]);
        if (order?.email) email = order.email.trim().toLowerCase();
      } catch {
        // ignore
      }
    }
  }
  if (!email) return;
  try {
    const customer = await identifyCustomer(email);
    await linkConversationToCustomer(conversationId, customer.id);
  } catch (e) {
    console.warn("[chat] identifyCustomer failed:", (e as Error).message);
  }
}

// POST /api/chat/message — public, stream AI response via SSE, with optional order lookup tool
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

    await tryIdentifyAndLinkConversation(conversation.id, (message as string).trim());

    const initialMessages: MessageParam[] = [
      ...recentMessages
        .filter((m) => m.role !== MessageRole.SYSTEM)
        .map((m) => ({
          role: (m.role === MessageRole.ASSISTANT ? "assistant" : "user") as "user" | "assistant",
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
    const hasOrderTool = !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN);
    const hasKnowledgeTool = !!process.env.OPENAI_API_KEY?.trim();
    const tools: Array<typeof getOrderInfoTool | typeof searchKnowledgeTool> = [];
    if (hasOrderTool) tools.push(getOrderInfoTool);
    if (hasKnowledgeTool) tools.push(searchKnowledgeTool);
    const toolsConfig = tools.length > 0 ? tools : undefined;

    let messages: MessageParam[] = initialMessages;

    while (true) {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: getConfig("SYSTEM_PROMPT") || DEFAULT_SYSTEM_PROMPT,
        messages,
        tools: toolsConfig,
      });

      stream.on("text", (delta: string) => {
        fullText += delta;
        res.write(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`);
        res.flushHeaders?.();
      });

      await stream.done();
      const finalMsg = await stream.finalMessage();
      const content = (finalMsg as { content?: { type: string; id?: string; name?: string; input?: unknown }[] }).content ?? [];
      const toolUses = content.filter((b) => b.type === "tool_use");

      if (toolUses.length === 0) {
        break;
      }

      const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
      for (const tu of toolUses) {
        const id = tu.id ?? "";
        const input = (tu.input ?? {}) as Record<string, unknown>;
        const name = tu.name ?? "";
        let result: unknown;
        if (name === "get_order_info") result = await executeGetOrderInfo(input as { order_number?: string; email?: string });
        else if (name === "search_knowledge") result = await executeSearchKnowledge(input as { query?: string });
        else result = { error: "Unknown tool" };
        toolResults.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(result) });
      }

      messages = [
        ...messages,
        { role: "assistant" as const, content } as MessageParam,
        { role: "user" as const, content: toolResults } as MessageParam,
      ];
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
    const errorMessage = err instanceof Error ? err.message : "An error occurred";
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
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
  await enqueueSyncConversationEnd(conversation.id);

  if (hasZendesk && ticketId != null) {
    return res.json({ success: true, ticketId, ticketUrl });
  }
  return res.json({
    success: true,
    ticketId: null,
    message: "Ticket submitted — our team will be in touch.",
  });
});

// POST /api/chat/identify — link conversation to customer by email
chatRouter.post("/api/chat/identify", async (req: Request, res: Response) => {
  const { conversationId, email } = req.body ?? {};
  if (!conversationId || typeof conversationId !== "string" || !conversationId.trim()) {
    return res.status(400).json({ error: "conversationId is required" });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId.trim() },
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    const customer = await identifyCustomer(email.trim());
    await linkConversationToCustomer(conversation.id, customer.id);
    return res.json({ success: true, customerId: customer.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Identification failed";
    return res.status(500).json({ error: message });
  }
});

// POST /api/chat/resolve — mark conversation resolved and enqueue summary sync
chatRouter.post("/api/chat/resolve", async (req: Request, res: Response) => {
  const { conversationId } = req.body ?? {};
  if (!conversationId || typeof conversationId !== "string" || !conversationId.trim()) {
    return res.status(400).json({ error: "conversationId is required" });
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId.trim() },
  });
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: ConversationStatus.RESOLVED, resolvedAt: new Date() },
  });
  await enqueueSyncConversationEnd(conversation.id);
  return res.json({ success: true });
});

// GET /api/suggested-questions — public, for chips on home page
chatRouter.get("/api/suggested-questions", async (_req: Request, res: Response) => {
  try {
    const raw = await getConfigFromDb("SUGGESTED_QUESTIONS");
    const defaultQs = ["Where is my order?", "Is this compatible with my rifle?", "How do I install the chassis?"];
    if (!raw) return res.json({ questions: defaultQs });
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return res.json({ questions: parsed.slice(0, 10) });
      }
    } catch {}
    res.json({ questions: defaultQs });
  } catch {
    res.json({ questions: ["Where is my order?", "Is this compatible with my rifle?", "How do I install the chassis?"] });
  }
});
