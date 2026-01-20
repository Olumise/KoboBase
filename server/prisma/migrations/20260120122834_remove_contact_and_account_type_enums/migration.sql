-- AlterTable: Convert account_type enum to varchar, preserving existing data
ALTER TABLE "bank_accounts"
ALTER COLUMN "account_type" TYPE VARCHAR(20) USING account_type::text;

-- AlterTable: Convert sender_type (ContactType) enum to varchar, preserving existing data
ALTER TABLE "senders"
ALTER COLUMN "sender_type" TYPE VARCHAR(20) USING sender_type::text;

-- DropEnum
DROP TYPE "account_type";

-- DropEnum
DROP TYPE "contact_type";
