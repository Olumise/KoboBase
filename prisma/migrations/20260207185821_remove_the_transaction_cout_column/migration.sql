/*
  Warnings:

  - You are about to drop the column `last_transaction_date` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `transaction_count` on the `contacts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "last_transaction_date",
DROP COLUMN "transaction_count";
