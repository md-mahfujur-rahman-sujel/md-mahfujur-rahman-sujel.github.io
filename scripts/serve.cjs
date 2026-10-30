const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

function createServer() {
  return http.createServer((req, res) => {
    let requested;
    try {
      requested = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
      return;
    }
    const target = path.normalize(path.join(root, requested === '/' ? 'index.html' : requested));
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(target, (error, data) => {
      if (error) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(target)] || 'application/octet-stream' }).end(data);
    });
  });
}

function start(port = 8765) {
  const server = createServer();
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { createServer, start, root };

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.PORT || 8765);
  start(port).then(() => console.log(`Serving ${root} at http://127.0.0.1:${port}/`));
}
