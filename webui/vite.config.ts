import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.FIGURINE_API ?? "http://127.0.0.1:8757";

export default defineConfig({
  plugins: [react()],
  // Localhost only. This machine holds the photos; the UI must not be reachable from
  // the network by accident.
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": { target: API } } },
  build: { outDir: "dist", sourcemap: true },
  css: { modules: { localsConvention: "camelCaseOnly" } },
});
