import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy: todas las llamadas a /api van al backend Express en :4000.
// Así en desarrollo el front (5173) y el back (4000) conviven sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
