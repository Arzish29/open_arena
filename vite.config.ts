import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The app lives in app/ so the teammates' ScreamLeap files at the repo root stay untouched.
// .env files are read from the repo root.
export default defineConfig({
  root: 'app',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // three.js is one ~680 kB chunk, loaded lazily only where it's used.
    chunkSizeWarningLimit: 800,
  },
});
