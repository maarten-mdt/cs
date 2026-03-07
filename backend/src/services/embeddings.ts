import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

export function hasEmbeddings(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function embed(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY || texts.length === 0) {
    return texts.map(() => []);
  }
  const batch = texts.map((t) => t.slice(0, 8000));
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: batch,
  });
  const sorted = res.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}
