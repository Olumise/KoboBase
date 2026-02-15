-- DropIndex
DROP INDEX IF EXISTS "idx_transactions_embedding_ivfflat";

-- AlterTable
ALTER TABLE "llm_usage_sessions" ADD COLUMN IF NOT EXISTS "chat_session_id" TEXT;

-- AlterTable
ALTER TABLE "user_cost_metrics" ADD COLUMN IF NOT EXISTS "chat_calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "chat_sessions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "query_embedding" vector(1536),
    "response" TEXT NOT NULL,
    "transactions_found" INTEGER NOT NULL DEFAULT 0,
    "retrieved_transactions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_sessions_status_idx" ON "chat_sessions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_sessions_created_at_idx" ON "chat_sessions"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "llm_usage_sessions_chat_session_id_key" ON "llm_usage_sessions"("chat_session_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'llm_usage_sessions_chat_session_id_fkey'
    ) THEN
        ALTER TABLE "llm_usage_sessions" ADD CONSTRAINT "llm_usage_sessions_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_id_fkey'
    ) THEN
        ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_session_id_fkey'
    ) THEN
        ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
