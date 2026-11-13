import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const backend = process.env.TOOLKIT_BACKEND_URL || 'http://127.0.0.1:5000';
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/static/ui/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    proxy: Object.fromEntries(['/api', '/process-image', '/process-images', '/white-border', '/static', '/download', '/download-all'].map((route) => [route, { target: backend, changeOrigin: true }])),
  },
  build: { outDir: path.resolve(root, '../static/ui'), emptyOutDir: true },
}));
