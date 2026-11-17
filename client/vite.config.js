import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Saat development, /api dan /uploads diteruskan ke server Express (port 4000)
// supaya cookie login bekerja tanpa urusan CORS.
const api = process.env.VITE_DEV_API || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": api, "/uploads": api },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
