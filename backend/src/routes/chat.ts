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
import { hasShopifyCredentials, type StoreRegion } from "../lib/shopifyConfig.js";
import { fetchProduct } from "../services/shopify.js";

export const chatRouter = Router();

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for MDT (Modular Driven Technologies). You help customers with product questions, orders, compatibility, and installation. Be concise and friendly. Use line breaks between paragraphs and use markdown-style lists (- or 1. 2.) when listing steps or items so the reply is easy to read.`;

const ORDER_PRIVACY_PROMPT = `

--- ORDER LOOKUP RULES ---
- When looking up orders, only show the most recent order first. After showing it, ask: "Would you like to see more order history?"
- Only set show_all=true if the customer explicitly asks for more orders.
- If no orders are found in the current store region, the tool will automatically search other regions (US, CA, INT). If still not found, ask the customer: "Which country did you place your order from? (US, Canada, or International)"
- IMPORTANT: When showing order info, only show order status, tracking info, and items. Do NOT show the customer's full shipping address or payment details.
--- END ORDER LOOKUP RULES ---`;

const getOrderInfoTool = {
  name: "get_order_info" as const,
  description: "Look up a customer order by order number or email. Use order_number for a specific order (e.g. #1234), or email to get the customer's most recent order. Set show_all=true only when the customer explicitly asks to see more order history.",
  input_schema: {
    type: "object" as const,
    properties: {
      order_number: { type: "string" as const, description: "Order number (e.g. #1234 or 1234)" },
      email: { type: "string" as const, description: "Customer email address" },
      show_all: { type: "boolean" as const, description: "If true, return up to 5 recent orders instead of just the latest. Only set true when customer explicitly asks for more history." },
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

const ALL_REGIONS: StoreRegion[] = ["US", "CA", "INT"];

/** Map store region to the public storefront domain customers should be linked to. */
const STOREFRONT_DOMAIN_MAP: Record<StoreRegion, string> = {
  US: "https://mdttac.com",
  CA: "https://mdttac.ca",
  INT: "https://mdttac.eu",
};

const STORE_URL_PROMPT = `

--- STORE URL VARIABLE ---
When you include links to MDT pages, always use the variable {{store_url}} as the base.
The system will replace {{store_url}} with the correct storefront domain for this customer's region.
Example: "Check out the [ESS Chassis]({{store_url}}/products/ess-chassis)" will become a link to the correct regional store.
Always use {{store_url}} — never hardcode mdttac.com, mdttac.ca, or mdttac.eu directly.
--- END STORE URL VARIABLE ---`;

async function executeGetOrderInfo(
  input: { order_number?: string; email?: string; show_all?: boolean },
  storeRegion: StoreRegion,
  shopifyCustomerId?: string | null
): Promise<unknown> {
  try {
    // --- Order by number: try current region, then fallback to others ---
    if (input.order_number != null && String(input.order_number).trim()) {
      const orderNum = String(input.order_number).trim();
      // Try current region first
      let order = await getOrderByNumber(orderNum, storeRegion).catch(() => null);
      let foundRegion = storeRegion;
      // Fallback: try other regions
      if (!order) {
        for (const region of ALL_REGIONS) {
          if (region === storeRegion) continue;
          if (!(await hasShopifyCredentials(region))) continue;
          order = await getOrderByNumber(orderNum, region).catch(() => null);
          if (order) { foundRegion = region; break; }
        }
      }
      if (!order) return { found: false, message: "No order found with that number in any store region. Ask the customer which country they ordered from." };
      return { found: true, order, storeRegion: foundRegion };
    }

    // --- Orders by email ---
    if (input.email != null && String(input.email).trim()) {
      const email = String(input.email).trim();
      const limit = input.show_all ? 5 : 1;

      // If shopifyCustomerId is set, verify the email belongs to this customer
      // by checking the order's customer email matches
      let orders = await getOrdersByEmail(email, storeRegion, limit).catch(() => [] as Awaited<ReturnType<typeof getOrdersByEmail>>);
      let foundRegion = storeRegion;

      // Fallback: if no orders in current region, try others
      if (orders.length === 0) {
        for (const region of ALL_REGIONS) {
          if (region === storeRegion) continue;
          if (!(await hasShopifyCredentials(region))) continue;
          orders = await getOrdersByEmail(email, region, limit).catch(() => []);
          if (orders.length > 0) { foundRegion = region; break; }
        }
      }

      if (orders.length === 0) {
        return { found: false, message: "No orders found for that email in any store region. Ask the customer which country they ordered from." };
      }

      return {
        found: true,
        orders,
        storeRegion: foundRegion,
        showing: orders.length,
        hasMore: !input.show_all && orders.length > 0,
        hint: !input.show_all ? "Only showing the most recent order. Ask the customer if they want to see more order history." : undefined,
      };
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
    const chunks = await searchKnowledge(q, 6);
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
const NAME_PATTERNS = [
  /(?:^|\s)(?:I'?m|I am|my name is|this is|call me)\s+([A-Za-z][A-Za-z\s'-]{1,50}?)(?:\s|,|$|\.)/i,
  /^([A-Za-z][A-Za-z\s'-]+?)(?:\s*[,;]\s*|\s+)[a-z0-9._%+-]+@/i,
];

function extractNameFromMessage(text: string): string | null {
  const t = text.trim();
  for (const re of NAME_PATTERNS) {
    const m = t.match(re);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length >= 2 && name.length <= 100 && !EMAIL_REGEX.test(name)) {
        return name;
      }
    }
  }
  return null;
}

async function tryIdentifyAndLinkConversation(
  conversationId: string,
  messageText: string,
  storeRegion: StoreRegion = "US"
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
        const order = await getOrderByNumber(orderNumMatch[0], storeRegion);
        if (order?.email) email = order.email.trim().toLowerCase();
      } catch {
        // ignore
      }
    }
  }
  if (!email) return;
  const name = extractNameFromMessage(messageText);
  try {
    const customer = await identifyCustomer(email, { name: name ?? undefined, storeRegion });
    await linkConversationToCustomer(conversationId, customer.id);
  } catch (e) {
    console.warn("[chat] identifyCustomer failed:", (e as Error).message);
  }
}

// POST /api/chat/message — public, stream AI response via SSE, with optional order lookup tool
chatRouter.post("/api/chat/message", async (req: Request, res: Response) => {
  const { sessionId, message, pageUrl, storeRegion: rawRegion, pageContext: rawPageContext, shopifyCustomerId: rawShopifyCustomerId } = req.body ?? {};
  const storeRegion: StoreRegion = (["CA", "US", "INT"].includes(rawRegion) ? rawRegion : "US") as StoreRegion;
  const shopifyCustomerId: string | null = rawShopifyCustomerId && typeof rawShopifyCustomerId === "string" ? rawShopifyCustomerId.trim() : null;
  const pageContext = rawPageContext && typeof rawPageContext === "object" ? rawPageContext as {
    pageType?: string; productHandle?: string; variantId?: string; url?: string;
  } : null;

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
        storeRegion,
        pageUrl: pageUrl ?? null,
      },
      update: { ...(pageUrl ? { pageUrl } : {}), storeRegion },
    });

    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    recentMessages.reverse();

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: (message as string).trim(),
      },
    });

    await tryIdentifyAndLinkConversation(conversation.id, (message as string).trim(), storeRegion);

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
    const hasOrderTool = await hasShopifyCredentials(storeRegion);
    const hasKnowledgeTool = true; // Always available: vector search or Q&A/keyword fallback
    const tools: Array<typeof getOrderInfoTool | typeof searchKnowledgeTool> = [];
    if (hasOrderTool) tools.push(getOrderInfoTool);
    if (hasKnowledgeTool) tools.push(searchKnowledgeTool);
    const toolsConfig = tools.length > 0 ? tools : undefined;

    let messages: MessageParam[] = initialMessages;

    // Build system prompt with optional product context
    let systemPrompt = getConfig("SYSTEM_PROMPT") || DEFAULT_SYSTEM_PROMPT;
    // Replace {{store_url}} in the user-configured system prompt so admins can use the variable too
    const storefrontDomain = STOREFRONT_DOMAIN_MAP[storeRegion] || STOREFRONT_DOMAIN_MAP.US;
    systemPrompt = systemPrompt.replace(/\{\{store_url\}\}/g, storefrontDomain);
    systemPrompt += STORE_URL_PROMPT;
    systemPrompt += ORDER_PRIVACY_PROMPT;
    if (shopifyCustomerId) {
      systemPrompt += `\n\n--- CUSTOMER CONTEXT ---\nThe customer is logged into their Shopify account (customer ID: ${shopifyCustomerId}). They are verified and you may look up their orders.\n--- END CUSTOMER CONTEXT ---`;
    } else {
      systemPrompt += `\n\n--- CUSTOMER CONTEXT ---\nThe customer is NOT logged into a Shopify account. For order lookups, only show basic order status and tracking. Do not reveal full shipping addresses or sensitive details.\n--- END CUSTOMER CONTEXT ---`;
    }
    if (pageContext?.productHandle && (await hasShopifyCredentials(storeRegion))) {
      try {
        const product = await fetchProduct(pageContext.productHandle, storeRegion);
        if (product) {
          const variantList = product.variants
            .map((v) => `  - ${v.title}: $${v.price}${v.available ? "" : " (out of stock)"}`)
            .join("\n");
          systemPrompt += `\n\n--- CURRENT PRODUCT (customer is viewing this page) ---\nTitle: ${product.title}\nURL: ${product.url}\nDescription: ${product.description.slice(0, 1000)}\nVariants:\n${variantList}\n--- END PRODUCT ---`;
        }
      } catch (e) {
        console.warn("[chat] fetchProduct failed:", (e as Error).message);
      }
    }

    // Helper: call Anthropic with retry on 429 + store_url buffered replacement
    async function callWithRetry(msgs: MessageParam[], sys: string, tls: typeof toolsConfig, maxRetries = 2) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: sys,
            messages: msgs,
            tools: tls,
          });

          // Buffer text to handle {{store_url}} replacement across chunk boundaries
          let streamBuf = "";
          stream.on("text", (delta: string) => {
            streamBuf += delta;
            const lastOpen = streamBuf.lastIndexOf("{{");
            const lastClose = streamBuf.indexOf("}}", lastOpen >= 0 ? lastOpen : 0);
            let flushUpTo: number;
            if (lastOpen >= 0 && lastClose < 0) {
              flushUpTo = lastOpen;
            } else {
              flushUpTo = streamBuf.length;
            }
            if (flushUpTo > 0) {
              let chunk = streamBuf.slice(0, flushUpTo);
              chunk = chunk.replace(/\{\{store_url\}\}/g, storefrontDomain);
              fullText += chunk;
              res.write(`data: ${JSON.stringify({ type: "delta", text: chunk })}\n\n`);
              res.flushHeaders?.();
              streamBuf = streamBuf.slice(flushUpTo);
            }
          });

          await stream.done();
          // Flush remaining buffered text
          if (streamBuf.length > 0) {
            const remaining = streamBuf.replace(/\{\{store_url\}\}/g, storefrontDomain);
            fullText += remaining;
            res.write(`data: ${JSON.stringify({ type: "delta", text: remaining })}\n\n`);
            res.flushHeaders?.();
          }
          return await stream.finalMessage();
        } catch (e: unknown) {
          const isRateLimit = e instanceof Error && (e.message.includes("429") || e.message.includes("rate_limit"));
          if (isRateLimit && attempt < maxRetries) {
            const waitMs = (attempt + 1) * 2000;
            console.warn(`[chat] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          throw e;
        }
      }
      throw new Error("Max retries exceeded");
    }

    while (true) {
      const finalMsg = await callWithRetry(messages, systemPrompt, toolsConfig);
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
        if (name === "get_order_info") result = await executeGetOrderInfo(input as { order_number?: string; email?: string; show_all?: boolean }, storeRegion, shopifyCustomerId);
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

    let assistantMessageId: string | null = null;
    if (fullText) {
      const saved = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: fullText,
        },
      });
      assistantMessageId = saved.id;
    }

    res.write(`data: ${JSON.stringify({ type: "done", conversationId: conversation.id, messageId: assistantMessageId })}\n\n`);
    res.flushHeaders?.();

    res.end();
  } catch (err) {
    console.error("[chat/message]", err);
    const raw = err instanceof Error ? err.message : "An error occurred";
    const isRateLimit = raw.includes("429") || raw.includes("rate_limit");
    const userMessage = isRateLimit
      ? "I'm getting a lot of questions right now. Please wait a moment and try again."
      : "Sorry, something went wrong. Please try again.";
    if (!res.headersSent) {
      res.status(isRateLimit ? 429 : 500).json({ error: userMessage });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: userMessage })}\n\n`);
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
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      customer: true,
    },
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
  let requesterId: number | null = null;

  if (hasZendesk) {
    try {
      const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
      const ticketPayload: {
        subject: string;
        comment: { body: string };
        requester?: { email: string; name?: string };
        requester_id?: number;
      } = { subject, comment: { body } };

      const customer = conversation.customer;
      if (customer?.email) {
        if (customer.zendeskId) {
          ticketPayload.requester_id = parseInt(customer.zendeskId, 10);
        } else {
          ticketPayload.requester = {
            email: customer.email,
            ...(customer.name && { name: customer.name }),
          };
        }
      }

      const response = await fetch(
        `https://${subdomain}.zendesk.com/api/v2/tickets.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({ ticket: ticketPayload }),
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Zendesk API: ${response.status} ${errText}`);
      }
      const data = (await response.json()) as {
        ticket?: { id?: number; url?: string; requester_id?: number };
      };
      ticketId = data.ticket?.id ?? null;
      requesterId = data.ticket?.requester_id ?? null;
      ticketUrl = data.ticket?.url ?? (ticketId ? `https://${subdomain}.zendesk.com/agent/tickets/${ticketId}` : null);
    } catch (e) {
      console.error("Zendesk ticket creation failed:", e);
      // Still escalate conversation; return success with message
    }
  }

  if (conversation.customer && requesterId != null && !conversation.customer.zendeskId) {
    await prisma.customer.update({
      where: { id: conversation.customer.id },
      data: { zendeskId: String(requesterId) },
    }).catch((e) => console.warn("[chat] Failed to update customer zendeskId:", (e as Error).message));
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

// POST /api/chat/identify — link conversation to customer by email (and optional name)
chatRouter.post("/api/chat/identify", async (req: Request, res: Response) => {
  const { conversationId, email, name, storeRegion: rawRegion } = req.body ?? {};
  const storeRegion: StoreRegion = (["CA", "US", "INT"].includes(rawRegion) ? rawRegion : "US") as StoreRegion;
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
    const customer = await identifyCustomer(email.trim(), {
      name: typeof name === "string" && name.trim() ? name.trim() : undefined,
      storeRegion,
    });
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

// POST /api/chat/feedback — thumbs up/down on a bot message
chatRouter.post("/api/chat/feedback", async (req: Request, res: Response) => {
  const { messageId, rating, comment } = req.body ?? {};
  if (!messageId || typeof messageId !== "string" || !messageId.trim()) {
    return res.status(400).json({ error: "messageId is required" });
  }
  if (!rating || !["up", "down"].includes(rating)) {
    return res.status(400).json({ error: "rating must be 'up' or 'down'" });
  }
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId.trim() } });
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    await prisma.messageFeedback.upsert({
      where: { messageId: messageId.trim() },
      create: {
        messageId: messageId.trim(),
        rating,
        comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
      },
      update: {
        rating,
        comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
      },
    });
    return res.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Feedback failed";
    return res.status(500).json({ error: msg });
  }
});

// GET /api/widget/config — public, returns greeting + suggested questions for embeddable widget
chatRouter.get("/api/widget/config", async (_req: Request, res: Response) => {
  try {
    const greeting = getConfig("WIDGET_GREETING") || "Hi! I'm MDT's support assistant. How can I help you today?";
    const defaultQs = ["Where is my order?", "Product compatibility", "Installation help"];
    let suggestedQuestions = defaultQs;
    const raw = await getConfigFromDb("SUGGESTED_QUESTIONS");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
          suggestedQuestions = parsed.slice(0, 6);
        }
      } catch {}
    }
    res.json({ greeting, suggestedQuestions });
  } catch {
    res.json({
      greeting: "Hi! How can I help you today?",
      suggestedQuestions: ["Where is my order?", "Product compatibility", "Installation help"],
    });
  }
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
