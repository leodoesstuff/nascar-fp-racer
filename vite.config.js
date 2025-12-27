import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true },
  preview: {
    host: true,
    port: 4173,
    // Allow Render subdomains and common setups
    allowedHosts: ["localhost", ".onrender.com"]
  }
});
