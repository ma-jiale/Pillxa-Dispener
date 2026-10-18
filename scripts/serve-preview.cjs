const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../apps/client/build/web');
const galleryRoot = path.resolve(__dirname, '../apps/client/preview');
const port = Number(process.env.PILLXAI_PREVIEW_PORT || 5180);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json',
  '.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.otf':'font/otf','.ttf':'font/ttf','.css':'text/css'};
http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Invalid URL'); }
  if (pathname === '/preview') { res.writeHead(302, {Location:'/preview/'}); return res.end(); }
  const isGallery = pathname === '/preview' || pathname.startsWith('/preview/');
  const base = isGallery ? galleryRoot : root;
  const relativePath = isGallery ? pathname.slice('/preview'.length) : pathname;
  const requested = path.resolve(base, '.' + relativePath);
  if (requested !== base && !requested.startsWith(base + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  const file = requested === base ? path.join(base, 'index.html') : requested;
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, '127.0.0.1', () => process.stdout.write('Pillxai GUI: http://127.0.0.1:' + port + '\n'));
