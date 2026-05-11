import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const networkHost = env.VITE_HOST || "0.0.0.0";
  const useHttps = fs.existsSync("./ssl/localhost-key.pem") && fs.existsSync("./ssl/localhost.pem");
  const hmrProtocol = (env.VITE_HMR_PROTOCOL as "ws" | "wss") || (useHttps ? "wss" : "ws");
  const hmrHost = env.VITE_HMR_HOST || (networkHost === "0.0.0.0" ? undefined : networkHost);
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : 5173;

  const plugins = [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
  ];

  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID) {
    try {
      const cartographerMod = await import("@replit/vite-plugin-cartographer");
      const cartographer = (cartographerMod as any).default ?? (cartographerMod as any).cartographer;
      if (typeof cartographer === 'function') {
        plugins.push(cartographer());
      } else {
        console.warn("@replit/vite-plugin-cartographer export introuvable (default/cartographer)");
      }
    } catch (error) {
      console.warn("Failed to load @replit/vite-plugin-cartographer:", error);
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets")
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      host: networkHost,
      https: useHttps
        ? {
            key: fs.readFileSync("./ssl/localhost-key.pem"),
            cert: fs.readFileSync("./ssl/localhost.pem"),
          }
        : undefined,
      hmr: {
        protocol: hmrProtocol,
        host: hmrHost, // définissez VITE_HMR_HOST=192.168.x.x pour accès depuis un autre appareil
        clientPort: hmrPort,
      },
      // Autoriser l'accès depuis les sous-domaines Serveo (tunnels SSH)
      // Évite l'erreur: "Requête bloquée. Cet hôte ... n'est pas autorisé"
      allowedHosts: [/\.serveo\.net$/],
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          secure: false,
        },
        // Important: servir les pièces jointes directement depuis le backend en dev
        // Sans ce proxy, une requête vers /uploads/... est gérée par Vite et renvoie index.html
        // ce qui explique que l'iframe affiche le tableau de bord au lieu du PDF/image.
        "/uploads": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          secure: false,
        },
        "/ws": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
      strictPort: true,
      open: true,
    },
    preview: {
      port: 5173,
      strictPort: true,
    },
  };
});