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

### 5. Deploy to Railway

```bash
./deploy.command
```

Or push to GitHub – Railway auto-deploys if connected.

## Data sources (knowledge base)

In **Admin → Data sources** you can add multiple sources; the chatbot uses this content to answer questions (RAG).

| Type | Description |
|------|-------------|
| **Website** | Crawls a site (e.g. mdttac.com). Config: `{"baseUrl": "https://...", "maxPages": 50}` |
| **Zendesk** | Syncs Help Center articles. Requires Zendesk env vars. Config: `{"locale": "en-us", "maxArticles": 200}` |
| **Shopify products** | Imports product catalog. Requires Shopify env vars. No config. |

After adding a source, click **Sync** to pull content. With `OPENAI_API_KEY` set, chunks are embedded for semantic search; otherwise full-text search is used.

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
