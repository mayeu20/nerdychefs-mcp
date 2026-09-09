import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

export async function startFixtureServer() {
  const hits = new Map<string, number>();
  const failures = new Map<string, number>();
  const overrides = new Map<string, string>();
  const server = createServer(async (request, response) => {
    const filename = request.url?.match(/^\/api\/(prompts|packs|categories|personas|tags)\.json$/)?.[1];
    if (!filename) { response.writeHead(404).end(); return; }
    hits.set(filename, (hits.get(filename) ?? 0) + 1);
    const remaining = failures.get(filename) ?? 0;
    if (remaining > 0) {
      failures.set(filename, remaining - 1);
      response.writeHead(503).end('Unavailable');
      return;
    }
    try {
      const body = overrides.get(filename)
        ?? await readFile(new URL(`./fixtures/${filename}.json`, import.meta.url), 'utf8');
      response.writeHead(200, { 'content-type': 'application/json' }).end(body);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture server port');
  return {
    base: `http://127.0.0.1:${address.port}/api`, hits, failures, overrides,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
