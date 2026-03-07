import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../db/client.js";
import { retrieve } from "../services/retrieve.js";

export const chatRouter = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT_BASE = `You are a helpful customer support assistant for MDT (Modular Driven Technologies), a company that sells tactical and outdoor equipment.

You help customers with:
- Order status, tracking, and ship dates
- Product information, compatibility, and specifications
- General policies and FAQs

Be concise, friendly, and professional. Use the knowledge below when relevant. If you need information you don't have (like live order details), say so. Never make up order numbers, tracking info, or product specs.`;

chatRouter.post("/stream", async (req: Request, res: Response) => {
  try {
    const { conversationId, message, customerEmail } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const pool = getPool();
    let convId = conversationId;

    if (!convId) {
      const result = await pool.query(
        `INSERT INTO conversations (id, customer_email) VALUES ($1, $2) RETURNING id`,
        [uuidv4(), customerEmail || null]
      );
      convId = result.rows[0].id;
    }

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
      [convId, "user", message]
    );

    const historyResult = await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [convId]
    );
    const messages = historyResult.rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));

    const chunks = await retrieve(message);
    const contextSection =
      chunks.length > 0
        ? `\n\n## Knowledge base (use when relevant):\n${chunks
            .map(
              (c) =>
                `---\n${c.title ? `Title: ${c.title}\n` : ""}${c.url ? `URL: ${c.url}\n` : ""}${c.content.slice(0, 1500)}`
            )
            .join("\n---\n")}`
        : "";
    const systemPrompt = SYSTEM_PROMPT_BASE + contextSection;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    let fullContent = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const text = event.delta.text;
        fullContent += text;
        res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ type: "done", conversationId: convId })}\n\n`);
    res.end();

    if (fullContent) {
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [convId, "assistant", fullContent]
      );
    }
  } catch (err) {
    console.error("Chat stream error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat failed" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`);
      res.end();
    }
  }
});

chatRouter.get("/conversations", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, customer_email, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List conversations error:", err);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

chatRouter.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Failed to get messages" });
  }
});
