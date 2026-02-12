-- AlterTable
-- First, update all NULL endpoint_path values to 'receipt.upload'
UPDATE "user_rate_limits" SET "endpoint_path" = 'receipt.upload' WHERE "endpoint_path" IS NULL;

-- Make endpoint_path NOT NULL with default value
ALTER TABLE "user_rate_limits" ALTER COLUMN "endpoint_path" SET DEFAULT 'receipt.upload';
ALTER TABLE "user_rate_limits" ALTER COLUMN "endpoint_path" SET NOT NULL;

-- Drop the old unique constraint
ALTER TABLE "user_rate_limits" DROP CONSTRAINT IF EXISTS "user_rate_limits_user_id_limit_type_window_start_key";

-- Add the new unique constraint including endpoint_path
ALTER TABLE "user_rate_limits" ADD CONSTRAINT "user_rate_limits_user_id_limit_type_window_start_endpoint_path_key" UNIQUE ("user_id", "limit_type", "window_start", "endpoint_path");

-- Drop old index and add new one
DROP INDEX IF EXISTS "user_rate_limits_user_id_limit_type_idx";
CREATE INDEX "user_rate_limits_user_id_limit_type_endpoint_path_idx" ON "user_rate_limits"("user_id", "limit_type", "endpoint_path");
