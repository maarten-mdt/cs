/**
 * Zendesk integration routes.
 *
 * POST /api/zendesk/suggest-reply — AI-generated reply suggestion for a Zendesk ticket.
 * Called by the Zendesk sidebar app (iframe) via ZAF client.request().
 */

import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { searchKnowledge } from "../services/search.js";
import { getConfig } from "../lib/config.js";

export const zendeskRouter = Router();

const DEFAULT_SYSTEM_PROMPT = `You are a helpful support assistant for MDT (Modular Driven Technologies). You help agents draft replies to customer support tickets. Be concise, professional, and friendly. Use the knowledge base context provided to give accurate answers. Format your reply as a ready-to-send customer response.`;

interface SuggestReplyBody {
  subject?: string;
  description?: string;
  requester?: string;
  comments?: { body?: string; author_id?: number; public?: boolean }[];
  latestCustomerMessage?: string;
}

/**
 * POST /api/zendesk/suggest-reply
 *
 * Accepts ticket context, searches the knowledge base, and returns an AI-suggested reply.
 * Auth: Bearer token (shared secret configured during Zendesk app install).
 */
zendeskRouter.post("/suggest-reply", async (req: Request, res: Response) => {
  // Validate auth token
  const authHeader = req.headers.authorization;
  const expectedToken = getConfig("ZENDESK_APP_TOKEN");
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Invalid authorization token" });
  }

  const { subject, description, comments, requester, latestCustomerMessage } = req.body as SuggestReplyBody;

  if (!subject && !description && !latestCustomerMessage) {
    return res.status(400).json({ error: "No ticket content provided" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "AI is not configured" });
  }

  try {
    // Build ticket context from comments
    const commentHistory = (comments ?? [])
      .filter((c) => c.body && c.public !== false)
      .slice(-10)
      .map((c) => c.body)
      .join("\n\n---\n\n");

    const customerQuestion = latestCustomerMessage || description || subject || "";

    // Search knowledge base for relevant context
    let knowledgeContext = "";
    if (process.env.OPENAI_API_KEY?.trim()) {
      try {
        const chunks = await searchKnowledge(customerQuestion, 8);
        if (chunks.length > 0) {
          knowledgeContext = "\n\n--- KNOWLEDGE BASE CONTEXT ---\n" +
            chunks.map((c) => `[${c.title || ""}] ${c.content}`).join("\n\n") +
            "\n--- END KNOWLEDGE BASE ---";
        }
      } catch (e) {
        console.warn("[zendesk] Knowledge search failed:", (e as Error).message);
      }
    }

    // Build system prompt
    let systemPrompt = getConfig("ZENDESK_SYSTEM_PROMPT") || getConfig("SYSTEM_PROMPT") || DEFAULT_SYSTEM_PROMPT;
    systemPrompt += knowledgeContext;

    // Build conversation for Claude
    const ticketSummary = [
      subject ? `Subject: ${subject}` : "",
      requester ? `Customer: ${requester}` : "",
      commentHistory ? `\nTicket history:\n${commentHistory}` : "",
      `\nLatest customer message:\n${customerQuestion}`,
    ].filter(Boolean).join("\n");

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Draft a reply to this support ticket. Write ONLY the reply text that the agent should send to the customer — no internal notes or explanations.\n\n${ticketSummary}`,
        },
      ],
    });

    const reply = (msg.content?.[0] as { type: string; text?: string })?.text ?? "";

    // Default store URL to .com
    const finalReply = reply.replace(/\{\{store_url\}\}/g, "https://mdttac.com");

    res.json({
      suggestedReply: finalReply,
      knowledgeChunksUsed: knowledgeContext ? true : false,
    });
  } catch (err) {
    console.error("[zendesk/suggest-reply]", err);
    res.status(500).json({ error: "Failed to generate suggestion" });
  }
});
