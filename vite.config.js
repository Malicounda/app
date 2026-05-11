import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const plugins = [
        react(),
        runtimeErrorOverlay(),
        themePlugin(),
    ];
    if (process.env.NODE_ENV !== "production" && process.env.REPL_ID) {
        try {
            const cartographer = (await import("@replit/vite-plugin-cartographer")).default;
            plugins.push(cartographer());
        }
        catch (error) {
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
            proxy: {
                "/api": {
                    target: "http://127.0.0.1:3000",
                    changeOrigin: true,
                    secure: false,
                    rewrite: (path) => path.replace(/^\/api/, ""),
                },
                "/ws": {
                    target: "ws://127.0.0.1:3000",
                    ws: true,
                },
            },
            port: 5173,
            strictPort: true,
            open: true,
        },
        preview: {
            port: 5173,
            strictPort: true,
        },
        define: {
            "import.meta.env.VITE_API_URL": JSON.stringify(env.VITE_API_BASE_URL || env.VITE_API_URL || "http://127.0.0.1:3000"),
        },
    };
});
//# sourceMappingURL=vite.config.js.map