/**
 * Chatbase Migration Script
 *
 * Pulls all data from Chatbase API and imports into our database:
 * 1. Conversations + messages → Conversation + Message tables
 * 2. Contacts/leads → Customer table
 * 3. Chatbot settings (instructions, model config)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx backend/src/scripts/chatbase-migrate.ts
 */

import { PrismaClient, MessageRole, ConversationStatus } from "@prisma/client";

const CHATBASE_API_KEY = process.env.CHATBASE_API_KEY || "4b7f6977-79ad-4629-99ca-cf6b4eb0a1e9";
const CHATBASE_BOT_ID = process.env.CHATBASE_BOT_ID || "wLjTSR6A2gMewcDWRWhlq";
const BASE_URL = "https://www.chatbase.co/api";

const prisma = new PrismaClient();

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function chatbaseGet(path: string, params?: Record<string, string>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${CHATBASE_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chatbase ${path} returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extractContent(msg: any): string {
  if (!msg) return "";
  const raw = msg.content ?? msg.text ?? msg.body ?? "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    // content could be { text: "..." } or similar
    return raw.text ?? raw.value ?? JSON.stringify(raw);
  }
  return String(raw);
}

// ─── 1. Pull conversations (v1 API) ───────────────────────────────
async function migrateConversationsV1() {
  console.log("\n=== Migrating conversations (v1 API) ===");

  let page = 1;
  let totalConvos = 0;
  let totalMsgs = 0;

  while (true) {
    try {
      const data = await chatbaseGet("/v1/get-conversations", {
        chatbotId: CHATBASE_BOT_ID,
        page: String(page),
        size: "100",
      });

      const conversations = data?.data || [];
      if (!conversations.length) break;

      for (const conv of conversations) {
        try {
          const sessionId = `chatbase_${conv.id || `v1_${page}_${totalConvos}`}`;

          // Check if already imported
          const existing = await prisma.conversation.findUnique({ where: { sessionId } });
          if (existing) {
            totalConvos++;
            continue;
          }

          const messages = conv.messages || [];
          const customerEmail = conv.form_submission?.email || conv.customer?.email || null;
          const customerName = conv.form_submission?.name || conv.customer?.name || null;

          let customerId: string | null = null;
          if (customerEmail) {
            const customer = await prisma.customer.upsert({
              where: { email: customerEmail },
              update: { lastSeenAt: new Date() },
              create: { email: customerEmail, name: customerName, storeRegion: "US" },
            });
            customerId = customer.id;
          }

          // Use the first message's createdAt as conversation start
          const firstMsgDate = messages[0]?.createdAt ? new Date(messages[0].createdAt) : new Date();

          const conversation = await prisma.conversation.create({
            data: {
              sessionId,
              customerId,
              status: ConversationStatus.RESOLVED,
              storeRegion: "US",
              createdAt: firstMsgDate,
              updatedAt: firstMsgDate,
            },
          });

          for (const msg of messages) {
            const role = (msg.role === "assistant" || msg.role === "ai")
              ? MessageRole.ASSISTANT
              : msg.role === "system"
                ? MessageRole.SYSTEM
                : MessageRole.USER;

            const content = extractContent(msg);
            if (!content.trim()) continue;

            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role,
                content,
                createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
              },
            });
            totalMsgs++;
          }

          totalConvos++;
        } catch (convErr) {
          console.warn(`  Skipping conversation: ${(convErr as Error).message}`);
        }
      }

      console.log(`  Page ${page}: ${conversations.length} conversations (${totalConvos} total, ${totalMsgs} messages)`);
      page++;
      await sleep(200);
    } catch (err) {
      if (page === 1) {
        console.warn(`  v1 conversations failed:`, (err as Error).message);
      }
      break;
    }
  }

  console.log(`  Done: ${totalConvos} conversations, ${totalMsgs} messages`);
  return { totalConvos, totalMsgs };
}

// ─── 2. Pull conversations (v2 API — agent-based) ─────────────────
async function migrateConversationsV2() {
  console.log("\n=== Migrating conversations (v2 API) ===");

  let cursor: string | null = null;
  let totalConvos = 0;
  let totalMsgs = 0;

  while (true) {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (cursor) params.cursor = cursor;

      const data = await chatbaseGet(`/v2/agents/${CHATBASE_BOT_ID}/conversations`, params);
      const conversations = data?.data || [];
      if (!conversations.length) break;

      for (const conv of conversations) {
        try {
          const convId = conv.id || conv.conversationId;
          const sessionId = `chatbase_v2_${convId}`;

          const existing = await prisma.conversation.findUnique({ where: { sessionId } });
          if (existing) continue;

          let messages: any[] = [];
          try {
            const msgData = await chatbaseGet(
              `/v2/agents/${CHATBASE_BOT_ID}/conversations/${convId}/messages`,
              { limit: "100" }
            );
            messages = msgData?.data || [];
            await sleep(150);
          } catch (e) {
            console.warn(`  Failed to fetch messages for ${convId}`);
          }

          const customerEmail = conv.customer?.email || conv.contact?.email || null;
          let customerId: string | null = null;
          if (customerEmail) {
            const customer = await prisma.customer.upsert({
              where: { email: customerEmail },
              update: { lastSeenAt: new Date() },
              create: { email: customerEmail, name: conv.customer?.name || null, storeRegion: "US" },
            });
            customerId = customer.id;
          }

          const conversation = await prisma.conversation.create({
            data: {
              sessionId,
              customerId,
              status: ConversationStatus.RESOLVED,
              storeRegion: "US",
              createdAt: conv.createdAt ? new Date(conv.createdAt) : new Date(),
              updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
            },
          });

          for (const msg of messages) {
            const role = (msg.role === "assistant" || msg.role === "ai")
              ? MessageRole.ASSISTANT
              : msg.role === "system" ? MessageRole.SYSTEM : MessageRole.USER;

            const content = extractContent(msg);
            if (!content.trim()) continue;

            const msgRecord = await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role,
                content,
                createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
              },
            });

            if (msg.feedback === "positive" || msg.feedback === "negative") {
              await prisma.messageFeedback.create({
                data: {
                  messageId: msgRecord.id,
                  rating: msg.feedback === "positive" ? "up" : "down",
                },
              });
            }

            totalMsgs++;
          }

          totalConvos++;
        } catch (convErr) {
          console.warn(`  Skipping v2 conversation: ${(convErr as Error).message}`);
        }
      }

      console.log(`  Batch: ${conversations.length} conversations`);
      cursor = data?.pagination?.cursor || null;
      if (!cursor || !data?.pagination?.hasMore) break;
      await sleep(200);
    } catch (err) {
      console.warn(`  v2 conversations:`, (err as Error).message);
      break;
    }
  }

  console.log(`  Done: ${totalConvos} conversations, ${totalMsgs} messages`);
  return { totalConvos, totalMsgs };
}

// ─── 3. Pull leads ───────────────────────────────────────────────
async function migrateLeads() {
  console.log("\n=== Migrating leads ===");

  let page = 1;
  let totalLeads = 0;

  while (true) {
    try {
      const data = await chatbaseGet("/v1/get-leads", {
        chatbotId: CHATBASE_BOT_ID,
        page: String(page),
        size: "100",
      });

      const leads = data?.data || [];
      if (!leads.length) break;

      for (const lead of leads) {
        const email = lead.email?.trim();
        if (!email) continue;

        await prisma.customer.upsert({
          where: { email },
          update: { name: lead.name || undefined, lastSeenAt: new Date() },
          create: { email, name: lead.name || null, storeRegion: "US" },
        });
        totalLeads++;
      }

      console.log(`  Page ${page}: ${leads.length} leads`);
      page++;
      await sleep(200);
    } catch (err) {
      if (page === 1) console.warn(`  Leads:`, (err as Error).message.slice(0, 200));
      break;
    }
  }

  console.log(`  Done: ${totalLeads} leads`);
  return totalLeads;
}

// ─── 4. Pull chatbot config + instructions ───────────────────────
async function migrateChatbotData() {
  console.log("\n=== Fetching chatbot configuration ===");

  try {
    const data = await chatbaseGet("/v1/get-chatbots");
    // Response: { chatbots: { data: [...] } }
    const botsContainer = data?.chatbots;
    const bots = Array.isArray(botsContainer)
      ? botsContainer
      : botsContainer?.data || [];

    for (const bot of bots) {
      const botId = bot.chatbotId || bot.id;
      console.log(`  Found bot: "${bot.name}" (${botId})`);

      if (botId === CHATBASE_BOT_ID || bot.name?.toLowerCase().includes("mdt")) {
        console.log(`  Model: ${bot.model || "unknown"}`);
        console.log(`  Temperature: ${bot.temp ?? bot.temperature ?? "unknown"}`);
        console.log(`  Characters: ${bot.num_of_characters || "unknown"}`);
        console.log(`  Status: ${bot.status || "unknown"}`);

        // Save instructions (brand voice)
        const instructions = bot.instructions || bot.systemPrompt || bot.prompt || "";
        if (instructions) {
          console.log(`  Instructions: ${instructions.length} chars`);
          await prisma.appConfig.upsert({
            where: { key: "CHATBASE_ORIGINAL_INSTRUCTIONS" },
            update: { value: instructions },
            create: { key: "CHATBASE_ORIGINAL_INSTRUCTIONS", value: instructions },
          });
          console.log(`  Saved instructions to AppConfig.CHATBASE_ORIGINAL_INSTRUCTIONS`);

          // Also set as SYSTEM_PROMPT if none exists yet
          const existing = await prisma.appConfig.findUnique({ where: { key: "SYSTEM_PROMPT" } });
          if (!existing) {
            await prisma.appConfig.create({
              data: { key: "SYSTEM_PROMPT", value: instructions },
            });
            console.log(`  Also set as SYSTEM_PROMPT (was empty)`);
          }
        }

        // Save initial messages
        if (bot.initial_messages?.length) {
          await prisma.appConfig.upsert({
            where: { key: "CHATBASE_INITIAL_MESSAGES" },
            update: { value: JSON.stringify(bot.initial_messages) },
            create: { key: "CHATBASE_INITIAL_MESSAGES", value: JSON.stringify(bot.initial_messages) },
          });
          console.log(`  Saved ${bot.initial_messages.length} initial messages`);
        }

        // Save model/temp config
        await prisma.appConfig.upsert({
          where: { key: "CHATBASE_MODEL_CONFIG" },
          update: { value: JSON.stringify({ model: bot.model, temp: bot.temp, analytics_sector: bot.analytics_sector }) },
          create: { key: "CHATBASE_MODEL_CONFIG", value: JSON.stringify({ model: bot.model, temp: bot.temp, analytics_sector: bot.analytics_sector }) },
        });
      }
    }
  } catch (err) {
    console.warn("  Failed to fetch chatbot data:", (err as Error).message.slice(0, 200));
  }
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Chatbase → MDT Support Migration    ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`API Key: ${CHATBASE_API_KEY.slice(0, 8)}...`);
  console.log(`Bot ID:  ${CHATBASE_BOT_ID}`);

  const results = { v1Convos: 0, v1Msgs: 0, v2Convos: 0, v2Msgs: 0, leads: 0 };

  const v1 = await migrateConversationsV1();
  results.v1Convos = v1.totalConvos;
  results.v1Msgs = v1.totalMsgs;

  const v2 = await migrateConversationsV2();
  results.v2Convos = v2.totalConvos;
  results.v2Msgs = v2.totalMsgs;

  results.leads = await migrateLeads();

  await migrateChatbotData();

  const total = results.v1Convos + results.v2Convos;
  const totalMsgs = results.v1Msgs + results.v2Msgs;

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║          Migration Summary             ║");
  console.log("╠════════════════════════════════════════╣");
  console.log(`║ Conversations:    ${String(total).padStart(6)}              ║`);
  console.log(`║ Messages:         ${String(totalMsgs).padStart(6)}              ║`);
  console.log(`║ Leads:            ${String(results.leads).padStart(6)}              ║`);
  console.log("╚════════════════════════════════════════╝");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
