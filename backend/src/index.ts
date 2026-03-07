import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { chatRouter } from "./routes/chat.js";
import { healthRouter } from "./routes/health.js";
import { shopifyRouter } from "./routes/shopify.js";
import { zendeskRouter } from "./routes/zendesk.js";
import { widgetConfigRouter } from "./routes/widget-config.js";
import { sourcesRouter } from "./routes/sources.js";
import { connectionsRouter } from "./routes/connections.js";
import { customersRouter } from "./routes/customers.js";
import { initDb } from "./db/client.js";
import { startDailySync } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json());

app.use("/api/chat", chatRouter);
app.use("/api/health", healthRouter);
app.use("/api/shopify", shopifyRouter);
app.use("/api/zendesk", zendeskRouter);
app.use("/api/widget/config", widgetConfigRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/customers", customersRouter);

// Serve widget script
const widgetPath = path.join(__dirname, "../../widget/dist");
app.use("/widget", express.static(widgetPath));

// Serve admin dashboard
const adminPath = path.join(__dirname, "../../admin/dist");
app.use("/admin", express.static(adminPath));
app.get("/admin/*", (_req, res) => {
  res.sendFile(path.join(adminPath, "index.html"));
});

// Demo page for widget testing
app.get("/demo", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../demo.html"));
});

// Home page: inline chat (root)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../home.html"));
});

async function start() {
  await initDb();
  startDailySync();
  app.listen(PORT, () => {
    console.log(`MDT AI Chatbot API running on port ${PORT}`);
  });
}

start().catch(console.error);
