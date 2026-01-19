/*
  Warnings:

  - You are about to drop the column `category` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `embedding` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `is_recurring` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `needs_review` on the `transactions` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "transactions_category_idx";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "category",
DROP COLUMN "embedding",
DROP COLUMN "is_recurring",
DROP COLUMN "needs_review",
ADD COLUMN     "category_id" TEXT;

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
