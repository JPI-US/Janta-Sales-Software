import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createProposalsApiMiddleware } from "./server/proposalsApi.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "proposals-cloud-api",
      configureServer(server) {
        server.middlewares.use(createProposalsApiMiddleware());
      },
    },
  ],
  server: {
    proxy: {},
  },
});
