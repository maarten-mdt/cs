-- pgvector is not available on all hosts (e.g. Railway default Postgres).
-- This migration is a no-op so deploy succeeds everywhere.
-- When your database has pgvector installed, run the SQL in:
--   prisma/add-embedding-when-pgvector.sql
SELECT 1;
