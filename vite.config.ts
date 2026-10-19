import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The app lives in app/ so the teammates' ScreamLeap files at the repo root stay untouched.
// .env files are read from the repo root.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  return {
    root: 'app',
    envDir: repoRoot,
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      // three.js is one ~680 kB chunk, loaded lazily only where it's used.
      chunkSizeWarningLimit: 800,
    },
    // API_PROXY (dev only) forwards /api/* to the RAG backend so the browser sees one origin.
    server: env.API_PROXY ? { proxy: { '/api': { target: env.API_PROXY, changeOrigin: true } } } : {},
  };
});
