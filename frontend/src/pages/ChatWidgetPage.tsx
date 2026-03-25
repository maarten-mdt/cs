import { useState, useEffect } from "react";
import { Copy, Check, Code, Globe, ExternalLink } from "lucide-react";
import { api } from "../lib/api";

/* ── helpers ──────────────────────────────────────────────────────── */

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border-dark bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-panel border-b border-border-dark">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────── */

export function ChatWidgetPage() {
  const [origin, setOrigin] = useState("");
  const [greeting, setGreeting] = useState("Hi! I'm MDT's support assistant. How can I help you today?");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Try to detect the origin from window or load from config
    const base = window.location.origin.replace(/\/admin.*/, "").replace(/:\d+$/, "");
    setOrigin(base);

    // Load saved widget config
    api.getConnections().then((res) => {
      const w = res.integrations?.widget;
      if (w?.keys?.CHAT_WIDGET_ORIGIN) setOrigin(w.keys.CHAT_WIDGET_ORIGIN);
      if (w?.keys?.WIDGET_GREETING) setGreeting(w.keys.WIDGET_GREETING);
    }).catch(() => {});
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await api.putConnections("widget", {
        CHAT_WIDGET_ORIGIN: origin,
        WIDGET_GREETING: greeting,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /* ── snippet: all-pages widget (Shopify theme.liquid) ─── */
  const shopifySnippet = `<!-- MDT Chat Widget — paste before </body> in theme.liquid -->
<script src="${origin || "https://YOUR-APP.up.railway.app"}/widget-loader.js" defer></script>`;

  /* ── snippet: custom data-origin override ─── */
  const shopifySnippetWithOrigin = `<!-- MDT Chat Widget with explicit origin -->
<script
  src="${origin || "https://YOUR-APP.up.railway.app"}/widget-loader.js"
  data-origin="${origin || "https://YOUR-APP.up.railway.app"}"
  defer
></script>`;

  /* ── snippet: single-page inline embed ─── */
  const inlineSnippet = `<!-- MDT Chat — inline embed for any web page -->
<div id="mdt-chat-container" style="width:100%;max-width:420px;height:600px;border:1px solid #e2e2e2;border-radius:12px;overflow:hidden;">
  <iframe
    src="${origin || "https://YOUR-APP.up.railway.app"}/widget.html?storeRegion=CA"
    style="width:100%;height:100%;border:none;"
    allow="clipboard-write"
    loading="lazy"
  ></iframe>
</div>`;

  /* ── snippet: custom page embed with params ─── */
  const advancedSnippet = `<!-- MDT Chat — embed with custom parameters -->
<iframe
  id="mdt-chat"
  src="${origin || "https://YOUR-APP.up.railway.app"}/widget.html?storeRegion=CA&pageType=product&productHandle=YOUR_PRODUCT"
  style="width:380px;height:560px;border:none;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);"
  allow="clipboard-write"
  loading="lazy"
></iframe>`;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Chat Widget</h1>
        <p className="text-sm text-gray-400 mt-1">
          Grab embed code to add the MDT chat widget to your Shopify store or any web page.
        </p>
      </div>

      {/* ── Widget config ────────────────────────────────────── */}
      <div className="rounded-lg border border-border-dark bg-panel p-5 space-y-4">
        <h2 className="text-sm font-medium text-white flex items-center gap-2">
          <Globe className="h-4 w-4 text-accent" />
          Widget Configuration
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">App Origin URL</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="https://your-app.up.railway.app"
              className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
            />
            <p className="text-[11px] text-gray-500 mt-1">Your Railway deployment URL (no trailing slash)</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Greeting Message</label>
            <input
              type="text"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Hi! How can I help you today?"
              className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {saved ? "Saved!" : saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      {/* ── All-Pages Widget (Shopify) ───────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <Code className="h-4 w-4 text-accent" />
            All-Pages Widget (Shopify theme.liquid)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Adds a floating chat button to every page. Paste this before <code className="text-gray-300">&lt;/body&gt;</code> in your Shopify theme.liquid file.
          </p>
        </div>
        <CopyBlock label="Shopify theme.liquid — simple" code={shopifySnippet} />
        <CopyBlock label="Shopify theme.liquid — with explicit origin" code={shopifySnippetWithOrigin} />
      </div>

      {/* ── Single-Page Inline Embed ─────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <Code className="h-4 w-4 text-accent" />
            Inline Embed (Any Web Page)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Embeds the chat directly in the page content. Use this for a dedicated support page or contact page.
          </p>
        </div>
        <CopyBlock label="Inline chat embed" code={inlineSnippet} />
      </div>

      {/* ── Advanced: Custom Params ───────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <Code className="h-4 w-4 text-accent" />
            Advanced: Custom Parameters
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Pass product context to the widget for product-specific answers.
          </p>
        </div>
        <CopyBlock label="Iframe with product context" code={advancedSnippet} />
      </div>

      {/* ── Available URL params ──────────────────────────────── */}
      <div className="rounded-lg border border-border-dark bg-panel p-5">
        <h2 className="text-sm font-medium text-white mb-3">Available URL Parameters</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-dark text-left">
                <th className="pb-2 pr-4 text-gray-400 font-medium">Parameter</th>
                <th className="pb-2 pr-4 text-gray-400 font-medium">Example</th>
                <th className="pb-2 text-gray-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-border-dark/50">
                <td className="py-2 pr-4 font-mono text-xs text-accent">storeRegion</td>
                <td className="py-2 pr-4 text-xs">CA, US, INT</td>
                <td className="py-2 text-xs">Which Shopify store to query</td>
              </tr>
              <tr className="border-b border-border-dark/50">
                <td className="py-2 pr-4 font-mono text-xs text-accent">pageType</td>
                <td className="py-2 pr-4 text-xs">product, collection, cart</td>
                <td className="py-2 text-xs">Current page context</td>
              </tr>
              <tr className="border-b border-border-dark/50">
                <td className="py-2 pr-4 font-mono text-xs text-accent">productHandle</td>
                <td className="py-2 pr-4 text-xs">ess-chassis</td>
                <td className="py-2 text-xs">Shopify product handle for product-aware answers</td>
              </tr>
              <tr className="border-b border-border-dark/50">
                <td className="py-2 pr-4 font-mono text-xs text-accent">variantId</td>
                <td className="py-2 pr-4 text-xs">12345678</td>
                <td className="py-2 text-xs">Specific variant for the product</td>
              </tr>
              <tr className="border-b border-border-dark/50">
                <td className="py-2 pr-4 font-mono text-xs text-accent">cookieId</td>
                <td className="py-2 pr-4 text-xs">mdt_abc123</td>
                <td className="py-2 text-xs">Persistent visitor ID (auto-set by widget-loader)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs text-accent">shopifyCustomerId</td>
                <td className="py-2 pr-4 text-xs">9876543</td>
                <td className="py-2 text-xs">Logged-in Shopify customer ID</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Preview link ─────────────────────────────────────── */}
      <div className="rounded-lg border border-border-dark bg-panel p-5">
        <h2 className="text-sm font-medium text-white mb-2">Preview</h2>
        <p className="text-xs text-gray-400 mb-3">
          Test the widget in a new tab to see how it looks.
        </p>
        <a
          href={`${origin || ""}/widget.html?storeRegion=CA`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded bg-accent/20 border border-accent/30 px-4 py-2 text-sm text-accent hover:bg-accent/30 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open Widget Preview
        </a>
      </div>
    </div>
  );
}
