/**
 * Chatbase → MDT Chat migration script.
 *
 * Pulls all conversations, messages, and leads from Chatbase API
 * and imports them into the local database.
 *
 * Usage:
 *   npx tsx backend/src/scripts/migrate-chatbase.ts
 *
 * Env:
 *   CHATBASE_API_KEY  — Chatbase API key (or set via --key flag)
 *   CHATBASE_BOT_ID   — Chatbase chatbot ID (or set via --bot flag)
 *   DATABASE_URL      — Postgres connection string (from .env)
 */

import { PrismaClient, MessageRole, ConversationStatus } from "@prisma/client";

const prisma = new PrismaClient();

const API_KEY = process.env.CHATBASE_API_KEY || "4b7f6977-79ad-4629-99ca-cf6b4eb0a1e9";
const BASE_URL = "https://www.chatbase.co/api/v1";

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

/* ── Chatbase API types ────────────────────────────────────────── */

interface ChatbaseConversation {
  id: string;
  created_at?: string;
  createdAt?: string;
  messages?: ChatbaseMessage[];
  customer?: { email?: string; name?: string };
  source?: string;
}

interface ChatbaseMessage {
  id?: string;
  role: string; // "user" | "assistant" | "system"
  content: string;
  created_at?: string;
  createdAt?: string;
}

interface ChatbaseLead {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
  created_at?: string;
  createdAt?: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatbase API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function parseDate(d?: string | null): Date {
  if (d) {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function mapRole(role: string): MessageRole {
  if (role === "assistant" || role === "ai" || role === "bot") return MessageRole.ASSISTANT;
  if (role === "system") return MessageRole.SYSTEM;
  return MessageRole.USER;
}

/* ── Fetch all chatbots ────────────────────────────────────────── */

async function getChatbots(): Promise<{ id: string; name: string }[]> {
  try {
    const data = await fetchJSON<{ chatbots?: { chatbot_id?: string; id?: string; name?: string }[] }>(
      `${BASE_URL}/get-chatbots`
    );
    return (data.chatbots ?? []).map((b) => ({
      id: b.chatbot_id ?? b.id ?? "",
      name: b.name ?? "Unknown",
    }));
  } catch (e) {
    console.warn("[chatbase] Could not list chatbots:", (e as Error).message);
    return [];
  }
}

/* ── Fetch all conversations (paginated) ───────────────────────── */

async function getAllConversations(chatbotId: string): Promise<ChatbaseConversation[]> {
  const all: ChatbaseConversation[] = [];
  let page = 1;
  const size = 50;
  let hasMore = true;

  console.log(`  Fetching conversations for bot ${chatbotId}...`);

  while (hasMore) {
    try {
      const data = await fetchJSON<{
        data?: ChatbaseConversation[];
        conversations?: ChatbaseConversation[];
        pages?: number;
        total?: number;
      }>(`${BASE_URL}/get-conversations?chatbotId=${chatbotId}&page=${page}&size=${size}`);

      const items = data.data ?? data.conversations ?? [];
      all.push(...items);

      console.log(`    Page ${page}: ${items.length} conversations (total so far: ${all.length})`);

      if (items.length < size || (data.pages != null && page >= data.pages)) {
        hasMore = false;
      } else {
        page++;
      }

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.error(`    Error on page ${page}:`, (e as Error).message);
      hasMore = false;
    }
  }

  return all;
}

/* ── Fetch messages for a conversation (if not inline) ─────────── */

async function getConversationMessages(conversationId: string): Promise<ChatbaseMessage[]> {
  try {
    const data = await fetchJSON<{
      messages?: ChatbaseMessage[];
      data?: ChatbaseMessage[];
    }>(`${BASE_URL}/get-conversations/${conversationId}/messages`);
    return data.messages ?? data.data ?? [];
  } catch {
    return [];
  }
}

/* ── Fetch leads ───────────────────────────────────────────────── */

async function getLeads(chatbotId: string): Promise<ChatbaseLead[]> {
  try {
    const data = await fetchJSON<{
      leads?: ChatbaseLead[];
      data?: ChatbaseLead[];
    }>(`${BASE_URL}/get-leads?chatbotId=${chatbotId}`);
    return data.leads ?? data.data ?? [];
  } catch (e) {
    console.warn("[chatbase] Could not fetch leads:", (e as Error).message);
    return [];
  }
}

/* ── Import a single conversation ──────────────────────────────── */

async function importConversation(conv: ChatbaseConversation, botId: string): Promise<boolean> {
  const sessionId = `chatbase_${conv.id}`;

  // Skip if already imported
  const existing = await prisma.conversation.findUnique({ where: { sessionId } });
  if (existing) return false;

  const createdAt = parseDate(conv.created_at ?? conv.createdAt);

  // Try to find or create customer
  let customerId: string | null = null;
  const email = conv.customer?.email?.trim()?.toLowerCase();
  if (email) {
    let customer = await prisma.customer.findUnique({ where: { email } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          email,
          name: conv.customer?.name ?? null,
          firstSeenAt: createdAt,
          lastSeenAt: createdAt,
        },
      });
    }
    customerId = customer.id;
  }

  // Get messages
  let messages = conv.messages ?? [];
  if (messages.length === 0) {
    messages = await getConversationMessages(conv.id);
  }

  if (messages.length === 0) return false;

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      sessionId,
      customerId,
      status: ConversationStatus.RESOLVED,
      storeRegion: "US",
      createdAt,
      updatedAt: createdAt,
    },
  });

  // Create messages
  for (const msg of messages) {
    const msgDate = parseDate(msg.created_at ?? msg.createdAt) ?? createdAt;
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: mapRole(msg.role),
        content: msg.content || "",
        createdAt: msgDate,
      },
    });
  }

  return true;
}

/* ── Import leads as customers ─────────────────────────────────── */

async function importLeads(leads: ChatbaseLead[]): Promise<number> {
  let imported = 0;
  for (const lead of leads) {
    const email = lead.email?.trim()?.toLowerCase();
    if (!email) continue;

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) continue;

    await prisma.customer.create({
      data: {
        email,
        name: lead.name ?? null,
        firstSeenAt: parseDate(lead.created_at ?? lead.createdAt),
        lastSeenAt: parseDate(lead.created_at ?? lead.createdAt),
      },
    });
    imported++;
  }
  return imported;
}

/* ── Main ──────────────────────────────────────────────────────── */

async function main() {
  console.log("=== Chatbase → MDT Chat Migration ===\n");

  // Step 1: Get chatbots
  console.log("1. Fetching chatbot list...");
  const bots = await getChatbots();
  if (bots.length === 0) {
    console.log("   No chatbots found. Trying with direct conversation fetch...");
    // Try fetching conversations without a specific bot ID
    bots.push({ id: "", name: "Default" });
  } else {
    console.log(`   Found ${bots.length} chatbot(s): ${bots.map((b) => `${b.name} (${b.id})`).join(", ")}`);
  }

  let totalConversations = 0;
  let totalImported = 0;
  let totalLeads = 0;

  for (const bot of bots) {
    console.log(`\n2. Processing bot: ${bot.name} (${bot.id || "default"})`);

    // Step 2: Fetch conversations
    const conversations = await getAllConversations(bot.id);
    totalConversations += conversations.length;
    console.log(`   Total conversations fetched: ${conversations.length}`);

    // Step 3: Import conversations
    console.log("\n3. Importing conversations...");
    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < conversations.length; i++) {
      try {
        const wasImported = await importConversation(conversations[i], bot.id);
        if (wasImported) {
          imported++;
        } else {
          skipped++;
        }
        if ((i + 1) % 10 === 0 || i === conversations.length - 1) {
          process.stdout.write(`\r   Progress: ${i + 1}/${conversations.length} (imported: ${imported}, skipped: ${skipped})`);
        }
      } catch (e) {
        console.error(`\n   Error importing conversation ${conversations[i].id}:`, (e as Error).message);
      }
      // Small delay
      await new Promise((r) => setTimeout(r, 50));
    }
    console.log();
    totalImported += imported;

    // Step 4: Fetch and import leads
    console.log("\n4. Fetching leads...");
    const leads = await getLeads(bot.id);
    console.log(`   Found ${leads.length} leads`);
    if (leads.length > 0) {
      const leadCount = await importLeads(leads);
      totalLeads += leadCount;
      console.log(`   Imported ${leadCount} new leads as customers`);
    }
  }

  console.log("\n=== Migration Complete ===");
  console.log(`  Conversations found: ${totalConversations}`);
  console.log(`  Conversations imported: ${totalImported}`);
  console.log(`  Leads imported: ${totalLeads}`);
  console.log(`\nNote: Already-imported conversations were skipped (sessionId prefix: chatbase_)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
