-- Drop the user_rate_limits table
DROP TABLE IF EXISTS "user_rate_limits";

-- Drop rate limit columns from user table
ALTER TABLE "user" DROP COLUMN IF EXISTS "hourly_upload_limit";
ALTER TABLE "user" DROP COLUMN IF EXISTS "daily_upload_limit";
