/** Serves a fixture website from tests/fixtures/sites/<name> on a random local port and records requests. */
import { createServer, type IncomingMessage } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export interface FixtureServer {
  url: string;
  /** Requested paths (with query). */
  requests: string[];
  userAgents: string[];
  close(): Promise<void>;
}

export const FIXTURES = fileURLToPath(new URL('../fixtures/sites', import.meta.url));

function resolveFile(dir: string, pathname: string): string | null {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = join(dir, clean);
  if (!base.startsWith(dir)) return null;
  const candidates = pathname.endsWith('/') ? [join(base, 'index.html'), base.replace(/[/\\]$/, '') + '.html', base.replace(/[/\\]$/, '') + '.json'] : [base, base + '.html', join(base, 'index.html'), base + '.json'];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

export async function serveFixture(name: string, opts: { status?: Record<string, number> } = {}): Promise<FixtureServer> {
  const dir = join(FIXTURES, name);
  const requests: string[] = [];
  const userAgents: string[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    requests.push(u.pathname + u.search);
    userAgents.push(String(req.headers['user-agent'] ?? ''));
    const forced = opts.status?.[u.pathname];
    if (forced) {
      res.writeHead(forced, { 'content-type': 'text/plain' });
      res.end(`HTTP ${forced}`);
      return;
    }
    const file = resolveFile(dir, u.pathname === '/' ? '/index.html' : u.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Introuvable</title><h1>404</h1>');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    userAgents,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
