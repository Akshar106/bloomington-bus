import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs separately (npm run dev:server), on port 3000 unless API_URL says otherwise.
    proxy: { "/api": process.env.API_URL ?? "http://localhost:3000" },
  },
});
