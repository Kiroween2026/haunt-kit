import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
});
