# MDT AI Support Platform — Cursor Build Instructions v2

> **How to use:** Read the chunk you are on. Follow it exactly. Do not write code outside the scope of the current chunk. Do not proceed to the next chunk until all success criteria pass.

---

## Global Rules

> ❌ **NEVER:** Generate code outside the scope of the current chunk. If you find yourself writing code for a feature not listed in this chunk, stop and delete it.

> ❌ **NEVER:** Add placeholder "TODO" implementations that silently do nothing. If something isn't built yet, throw a `NotImplementedError` or return a clear error response.

> ✅ **REQUIRED:** Every error that can reach the user must include the actual error message — not a generic "Something went wrong". This applies to sync jobs, API calls, and form submissions.

---

## Architecture Overview

| App | Path | Description |
|-----|------|-------------|
| Public home | `/` | React page with **inline** chat. This is what customers see. No auth required. |
| Admin dashboard | `/admin` | Separate React app behind Google OAuth. **No chat widget here.** |
| Backend API | — | Single Express server serving both public chat API and all admin APIs. |

> ❌ **NEVER:** Put the chat widget on the admin dashboard. The admin is for staff only.

---

## Tech Stack — Do Not Deviate

- **Backend:** Node.js 20, TypeScript, Express.js, PostgreSQL, Prisma ORM, BullMQ (Redis), Passport.js
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + React Router v6
- **AI:** Anthropic `claude-sonnet-4-6` via `@anthropic-ai/sdk`, streaming via SSE
- **Hosting:** Railway (backend + PostgreSQL + Redis)

---

## Master Checklist

- [ ] Chunk 1 — Project Scaffold & Routing
- [ ] Chunk 2 — Google OAuth (@mdttac.com only)
- [ ] Chunk 3 — Full Database Schema
- [ ] Chunk 4 — Public Home Chat (inline, streaming, form submit)
- [ ] Chunk 5 — Order Lookup (live Shopify + Acumatica)
- [ ] Chunk 6 — Website Crawler (Cloudflare headers, error reporting, no 0-chunk success)
- [ ] Chunk 7 — Zendesk, Google Drive, Shopify Sync (no limits)
- [ ] Chunk 8 — Customer Identity & Data Sync
- [ ] Chunk 9 — Conversations & Customers Pages (with merge)
- [ ] Chunk 10 — Knowledge Base, Connections, Analytics, Settings
- [ ] Chunk 11 — Railway Deployment & Security

---

## What Went Wrong in Build 1 — Keep This Visible

> ❌ Chat was placed as a popup widget — must be inline on the home page  
> ❌ Chat script was inline in HTML — blocked by CSP. Must be external `/chat.js`  
> ❌ Enter key didn't send messages — use `<form>` with submit handler  
> ❌ SSE parsing broke on partial chunks — must buffer and split on `\n\n`  
> ❌ Website crawl completed with 0 chunks but showed status SYNCED  
> ❌ Crawler was blocked by Cloudflare (403) — must send browser-like User-Agent  
> ❌ Crawl was limited to 50/200 pages — default must be 500, max 50,000  
> ❌ URL entered without `https://` caused silent failure — must normalize  
> ❌ Zendesk sync failed with "fetch failed" — subdomain was set to full domain  
> ❌ Zendesk sync capped at 200 articles — must paginate to get all  
> ❌ Error messages were swallowed — UI showed generic message, not actual error  
> ❌ Chat widget was added to admin dashboard — admin has no chat widget  
> ❌ Credentials were mixed into the Add Source form — they belong on the Connections page

---

---

# CHUNK 1 — Project Scaffold & Routing

Creates the monorepo, installs all dependencies, and builds the full routing shell with placeholder pages. No feature logic.

## Prompt

```
Create a monorepo: mdt-support-platform/
  /backend    Express API
  /frontend   React admin dashboard
  /public     Public home page with inline chat

BACKEND scaffold:
- Node.js 20 + TypeScript + Express
- Dependencies: express, typescript, ts-node-dev, @types/node,
  @types/express, dotenv, cors, helmet, morgan, prisma,
  @prisma/client, passport, passport-google-oauth20,
  @types/passport, @types/passport-google-oauth20,
  express-session, connect-pg-simple, bullmq, ioredis
- src/index.ts: Express server, PORT from .env, JSON middleware,
  CORS (allow FRONTEND_URL and PUBLIC_URL from env),
  helmet, morgan, mount routes
- src/routes/index.ts: empty router for now
- GET /health returns { status: 'ok', timestamp: new Date() }
- .env.example with ALL required keys (listed at end)

FRONTEND (admin dashboard) scaffold:
- React 18 + TypeScript + Vite + Tailwind + React Router v6
- Dependencies: react-router-dom, @tanstack/react-query, axios,
  lucide-react, zustand
- Routes in App.tsx:
    /login             -> LoginPage
    /conversations     -> ConversationsPage  (default after login)
    /customers         -> CustomersPage
    /knowledge         -> KnowledgePage
    /analytics         -> AnalyticsPage
    /connections       -> ConnectionsPage
    /settings          -> SettingsPage
- ALL routes except /login wrapped in <AuthGuard>
  AuthGuard: if not authenticated, redirect to /login
  AuthGuard checks useAuthStore (zustand)
- AppLayout.tsx: persistent sidebar + top bar
  Sidebar nav links with lucide icons, active state green #86a33d
  User avatar + name + role at bottom
- Each page renders <h1> with page name only — no other content yet
- Tailwind config extend colors:
    accent: { DEFAULT: '#86a33d', dark: '#5f7c27' }
    surface: '#1a1b1d'
    panel: '#202224'
    border: { dark: '#2a2c2f' }

PUBLIC HOME PAGE scaffold:
- Static files in /public folder
- Single HTML page: public/index.html
- Has a large centered chat container (NOT a popup/widget)
- Placeholder: "Chat loading..." text in the center
- Express serves: GET / -> public/index.html
- Express serves: GET /chat.js -> public/chat.js (empty file for now)
  IMPORTANT: chat.js must be an external script file, not inline JS.
  This avoids CSP violations with strict Content-Security-Policy.

.env.example must include:
DATABASE_URL=
REDIS_URL=
SESSION_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ANTHROPIC_API_KEY=
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ACCESS_TOKEN=
ZENDESK_SUBDOMAIN=         # only the part before .zendesk.com, e.g. "mdt"
ZENDESK_EMAIL=
ZENDESK_API_TOKEN=
HUBSPOT_API_KEY=
FRONTEND_URL=http://localhost:5173
PUBLIC_URL=http://localhost:3001
ALLOWED_EMAIL_DOMAIN=mdttac.com
CRAWLER_USER_AGENT=        # optional: custom UA string for crawler
```

## Success Criteria

- [ ] `npm run dev` in /backend starts server, `GET /health` returns 200
- [ ] `npm run dev` in /frontend shows admin shell, all nav links render
- [ ] All protected routes redirect to /login when not authenticated
- [ ] `GET /` serves the public home page with a chat placeholder
- [ ] `GET /chat.js` returns an empty JS file (not 404)

---

---

# CHUNK 2 — Authentication (Google OAuth, @mdttac.com only)

Admin login via Google, restricted to @mdttac.com. Public home page has no auth.

## Prompt

```
Implement Google OAuth for the ADMIN dashboard only.
The public home page (/) does NOT require authentication.

BACKEND:
- Prisma schema — User model:
    id           String   @id @default(cuid())
    email        String   @unique
    name         String?
    avatarUrl    String?
    role         Role     @default(SUPPORT)
    createdAt    DateTime @default(now())
    lastLoginAt  DateTime?
  enum Role { ADMIN SUPPORT MARKETING CONTENT_EDITOR }
- npx prisma migrate dev --name add-users
- Passport.js GoogleStrategy:
    clientID, clientSecret from env
    callbackURL: /auth/google/callback
    On profile received:
      If profile.emails[0].value domain != ALLOWED_EMAIL_DOMAIN:
        Return done(null, false, { message: 'Domain not allowed' })
      Upsert user by email, update name/avatarUrl/lastLoginAt
      Return done(null, user)
- Session: express-session + connect-pg-simple
    Store sessions in PostgreSQL sessions table
    Secret from SESSION_SECRET env
    Cookie: httpOnly, secure in production, maxAge 8 hours
- Routes:
    GET /auth/google          -> passport.authenticate('google', { scope: ['profile','email'] })
    GET /auth/google/callback -> on success redirect to FRONTEND_URL,
                                  on fail redirect to FRONTEND_URL/login?error=domain
    POST /auth/logout         -> req.logout(), destroy session, return 200
    GET /auth/me              -> if req.user return user, else 401
- Middleware requireAuth(roles?: Role[]):
    If no session user: return 401 { error: 'Unauthorized' }
    If roles provided and user role not in list: return 403 { error: 'Forbidden' }
    Otherwise: next()
- All /api/admin/* routes must use requireAuth() — enforce at the router level,
  not individually per route

FRONTEND (admin):
- LoginPage:
    Dark background (#111213), centered card
    MDT logo (text: "MDT Support" in green)
    "Sign in with Google" button -> window.location = VITE_API_URL + '/auth/google'
    If URL has ?error=domain, show: "Access restricted to @mdttac.com accounts"
- useAuthStore (zustand):
    { user: User | null, isLoading: boolean, isAuthenticated: boolean }
    init(): call GET /api/auth/me, set user or null
- App.tsx: call authStore.init() on mount before rendering routes
- AuthGuard: show loading spinner while isLoading is true
- Sidebar: show user name, email, role badge, Sign Out button
- Sign Out: call POST /api/auth/logout, clear store, redirect to /login
```

## Success Criteria

- [ ] Non-mdttac.com Google account sees domain error message on /login
- [ ] Valid account lands on /conversations after sign-in
- [ ] Refreshing /conversations while authenticated stays on page
- [ ] Sign Out clears session and returns to /login
- [ ] Direct `GET /api/admin/conversations` without auth returns 401

---

---

# CHUNK 3 — Full Database Schema

All Prisma models. No API routes yet — schema and migration only.

## Prompt

```
Extend the Prisma schema. Migration only — no API routes in this chunk.

Add these models:

Customer {
  id             String    @id @default(cuid())
  email          String    @unique   // primary identifier
  name           String?
  shopifyId      String?   @unique
  hubspotId      String?
  zendeskId      String?
  totalSpend     Float     @default(0)
  orderCount     Int       @default(0)
  firstSeenAt    DateTime  @default(now())
  lastSeenAt     DateTime  @default(now())
  conversations  Conversation[]
  mergedIntoId   String?
  mergedInto     Customer? @relation("CustomerMerge", fields: [mergedIntoId], references: [id])
  mergedFrom     Customer[] @relation("CustomerMerge")
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

Conversation {
  id             String              @id @default(cuid())
  sessionId      String              @unique
  customerId     String?
  customer       Customer?           @relation(fields: [customerId], references: [id])
  messages       Message[]
  status         ConversationStatus  @default(BOT)
  topic          String?
  sentiment      String?
  escalatedAt    DateTime?
  resolvedAt     DateTime?
  pageUrl        String?
  zendeskTicketId String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
}
enum ConversationStatus { BOT ESCALATED RESOLVED }

Message {
  id             String      @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           MessageRole
  content        String      @db.Text
  createdAt      DateTime    @default(now())
}
enum MessageRole { USER ASSISTANT SYSTEM }

KnowledgeSource {
  id             String      @id @default(cuid())
  name           String
  type           SourceType
  url            String?
  maxPages       Int         @default(500)
  lastSyncedAt   DateTime?
  chunkCount     Int         @default(0)
  status         SyncStatus  @default(PENDING)
  errorMessage   String?     @db.Text
  createdAt      DateTime    @default(now())
}
enum SourceType { WEBSITE ZENDESK GOOGLE_DRIVE GOOGLE_SHEETS SHOPIFY MANUAL }
enum SyncStatus  { PENDING SYNCING SYNCED FAILED }

KnowledgeChunk {
  id             String          @id @default(cuid())
  sourceId       String
  source         KnowledgeSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  content        String          @db.Text
  url            String?
  title          String?
  createdAt      DateTime        @default(now())
  // embedding column added via SQL below
}

After adding models:
1. Run: npx prisma migrate dev --name full-schema
2. Run this SQL to add the vector column:
   ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);
   CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_idx
   ON "KnowledgeChunk" USING ivfflat (embedding vector_cosine_ops);
3. Run: npx prisma generate
4. Verify with: npx prisma studio
```

## Success Criteria

- [ ] `npx prisma migrate dev` completes without errors
- [ ] `npx prisma studio` shows all tables
- [ ] `KnowledgeChunk` table has an `embedding` vector column
- [ ] `npx prisma generate` succeeds

---

---

# CHUNK 4 — Public Home Page (Inline Chat, Streaming AI)

The customer-facing chat. Inline in the page — not a popup. Handles SSE streaming correctly.

> ✅ **REQUIRED:** The chat on the public home page is INLINE — a large chat panel in the center of the page. It is NOT a floating widget or popup.

> ✅ **REQUIRED:** The chat script must be served as `GET /chat.js` (an external file). Do NOT use inline `<script>` tags with chat logic.

> ✅ **REQUIRED:** Use an HTML `<form>` element with a submit handler. This ensures Enter works reliably across all browsers.

> ❌ **NEVER:** Parse SSE by splitting on newlines naively. SSE chunks can arrive as partial lines. Buffer the incoming stream and split on `\n\n` to get complete events.

## Prompt

```
Build the public home page chat and its backend API.

BACKEND — POST /api/chat/message:
- Public route (no auth required)
- Accepts JSON: { sessionId: string, message: string, pageUrl?: string }
- Validation: if message is empty or sessionId is missing, return 400
- Find or create Conversation by sessionId
- Append user message to DB (role: USER)
- Set response headers for SSE:
    Content-Type: text/event-stream
    Cache-Control: no-cache
    Connection: keep-alive
    X-Accel-Buffering: no
- Call Anthropic claude-sonnet-4-6 with stream: true
  Include last 20 messages from this conversation as context
  System prompt: hardcoded default for now (editable in Chunk 10)
- For each text delta write SSE event:
    data: {"type":"delta","text":"[chunk]"}
    followed by a blank line
- On stream complete write:
    data: {"type":"done"}
    Save complete assistant message to DB
- On error write:
    data: {"type":"error","message":"[error text]"}

BACKEND — POST /api/chat/escalate:
- Accepts: { conversationId: string, reason?: string }
- If Zendesk credentials in env: create Zendesk ticket
    POST /api/v2/tickets with full conversation transcript
    Return { success: true, ticketId, ticketUrl }
- If Zendesk not configured:
    Return { success: true, ticketId: null,
      message: 'Ticket submitted — our team will be in touch.' }
- Update conversation status to ESCALATED regardless

BACKEND — GET /chat.js:
- Serve the static file at public/chat.js

PUBLIC HOME PAGE — public/index.html:
- Dark background (#111213), MDT branding at top
- Large centered container (max-width 720px):
    Title: "MDT Support"
    Subtitle: "Ask anything about products, orders, or compatibility"
    Message list area (scrollable, min-height 400px)
    <form id="chat-form">
      <input id="chat-input" type="text" placeholder="Type a message...">
      <button type="submit">Send</button>
    </form>
    "Talk to a human" link below the form
- Suggested question chips when messages list is empty:
    "Where is my order?"
    "Is this compatible with my rifle?"
    "How do I install the chassis?"
  Clicking a chip populates the input and submits the form
- <script src="/chat.js" defer></script> at end of body — NO inline scripts

public/chat.js:
- On DOMContentLoaded, attach submit listener to #chat-form
- sessionId: check localStorage.getItem('mdt_session_id'),
  if missing generate crypto.randomUUID() and save to localStorage
- On form submit:
    1. e.preventDefault()
    2. Read and clear input value
    3. Append user message bubble to message list
    4. Scroll to bottom
    5. Create empty AI message bubble with typing indicator
    6. fetch POST /api/chat/message with JSON body
       { sessionId, message, pageUrl: window.location.href }
    7. Read response as ReadableStream with TextDecoder
    8. Maintain a string buffer:
         On each chunk: append decoded text to buffer
         Split buffer on "\n\n" to extract complete SSE events
         Keep incomplete tail in buffer for next chunk
         For each complete event: parse the data: JSON
           type == "delta" -> append text to AI bubble, scroll down
           type == "done"  -> remove typing indicator, stop
           type == "error" -> show error text in bubble
    9. On fetch error: show "Connection error. Please try again."
- "Talk to a human" link:
    On click: POST /api/chat/escalate with current conversationId
    Show confirmation message in chat (not alert())
```

## Success Criteria

- [ ] Visiting `/` shows the inline chat (not a floating button)
- [ ] Typing a message and pressing Enter sends it (no page reload)
- [ ] AI response streams in word by word (not all at once at the end)
- [ ] Refreshing the page continues the same conversation
- [ ] Clicking "Talk to a human" creates a Zendesk ticket or shows confirmation
- [ ] DevTools Network tab shows `/chat.js` loaded as external script

---

---

# CHUNK 5 — Order Lookup (Live Shopify + Acumatica)

Gives the AI real order data via Anthropic tool use. Always live — never cached.

> ❌ **NEVER:** Look up order data from any static file, spreadsheet, or cached DB table. All order lookups must call the Shopify API in real time.

## Prompt

```
Add live order lookup as an Anthropic tool available in the chat.

BACKEND — src/services/orders.ts:

Interfaces:
  OrderItem { name, sku, qtyOrdered, qtyShipped, qtyOnHand }
  Order {
    orderNumber, email, orderDate, status, items: OrderItem[],
    trackingNumber?, trackingUrl?, carrierName?,
    shippingStatus: 'SHIPPED' | 'PARTIAL' | 'PENDING_STOCK' | 'BACKORDERED',
    expectedShipDate?
  }

getOrderByNumber(orderNumber: string): Promise<Order | null>
  GET https://{SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json
    ?name={orderNumber}&status=any&limit=1
  Auth: X-Shopify-Access-Token header
  If no results: return null
  For each line item, get inventory:
    Try Acumatica first (if ACUMATICA_API_URL in env)
    Fall back to Shopify inventory_quantity on the variant
  Calculate shippingStatus:
    All items fulfilled -> SHIPPED (include tracking from fulfillments[0])
    Some fulfilled -> PARTIAL
    All unfulfilled + enough inventory -> PENDING_STOCK
      expectedShipDate = 1-2 business days from today
    All unfulfilled + insufficient inventory -> BACKORDERED
      expectedShipDate = orderDate + 70 days (10 weeks)

getOrdersByEmail(email: string): Promise<Order[]>
  GET /orders.json?email={email}&status=any&limit=5

Anthropic tool definition:
  name: "get_order_info"
  description: "Look up a customer order by order number or email"
  input_schema:
    type: object
    properties:
      order_number: { type: string }
      email: { type: string }
    minProperties: 1

Update POST /api/chat/message:
- Include tools: [getOrderInfoTool] in the Anthropic API call
- Handle tool_use blocks in the stream:
    When a tool_use block arrives:
      1. Execute the tool (call orders service)
      2. Send a tool_result message back to the API
      3. Continue streaming the model's final response
- Full tool call + result cycle must still stream to the frontend

New env vars:
ACUMATICA_API_URL=
ACUMATICA_USERNAME=
ACUMATICA_PASSWORD=
```

## Success Criteria

- [ ] Asking "where is my order #[real number]?" returns live data from Shopify
- [ ] Asking with an email returns that customer's last 5 orders
- [ ] If the order doesn't exist, AI says so clearly
- [ ] Shipping status logic correctly handles all four states

---

---

# CHUNK 6 — Website Crawler

Crawls mdttac.com and indexes content for AI retrieval. Handles Cloudflare, large sites, proper error reporting.

> ✅ **REQUIRED:** If crawl completes with 0 chunks, set status = `FAILED`. Do NOT show SYNCED.

> ✅ **REQUIRED:** If the very first page returns 403 or times out, set status = `FAILED` with the exact HTTP error in `errorMessage`.

> ✅ **REQUIRED:** Normalize URLs — if user enters `mdttac.com` (no protocol), prepend `https://`.

> ✅ **REQUIRED:** `CRAWLER_USER_AGENT` env variable, if set, must be used as User-Agent on every fetch.

> ❌ **NEVER:** Limit crawling to 50 or 200 pages. Default is 500. Maximum is 50,000.

## Prompt

```
Build the website crawler and vector indexing pipeline.

Install: cheerio, @xenova/transformers, p-limit

BACKEND — src/services/crawler.ts:

crawlWebsite(sourceId: string): Promise<void>
  Load source from DB
  Normalize URL:
    if (!url.startsWith('http')) url = 'https://' + url
    Update source.url in DB with normalized value

  Default headers for every fetch:
    'User-Agent': process.env.CRAWLER_USER_AGENT ||
      'Mozilla/5.0 (compatible; MDTBot/1.0; +https://mdttac.com)'
    'Accept': 'text/html,application/xhtml+xml,*/*'
    'Accept-Language': 'en-US,en;q=0.9'
    'Cache-Control': 'no-cache'

  Fetch the first page with 15-second timeout (AbortController)
  If fetch throws OR status >= 400:
    source.status = FAILED
    source.errorMessage = 'HTTP [status] [statusText] — site may be blocking
      the crawler. Set CRAWLER_USER_AGENT in .env and whitelist it in
      Cloudflare WAF if applicable.'
    Save and return — do not continue crawl

  BFS crawl from root URL:
    Queue: [rootUrl], Visited: Set
    Respect source.maxPages limit
    For each URL:
      Fetch with 15s timeout + browser-like headers
      Skip if status >= 400
      Parse HTML with cheerio
      Extract same-domain links from <a href> (skip mailto/tel/pdf)
      Extract text:
        Remove <nav> <footer> <header> <script> <style> <aside>
        Normalize whitespace
        Skip if < 100 characters
      Split into chunks: max 2000 chars, 100 char overlap
      Tag each chunk with { url, title: <title> tag text }
      Add to insertQueue

  After crawl:
    If insertQueue is empty:
      status = FAILED
      errorMessage = 'Crawl found [N] pages but extracted 0 content chunks.
        Pages may be JavaScript-rendered or behind authentication.'
      Return
    Generate embeddings in batches of 20
    Insert all KnowledgeChunk records
    Update source: status = SYNCED, chunkCount, lastSyncedAt = now()

BACKEND — src/services/embeddings.ts:
  generateEmbedding(text: string): Promise<number[]>
  generateBatch(texts: string[]): Promise<number[][]>
  Use @xenova/transformers model 'Xenova/all-MiniLM-L6-v2'
  OR use OpenAI text-embedding-3-small if OPENAI_API_KEY in env

BACKEND — src/services/search.ts:
  searchKnowledge(query: string, topK = 14): Promise<KnowledgeChunk[]>
  Embed the query
  SQL: SELECT *, (embedding <=> $1) as distance
       FROM "KnowledgeChunk" ORDER BY distance ASC LIMIT $2
  Return topK = 14 (more context = better answers)

Add search_knowledge Anthropic tool:
  name: "search_knowledge"
  input: { query: string }
  Calls searchKnowledge, returns top 14 chunks with title + url

Update chat route: include both get_order_info and search_knowledge tools

BullMQ worker — src/workers/sync.worker.ts:
  Process 'sync-source' jobs: { sourceId, type }
  Route to correct sync function by type
  On error: catch exception, set source.status = FAILED,
    source.errorMessage = error.message
  NEVER swallow errors silently

Admin routes (all require requireAuth()):
  POST   /api/admin/sources              create source + enqueue sync job
    Normalize URL if provided (add https:// if missing)
  GET    /api/admin/sources              list all sources INCLUDING errorMessage
  GET    /api/admin/sources/:id          source + first 20 chunks
  POST   /api/admin/sources/:id/sync     re-enqueue sync job
  PATCH  /api/admin/sources/:id          update name, maxPages, url
  DELETE /api/admin/sources/:id          delete source + cascade chunks
```

## Success Criteria

- [ ] Adding `mdttac.com` without `https://` normalizes to `https://mdttac.com`
- [ ] If site returns 403, source shows status FAILED with exact HTTP error
- [ ] If `CRAWLER_USER_AGENT` is set, every fetch uses that User-Agent
- [ ] Successful crawl indexes > 100 chunks (not 0)
- [ ] If crawl produces 0 chunks, source shows FAILED (not SYNCED)
- [ ] `errorMessage` is visible in the Data Sources list for FAILED sources
- [ ] Asking a product question uses `search_knowledge` and answers from MDT content

---

---

# CHUNK 7 — Zendesk, Google Drive, Shopify Sync

Syncs all other knowledge sources. No article limits.

> ✅ **REQUIRED:** Zendesk — sync ALL articles. Paginate via `next_page` until null. No 200-article cap.

> ✅ **REQUIRED:** Google Drive — paginate folder listing via `pageToken`. Recurse into subfolders up to 15 levels deep.

> ✅ **REQUIRED:** `ZENDESK_SUBDOMAIN` is only the prefix before `.zendesk.com`. If it's `mdt`, the URL is `https://mdt.zendesk.com`. Never use the full domain.

> ✅ **REQUIRED:** Show the exact Zendesk API error in `source.errorMessage`. "fetch failed" is not acceptable.

## Prompt

```
Add sync for Zendesk, Google Drive, and Shopify.

BACKEND — src/services/zendesk.ts:

syncZendeskArticles(sourceId: string): Promise<void>
  Base URL: https://[ZENDESK_SUBDOMAIN].zendesk.com
  Auth: Basic base64(email/token:api_token)

  Paginate through ALL articles:
    url = baseUrl + '/api/v2/help_center/articles.json?per_page=100'
    while (url) {
      fetch with 15-second timeout
      if fetch throws: throw new Error(
        'Zendesk API unreachable. ZENDESK_SUBDOMAIN must be prefix only ' +
        '(e.g. "mdt" not "mdt.zendesk.com"). Raw error: ' + error.message
      )
      if status != 200: throw new Error('HTTP ' + status + ': ' + body)
      articles.push(...json.articles)
      url = json.next_page   // null = done
      if articles.length >= 10000: break
    }

  For each article:
    Strip HTML from body, chunk 2000 chars / 100 overlap
    Generate embeddings, insert KnowledgeChunks
    url = article.html_url, title = article.title

  Update source: status = SYNCED, chunkCount, lastSyncedAt

BACKEND — src/services/googledrive.ts:

syncGoogleDriveFolder(sourceId: string): Promise<void>
  Auth: GOOGLE_SERVICE_ACCOUNT_JSON env OR GOOGLE_DRIVE_ACCESS_TOKEN

  listFiles(folderId, depth = 0): recursive
    if depth > 15: return []
    GET /drive/v3/files?q=[folderId]+in+parents&pageSize=200
    Paginate via nextPageToken until null
    Recurse into subfolders, collect pdf/docx/txt files

  Extract text, chunk, embed, insert for each file

BACKEND — src/services/shopify.ts:

syncShopifyProducts(sourceId: string): Promise<void>
  GET /admin/api/2024-01/products.json?limit=250
  Paginate via Link header rel=next
  One KnowledgeChunk per product: title + description + variant titles

Zendesk add-source form:
  Name field ONLY — no credential inputs
  Note shown: "Credentials are configured on the Connections page"

PATCH /api/admin/sources/:id allows updating name, maxPages, url

New env vars:
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_DRIVE_ACCESS_TOKEN=
```

## Success Criteria

- [ ] Adding a Zendesk source shows Name field only — no credential inputs
- [ ] Syncing Zendesk with wrong subdomain shows exact error (not "fetch failed")
- [ ] Syncing with correct credentials retrieves ALL articles (not just first 100)
- [ ] Google Drive sync recurses into subfolders
- [ ] Shopify sync paginates through all products

---

---

# CHUNK 8 — Customer Identity & Data Collection

Links conversations to customer profiles. Syncs summaries to Shopify, Zendesk, and HubSpot.

## Prompt

```
Build customer identity resolution and post-conversation sync.

BACKEND — src/services/customers.ts:

identifyCustomer(email: string): Promise<Customer>
  Find Customer by email in local DB
  If not found: fetch from Shopify
    GET /customers/search.json?query=email:{email}&limit=1
    If found: create Customer with shopifyId, name, totalSpend, orderCount
    If not in Shopify: create Customer with email only
  Update customer.lastSeenAt = now()
  Return customer

linkConversationToCustomer(conversationId, customerId)
  Update Conversation.customerId

syncConversationEnd(conversationId)
  Load conversation + all messages
  Build transcript: "[role]: [content]\n" for each message

  Call Claude (non-streaming, max_tokens 150):
    "Summarize this support conversation in 1-2 sentences.
     Identify the main topic and customer sentiment.
     Respond in JSON: { summary, topic, sentiment }"
  Parse response, update Conversation.topic and .sentiment

  If customer has email:
    Shopify: PUT /customers/{shopifyId} metafield
      namespace: 'mdt_support', key: 'last_chat_summary'
    Zendesk: POST internal note to user if customer.zendeskId exists
    HubSpot: create NOTE engagement on contact
      Create contact if not found

  All three syncs are best-effort: log errors, do not throw

Update POST /api/chat/message:
  After each user message:
    Try to extract email from message text (regex)
    If email found and conversation has no customer:
      Call identifyCustomer + linkConversationToCustomer
    If message contains 10+ digit order number:
      Look up order, get customer email, identifyCustomer

POST /api/chat/identify:
  Body: { conversationId, email }
  Calls identifyCustomer + linkConversationToCustomer

BullMQ: add 'sync-conversation-end' job
  Triggered when conversation status -> RESOLVED or ESCALATED
```

## Success Criteria

- [ ] Customer who provides email appears in the Customers table
- [ ] After conversation ends, summary appears in Shopify customer metafields
- [ ] HubSpot contact gets a note with the conversation summary
- [ ] If Shopify/HubSpot/Zendesk sync fails, conversation still resolves — errors logged only

---

---

# CHUNK 9 — Conversations & Customers Pages

Builds the Conversations list and the full Customers page with merge support.

> ✅ **REQUIRED:** Customers page lists every person who has ever chatted — whether or not they are a Shopify customer. Unique identifier is email address.

## Prompt

```
Build the Conversations and Customers pages in the admin dashboard.

CONVERSATIONS PAGE backend:
  GET /api/admin/conversations
    Params: topic?, status?, search? (email or name), page=1, limit=50
    Returns: id, customerName, customerEmail, topic, status,
      messageCount, sentiment, createdAt, resolvedAt
  GET /api/admin/conversations/:id
    Full conversation with all messages + customer info

CONVERSATIONS PAGE frontend:
  Search bar + filter dropdowns (status, topic, sentiment)
  Table: Customer, Topic, Messages, Sentiment, Outcome, Time
  Click row: right drawer with full chat transcript
  AI messages labeled "MDT AI", user messages labeled with email if known
  Outcome badge: Resolved (green), Escalated (red), Bot (gray)

CUSTOMERS PAGE backend:
  GET /api/admin/customers
    Params: search? (name or email), page=1, limit=50
    Returns: id, name, email, totalSpend, orderCount, conversationCount,
      firstSeenAt, lastSeenAt, shopifyId
    Include ALL customers who have a conversation — not just Shopify customers
  GET /api/admin/customers/:id
    Full profile:
      Customer fields
      Last 5 conversations (topic, status, createdAt)
      Last 5 orders from Shopify (live API call, null if no shopifyId)
      mergedFrom: list of merged customer emails
  POST /api/admin/customers/:id/merge
    Body: { mergeFromId: string }
    Reassign all Conversation.customerId from mergeFrom -> mergeTo
    Set mergeFrom.mergedIntoId = mergeTo.id
    Copy shopifyId/hubspotId from mergeFrom if mergeTo lacks them

CUSTOMERS PAGE frontend:
  Search bar at top
  Table: Name, Email, Spend, Orders, Chats, Last Seen
  Click row: customer detail drawer
    Stats: spend, orders, chats
    Orders: live from Shopify (or "No Shopify account linked")
    Conversations: list with topic + outcome badges
    External links to Shopify/Zendesk/HubSpot admin if IDs exist
    Merge button: modal to search for another customer to merge into
    Merged customers shown with "(merged)" label
```

## Success Criteria

- [ ] Customers page shows every email that has ever chatted — including non-Shopify customers
- [ ] Customer detail shows live Shopify orders or "No Shopify account linked"
- [ ] Merge: after merging two customers, their conversations all appear under one profile

---

---

# CHUNK 10 — Knowledge Base, Connections, Analytics, Settings

Remaining admin pages. Connections page holds all integration credentials.

> ✅ **REQUIRED:** The Connections page is where credentials live. They are NOT entered when adding a Data Source.

## Prompt

```
Build the remaining four admin pages.

KNOWLEDGE BASE PAGE:
  Uses /api/admin/sources routes from Chunks 6 & 7
  Data sources list:
    Each source: name, type badge, chunk count, last synced, status dot
    Status colors: green=SYNCED, blue+pulsing=PENDING/SYNCING, red=FAILED
    For FAILED sources: show full errorMessage in red INLINE below source name
      Not a tooltip — must be visible without hovering
    Buttons: Re-sync, View Chunks (drawer with first 20), Remove
    Click name to edit maxPages (website) or name
  Add Source modal:
    Types: Website, Zendesk Help Center, Google Drive, Google Sheets, Shopify Products
    Website: URL field + "Max pages" field (default 500, max 50,000)
    Zendesk: Name field only
      Show note: "Credentials are configured on the Connections page"
    Google Drive: Folder URL or ID field
    Shopify: no fields (uses env credentials)
  System Prompt editor:
    Textarea with current prompt
    Character count, last saved timestamp
    Save: PUT /api/admin/knowledge/system-prompt
  Suggested questions editor:
    Three text inputs (shown as chips on the public home page)
    Save: PUT /api/admin/knowledge/suggested-questions

CONNECTIONS PAGE:
  Shows all integration credentials with test buttons
  Each integration card: name, icon, description, status, Configure button
  Configure opens a form:
    Shopify: store domain + access token
    Zendesk: subdomain (prefix only, e.g. "mdt"), email, API token
    HubSpot: API key
    Acumatica: API URL, username, password
    Anthropic: API key
    Google: service account JSON or OAuth token
  "Test Connection" button per integration:
    Lightweight API call to verify credentials
    Shows exact error if test fails
  Credentials stored in DB table AppConfig { key, value } (encrypted)

ANALYTICS PAGE:
  GET /api/admin/analytics/summary?days=7|30|90
    totalConversations, resolvedCount, escalatedCount, deflectionRate,
    avgMessages, topTopics[5], dailyVolume[]
  Period selector: 7d / 30d / 90d
  Stat cards: Deflection Rate, Avg Session, Escalations, Tickets
  Bar chart (recharts): daily volume
  Horizontal bars: top 5 topics

SETTINGS PAGE (ADMIN role only, enforced in AuthGuard):
  User table: name, email, role, last login, Edit/Remove
  Invite User: creates User record, shows activation note
  Role selector: Admin, Support Agent, Marketing, Content Editor
  Non-admin redirected away from this page
```

## Success Criteria

- [ ] FAILED knowledge source shows full `errorMessage` inline (not in tooltip)
- [ ] Zendesk source add form shows Name field only — no credential inputs
- [ ] Connections page "Test Connection" shows exact error on failure
- [ ] System prompt edits persist across server restarts
- [ ] Non-admin navigating to /settings gets redirected

---

---

# CHUNK 11 — Railway Deployment & Security

Production environment, security hardening, and deployment.

## Prompt

```
Configure production deployment on Railway.

BACKEND:
  railway.toml:
    [build] builder = "nixpacks"
    [deploy] startCommand = "node dist/index.js"
  GET /health: { status: 'ok', timestamp, version }
  Rate limiting on /api/chat/*:
    20 requests per minute per IP
    Return 429 { error: 'Too many requests' }
  CORS: only allow FRONTEND_URL and PUBLIC_URL from env
  Production error handler:
    Never expose stack traces in responses
    Log full error to console
    Return { error: 'Internal server error' }

FRONTEND (admin):
  VITE_API_URL = Railway backend URL
  Build -> dist/ -> deploy to Railway static or Vercel

SETUP.md in repo root:
  1. Railway services needed: Web, PostgreSQL, Redis
  2. All environment variables and where to get each value
  3. How to run first migration on Railway
  4. How to set CRAWLER_USER_AGENT and whitelist in Cloudflare
  5. How to configure connections after first deploy

Security checklist:
  [ ] SESSION_SECRET is at least 32 random characters
  [ ] ANTHROPIC_API_KEY not exposed to frontend build
  [ ] All /api/admin/* return 401 without valid session
  [ ] Stack traces never appear in HTTP responses
  [ ] CORS rejects requests from unlisted origins
  [ ] Rate limiter returns 429 after 20 chat requests per minute per IP
```

## Success Criteria

- [ ] `GET /health` returns 200 from Railway production URL
- [ ] Public home page chat works from production URL
- [ ] Admin Google OAuth works from production URL
- [ ] 21st chat message in one minute returns 429
- [ ] All security checklist items pass

---

*MDT — Internal Development Document — Confidential*
