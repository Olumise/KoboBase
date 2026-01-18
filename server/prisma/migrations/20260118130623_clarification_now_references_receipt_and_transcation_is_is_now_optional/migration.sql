/*
  Warnings:

  - You are about to drop the column `extracted_info` on the `clarification_messages` table. All the data in the column will be lost.
  - You are about to drop the column `message_order` on the `clarification_messages` table. All the data in the column will be lost.
  - You are about to drop the column `reasoning` on the `clarification_messages` table. All the data in the column will be lost.
  - You are about to drop the column `ambiguity_reasons` on the `clarification_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `initial_extraction` on the `clarification_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `questions_asked` on the `clarification_sessions` table. All the data in the column will be lost.
  - Added the required column `receipt_id` to the `clarification_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "clarification_sessions" DROP CONSTRAINT "clarification_sessions_transaction_id_fkey";

-- DropIndex
DROP INDEX "clarification_sessions_transaction_id_idx";

-- AlterTable
ALTER TABLE "clarification_messages" DROP COLUMN "extracted_info",
DROP COLUMN "message_order",
DROP COLUMN "reasoning";

-- AlterTable
ALTER TABLE "clarification_sessions" DROP COLUMN "ambiguity_reasons",
DROP COLUMN "initial_extraction",
DROP COLUMN "questions_asked",
ADD COLUMN     "extracted_data" JSONB,
ADD COLUMN     "receipt_id" TEXT NOT NULL,
ALTER COLUMN "transaction_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "clarification_sessions_receipt_id_idx" ON "clarification_sessions"("receipt_id");

-- CreateIndex
CREATE INDEX "clarification_sessions_user_id_idx" ON "clarification_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "clarification_sessions" ADD CONSTRAINT "clarification_sessions_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_sessions" ADD CONSTRAINT "clarification_sessions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
