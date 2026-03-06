import React from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./ChatWidget";

interface MDTWidgetConfig {
  apiUrl: string;
  greeting?: string;
  suggestedQuestions?: string[];
}

function init(config: MDTWidgetConfig) {
  if (document.getElementById("mdt-chat-root")) return;
  const container = document.createElement("div");
  container.id = "mdt-chat-root";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<ChatWidget config={config} />);
}

declare global {
  interface Window {
    MDTChatWidget?: { init: (config: MDTWidgetConfig) => void };
  }
}

async function autoInit() {
  const scripts = document.getElementsByTagName("script");
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    const src = s.getAttribute("src") || "";
    if (src.includes("mdt-chat-widget")) {
      const apiUrl = (s.getAttribute("data-api-url") || window.location.origin).replace(/\/$/, "");
      let greeting = s.getAttribute("data-greeting") || undefined;
      let suggestedQuestions = s.getAttribute("data-suggested-questions")
        ? s.getAttribute("data-suggested-questions")!.split("|")
        : undefined;
      if (!greeting || !suggestedQuestions) {
        try {
          const res = await fetch(`${apiUrl}/api/widget/config`);
          const cfg = await res.json();
          greeting = greeting || cfg.greeting;
          suggestedQuestions = suggestedQuestions || cfg.suggestedQuestions;
        } catch (_) {}
      }
      init({ apiUrl, greeting, suggestedQuestions });
      break;
    }
  }
}

if (typeof window !== "undefined") {
  window.MDTChatWidget = { init };
  autoInit();
}
