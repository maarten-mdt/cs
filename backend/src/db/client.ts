import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id VARCHAR(255),
      customer_email VARCHAR(255),
      shopify_customer_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_email);
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS widget_config (
      id INT PRIMARY KEY DEFAULT 1,
      greeting TEXT DEFAULT 'Hi! How can I help you today?',
      suggested_questions JSONB DEFAULT '["Where is my order?","Product compatibility","Return policy"]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await p.query(`
    INSERT INTO widget_config (id, greeting, suggested_questions) 
    VALUES (1, 'Hi! How can I help you today?', '["Where is my order?","Product compatibility","Return policy"]')
    ON CONFLICT (id) DO NOTHING
  `);

  let hasVector = false;
  try {
    await p.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    hasVector = true;
  } catch (_) {
    console.warn("pgvector extension not available; using full-text search only.");
  }

  await p.query(`
    CREATE TABLE IF NOT EXISTS data_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      config JSONB DEFAULT '{}',
      last_synced_at TIMESTAMPTZ,
      last_sync_status VARCHAR(50),
      last_sync_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID REFERENCES data_sources(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      title VARCHAR(500),
      url VARCHAR(2000),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_chunks(source_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_content_fts ON knowledge_chunks USING gin(to_tsvector('english', content));
  `);
  if (hasVector) {
    try {
      await p.query(`ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)`);
      await p.query(`CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`);
    } catch (_) {}
  }

  console.log("Database initialized");
}
