/**
 * Discrepancy detection: compare community-sourced content (Reddit) against
 * official website/Zendesk content. Uses vector similarity + Claude analysis.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { generateEmbedding } from "./embeddings.js";

const TOP_K_SIMILAR = 3;
const SIMILARITY_THRESHOLD = 0.35; // cosine distance — lower = more similar

interface ComparisonResult {
  hasConflict: boolean;
  topic: string;
  explanation: string;
  suggestion: string;
}

async function findSimilarWebsiteChunks(
  embedding: number[],
  excludeSourceId: string
): Promise<{ content: string; url: string | null; title: string | null; sourceId: string }[]> {
  const vecStr = "[" + embedding.join(",") + "]";
  const rows = await prisma.$queryRawUnsafe<
    { content: string; url: string | null; title: string | null; sourceId: string; distance: number }[]
  >(
    `SELECT kc.content, kc.url, kc.title, kc."sourceId",
            (kc.embedding <=> $1::vector) as distance
     FROM "KnowledgeChunk" kc
     JOIN "KnowledgeSource" ks ON ks.id = kc."sourceId"
     WHERE kc.embedding IS NOT NULL
       AND kc."sourceId" != $2
       AND ks.type IN ('WEBSITE', 'ZENDESK', 'MANUAL')
     ORDER BY distance ASC
     LIMIT $3`,
    vecStr,
    excludeSourceId,
    TOP_K_SIMILAR
  );
  return rows.filter((r) => r.distance < SIMILARITY_THRESHOLD);
}

async function compareWithClaude(
  communityText: string,
  websiteText: string
): Promise<ComparisonResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Compare these two information sources about MDT (Modular Driven Technologies) products. Determine if there are any factual conflicts or contradictions.

Community source (Reddit):
${communityText.slice(0, 1500)}

Official source (website/docs):
${websiteText.slice(0, 1500)}

Respond ONLY with valid JSON:
{
  "hasConflict": true/false,
  "topic": "brief topic description",
  "explanation": "what the conflict is (or 'No conflict found')",
  "suggestion": "which source is likely correct and why"
}`,
      },
    ],
  });

  const text = (msg.content?.[0] as { type: string; text?: string })?.text ?? "";
  try {
    return JSON.parse(text) as ComparisonResult;
  } catch {
    return null;
  }
}

/**
 * Detect discrepancies between a Reddit source's chunks and official website content.
 * Runs after a Reddit sync completes.
 */
export async function detectDiscrepancies(sourceId: string): Promise<void> {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openAiKey || !anthropicKey) {
    console.log("[discrepancy] Skipping — OPENAI_API_KEY or ANTHROPIC_API_KEY not set");
    return;
  }

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { sourceId },
    select: { id: true, content: true, url: true, title: true },
    take: 50, // limit to avoid excessive API calls
  });

  if (chunks.length === 0) {
    console.log("[discrepancy] No chunks to analyze");
    return;
  }

  console.log(`[discrepancy] Analyzing ${chunks.length} community chunks for conflicts...`);
  let found = 0;

  for (const chunk of chunks) {
    try {
      // Generate embedding for the community chunk
      const embedding = await generateEmbedding(chunk.content.slice(0, 500));

      // Find similar official content
      const similar = await findSimilarWebsiteChunks(embedding, sourceId);
      if (similar.length === 0) continue;

      // Compare with Claude
      const bestMatch = similar[0];
      const result = await compareWithClaude(chunk.content, bestMatch.content);
      if (!result || !result.hasConflict) continue;

      // Check if we already have this discrepancy (avoid duplicates)
      const existing = await prisma.discrepancy.findFirst({
        where: {
          communitySource: chunk.url ?? sourceId,
          websiteUrl: bestMatch.url,
          status: "open",
        },
      });
      if (existing) continue;

      await prisma.discrepancy.create({
        data: {
          communitySource: chunk.title ?? chunk.url ?? `source:${sourceId}`,
          communityText: chunk.content.slice(0, 3000),
          websiteText: bestMatch.content.slice(0, 3000),
          websiteUrl: bestMatch.url,
          topic: result.topic,
          aiSuggestion: `${result.explanation}\n\nSuggestion: ${result.suggestion}`,
        },
      });
      found++;
    } catch (e) {
      console.warn("[discrepancy] Error analyzing chunk:", (e as Error).message);
    }
  }

  console.log(`[discrepancy] Found ${found} new discrepancies`);
}
