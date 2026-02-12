-- Restore the pgvector embedding index for transaction similarity search
-- This index was accidentally dropped in a previous migration

CREATE INDEX IF NOT EXISTS idx_transactions_embedding_ivfflat
ON transactions
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
