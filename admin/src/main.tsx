import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const apiUrl = import.meta.env.VITE_API_URL || "";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin">
      <App apiUrl={apiUrl} />
    </BrowserRouter>
  </React.StrictMode>
);
