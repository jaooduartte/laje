import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

function createApiProxy(mode: string) {
  const target = loadEnv(mode, process.cwd(), "API_").API_PROXY_TARGET;
  return target
    ? {
        "/api/v1": {
          target,
          changeOrigin: true,
          secure: true,
        },
      }
    : undefined;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: SECURITY_HEADERS,
    hmr: {
      overlay: false,
    },
    proxy: createApiProxy(mode),
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
