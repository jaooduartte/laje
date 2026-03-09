import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: SECURITY_HEADERS,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    headers: SECURITY_HEADERS,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
