import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { staticPwa } from "./pwa-build";
const proxy = {
  "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
};
export default defineConfig({
  plugins: [tailwindcss(), staticPwa()],
  server: { proxy },
  preview: { proxy, port: 4173 },
  build: { sourcemap: false },
});
