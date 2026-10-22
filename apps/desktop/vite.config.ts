import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as path from 'node:path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true
  },
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  }
});
