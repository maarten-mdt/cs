/**
 * MDT Chat Widget Loader — paste into Shopify theme.liquid before </body>:
 *   <script src="https://YOUR_RAILWAY_URL/widget-loader.js" defer></script>
 *
 * Configurable: edit CHAT_WIDGET_ORIGIN and HOSTNAME_REGION_MAP below.
 */
(function () {
  /* ── Configuration ─────────────────────────────────────────────── */

  // Base URL of your Railway-hosted chat backend.
  // Override via: <script src="/widget-loader.js" data-origin="https://your-url.up.railway.app" defer></script>
  var CHAT_WIDGET_ORIGIN = (function () {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      if ((scripts[i].src || "").indexOf("widget-loader") !== -1) {
        var attr = scripts[i].getAttribute("data-origin");
        if (attr) return attr.replace(/\/$/, "");
      }
    }
    return "https://cs-production.up.railway.app";
  })();

  // Map Shopify storefront hostnames to store regions
  var HOSTNAME_REGION_MAP = {
    "mdttac.com":     "CA",
    "www.mdttac.com": "CA",
    "mdttac.ca":      "CA",
    "www.mdttac.ca":  "CA",
    "mdttac.us":      "US",
    "www.mdttac.us":  "US",
    "mdttac.eu":      "INT",
    "www.mdttac.eu":  "INT",
  };

  var COOKIE_NAME = "mdt_chat_id";
  var COOKIE_DAYS = 365;

  /* ── Helpers ────────────────────────────────────────────────────── */

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + "=" + encodeURIComponent(value) +
      ";expires=" + d.toUTCString() +
      ";path=/;SameSite=Lax";
  }

  function getOrCreateCookieId() {
    var id = getCookie(COOKIE_NAME);
    if (!id) {
      id = "mdt_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
      setCookie(COOKIE_NAME, id, COOKIE_DAYS);
    }
    return id;
  }

  function detectStoreRegion() {
    var host = window.location.hostname.toLowerCase();
    return HOSTNAME_REGION_MAP[host] || "CA";
  }

  function detectPageType() {
    var path = window.location.pathname;
    if (/^\/products\//.test(path)) return "product";
    if (/^\/collections\//.test(path)) return "collection";
    if (/^\/cart/.test(path)) return "cart";
    if (/^\/account/.test(path)) return "account";
    if (path === "/" || path === "") return "home";
    return "other";
  }

  function getProductHandle() {
    // Prefer Shopify analytics object
    try {
      var sa = window.ShopifyAnalytics;
      if (sa && sa.meta && sa.meta.product && sa.meta.product.handle) {
        return sa.meta.product.handle;
      }
    } catch (e) {}
    // Fallback: parse URL
    var match = window.location.pathname.match(/^\/products\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function getVariantId() {
    try {
      var sa = window.ShopifyAnalytics;
      if (sa && sa.meta && sa.meta.selectedVariantId) {
        return String(sa.meta.selectedVariantId);
      }
    } catch (e) {}
    // Fallback: URL param
    var params = new URLSearchParams(window.location.search);
    return params.get("variant") || null;
  }

  function getShopifyCustomerId() {
    try {
      if (window.__st && window.__st.cid) {
        return String(window.__st.cid);
      }
    } catch (e) {}
    return null;
  }

  /* ── Build iframe URL ──────────────────────────────────────────── */

  function buildWidgetUrl() {
    var params = new URLSearchParams();
    params.set("cookieId", getOrCreateCookieId());
    params.set("storeRegion", detectStoreRegion());
    params.set("pageType", detectPageType());
    params.set("url", window.location.href);

    var handle = getProductHandle();
    if (handle) params.set("productHandle", handle);

    var variant = getVariantId();
    if (variant) params.set("variantId", variant);

    var custId = getShopifyCustomerId();
    if (custId) params.set("shopifyCustomerId", custId);

    return CHAT_WIDGET_ORIGIN + "/widget.html?" + params.toString();
  }

  /* ── Create launcher + iframe ──────────────────────────────────── */

  function createWidget() {
    // Prevent double-init
    if (document.getElementById("mdt-chat-launcher")) return;

    // Inject styles
    var style = document.createElement("style");
    style.textContent = [
      "#mdt-chat-launcher{",
      "  position:fixed;bottom:20px;right:20px;z-index:999998;",
      "  width:56px;height:56px;border-radius:50%;",
      "  background:#1a1a1a;border:none;cursor:pointer;",
      "  box-shadow:0 4px 12px rgba(0,0,0,0.3);",
      "  display:flex;align-items:center;justify-content:center;",
      "  transition:transform 0.15s,background 0.15s;",
      "}",
      "#mdt-chat-launcher:hover{background:#333;transform:scale(1.05);}",
      "#mdt-chat-launcher svg{width:24px;height:24px;fill:white;}",
      "#mdt-chat-frame{",
      "  position:fixed;bottom:88px;right:20px;z-index:999999;",
      "  width:380px;height:560px;max-width:calc(100vw - 40px);max-height:calc(100vh - 108px);",
      "  border:none;border-radius:12px;",
      "  box-shadow:0 8px 32px rgba(0,0,0,0.2);",
      "  display:none;",
      "}",
      "@media(max-width:440px){",
      "  #mdt-chat-frame{width:calc(100vw - 20px);right:10px;bottom:80px;height:calc(100vh - 100px);}",
      "  #mdt-chat-launcher{bottom:14px;right:14px;}",
      "}",
    ].join("\n");
    document.head.appendChild(style);

    // Launcher button
    var btn = document.createElement("button");
    btn.id = "mdt-chat-launcher";
    btn.setAttribute("aria-label", "Open chat");
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
    document.body.appendChild(btn);

    // Iframe (lazy — src set on first open)
    var frame = document.createElement("iframe");
    frame.id = "mdt-chat-frame";
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("loading", "lazy");
    document.body.appendChild(frame);

    var isOpen = false;

    btn.addEventListener("click", function () {
      isOpen = !isOpen;
      if (isOpen) {
        if (!frame.src) {
          frame.src = buildWidgetUrl();
        }
        frame.style.display = "block";
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      } else {
        frame.style.display = "none";
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
      }
    });
  }

  /* ── Init ───────────────────────────────────────────────────────── */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
