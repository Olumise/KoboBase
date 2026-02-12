-- DropIndex
DROP INDEX "idx_transactions_embedding_ivfflat";

-- DropIndex
DROP INDEX "user_rate_limits_user_id_limit_type_window_start_key";

-- RenameIndex
ALTER INDEX "user_rate_limits_user_id_limit_type_window_start_endpoint_path_" RENAME TO "user_rate_limits_user_id_limit_type_window_start_endpoint_p_key";
