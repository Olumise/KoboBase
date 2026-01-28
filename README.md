# KoboBase Backend

KoboBase is an AI-powered financial transaction extraction and management system that processes receipts and documents to automatically extract, categorize, and track financial transactions.

## Features

### Core Capabilities

- **Intelligent Receipt Processing**: Upload receipts and documents for automatic OCR text extraction
- **AI-Powered Transaction Extraction**: Multiple processing modes for extracting transaction data using LLMs
- **Financial Categorization**: System and custom categories with smart suggestions
- **Contact Management**: Track vendors, customers, and other financial contacts with name normalization
- **Multi-Account Support**: Manage multiple bank accounts and track transfers between accounts
- **Cost Tracking**: Monitor LLM usage, token consumption, and costs per processing session

### Processing Modes

1. **Batch Processing**: Extract all transactions from a receipt at once for bulk approval (Not fully configured yet)
2. **Sequential Processing**: Review and approve transactions one-by-one for granular control
3. **Clarification Mode**: Interactive chat-based refinement with AI-powered clarifying questions

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js v5
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: better-auth
- **AI/LLM**: LangChain with OpenAI (GPT-4), Anthropic (Claude), and Google (Gemini) support
- **Storage**: AWS S3 / Supabase Storage
- **Validation**: Zod for schema validation
- **File Processing**: Multer for uploads, pdf-parse for PDFs

## Prerequisites

- Node.js (v18 or higher recommended)
- PostgreSQL database
- API keys for at least one LLM provider (OpenAI, Anthropic, or Google)
- AWS S3 or Supabase account for file storage

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd KoboBase
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables by creating a `.env` file:
```env
PORT=4245
DATABASE_URL=postgresql://username:password@localhost:5432/kobobase
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:4245

# LLM API Keys (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=...

# Storage Configuration
SUPABASE_S3_STORAGE_URL=https://your-project.supabase.co/storage/v1/s3
SUPABASE_URL=https://your-project.supabase.co
S3_REGION=eu-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Environment
MODE=development
```

4. Run Prisma migrations:
```bash
npx prisma migrate dev
```

5. Seed the database with system categories:
```bash
npm run prisma-seed
```

## Running the Application

### Development Mode
```bash
npm start
```
This starts the server with hot-reload on the configured PORT (default: 4245).

### Database Management
```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Open Prisma Studio for visual data management
npx prisma studio

# Reset database (caution: deletes all data)
npx prisma migrate reset
```

## Project Structure

```
KoboBase/
├── src/
│   ├── routes/          # API endpoint definitions
│   ├── services/        # Business logic and external integrations
│   ├── controllers/     # Request handlers
│   ├── middlewares/     # Express middleware (auth, error handling, uploads)
│   ├── lib/            # Core utilities (Prisma, auth, prompts)
│   ├── tools/          # LangChain tool definitions for AI
│   ├── models/         # LLM model configurations
│   ├── schema/         # Zod validation schemas
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Token counting and utilities
│   ├── config/         # Configuration files
│   └── index.ts        # Application entry point
├── prisma/
│   ├── schema.prisma   # Database schema
│   ├── migrations/     # Database migrations
│   └── seed.ts         # Database seeding script
├── postman/            # API documentation and test collections
├── generated/          # Auto-generated Prisma client
├── package.json
├── tsconfig.json
└── .env
```

## API Documentation

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/signin` - Login user

### Receipt Management
- `POST /receipt/add` - Upload receipt image/PDF
- `POST /receipt/extract/:receiptId` - Initiate extraction
- `PATCH /receipt/update-file/:receiptId` - Update receipt file
- `GET /receipt/batch-session/:receiptId` - Get processing status

### Transaction Processing

#### Single Transaction Initiation
- `POST /transaction/initiate/:receiptId` - Initiate single transaction extraction

#### Sequential Processing
- `POST /transaction/sequential/initiate/:receiptId` - Start sequential mode
- `GET /transaction/sequential/current/:batchSessionId` - Get current transaction
- `POST /transaction/sequential/approve-and-next` - Approve and move to next
- `POST /transaction/sequential/skip/:batchSessionId` - Skip transaction
- `POST /transaction/sequential/complete/:batchSessionId` - Complete session

#### Transaction CRUD
- `GET /transaction/` - List transactions (supports filtering)
- `GET /transaction/stats` - Get transaction statistics
- `GET /transaction/:transactionId` - Get single transaction
- `POST /transaction/` - Create transaction
- `PUT /transaction/:transactionId` - Update transaction
- `DELETE /transaction/:transactionId` - Delete transaction

### Categories
- `GET /category/all` - Get all categories
- `GET /category/system` - Get system categories
- `GET /category/user/:userId/created` - Get user-created categories
- `POST /category/` - Create category
- `PUT /category/:categoryId` - Update category
- `DELETE /category/:categoryId` - Delete category

### Contacts
- `GET /contact/all` - List all contacts
- `GET /contact/search` - Search contacts
- `POST /contact/` - Create contact
- `PUT /contact/:contactId` - Update contact

### Bank Accounts
- `GET /bank-account/` - List bank accounts
- `POST /bank-account/` - Create bank account
- `GET /bank-account/primary/:userId` - Get primary account
- `PATCH /bank-account/:accountId/set-primary` - Set as primary
- `PUT /bank-account/:accountId` - Update account
- `DELETE /bank-account/:accountId` - Delete account

### Clarification
- `POST /clarification/create` - Create clarification session
- `GET /clarification/session/:sessionId` - Get session details
- `POST /clarification/session/:sessionId/message` - Send message
- `POST /clarification/session/:sessionId/confirm` - Confirm tool results
- `PATCH /clarification/session/:sessionId/complete` - Complete session

### AI Utilities
- `POST /ai/image-ocr` - Perform OCR on images
- `POST /ai/pdf-info` - Get PDF information
- `POST /ai/parse-pdf` - Parse PDF content

### User Settings
- `GET /user/:userId/settings` - Get user settings
- `PATCH /user/settings` - Update settings (custom context, currency, etc.)

For detailed API documentation and example requests, see the Postman collections in the [postman/](postman/) directory.

## Database Schema

### Core Models

**User**: User accounts with authentication and preferences
- Custom context prompts for personalized extraction
- Default currency setting
- Relations to all user-specific data

**Receipt**: Uploaded documents/images
- OCR text and confidence scores
- Processing status tracking
- Document type detection
- Expected vs processed transaction counts

**Transaction**: Financial transactions
- Amount, currency, date, description
- Transaction type (income/expense/transfer/refund/fee/adjustment)
- Status tracking (pending/confirmed/failed/cancelled/disputed)
- AI confidence scores
- Vector embeddings for similarity matching
- Self-transaction detection for transfers

**Category**: System and user-defined categories
- Icons and colors for visual representation
- System categories (unchangeable) and custom categories
- Active/inactive status

**Contact**: Vendors, customers, and other parties
- Name normalization and variations
- Transaction frequency and amount tracking
- Default category assignment
- Contact type classification

**BankAccount**: User's bank accounts
- Account details (number, bank name, type)
- Primary account designation
- Multi-currency support
- Transfer tracking between accounts

**ClarificationSession**: Interactive refinement sessions
- Chat-based clarification with AI
- Tool call execution and confirmation
- Extracted data storage
- Message history

**BatchSession**: Batch processing sessions
- Progress tracking (current index, total expected)
- Processing mode (batch/sequential)
- Extracted data storage
- Status management

**LLMUsageSession**: Cost and usage tracking
- Token consumption (input/output/total)
- Cost calculation in USD
- Call breakdown by type
- Links to clarification or batch sessions

**UserCostMetrics**: Aggregated usage metrics
- Total tokens and costs
- Monthly tracking with reset
- Call counts by operation type

## LLM Integration

KoboBase uses LangChain to integrate with multiple LLM providers:

### Supported Models

**OpenAI**
- gpt-4o (recommended for extraction)
- gpt-4.1
- text-embedding-3-small (for embeddings)

**Anthropic**
- Claude 3.5 Sonnet
- Claude 3 Haiku

**Google**
- Gemini 3 Flash Preview

### Tool Integration

The AI can use structured tools during extraction:
- `get_category` - Find or suggest transaction categories
- `get_or_create_contact` - Create or retrieve contacts
- `get_bank_accounts` - List user's bank accounts
- `validate_transaction_type` - Validate transaction types

Tool results can require user confirmation based on configured rules.

### Cost Tracking

All LLM calls are tracked with:
- Input/output token counts
- Cost calculations using provider-specific pricing
- Call type categorization (OCR, detection, extraction, clarification)
- Per-session and monthly aggregation

## Configuration

### LLM Pricing

Pricing per million tokens is configured in [src/config/llm-pricing.config.ts](src/config/llm-pricing.config.ts). Update this file when provider pricing changes.

### Tool Confirmations

Configure which tool results require user confirmation in [src/config/toolConfirmations.ts](src/config/toolConfirmations.ts).

### System Prompts

Core extraction prompts are managed in [src/lib/prompts.ts](src/lib/prompts.ts), including:
- Document detection prompts
- Transaction extraction prompts
- Clarification prompts
- Category matching prompts

## Authentication

KoboBase uses [better-auth](https://github.com/better-auth/better-auth) for authentication:

1. Users register via `/auth/signup` with email and password
2. Sign in via `/auth/signin` returns a session token
3. Include the token in the `Authorization` header for authenticated requests
4. The `authVerify` middleware validates tokens and populates `req.user`

## Error Handling

All API errors return JSON responses:

```json
{
  "status": 404,
  "message": "Receipt not found",
  "isOperational": true
}
```

- `4xx` errors indicate client errors (invalid requests, unauthorized, not found)
- `5xx` errors indicate server errors
- Stack traces are included in development mode

## Development

### Code Style

- TypeScript with strict mode enabled
- ES2023 target
- ESNext modules
- Absolute imports from `src/`

### Database Changes

1. Update [prisma/schema.prisma](prisma/schema.prisma)
2. Run `npx prisma migrate dev --name description_of_change`
3. Commit both the schema and migration files

### Adding New Models

1. Add model to Prisma schema
2. Create migration
3. Update types in [src/types/](src/types/)
4. Create service in [src/services/](src/services/)
5. Add routes in [src/routes/](src/routes/)
6. Update router in [src/index.ts](src/index.ts)

## Deployment

1. Set `MODE=production` in environment variables
2. Update `BETTER_AUTH_URL` to production URL
3. Ensure `DATABASE_URL` points to production database
4. Configure production storage endpoints
5. Run migrations: `npx prisma migrate deploy`
6. Start application: `npm start`

## Security Considerations

- All authenticated endpoints require valid bearer tokens
- File uploads are validated for type and size
- SQL injection prevention via Prisma parameterized queries
- Input validation using Zod schemas
- Sensitive data (API keys, secrets) stored in environment variables
- CORS configured for specific origins in production

## Cost Optimization

- Prompt caching enabled for repeated system messages
- Token counting before API calls for budget management
- Usage tracking per user for quota enforcement
- Multiple model options (Haiku for speed, GPT-4o for accuracy)
- Batch processing reduces per-transaction overhead

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Ensure PostgreSQL is running
- Check network connectivity and firewall rules

### LLM API Errors
- Verify API keys are valid and have sufficient credits
- Check rate limits and quotas
- Review error messages in server logs

### File Upload Failures
- Check S3/Supabase credentials
- Verify storage bucket permissions
- Ensure file size is within limits (configured in multer)

### Authentication Errors
- Verify `BETTER_AUTH_SECRET` is set and consistent
- Check token expiration
- Ensure `BETTER_AUTH_URL` matches deployment URL



