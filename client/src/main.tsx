// Importer les polyfills en premier
import "./polyfills";

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/responsive.css";
import { initPWA } from "./lib/pwaUtils";
import { logEnvironmentInfo } from "./utils/environment";

// Initialiser les fonctionnalités PWA (Service Worker + offline fetch)
initPWA();

// APK Alerte: imposer le domaine ALERTE dès le démarrage
try {
  const isAlerteApk =
    typeof window !== "undefined" &&
    (window.location.search.includes("isApk=true") ||
      window.navigator.userAgent.includes("AlerteAPK"));
  if (isAlerteApk) {
    localStorage.setItem("domain", "ALERTE");
  }
} catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
  // ignore
 }

// Logger les détails de l'environnement (mode, URL API, plateforme, réseau)
logEnvironmentInfo();

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Configuration HMR (Hot Module Replacement)
if (import.meta.hot) {
  import.meta.hot.accept();
}
