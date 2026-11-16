// serve.ts — a small static file server for local testing of HELIOSTAT.
// Serves this repository's directory on :8080 with the MIME types the game
// needs (.js as JavaScript modules, .html, .jpg/.png, .json). Node 22 stdlib.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = normalize(urlPath === '/' ? '/game/index.html' : urlPath).replace(/^[/\\]+/, '');
  const file = resolve(join(root, rel));
  if (!file.startsWith(root + '/') && file !== root) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found: ' + urlPath);
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log('heliostat: serving ' + root + ' at http://localhost:' + port + '/game/index.html');
  console.log('heliostat: add ?shot=1..4 to stage a screenshot scene');
});
