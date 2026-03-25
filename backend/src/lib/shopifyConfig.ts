/**
 * Shared Shopify multi-store credential resolver.
 * Maps storeRegion (CA | US | INT) to env-var pairs.
 * Supports both:
 *   - Legacy static tokens (SHOPIFY_XX_TOKEN / SHOPIFY_ACCESS_TOKEN)
 *   - OAuth2 client_credentials flow (SHOPIFY_XX_CLIENT_ID + SHOPIFY_XX_CLIENT_SECRET)
 * OAuth tokens are cached in memory and refreshed when expired (24h TTL).
 */

import { getConfig } from "./config.js";

export type StoreRegion = "CA" | "US" | "INT";

const SHOPIFY_VERSION = "2025-01";
export { SHOPIFY_VERSION };

interface ShopifyCredentials {
  storeUrl: string;
  headers: HeadersInit;
}

interface EnvKeys {
  domain: string;
  token: string;
  clientId: string;
  clientSecret: string;
}

const ENV_MAP: Record<StoreRegion, EnvKeys> = {
  CA: { domain: "SHOPIFY_CA_DOMAIN", token: "SHOPIFY_CA_TOKEN", clientId: "SHOPIFY_CA_CLIENT_ID", clientSecret: "SHOPIFY_CA_CLIENT_SECRET" },
  US: { domain: "SHOPIFY_US_DOMAIN", token: "SHOPIFY_US_TOKEN", clientId: "SHOPIFY_US_CLIENT_ID", clientSecret: "SHOPIFY_US_CLIENT_SECRET" },
  INT: { domain: "SHOPIFY_INT_DOMAIN", token: "SHOPIFY_INT_TOKEN", clientId: "SHOPIFY_INT_CLIENT_ID", clientSecret: "SHOPIFY_INT_CLIENT_SECRET" },
};

/* ── OAuth2 token cache ──────────────────────────────────────────── */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const tokenCache = new Map<StoreRegion, CachedToken>();
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // refresh 1h before 24h expiry

async function getOAuthToken(storeUrl: string, clientId: string, clientSecret: string, region: StoreRegion): Promise<string> {
  const cached = tokenCache.get(region);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const res = await fetch(`${storeUrl}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "MDTSupportBot/1.0 (+https://mdttac.com)",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify OAuth failed for ${region}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  const accessToken = data.access_token;
  if (!accessToken) {
    throw new Error(`Shopify OAuth for ${region} returned no access_token`);
  }

  tokenCache.set(region, {
    accessToken,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  console.log(`[shopify] OAuth token acquired for ${region} (expires in ~23h)`);
  return accessToken;
}

/* ── Public API ──────────────────────────────────────────────────── */

function cfg(key: string): string | undefined {
  return getConfig(key)?.trim() || undefined;
}

export async function getShopifyCredentials(region: StoreRegion = "US"): Promise<ShopifyCredentials> {
  const envKeys = ENV_MAP[region];
  let domain = cfg(envKeys.domain);

  // CA fallback to legacy domain
  if (region === "CA" && !domain) {
    domain = cfg("SHOPIFY_STORE_DOMAIN");
  }

  if (!domain) throw new Error(`Shopify domain not configured for region ${region} (set ${envKeys.domain})`);

  const storeUrl = (domain.startsWith("http") ? domain : `https://${domain}`).replace(/\/$/, "");

  // Try OAuth2 client_credentials first
  const clientId = cfg(envKeys.clientId);
  const clientSecret = cfg(envKeys.clientSecret);

  if (clientId && clientSecret) {
    console.log(`[shopify] Using OAuth2 for ${region} — domain: ${domain}, clientId: ${clientId.slice(0, 8)}...`);
    const accessToken = await getOAuthToken(storeUrl, clientId, clientSecret, region);
    return {
      storeUrl,
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    };
  }

  // Fall back to static token
  let token = cfg(envKeys.token);
  if (region === "CA" && !token) {
    token = cfg("SHOPIFY_ACCESS_TOKEN");
  }

  if (!token) {
    throw new Error(`Shopify credentials not configured for ${region}. Set either ${envKeys.clientId}+${envKeys.clientSecret} (OAuth) or ${envKeys.token} (static token).`);
  }

  return {
    storeUrl,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  };
}

/** Returns true if credentials exist for the given region (does not throw). */
export async function hasShopifyCredentials(region: StoreRegion = "US"): Promise<boolean> {
  const envKeys = ENV_MAP[region];
  const domain = cfg(envKeys.domain) || (region === "CA" ? cfg("SHOPIFY_STORE_DOMAIN") : undefined);
  if (!domain) return false;

  const hasOAuth = !!(cfg(envKeys.clientId) && cfg(envKeys.clientSecret));
  const hasToken = !!(cfg(envKeys.token) || (region === "CA" && cfg("SHOPIFY_ACCESS_TOKEN")));

  return hasOAuth || hasToken;
}
