/*
  Warnings:

  - You are about to drop the column `embedding` on the `receipts` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `receipts` table. All the data in the column will be lost.

*/

-- Step 1: Add new columns to transactions table
ALTER TABLE "transactions" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "transactions" ADD COLUMN "summary" TEXT;

-- Step 2: Migrate existing data from receipts to transactions
UPDATE transactions t
SET
  summary = r.summary,
  embedding = r.embedding
FROM receipts r
WHERE t.receipt_id = r.id
  AND r.summary IS NOT NULL;

-- Step 3: Now safe to drop columns from receipts table
ALTER TABLE "receipts" DROP COLUMN "embedding";
ALTER TABLE "receipts" DROP COLUMN "summary";
