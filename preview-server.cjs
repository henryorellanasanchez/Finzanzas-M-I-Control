const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let requested;
  try{ requested = new URL(req.url || '/', 'http://127.0.0.1').pathname; }
  catch{ res.writeHead(400); return res.end('Bad request'); }
  let relative;
  try{ relative = requested === '/' ? 'index.html' : decodeURIComponent(requested).replace(/^\/+/, ''); }
  catch{ res.writeHead(400); return res.end('Bad request'); }
  const file = path.resolve(root, relative);

  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      if(req.method === 'GET' && /^\/share\/[0-9a-f-]+$/i.test(requested)){
        res.writeHead(200, { 'Content-Type': mime['.html'], 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(path.join(root, 'index.html')).pipe(res);
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(5500, '127.0.0.1', () => {
  console.log('M&I Control preview: http://127.0.0.1:5500');
});
