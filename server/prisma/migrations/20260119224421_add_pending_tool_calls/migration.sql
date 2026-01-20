-- AlterTable
ALTER TABLE "clarification_sessions" ADD COLUMN     "pending_tool_calls" JSONB,
ADD COLUMN     "tool_results" JSONB;
