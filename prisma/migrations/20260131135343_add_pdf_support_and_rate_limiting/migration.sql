-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "extraction_metadata" JSONB;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "daily_upload_limit" INTEGER,
ADD COLUMN     "hourly_upload_limit" INTEGER;

-- CreateTable
CREATE TABLE "user_rate_limits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "limit_type" VARCHAR(20) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "max_requests" INTEGER NOT NULL,
    "endpoint_path" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_rate_limits_user_id_limit_type_idx" ON "user_rate_limits"("user_id", "limit_type");

-- CreateIndex
CREATE INDEX "user_rate_limits_window_end_idx" ON "user_rate_limits"("window_end");

-- CreateIndex
CREATE UNIQUE INDEX "user_rate_limits_user_id_limit_type_window_start_key" ON "user_rate_limits"("user_id", "limit_type", "window_start");

-- AddForeignKey
ALTER TABLE "user_rate_limits" ADD CONSTRAINT "user_rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
