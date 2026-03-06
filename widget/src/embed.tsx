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

if (typeof window !== "undefined") {
  window.MDTChatWidget = { init };
  const scripts = document.getElementsByTagName("script");
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    const apiUrl = s.getAttribute("data-api-url");
    if (apiUrl) {
      init({
        apiUrl: apiUrl.replace(/\/$/, ""),
        greeting: s.getAttribute("data-greeting") || undefined,
        suggestedQuestions: s.getAttribute("data-suggested-questions")
          ? s.getAttribute("data-suggested-questions")!.split("|")
          : undefined,
      });
      break;
    }
  }
}
