/**
 * Shared Shopify multi-store credential resolver.
 * Maps storeRegion (CA | US | INT) to env-var pairs.
 * CA falls back to legacy SHOPIFY_STORE_DOMAIN / SHOPIFY_ACCESS_TOKEN for backward compat.
 */

export type StoreRegion = "CA" | "US" | "INT";

const SHOPIFY_VERSION = "2024-01";
export { SHOPIFY_VERSION };

interface ShopifyCredentials {
  storeUrl: string;
  headers: HeadersInit;
}

const ENV_MAP: Record<StoreRegion, { domain: string; token: string }> = {
  CA: { domain: "SHOPIFY_CA_DOMAIN", token: "SHOPIFY_CA_TOKEN" },
  US: { domain: "SHOPIFY_US_DOMAIN", token: "SHOPIFY_US_TOKEN" },
  INT: { domain: "SHOPIFY_INT_DOMAIN", token: "SHOPIFY_INT_TOKEN" },
};

export function getShopifyCredentials(region: StoreRegion = "CA"): ShopifyCredentials {
  const envKeys = ENV_MAP[region];
  let domain = process.env[envKeys.domain]?.trim();
  let token = process.env[envKeys.token]?.trim();

  // CA fallback to legacy env vars
  if (region === "CA" && (!domain || !token)) {
    domain = domain || process.env.SHOPIFY_STORE_DOMAIN?.trim();
    token = token || process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  }

  if (!domain) throw new Error(`Shopify domain not configured for region ${region} (set ${envKeys.domain})`);
  if (!token) throw new Error(`Shopify token not configured for region ${region} (set ${envKeys.token})`);

  const storeUrl = (domain.startsWith("http") ? domain : `https://${domain}`).replace(/\/$/, "");

  return {
    storeUrl,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  };
}

/** Returns true if credentials exist for the given region (does not throw). */
export function hasShopifyCredentials(region: StoreRegion = "CA"): boolean {
  try {
    getShopifyCredentials(region);
    return true;
  } catch {
    return false;
  }
}
