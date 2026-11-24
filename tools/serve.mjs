// Static server for the site (WebGL textures need http, not file://). Usage: node tools/serve.mjs [port]
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 4262);
const mime = {html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', woff2: 'font/woff2'};
const inside = f => { const r = path.relative(root, f); return !r.startsWith('..') && !path.isAbsolute(r); };

http.createServer(async (req, res) => {
  const fail = (s, m) => { res.writeHead(s, {'Content-Type': 'text/plain'}); res.end(m); };
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.includes('\0') || p.includes('\\') || p.split('/').includes('..')) return fail(403, 'Forbidden');
    let file = path.resolve(root, '.' + p);
    if (!inside(file)) return fail(403, 'Forbidden');
    let info = await stat(file);
    if (info.isDirectory()) { file = path.join(file, 'index.html'); info = await stat(file); }
    if (!inside(await realpath(file))) return fail(403, 'Forbidden');
    res.writeHead(200, {'Content-Type': mime[path.extname(file).slice(1)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store'});
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch { fail(404, 'Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`elewen-photography on http://127.0.0.1:${port}/`));
