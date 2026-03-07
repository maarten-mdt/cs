import { getPool } from "../db/client.js";

export type ConnectionName =
  | "shopify"
  | "zendesk"
  | "google_drive"
  | "hubspot"
  | "anthropic"
  | "openai";

const ENV_MAP: Record<ConnectionName, Record<string, string>> = {
  shopify: { shop: "SHOPIFY_SHOP", accessToken: "SHOPIFY_ACCESS_TOKEN" },
  zendesk: { subdomain: "ZENDESK_SUBDOMAIN", email: "ZENDESK_EMAIL", apiToken: "ZENDESK_API_TOKEN" },
  google_drive: { serviceAccountJson: "GOOGLE_SERVICE_ACCOUNT_JSON" },
  hubspot: { accessToken: "HUBSPOT_ACCESS_TOKEN" },
  anthropic: { apiKey: "ANTHROPIC_API_KEY" },
  openai: { apiKey: "OPENAI_API_KEY" },
};

export async function getConnectionConfig(
  name: ConnectionName
): Promise<Record<string, string> | null> {
  const pool = getPool();
  const row = await pool.query(
    `SELECT config FROM connections WHERE name = $1`,
    [name]
  );
  if (row.rows[0]?.config && typeof row.rows[0].config === "object") {
    const c = row.rows[0].config as Record<string, string>;
    if (Object.values(c).some((v) => v && String(v).trim())) return c;
  }
  const envKeys = ENV_MAP[name];
  const fromEnv: Record<string, string> = {};
  for (const [key, envVar] of Object.entries(envKeys)) {
    const v = process.env[envVar];
    if (v) fromEnv[key] = v;
  }
  if (Object.keys(fromEnv).length === 0) return null;
  return fromEnv;
}

export async function setConnectionConfig(
  name: ConnectionName,
  config: Record<string, string>
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO connections (name, config, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (name) DO UPDATE SET config = $2, updated_at = NOW()`,
    [name, JSON.stringify(config)]
  );
}

export function getConnectionNames(): ConnectionName[] {
  return ["shopify", "zendesk", "google_drive", "hubspot", "anthropic", "openai"];
}

export function maskSecret(s: string): string {
  if (!s || s.length <= 8) return "••••";
  return s.slice(0, 4) + "••••••••" + s.slice(-4);
}
