export type ProgressStep =
  | 'validating_receipt'
  | 'fetching_user_data'
  | 'checking_session'
  | 'invoking_ai'
  | 'analyzing_transactions'
  | 'executing_tools'
  | 'enriching_data'
  | 'finalizing_extraction'
  | 'creating_session'
  | 'complete';

export interface ProgressUpdate {
  step: ProgressStep;
  message: string;
  progress: number; // 0-100
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type ProgressCallback = (update: ProgressUpdate) => void;
