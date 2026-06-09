// Importer les polyfills en premier
import "./polyfills";

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/responsive.css";
import { initPWA } from "./lib/pwaUtils";
import { logEnvironmentInfo } from "./utils/environment";
import { Preferences } from "@capacitor/preferences";

// Initialiser les fonctionnalités PWA (Service Worker + offline fetch)
initPWA();

// Imposer le domaine selon l'APK dès le démarrage
try {
  const isChasseApk =
    typeof window !== "undefined" &&
    window.navigator.userAgent &&
    window.navigator.userAgent.includes("ChasseAPK");

  const isAlerteApk =
    typeof window !== "undefined" &&
    !isChasseApk &&
    (window.location.search.includes("isApk=true") ||
      window.navigator.userAgent.includes("AlerteAPK"));

  if (isChasseApk) {
    localStorage.setItem("domain", "CHASSE");
    Preferences.set({ key: "domain", value: "CHASSE" }).catch(() => {});
  } else if (isAlerteApk) {
    localStorage.setItem("domain", "ALERTE");
    Preferences.set({ key: "domain", value: "ALERTE" }).catch(() => {});
  }
} catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
  // ignore
}

// Logger les détails de l'environnement (mode, URL API, plateforme, réseau)
logEnvironmentInfo();

async function bootstrap() {
  try {
    const isCapacitor = typeof window !== "undefined" && !!(window as any).Capacitor;
    if (isCapacitor) {
      const { value: token } = await Preferences.get({ key: "token" });
      if (token !== null && token !== "null" && token !== "undefined") {
        localStorage.setItem("token", token);
      }
      const { value: session } = await Preferences.get({ key: "scodi_session" });
      if (session !== null && session !== "null" && session !== "undefined") {
        localStorage.setItem("scodi_session", session);
      }
      const { value: domain } = await Preferences.get({ key: "domain" });
      if (domain !== null && domain !== "null" && domain !== "undefined") {
        localStorage.setItem("domain", domain);
      }
    }
  } catch (e) {
    console.error("[Bootstrap] Erreur lors du chargement des préférences natives:", e);
  }

  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

bootstrap();

// Configuration HMR (Hot Module Replacement)
if (import.meta.hot) {
  import.meta.hot.accept();
}
