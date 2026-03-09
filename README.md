# MDT AI Support Platform

AI-powered customer support chatbot for MDT (Modular Driven Technologies). Embeddable chat widget, backend API with Claude, Shopify & Zendesk integrations, and admin dashboard.

## Structure

```
/backend   - Express API (Claude, PostgreSQL, Shopify, Zendesk)
/widget    - Embeddable chat widget (React, single script tag)
/admin     - Admin dashboard (conversations, live monitor)
```

## Setup

### 1. Environment variables

Copy `env.example` to `.env` and fill in:

- **ANTHROPIC_API_KEY** – Required for Claude
- **DATABASE_URL** – PostgreSQL connection string (required)
- **SHOPIFY_SHOP** / **SHOPIFY_ACCESS_TOKEN** – For product/order lookup
- **ZENDESK_SUBDOMAIN** / **ZENDESK_EMAIL** / **ZENDESK_API_TOKEN** – For escalation

### 2. Database

Railway provides PostgreSQL. Add `DATABASE_URL` to your Railway project variables.

### 3. Local development

```bash
npm install
npm run build
# Set DATABASE_URL and ANTHROPIC_API_KEY in .env
npm run dev
```

Backend runs at http://localhost:3000
- Admin: http://localhost:3000/admin
- Widget script: http://localhost:3000/widget/mdt-chat-widget.iife.js

### 4. Embed the widget

```html
<script
  src="https://YOUR-RAILWAY-URL/widget/mdt-chat-widget.iife.js"
  data-api-url="https://YOUR-RAILWAY-URL"
></script>
```

Optional: `data-greeting="Custom greeting"` and `data-suggested-questions="Question 1|Question 2|Question 3"`

### 5. Identify logged-in users (Shopify / Zendesk)

When the chat is embedded on a page where the customer is already logged in (e.g. Shopify store account, Zendesk Help Center), set `window.MDT_CHAT_USER` **before** the chat script loads so the conversation is linked to their account immediately:

```html
<script>
  // Shopify Liquid: window.MDT_CHAT_USER = { email: "{{ customer.email }}", name: "{{ customer.first_name }} {{ customer.last_name }}" };
  // Or set manually for logged-in users
  window.MDT_CHAT_USER = { email: "user@example.com", name: "Jane Doe" };
</script>
<script src="/chat.js" defer></script>
```

The chat will call `POST /api/chat/identify` on load, linking the session to the customer. Customer records are enriched from Shopify (shopifyId, order history) and Zendesk (zendeskId) when available.

### 6. Deploy to Railway

```bash
./deploy.command
```

Or push to GitHub – Railway auto-deploys if connected.

## Customer identity linking

The platform links customer data across chat, Shopify, Zendesk, and HubSpot:

- **Email in chat** – Typing an email or order number triggers identification; the conversation is linked to the customer.
- **Name in chat** – Patterns like "I'm John Smith" or "My name is Jane" are detected and stored on the customer record.
- **Shopify** – On identify, we search Shopify customers by email and store `shopifyId`, order count, and total spend.
- **Zendesk** – We search for existing Zendesk users by email; on escalation, the ticket is created with the customer as requester and we store `zendeskId`.
- **HubSpot** – When a conversation ends, we create/find the HubSpot contact and store `hubspotId` for future syncs.

## Data sources (knowledge base)

In **Admin → Data sources** you can add multiple sources; the chatbot uses this content to answer questions (RAG). **All sources are re-synced daily at 2:00 AM UTC.**

| Type | Description |
|------|-------------|
| **Website** | Enter URL; choose "Entire site" or "Only this page". Crawls product pages, docs, etc. |
| **Google Drive** | Enter folder URL or ID. Requires `GOOGLE_SERVICE_ACCOUNT_JSON`; share the folder with the service account email. Syncs Docs (as text), text files, CSV, Markdown. |
| **Google Sheets** | Enter spreadsheet URL or ID. Requires `GOOGLE_SERVICE_ACCOUNT_JSON`; share the sheet with the service account email. Syncs all sheets for live data. |
| **Zendesk** | Syncs Help Center articles. Requires Zendesk env vars. |
| **Shopify products** | Imports product catalog. Requires Shopify env vars. |

After adding a source, click **Sync** to pull content (or wait for daily sync). With `OPENAI_API_KEY` set, chunks are embedded for semantic search; otherwise full-text search is used.

## API

- `POST /api/chat/stream` – Chat with streaming (uses knowledge base when available)
- `GET /api/chat/conversations` – List conversations (admin)
- `GET /api/chat/conversations/:id/messages` – Get messages (admin)
- `GET/PUT /api/widget/config` – Widget greeting and suggested questions
- `GET/POST/PATCH/DELETE /api/sources` – Data sources CRUD
- `POST /api/sources/:id/sync` – Run sync for a source
- `GET /api/sources/:id/chunks` – List chunks for a source
- `POST /api/zendesk/escalate` – Create Zendesk ticket
- `GET /api/shopify/orders/:id` – Get order by ID
- `GET /api/shopify/orders?email=...` – Get orders by email
- `GET /api/shopify/products?q=...` – Search products
- `GET /api/health` – Health check
