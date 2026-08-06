import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createApiMiddleware } from "./server/apiHandler.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "proposals-cloud-api",
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
    },
  ],
  server: {
    proxy: {},
  },
});
