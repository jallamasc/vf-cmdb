/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  // Build-time version exposed to the app (informational; the authoritative
  // running/update answer comes from the backend /api/v1/meta/version).
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VF_VERSION || pkg.version || "dev",
    ),
    __APP_GIT_SHA__: JSON.stringify(process.env.VF_GIT_SHA || "unknown"),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
