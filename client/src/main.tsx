// Importer les polyfills en premier
import "./polyfills";

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/responsive.css";
import { initPWA } from "./lib/pwaUtils";

// Initialiser les fonctionnalités PWA (Service Worker + offline fetch)
initPWA();

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Configuration HMR (Hot Module Replacement)
if (import.meta.hot) {
  import.meta.hot.accept();
}
