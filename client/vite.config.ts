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
      // The backend runs as a plain Express server locally (functions/src/localServer.ts,
      // started with `npm run dev` in functions/) and as Vercel serverless functions in
      // production — never through Firebase Hosting/Functions, so this just proxies
      // straight to that local server.
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
