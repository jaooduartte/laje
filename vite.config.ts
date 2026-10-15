import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/components/admin/AdminMatches",
        replacement: path.resolve(
          __dirname,
          "./src/components/admin/AdminMatchesWithScheduleFilters.tsx",
        ),
      },
      {
        find: "@/components/admin/AdminStandings",
        replacement: path.resolve(
          __dirname,
          "./src/components/admin/AdminStandingsWithInterlajeSettlement.tsx",
        ),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
}));
