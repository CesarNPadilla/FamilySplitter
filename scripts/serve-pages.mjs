import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve('dist');
const base = '/FamilySplitter/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
// Test server deliberately has no SPA success rewrite: missing routes receive
// the built 404 document, matching GitHub Pages' nested-link behavior.
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    );
    if (!pathname.startsWith(base)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const target = resolve(root, pathname.slice(base.length) || 'index.html');
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    let data;
    let contentType = types[extname(target)] ?? 'application/octet-stream';
    let status = 200;
    try {
      data = await readFile(target);
    } catch {
      data = await readFile(resolve(root, '404.html'));
      contentType = 'text/html';
      status = 404;
    }
    response.writeHead(status, { 'Content-Type': contentType });
    response.end(data);
  } catch {
    response.writeHead(400);
    response.end();
  }
}).listen(5176, '127.0.0.1');
