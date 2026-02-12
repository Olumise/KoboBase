# Sequential Transaction Response Structure

## Complete Response Example

When you call the sequential transaction endpoints, here's the exact structure you'll receive:

```json
{
  "batch_session_id": "uuid-here",
  "total_transactions": 1,
  "successfully_initiated": 1,
  "transactions": [
    {
      "transaction_index": 0,
      "needs_clarification": false,
      "needs_confirmation": false,
      "clarification_session_id": null,
      "is_complete": "true",
      "confidence_score": 1.0,

      "transaction": {
        "fees": 0,
        "amount": 3000,
        "status": "successful",
        "summary": "Expense of ₦3,000 paid to bills...",
        "category": "Data & Airtime",
        "currency": "NGN",
        "raw_input": "01/02/26 16:51:36 ₦3,000.00 bills...",
        "time_sent": "2026-02-01T16:51:36",
        "description": "10gb weekly plan + youtube & social plan...",
        "sender_bank": "Kuda Bank",
        "sender_name": "Tolulope",
        "receiver_bank": "",
        "receiver_name": "bills",
        "payment_method": "other",
        "transaction_type": "expense",  // ← HERE IS THE TRANSACTION TYPE
        "transaction_direction": "outbound",
        "transaction_reference": "MISSING",
        "receiver_account_number": ""
      },

      "raw_text": "01/02/26 16:51:36 ₦3,000.00 bills 10gb weekly plan + youtube & social plan (7 days) purchase ₦1,318.63",

      "missing_fields": null,
      "questions": null,

      "enrichment_data": {
        "category_id": "uuid-or-null",
        "contact_id": "uuid-or-null",
        "user_bank_account_id": "uuid-or-null",
        "to_bank_account_id": null,
        "is_self_transaction": false
      },

      "notes": "All transaction details extracted successfully."
    }
  ],
  "overall_confidence": 1.0,
  "processing_notes": "Sequential processing started. Showing transaction 1 of 1."
}
```

## How to Access Fields in Your Frontend

### ✅ CORRECT Access Patterns:

```typescript
const response = await fetch('/api/transactions/sequential/initiate', {...});
const data = await response.json();

// Get the first transaction item
const transactionItem = data.transactions[0];

// Access transaction type (nested inside transaction object)
const transactionType = transactionItem.transaction.transaction_type;  // ✅ "expense"

// Access other transaction fields
const amount = transactionItem.transaction.amount;  // ✅ 3000
const description = transactionItem.transaction.description;  // ✅ "10gb weekly plan..."
const rawInput = transactionItem.transaction.raw_input;  // ✅ OCR text

// Access top-level fields
const rawText = transactionItem.raw_text;  // ✅ Full OCR text
const isComplete = transactionItem.is_complete;  // ✅ "true"
const confidence = transactionItem.confidence_score;  // ✅ 1.0
```

### ❌ INCORRECT Access Patterns:

```typescript
// ❌ WRONG - transaction_type is NOT at the top level
const transactionType = transactionItem.transaction_type;  // undefined

// ❌ WRONG - transaction_type is NOT at the data level
const transactionType = data.transaction_type;  // undefined
```

## Editing Transaction Type on Approve

When approving a transaction with edits:

```typescript
POST /api/transactions/sequential/approve

{
  "batchSessionId": "uuid-here",
  "edits": {
    "transactionType": "income",  // ✅ Override AI's choice
    "amount": 3500,
    "description": "Updated description",
    "transactionDate": "2026-02-01T16:51:36",
    "paymentMethod": "transfer"
  }
}
```

## Valid Transaction Types

The transaction type must be one of these (lowercase in response, uppercase in DB):

- `"income"` - Money coming in
- `"expense"` - Money going out
- `"transfer"` - Moving money between your own accounts
- `"refund"` - Money returned
- `"fee"` - Charges/fees
- `"adjustment"` - Balance adjustments

## Frontend Dropdown Example

```typescript
// Example React/TypeScript code
interface TransactionItemType {
  transaction: {
    transaction_type: string;
    amount: number;
    // ... other fields
  };
  // ... other fields
}

function TransactionTypeDropdown({ transactionItem }: { transactionItem: TransactionItemType }) {
  const [selectedType, setSelectedType] = useState(
    transactionItem.transaction.transaction_type  // ✅ Correct access
  );

  const transactionTypes = [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'refund', label: 'Refund' },
    { value: 'fee', label: 'Fee' },
    { value: 'adjustment', label: 'Adjustment' }
  ];

  return (
    <select
      value={selectedType}
      onChange={(e) => setSelectedType(e.target.value)}
    >
      {transactionTypes.map(type => (
        <option key={type.value} value={type.value}>
          {type.label}
        </option>
      ))}
    </select>
  );
}
```

## Summary

- **Transaction type location**: `transactions[0].transaction.transaction_type`
- **Raw OCR text (full)**: `transactions[0].raw_text`
- **Raw OCR text (in transaction)**: `transactions[0].transaction.raw_input`
- **Both contain the same OCR text** - use whichever is more convenient
- **Editing**: Send `edits.transactionType` in the approve request
