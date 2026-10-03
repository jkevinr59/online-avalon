import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const backend = 'http://localhost:3000';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
