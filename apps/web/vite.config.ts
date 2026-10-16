import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { staticPwa } from "./pwa-build";
const headers = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const proxy = {
  "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
};
export default defineConfig({
  plugins: [tailwindcss(), staticPwa()],
  server: { proxy, headers },
  preview: { proxy, port: 4173, headers },
  build: { sourcemap: false },
});
