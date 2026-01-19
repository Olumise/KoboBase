-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('savings', 'current', 'wallet', 'card', 'other');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "to_bank_account_id" TEXT,
ADD COLUMN     "user_bank_account_id" TEXT;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(20),
    "bank_name" VARCHAR(100) NOT NULL,
    "account_type" "account_type",
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "nickname" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "bank_accounts_bank_name_idx" ON "bank_accounts"("bank_name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_user_id_account_number_bank_name_key" ON "bank_accounts"("user_id", "account_number", "bank_name");

-- CreateIndex
CREATE INDEX "transactions_user_bank_account_id_idx" ON "transactions"("user_bank_account_id");

-- CreateIndex
CREATE INDEX "transactions_to_bank_account_id_idx" ON "transactions"("to_bank_account_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_bank_account_id_fkey" FOREIGN KEY ("user_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_bank_account_id_fkey" FOREIGN KEY ("to_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
