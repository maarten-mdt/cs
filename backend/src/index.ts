import "dotenv/config";
import { config as loadEnv } from "dotenv";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { routes } from "./routes/index.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { chatRouter } from "./routes/chat.js";
import { zendeskRouter } from "./routes/zendesk.js";
import { hubRouter } from "./routes/hub.js";
import { rateLimitChat } from "./middleware/rateLimitChat.js";
import passport from "passport";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src -> project root is ../../ (CustomerSupportbot)
loadEnv({ path: path.resolve(__dirname, "../../.env") });

// Passport: minimal only so startup never touches passport-google-oauth20. Admin login uses lazy Google strategy in auth routes.
await import("./lib/passport-minimal.js");

// Load AppConfig into env overlay (after DB is available)
const { loadConfigFromDb } = await import("./lib/config.js");
loadConfigFromDb().catch((e) => console.warn("[config] Load from DB failed:", (e as Error).message));

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const frontendUrl = process.env.FRONTEND_URL;
const publicUrl = process.env.PUBLIC_URL;
const corsOrigins: string[] = [frontendUrl, publicUrl].filter(
  (u): u is string => !!u
);
// Zendesk sidebar app requests come through Zendesk's proxy, allow them
const zendeskOriginPattern = /\.zendesk\.com$/;

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, Zendesk proxy)
      if (!origin) return callback(null, true);
      // Allow configured origins
      if (corsOrigins.includes(origin)) return callback(null, true);
      // Allow Zendesk subdomains
      try {
        const host = new URL(origin).hostname;
        if (zendeskOriginPattern.test(host)) return callback(null, true);
      } catch {}
      // Dev: allow all; Prod: reject unknown
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      callback(null, corsOrigins.length > 0 ? false : true);
    },
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json());

// Health check (no auth, no rate limit)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "1.0.0",
  });
});

// Rate limit chat API: 20 requests per minute per IP
app.use("/api/chat", rateLimitChat);

const PgSession = connectPgSimple(session);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(
  session({
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use("/", authRouter);
app.use("/", chatRouter);
app.use("/api/admin", adminRouter);
app.use("/api/zendesk", zendeskRouter);
app.use("/api/hub", hubRouter);

// Public phone webhook (no auth — verified by provider signature)
app.post("/api/webhooks/phone/:provider", (req, res) => {
  const { provider } = req.params;
  if (!["ringcentral", "aircall"].includes(provider)) {
    return res.status(400).json({ error: "Unsupported provider" });
  }
  // TODO: Parse provider payload and upsert PhoneCall record
  console.log(`[webhook/phone/${provider}] Received:`, JSON.stringify(req.body).slice(0, 500));
  res.json({ received: true });
});

app.use("/", routes);

// Public home page, chat script, and widget
const publicPath = path.join(__dirname, "../../public");
app.use(express.static(publicPath));

// Serve widget chat UI at /widget (without .html extension)
app.get("/widget", (_req, res) => {
  res.sendFile(path.join(publicPath, "widget.html"));
});

// Admin dashboard (frontend build)
const adminPath = path.join(__dirname, "../../frontend/dist");
app.use("/admin", express.static(adminPath));
app.get("/admin/*", (_req, res) => {
  res.sendFile(path.join(adminPath, "index.html"));
});

// Production error handler: never expose stack, log full error, return generic message
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`MDT Support API running on port ${PORT}`);

  // Start sync worker in-process (no separate Railway service needed)
  if (process.env.REDIS_URL?.trim()) {
    import("./workers/sync.worker.js")
      .then(() => console.log("[worker] Sync worker started in-process"))
      .catch((e) => console.warn("[worker] Failed to start sync worker:", (e as Error).message));
  } else {
    console.warn("[worker] REDIS_URL not set — sync worker disabled");
  }
});
