/**
 * Vite config for GitHub Pages static build.
 *
 * Usage:  npm run build:github-pages
 *
 * Key differences from vite.config.ts:
 *  - base is set to the GitHub Pages sub-path
 *  - PWA service worker uses autoUpdate (no prompt; GH Pages has no server-push)
 *  - navigateFallback disabled (static host cannot serve SPA fallback reliably)
 *  - No /api/* routes — backend is not deployed to GH Pages
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Change this to match your GitHub repository name, e.g. '/RBI-Prep-OS-2027/'
const GH_PAGES_BASE = '/RBI-Prep-OS-2027/';

export default defineConfig({
  base: GH_PAGES_BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        // No navigateFallback — static hosts can't serve it cleanly
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: 'dist-gh-pages',
    emptyOutDir: true,
  },
});
