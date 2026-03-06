import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/embed.tsx",
      name: "MDTChatWidget",
      fileName: "mdt-chat-widget",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "mdt-chat-widget.[ext]",
      },
    },
    cssCodeSplit: false,
    minify: true,
  },
});
