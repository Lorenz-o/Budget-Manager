import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
    // In sviluppo le chiamate /api vengono proxate al backend Flask (porta
    // 5000). Cosi' il frontend usa sempre '/api' come in produzione: niente
    // CORS e, se il backend non e' avviato, la richiesta fallisce in modo
    // riconoscibile invece di ricevere l'HTML del dev server (che prima
    // produceva "Unexpected token '<', <!doctype ... is not valid JSON").
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
