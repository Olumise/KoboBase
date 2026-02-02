/**
 * Frontend TypeScript types for SSE progress tracking
 * Copy these types to your frontend project
 */

export type ProgressStep =
  | 'validating_receipt'
  | 'fetching_user_data'
  | 'checking_session'
  | 'invoking_ai'
  | 'analyzing_transactions'
  | 'executing_tools'
  | 'creating_session'
  | 'enriching_data'
  | 'finalizing_extraction'
  | 'complete';

export interface ProgressEvent {
  type: 'progress';
  step: ProgressStep;
  message: string;
  progress: number; // 0-100
  timestamp: string;
  metadata?: {
    toolCallsCount?: number;
    autoToolsCount?: number;
    transactionsFound?: number;
    totalTransactions?: number;
    [key: string]: any;
  };
}

export interface ConnectedEvent {
  type: 'connected';
  message: string;
}

export interface CompleteEvent {
  type: 'complete';
  message: string;
  data: {
    batch_session_id: string;
    total_transactions: number;
    successfully_initiated: number;
    transactions: Transaction[];
    overall_confidence: number;
    processing_notes: string;
  };
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type SSEEvent = ConnectedEvent | ProgressEvent | CompleteEvent | ErrorEvent;

export interface Transaction {
  transaction_index: number;
  needs_clarification: boolean;
  needs_confirmation: boolean;
  clarification_session_id: string | null;
  is_complete: string;
  confidence_score: number;
  transaction: TransactionData | null;
  missing_fields: string[] | null;
  questions: Question[] | null;
  enrichment_data: EnrichmentData | null;
  notes: string | null;
}

export interface TransactionData {
  amount: number;
  currency: string;
  transaction_type: string;
  time_sent: string;
  description?: string;
  payment_method?: string;
  transaction_reference?: string;
  summary?: string;
}

export interface EnrichmentData {
  contact_id?: string;
  category_id?: string;
  user_bank_account_id?: string;
  to_bank_account_id?: string;
  is_self_transaction?: boolean;
}

export interface Question {
  field: string;
  question: string;
  suggestions?: any[];
}

/**
 * Progress step details for UI rendering
 */
export const PROGRESS_STEPS: Record<ProgressStep, { label: string; color: string }> = {
  validating_receipt: {
    label: 'Validating receipt',
    color: '#3B82F6', // blue
  },
  fetching_user_data: {
    label: 'Loading user data',
    color: '#6366F1', // indigo
  },
  checking_session: {
    label: 'Checking session',
    color: '#8B5CF6', // violet
  },
  invoking_ai: {
    label: 'Starting AI extraction',
    color: '#A855F7', // purple
  },
  analyzing_transactions: {
    label: 'Analyzing transactions',
    color: '#EC4899', // pink
  },
  executing_tools: {
    label: 'Enriching data',
    color: '#F97316', // orange
  },
  creating_session: {
    label: 'Creating session',
    color: '#EAB308', // yellow
  },
  enriching_data: {
    label: 'Processing enrichment',
    color: '#84CC16', // lime
  },
  finalizing_extraction: {
    label: 'Finalizing',
    color: '#22C55E', // green
  },
  complete: {
    label: 'Complete',
    color: '#10B981', // emerald
  },
};

/**
 * Helper function to parse SSE data
 */
export function parseSSEData(line: string): SSEEvent | null {
  if (!line.startsWith('data: ')) return null;

  try {
    return JSON.parse(line.slice(6)) as SSEEvent;
  } catch (error) {
    console.error('Failed to parse SSE data:', error);
    return null;
  }
}

/**
 * Hook-friendly state interface
 */
export interface SequentialProcessingState {
  isProcessing: boolean;
  currentStep: ProgressStep | null;
  progress: number;
  message: string;
  result: CompleteEvent['data'] | null;
  error: string | null;
  metadata?: ProgressEvent['metadata'];
}
