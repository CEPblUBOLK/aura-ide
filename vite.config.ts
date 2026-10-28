import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/preview': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/proxy': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/terminal': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/events': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
