import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Plug, ChevronDown, ChevronUp, Check, X } from "lucide-react";

const INTEGRATIONS: { id: string; name: string; description: string; keys: { key: string; label: string; secret?: boolean; placeholder?: string }[] }[] = [
  { id: "shopify", name: "Shopify (Legacy/CA fallback)", description: "Default store domain and token — used as CA fallback", keys: [{ key: "SHOPIFY_STORE_DOMAIN", label: "Store domain", placeholder: "mystore.myshopify.com" }, { key: "SHOPIFY_ACCESS_TOKEN", label: "Access token", secret: true }] },
  { id: "shopify_ca", name: "Shopify CA", description: "Canada store credentials", keys: [{ key: "SHOPIFY_CA_DOMAIN", label: "CA store domain", placeholder: "mdt-ca.myshopify.com" }, { key: "SHOPIFY_CA_TOKEN", label: "CA access token", secret: true }] },
  { id: "shopify_us", name: "Shopify US", description: "United States store credentials", keys: [{ key: "SHOPIFY_US_DOMAIN", label: "US store domain", placeholder: "mdt-us.myshopify.com" }, { key: "SHOPIFY_US_TOKEN", label: "US access token", secret: true }] },
  { id: "shopify_int", name: "Shopify INT", description: "International store credentials", keys: [{ key: "SHOPIFY_INT_DOMAIN", label: "INT store domain", placeholder: "mdt-int.myshopify.com" }, { key: "SHOPIFY_INT_TOKEN", label: "INT access token", secret: true }] },
  { id: "zendesk", name: "Zendesk", description: "Subdomain (e.g. mdt), email, API token", keys: [{ key: "ZENDESK_SUBDOMAIN", label: "Subdomain (prefix only)", placeholder: "mdt" }, { key: "ZENDESK_EMAIL", label: "Email" }, { key: "ZENDESK_API_TOKEN", label: "API token", secret: true }] },
  { id: "hubspot", name: "HubSpot", description: "API key for CRM and notes", keys: [{ key: "HUBSPOT_API_KEY", label: "API key", secret: true }] },
  { id: "acumatica", name: "Acumatica", description: "API URL, username, password", keys: [{ key: "ACUMATICA_API_URL", label: "API URL" }, { key: "ACUMATICA_USERNAME", label: "Username" }, { key: "ACUMATICA_PASSWORD", label: "Password", secret: true }] },
  { id: "anthropic", name: "Anthropic", description: "API key for Claude AI", keys: [{ key: "ANTHROPIC_API_KEY", label: "API key", secret: true }] },
  { id: "google", name: "Google Drive", description: "Service account JSON or access token", keys: [{ key: "GOOGLE_SERVICE_ACCOUNT_JSON", label: "Service account JSON (paste full JSON)" }, { key: "GOOGLE_DRIVE_ACCESS_TOKEN", label: "Or access token", secret: true }] },
  { id: "firecrawl", name: "Firecrawl", description: "Web scraper API — searches and scrapes MDT content from Reddit, forums, blogs", keys: [{ key: "FIRECRAWL_API_KEY", label: "API key", secret: true }] },
  { id: "widget", name: "Chat Widget", description: "Widget configuration for Shopify embed", keys: [{ key: "CHAT_WIDGET_ORIGIN", label: "Widget origin URL", placeholder: "https://your-app.up.railway.app" }, { key: "WIDGET_GREETING", label: "Greeting message", placeholder: "Hi! How can I help you today?" }, { key: "WIDGET_HOSTNAME_REGION_MAP", label: "Hostname → region JSON", placeholder: '{"mdttac.com":"CA","mdttac.us":"US"}' }] },
];

export function ConnectionsPage() {
  const [integrations, setIntegrations] = useState<Record<string, { configured: boolean; keys?: Record<string, string> }>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getConnections();
      setIntegrations(res.integrations);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openForm = (id: string) => {
    setOpenId(openId === id ? null : id);
    setTestResult(null);
    const integ = INTEGRATIONS.find((i) => i.id === id);
    if (integ) {
      const vals: Record<string, string> = {};
      integ.keys.forEach((k) => { vals[k.key] = ""; });
      setFormValues(vals);
    }
  };

  const handleSave = async (id: string) => {
    const integ = INTEGRATIONS.find((i) => i.id === id);
    if (!integ) return;
    setSaving(true);
    try {
      const values: Record<string, string> = {};
      integ.keys.forEach((k) => {
        const v = formValues[k.key];
        if (v !== undefined && v !== "") values[k.key] = v;
      });
      await api.putConnections(id, values);
      setTestResult(null);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await api.testConnection(id);
      setTestResult({ id, ok: res.ok, message: res.message });
    } catch (e) {
      setTestResult({ id, ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Connections</h1>
      <p className="text-sm text-gray-400">Configure integration credentials. Data sources use these when syncing.</p>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-2">
          {INTEGRATIONS.map((integ) => {
            const state = integrations[integ.id];
            const isOpen = openId === integ.id;
            return (
              <div key={integ.id} className="rounded-lg border border-border-dark bg-panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => openForm(integ.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Plug className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-white">{integ.name}</p>
                      <p className="text-sm text-gray-400">{integ.description}</p>
                    </div>
                    {state?.configured && <span className="inline-flex items-center gap-1 text-xs text-green-400"><Check className="h-4 w-4" /> Configured</span>}
                  </div>
                  {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </button>
                {isOpen && (
                  <div className="border-t border-border-dark p-4 space-y-4">
                    {integ.keys.map((k) => (
                      <div key={k.key}>
                        <label className="block text-sm text-gray-400 mb-1">{k.label}</label>
                        <input
                          type={k.secret ? "password" : "text"}
                          value={formValues[k.key] ?? ""}
                          onChange={(e) => setFormValues((v) => ({ ...v, [k.key]: e.target.value }))}
                          className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
                          placeholder={k.secret ? "••••••••" : (k.placeholder || "")}
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => handleSave(integ.id)} disabled={saving} className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent-dark disabled:opacity-50">Save</button>
                      <button type="button" onClick={() => handleTest(integ.id)} disabled={testing !== null} className="rounded border border-border-dark px-4 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50">
                        {testing === integ.id ? "Testing..." : "Test connection"}
                      </button>
                      {testResult?.id === integ.id && (
                        <span className={testResult.ok ? "text-green-400 text-sm" : "text-red-400 text-sm"}>
                          {testResult.ok ? testResult.message : testResult.message}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
