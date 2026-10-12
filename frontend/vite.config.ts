import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server on :5173 (matches Keycloak client `windband-inventory-local`
// redirectUris: http://localhost:5173/*). The /api proxy makes WM calls
// same-origin for the browser (no CORS needed); production must serve the
// SPA behind a reverse proxy that routes /api/v1 to windband-manager.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.WM_TARGET ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  preview: { port: 5173 },
});
