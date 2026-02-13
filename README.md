# NUCallPartyLine - Automated School Call System

An automated call system for schools that integrates with VAPI for AI-powered outbound calls, with full transcript tracking and sentiment analysis.

## Features

- **Contact Management**: Import contacts via CSV, manage contact lists
- **Campaign Creation**: Create call campaigns, select contacts, configure settings
- **VAPI Integration**: Make outbound calls using your existing VAPI assistant/script
- **Call Tracking**: Real-time call status, duration, transcripts via VAPI webhooks
- **AI Analytics**: Sentiment analysis and key response extraction via OpenAI
- **Web Dashboard**: Real-time campaign progress and call monitoring

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Real-time**: Socket.io for live call status updates
- **Analytics**: OpenAI API for sentiment analysis
- **Package Manager**: pnpm with workspaces

## Prerequisites

- Node.js 18+
- pnpm 8+
- Docker (for PostgreSQL) or PostgreSQL instance
- VAPI account with:
  - API key
  - Assistant ID (your call script)
  - Phone Number ID (for outbound calls)
- OpenAI API key

## Quick Start

### 1. Clone and Install

```bash
cd NUCallPartyLine_repo
pnpm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nucallpartyline"

# VAPI (required)
VAPI_API_KEY="your-vapi-api-key"
VAPI_ASSISTANT_ID="your-assistant-id"
VAPI_PHONE_NUMBER_ID="your-phone-number-id"

# OpenAI (required for analytics)
OPENAI_API_KEY="your-openai-api-key"
```

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

### 4. Initialize Database

```bash
pnpm db:push
```

### 5. Start Development Servers

```bash
pnpm dev
```

This starts:
- Backend API: http://localhost:3001
- Frontend: http://localhost:5173

## Project Structure

```
NUCallPartyLine_repo/
├── apps/
│   ├── api/                    # Express backend
│   │   ├── src/
│   │   │   ├── config/         # Database, env, VAPI setup
│   │   │   ├── controllers/    # Route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── routes/         # API routes
│   │   │   └── index.ts        # Server entry
│   │   └── prisma/
│   │       └── schema.prisma   # Database schema
│   └── web/                    # React frontend
│       └── src/
│           ├── components/     # UI components
│           ├── pages/          # Page components
│           ├── hooks/          # Custom hooks
│           ├── services/       # API client
│           └── store/          # State management
├── packages/
│   └── shared/                 # Shared types
├── docker-compose.yml          # PostgreSQL
└── .env.example                # Environment template
```

## Usage

### 1. Import Contacts

1. Go to **Contacts** page
2. Click **Import CSV**
3. Upload a CSV file with columns:
   - `firstName` (required)
   - `lastName` (required)
   - `phoneNumber` (required)
   - `email`
   - `studentName`
   - `studentGrade`
   - `relationship`

Or download the template for the correct format.

### 2. Create a Campaign

1. Go to **Campaigns** page
2. Click **New Campaign**
3. Enter a name and optional description
4. Add contacts from your contact list
5. Click **Start** to begin calling

### 3. Monitor Progress

- Watch real-time call progress on the campaign page
- View individual call details and transcripts
- See sentiment analysis and extracted responses

### 4. Analyze Results

- Go to **Analytics** for overall statistics
- View campaign-specific analytics
- Check sentiment distribution and call outcomes

## VAPI Webhook Setup

Configure your VAPI assistant to send webhooks to:

```
https://your-domain.com/api/webhooks/vapi
```

For local development, use ngrok:

```bash
ngrok http 3001
```

Then update your VAPI assistant's Server URL with the ngrok URL.

## API Endpoints

### Contacts
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact
- `POST /api/contacts/import` - Import CSV
- `GET /api/contacts/export` - Export CSV

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/contacts` - Add contacts
- `POST /api/campaigns/:id/start` - Start campaign
- `POST /api/campaigns/:id/pause` - Pause campaign

### Calls
- `GET /api/calls` - List calls
- `GET /api/calls/:id` - Get call details
- `GET /api/calls/:id/transcript` - Get transcript
- `GET /api/calls/:id/analytics` - Get analytics

### Webhooks
- `POST /api/webhooks/vapi` - VAPI webhook endpoint

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `VAPI_API_KEY` | Your VAPI API key | Yes |
| `VAPI_ASSISTANT_ID` | Your VAPI assistant ID | Yes |
| `VAPI_PHONE_NUMBER_ID` | Your VAPI phone number ID | Yes |
| `OPENAI_API_KEY` | OpenAI API key for analytics | Yes |
| `PORT` | API server port (default: 3001) | No |
| `CORS_ORIGIN` | Frontend URL (default: http://localhost:5173) | No |
| `MAX_CONCURRENT_CALLS` | Max simultaneous calls (default: 10) | No |

## Development

### Run backend only
```bash
pnpm dev:api
```

### Run frontend only
```bash
pnpm dev:web
```

### Database commands
```bash
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema changes
pnpm db:studio    # Open Prisma Studio
```

## License

MIT
