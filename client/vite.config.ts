import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built assets resolve correctly whether the app is served
  // from a domain root (Firebase Hosting) or a GitHub Pages project subpath
  // (username.github.io/repo-name/). Paired with HashRouter (see src/main.tsx) so
  // client-side routes don't need any server-side rewrite support either.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // The Functions emulator does not serve at /api/* directly — only Hosting's
      // rewrite (firebase.json) maps /api/** to the "api" function. So proxy to the
      // Hosting emulator (started as part of `firebase emulators:start`), which
      // replicates the same rewrite locally that production Hosting does.
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
