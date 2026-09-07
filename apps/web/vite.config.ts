import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The API's CORS_ORIGIN (apps/api/.env) only allows exactly http://localhost:5173 — without
    // strictPort, Vite silently falls back to 5174/5175/... whenever 5173 is already taken (a
    // leftover dev server, another project), and every API call then gets silently blocked by
    // CORS. That surfaces to the user as a misleading "check your internet connection" error
    // (api-client.ts's fetch() throws a generic TypeError for a CORS rejection, indistinguishable
    // client-side from an actual offline network). Failing loudly here — a clear "port 5173 is in
    // use" error in the terminal — is far better than a dev server that starts fine but silently
    // breaks every request.
    strictPort: true,
  },
});
