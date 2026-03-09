/**
 * Embeddings via OpenAI text-embedding-3-small (1536 dimensions).
 * Requires OPENAI_API_KEY. Used for knowledge chunk indexing and search.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 20;

export async function generateEmbedding(text: string): Promise<number[]> {
  const batch = await generateBatch([text]);
  return batch[0] ?? [];
}

export async function generateBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is required for embeddings");
  }
  if (texts.length === 0) return [];
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: apiKey.trim() });
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunk,
    });
    const ordered = chunk.map((_, idx) => res.data.find((d) => d.index === idx) ?? res.data[idx]);
    for (const d of ordered) {
      if (d?.embedding) results.push(d.embedding);
    }
  }
  return results;
}
