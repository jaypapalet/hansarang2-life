import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile({ overrideConfig: { base: '/' } })],
  build: { outDir: 'dist/client', manifest: true },
  server: {
    proxy: {
      '/api/apartment-notices': {
        target: 'http://127.0.0.1:4189',
        changeOrigin: false,
      },
      '/api': {
        target: 'http://127.0.0.1:4189',
        changeOrigin: true,
        headers: { Origin: 'http://127.0.0.1:4189' },
      },
    },
  },
});
