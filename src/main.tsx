import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AwsErrorBoundary } from "./components/observability/AwsErrorBoundary.tsx";
import { isAwsBackendEnabled } from "./config/environment.ts";
import { installAwsErrorMonitoring } from "./lib/observability.ts";
import "./index.css";
import "./mobile-layout-fixes.css";

// LAJE-40 telemetry and render fallback are scoped to the TCC AWS deployment.
installAwsErrorMonitoring();
createRoot(document.getElementById("root")!).render(
  isAwsBackendEnabled() ? (
    <AwsErrorBoundary>
      <App />
    </AwsErrorBoundary>
  ) : (
    <App />
  ),
);
