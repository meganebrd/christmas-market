import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';

/**
 * Dev-only endpoint used by the stall editor: GET /__givrelune/scan?url=https://…
 * Scans a website server-side (no CORS issue) and returns ScannedStallData-like JSON.
 */
function scanEndpoint(): Plugin {
  return {
    name: 'givrelune-scan-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__givrelune/scan', async (req, res) => {
        try {
          const u = new URL(req.url ?? '', 'http://localhost');
          const target = u.searchParams.get('url');
          if (!target) throw new Error('missing ?url=');
          const mod = await server.ssrLoadModule('/scripts/scanner/index.ts');
          const data = await mod.scanSite(target, { maxPages: Number(u.searchParams.get('maxPages') ?? 12), stallId: u.searchParams.get('id') ?? 'preview' });
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(data));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(err?.message ?? err) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [scanEndpoint()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor.html'),
      },
      output: {
        // Three.js in its own long-cached file, shared by the market and the editor
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: { host: true },
});
