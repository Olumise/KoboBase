-- CreateTable
CREATE TABLE "llm_usage_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clarification_session_id" TEXT,
    "batch_session_id" TEXT,
    "total_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "call_breakdown" JSONB,
    "receipt_id" TEXT,
    "document_type" VARCHAR(50),
    "transaction_count" INTEGER,
    "processing_mode" VARCHAR(20),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_usage_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cost_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "clarification_sessions" INTEGER NOT NULL DEFAULT 0,
    "batch_sessions" INTEGER NOT NULL DEFAULT 0,
    "sequential_sessions" INTEGER NOT NULL DEFAULT 0,
    "ocr_calls" INTEGER NOT NULL DEFAULT 0,
    "detection_calls" INTEGER NOT NULL DEFAULT 0,
    "extraction_calls" INTEGER NOT NULL DEFAULT 0,
    "clarification_calls" INTEGER NOT NULL DEFAULT 0,
    "embedding_calls" INTEGER NOT NULL DEFAULT 0,
    "current_month_tokens" INTEGER NOT NULL DEFAULT 0,
    "current_month_cost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "month_start_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_cost_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_sessions_clarification_session_id_key" ON "llm_usage_sessions"("clarification_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_sessions_batch_session_id_key" ON "llm_usage_sessions"("batch_session_id");

-- CreateIndex
CREATE INDEX "llm_usage_sessions_user_id_idx" ON "llm_usage_sessions"("user_id");

-- CreateIndex
CREATE INDEX "llm_usage_sessions_created_at_idx" ON "llm_usage_sessions"("created_at");

-- CreateIndex
CREATE INDEX "llm_usage_sessions_processing_mode_idx" ON "llm_usage_sessions"("processing_mode");

-- CreateIndex
CREATE UNIQUE INDEX "user_cost_metrics_user_id_key" ON "user_cost_metrics"("user_id");

-- AddForeignKey
ALTER TABLE "llm_usage_sessions" ADD CONSTRAINT "llm_usage_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_sessions" ADD CONSTRAINT "llm_usage_sessions_clarification_session_id_fkey" FOREIGN KEY ("clarification_session_id") REFERENCES "clarification_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_sessions" ADD CONSTRAINT "llm_usage_sessions_batch_session_id_fkey" FOREIGN KEY ("batch_session_id") REFERENCES "batch_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cost_metrics" ADD CONSTRAINT "user_cost_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
