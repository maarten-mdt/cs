-- Run this manually when your PostgreSQL has the pgvector extension
-- (e.g. after enabling it in Railway or on a host that supports it).
-- Usage: psql $DATABASE_URL -f prisma/add-embedding-when-pgvector.sql

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_idx ON "KnowledgeChunk" USING ivfflat (embedding vector_cosine_ops);
