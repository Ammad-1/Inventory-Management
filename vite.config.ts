import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const apiPort = process.env.API_PORT || 5000;
  const apiTarget = `http://127.0.0.1:${apiPort}`;

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
          target: apiTarget,
          changeOrigin: true,
          configure: (proxy) => {
            /*
             * A dev server left pointing at a port nothing is listening on
             * answers every call with a bare 502, which surfaces in the app
             * as "could not sign in" and sends you looking for a bug in the
             * login. Say which port failed, in the terminal and in the body.
             */
            proxy.on('error', (err: NodeJS.ErrnoException, _req, res) => {
              const reason = err.code === 'ECONNREFUSED'
                ? `Nothing is listening on ${apiTarget}. Start the API with "npm run server"` +
                  (process.env.API_PORT ? `, or unset API_PORT (currently ${apiPort}).` : '.')
                : err.message;
              console.error(`\n[vite proxy] cannot reach the API: ${reason}\n`);
              if (res && 'writeHead' in res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `API unreachable — ${reason}` }));
              }
            });
          },
        },
      },
    },
  };
});
