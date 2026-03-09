/**
 * Customer identity: find/create from email, link to conversations, sync summary to Shopify/Zendesk/HubSpot.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import type { Customer, Conversation } from "@prisma/client";

const SHOPIFY_VERSION = "2024-01";

function getShopifyConfig(): { storeUrl: string; headers: HeadersInit } | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!domain || !token) return null;
  const storeUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  return {
    storeUrl: storeUrl.replace(/\/$/, ""),
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  };
}

/** Find or create Customer by email; update lastSeenAt. */
export async function identifyCustomer(email: string): Promise<Customer> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required");

  let customer = await prisma.customer.findUnique({
    where: { email: normalized },
  });

  if (!customer) {
    const shopify = getShopifyConfig();
    if (shopify) {
      try {
        const res = await fetch(
          `${shopify.storeUrl}/admin/api/${SHOPIFY_VERSION}/customers/search.json?query=${encodeURIComponent(`email:${normalized}`)}&limit=1`,
          { headers: shopify.headers }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            customers?: { id: number; email?: string; first_name?: string; last_name?: string; total_spent?: string; orders_count?: number }[];
          };
          const c = data.customers?.[0];
          if (c) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
            customer = await prisma.customer.create({
              data: {
                email: (c.email ?? normalized).toLowerCase(),
                name,
                shopifyId: String(c.id),
                totalSpend: parseFloat(c.total_spent ?? "0") || 0,
                orderCount: c.orders_count ?? 0,
              },
            });
          }
        }
      } catch (e) {
        console.warn("[customers] Shopify search failed:", (e as Error).message);
      }
    }
    if (!customer) {
      customer = await prisma.customer.create({
        data: { email: normalized },
      });
    }
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: { lastSeenAt: new Date() },
  });
  return customer;
}

/** Link a conversation to a customer. */
export async function linkConversationToCustomer(
  conversationId: string,
  customerId: string
): Promise<Conversation> {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { customerId },
  });
}

/** Build transcript string from messages. */
function buildTranscript(messages: { role: string; content: string }[]): string {
  return messages.map((m) => `[${m.role}]: ${m.content}`).join("\n");
}

/** Call Claude for summary/topic/sentiment (non-streaming, JSON). */
async function summarizeConversation(transcript: string): Promise<{
  summary?: string;
  topic?: string;
  sentiment?: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return {};
  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `Summarize this support conversation in 1-2 sentences. Identify the main topic and customer sentiment. Respond only with valid JSON: { "summary": "...", "topic": "...", "sentiment": "..." }\n\n---\n\n${transcript}`,
      },
    ],
  });
  const text = (msg.content?.[0] as { type: string; text?: string })?.text ?? "";
  try {
    const parsed = JSON.parse(text) as { summary?: string; topic?: string; sentiment?: string };
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      topic: typeof parsed.topic === "string" ? parsed.topic : undefined,
      sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment : undefined,
    };
  } catch {
    return {};
  }
}

/** Best-effort: set Shopify customer metafield (last_chat_summary). */
async function syncSummaryToShopify(shopifyId: string, summary: string): Promise<void> {
  const shopify = getShopifyConfig();
  if (!shopify) return;
  try {
    const res = await fetch(
      `${shopify.storeUrl}/admin/api/${SHOPIFY_VERSION}/customers/${shopifyId}/metafields.json`,
      {
        method: "POST",
        headers: shopify.headers,
        body: JSON.stringify({
          metafield: {
            namespace: "mdt_support",
            key: "last_chat_summary",
            value: summary.slice(0, 5000),
            type: "single_line_text_field",
          },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      console.warn("[customers] Shopify metafield failed:", res.status, body);
    }
  } catch (e) {
    console.warn("[customers] Shopify metafield error:", (e as Error).message);
  }
}

/** Best-effort: add internal note to Zendesk ticket if conversation has one. */
async function syncSummaryToZendesk(
  conversation: { zendeskTicketId?: string | null },
  summary: string
): Promise<void> {
  const sub = process.env.ZENDESK_SUBDOMAIN?.trim();
  const email = process.env.ZENDESK_EMAIL?.trim();
  const token = process.env.ZENDESK_API_TOKEN?.trim();
  const ticketId = conversation.zendeskTicketId?.trim();
  if (!sub || !email || !token || !ticketId) return;
  try {
    const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
    const res = await fetch(`https://${sub}.zendesk.com/api/v2/tickets/${ticketId}.json`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        ticket: {
          comment: { body: `[Chat summary] ${summary}`, public: false },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn("[customers] Zendesk internal note failed:", res.status, body);
    }
  } catch (e) {
    console.warn("[customers] Zendesk internal note error:", (e as Error).message);
  }
}

/** Best-effort: create HubSpot contact if needed and add note. */
async function syncSummaryToHubSpot(customerEmail: string, summary: string): Promise<void> {
  const apiKey = process.env.HUBSPOT_API_KEY?.trim();
  if (!apiKey) return;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  try {
    const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "email", operator: "EQ", value: customerEmail },
            ],
          },
        ],
      }),
    });
    if (!searchRes.ok) {
      console.warn("[customers] HubSpot search failed:", searchRes.status, await searchRes.text());
      return;
    }
    const searchData = (await searchRes.json()) as { results?: { id: string }[] };
    let contactId: string | null = searchData.results?.[0]?.id ?? null;
    if (!contactId) {
      const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          properties: { email: customerEmail },
        }),
      });
      if (!createRes.ok) {
        console.warn("[customers] HubSpot create contact failed:", createRes.status, await createRes.text());
        return;
      }
      const createData = (await createRes.json()) as { id?: string };
      contactId = createData.id ?? null;
    }
    if (!contactId) return;
    const noteRes = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: summary,
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
          },
        ],
      }),
    });
    if (!noteRes.ok) {
      console.warn("[customers] HubSpot note failed:", noteRes.status, await noteRes.text());
    }
  } catch (e) {
    console.warn("[customers] HubSpot sync error:", (e as Error).message);
  }
}

/**
 * Load conversation, summarize with Claude, update topic/sentiment, then best-effort sync to Shopify/Zendesk/HubSpot.
 * Logs errors; does not throw.
 */
export async function syncConversationEnd(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      customer: true,
    },
  });
  if (!conversation) return;
  const transcript = buildTranscript(
    conversation.messages.map((m) => ({ role: m.role, content: m.content }))
  );
  if (!transcript.trim()) return;

  const { summary, topic, sentiment } = await summarizeConversation(transcript);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(topic != null && { topic: topic.slice(0, 500) }),
      ...(sentiment != null && { sentiment: sentiment.slice(0, 255) }),
    },
  });
  const text = summary ?? topic ?? transcript.slice(0, 500);

  const customer = conversation.customer;
  if (customer?.shopifyId) {
    await syncSummaryToShopify(customer.shopifyId, text);
  }
  await syncSummaryToZendesk(conversation, text);
  if (customer?.email) {
    await syncSummaryToHubSpot(customer.email, text);
  }
}
