import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    server: {
      port: 3000,
      // Loopback only - matches the API's binding and keeps the app off the LAN
      host: '127.0.0.1',
      watch: { ignored: ['**/*.db', '**/*.db-*'] },
      proxy: {
        '/api': {
          // Matches the API's default port; override both with API_PORT
          target: `http://127.0.0.1:${process.env.API_PORT || 5000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
