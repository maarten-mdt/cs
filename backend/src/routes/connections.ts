import { Router, Request, Response } from "express";
import {
  getConnectionConfig,
  setConnectionConfig,
  getConnectionNames,
  maskSecret,
  type ConnectionName,
} from "../services/connections.js";

export const connectionsRouter = Router();

const CONNECTION_LABELS: Record<ConnectionName, string> = {
  shopify: "Shopify",
  zendesk: "Zendesk",
  google_drive: "Google Drive",
  hubspot: "HubSpot",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (embeddings)",
};

const CONNECTION_FIELDS: Record<ConnectionName, { key: string; label: string; secret?: boolean }[]> = {
  shopify: [
    { key: "shop", label: "Shop domain (e.g. your-store.myshopify.com)" },
    { key: "accessToken", label: "Admin API access token", secret: true },
  ],
  zendesk: [
    { key: "subdomain", label: "Subdomain (e.g. yourcompany)" },
    { key: "email", label: "Email (e.g. admin@mdttac.com)" },
    { key: "apiToken", label: "API token", secret: true },
  ],
  google_drive: [
    { key: "serviceAccountJson", label: "Service account JSON (paste full JSON)", secret: true },
  ],
  hubspot: [
    { key: "accessToken", label: "Private app access token", secret: true },
  ],
  anthropic: [
    { key: "apiKey", label: "API key", secret: true },
  ],
  openai: [
    { key: "apiKey", label: "API key (optional, for embeddings)", secret: true },
  ],
};

connectionsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const names = getConnectionNames();
    const list = await Promise.all(
      names.map(async (name) => {
        const config = await getConnectionConfig(name);
        const configured = config && Object.values(config).some((v) => v && String(v).trim());
        return {
          name,
          label: CONNECTION_LABELS[name],
          configured: !!configured,
        };
      })
    );
    res.json(list);
  } catch (err) {
    console.error("List connections error:", err);
    res.status(500).json({ error: "Failed to list connections" });
  }
});

connectionsRouter.get("/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as ConnectionName;
    if (!getConnectionNames().includes(name)) {
      res.status(404).json({ error: "Unknown connection" });
      return;
    }
    const config = await getConnectionConfig(name);
    const fields = CONNECTION_FIELDS[name];
    const masked: Record<string, string> = {};
    const safeConfig: Record<string, string> = {};
    if (config) {
      for (const f of fields) {
        const v = config[f.key];
        if (v) {
          masked[f.key] = f.secret ? maskSecret(v) : v;
          safeConfig[f.key] = f.secret ? "" : v;
        }
      }
    }
    res.json({
      name,
      label: CONNECTION_LABELS[name],
      fields: CONNECTION_FIELDS[name],
      config: safeConfig,
      masked,
    });
  } catch (err) {
    console.error("Get connection error:", err);
    res.status(500).json({ error: "Failed to get connection" });
  }
});

connectionsRouter.put("/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as ConnectionName;
    if (!getConnectionNames().includes(name)) {
      res.status(404).json({ error: "Unknown connection" });
      return;
    }
    const body = req.body;
    const fields = CONNECTION_FIELDS[name];
    const config: Record<string, string> = {};
    const current = await getConnectionConfig(name);
    for (const f of fields) {
      const v = body[f.key];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s) config[f.key] = s;
      } else if (current?.[f.key]) {
        config[f.key] = current[f.key];
      }
    }
    await setConnectionConfig(name, config);
    res.json({ success: true });
  } catch (err) {
    console.error("Update connection error:", err);
    res.status(500).json({ error: "Failed to update connection" });
  }
});
