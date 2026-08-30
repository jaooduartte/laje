import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./mobile-layout-fixes.css";

createRoot(document.getElementById("root")!).render(<App />);
