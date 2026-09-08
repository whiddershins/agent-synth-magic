import { defineConfig } from 'vite';
import { agentBridge } from '../bridge/src/server.ts';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [agentBridge()],
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2022' },
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
