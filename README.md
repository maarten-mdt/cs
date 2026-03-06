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

## API

- `POST /api/chat/stream` – Chat with streaming
- `GET /api/chat/conversations` – List conversations (admin)
- `GET /api/chat/conversations/:id/messages` – Get messages (admin)
- `POST /api/zendesk/escalate` – Create Zendesk ticket
- `GET /api/shopify/orders/:id` – Get order by ID
- `GET /api/shopify/orders?email=...` – Get orders by email
- `GET /api/shopify/products?q=...` – Search products
- `GET /api/health` – Health check
