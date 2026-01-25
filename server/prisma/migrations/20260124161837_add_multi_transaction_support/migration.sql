-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "detection_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "document_type" VARCHAR(30),
ADD COLUMN     "expected_transactions" INTEGER DEFAULT 1,
ADD COLUMN     "processed_transactions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "batch_sessions" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_expected" INTEGER NOT NULL,
    "total_processed" INTEGER NOT NULL DEFAULT 0,
    "current_index" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    "extracted_data" JSONB,
    "processing_mode" VARCHAR(20) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_sessions_receipt_id_idx" ON "batch_sessions"("receipt_id");

-- CreateIndex
CREATE INDEX "batch_sessions_user_id_idx" ON "batch_sessions"("user_id");

-- CreateIndex
CREATE INDEX "batch_sessions_status_idx" ON "batch_sessions"("status");

-- CreateIndex
CREATE INDEX "receipts_document_type_idx" ON "receipts"("document_type");

-- AddForeignKey
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
