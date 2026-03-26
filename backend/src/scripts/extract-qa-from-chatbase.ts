/**
 * Extract Q&A pairs from imported Chatbase conversations.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx backend/src/scripts/extract-qa-from-chatbase.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║  Extract Q&A from Chatbase Convos      ║");
  console.log("╚════════════════════════════════════════╝");

  // Load all existing Q&A questions into a Set for fast dedup
  const existingQAs = await prisma.curatedQA.findMany({
    where: { source: "chatbase_import" },
    select: { question: true },
  });
  const seenQuestions = new Set(existingQAs.map((q) => q.question.slice(0, 40).toLowerCase()));
  console.log(`Existing chatbase Q&A: ${seenQuestions.size}`);

  // Find all Chatbase conversations with messages
  const conversations = await prisma.conversation.findMany({
    where: { sessionId: { startsWith: "chatbase_" } },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  console.log(`Found ${conversations.length} Chatbase conversations`);

  // Collect all Q&A pairs in memory first
  const pairs: { question: string; answer: string }[] = [];

  for (const conv of conversations) {
    const msgs = conv.messages;

    for (let i = 0; i < msgs.length - 1; i++) {
      const userMsg = msgs[i];
      const assistantMsg = msgs[i + 1];

      if (userMsg.role !== "USER" || assistantMsg.role !== "ASSISTANT") continue;

      const question = userMsg.content.trim();
      const answer = assistantMsg.content.trim();

      // Skip short/generic
      if (question.length < 10 || answer.length < 30) continue;

      const lowerQ = question.toLowerCase();
      if (["hi", "hello", "hey", "thanks", "thank you", "ok", "okay", "yes", "no", "yep", "nope"].includes(lowerQ)) continue;

      const lowerA = answer.toLowerCase();
      if (lowerA.includes("what can i help you with") && answer.length < 60) continue;

      // Dedup by first 40 chars of question
      const key = question.slice(0, 40).toLowerCase();
      if (seenQuestions.has(key)) continue;
      seenQuestions.add(key);

      pairs.push({ question, answer });
    }
  }

  console.log(`Collected ${pairs.length} unique Q&A pairs, inserting...`);

  // Batch insert
  let inserted = 0;
  for (const pair of pairs) {
    await prisma.curatedQA.create({
      data: {
        question: pair.question,
        answer: pair.answer,
        source: "chatbase_import",
        active: true,
      },
    });
    inserted++;
    if (inserted % 50 === 0) console.log(`  Inserted ${inserted}/${pairs.length}...`);
  }

  console.log(`\nDone: ${inserted} Q&A pairs inserted`);

  // Samples
  const samples = await prisma.curatedQA.findMany({
    where: { source: "chatbase_import" },
    take: 5,
    orderBy: { createdAt: "desc" },
  });

  console.log("\nSample Q&A pairs:");
  for (const qa of samples) {
    console.log(`\n  Q: ${qa.question.slice(0, 120)}`);
    console.log(`  A: ${qa.answer.slice(0, 120)}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Extraction failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
