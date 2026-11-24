// Single-file build: dist/elewen.html opens by double-click (file://) and holds both presentations. ?v=orbit | pages picks
// one (default orbit); the home page and the top bar link between them. Modules travel
// as text and are chained through blob: URLs (Overture's approach); three.js is gzipped; images are the embedded WebP copies.
// Usage: node tools/build-standalone.mjs   (after python -I tools/prepare-photos.py <photos>)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(root, ...p);
const read = p => fs.readFileSync(P(p), 'utf8');
const b64 = buf => buf.toString('base64');
const {ROLLS} = await import(pathToFileURL(P('src/rolls.js')).href);
// Module id -> file, in dependency order; each later module may import the earlier ones.
const MODULES = [['three-core', 'src/lib/three.core.js'], ['three-webgpu', 'src/lib/three.webgpu.js'], ['rolls', 'src/rolls.js'], ['labels', 'src/labels.js'],
  ['motion', 'src/motion.js'], ['sound', 'src/sound.js'], ['film', 'src/film.js'], ['home', 'src/home.js'], ['main', 'src/main.js']];
const SPEC = {'./three.core.js': 'three-core', './lib/three.webgpu.js': 'three-webgpu', './rolls.js': 'rolls', './labels.js': 'labels', './motion.js': 'motion', './sound.js': 'sound', './film.js': 'film', './home.js': 'home'};
for (const [, f] of MODULES) for (const m of read(f).matchAll(/from\s+'([^']+)'/g)) if (!SPEC[m[1]]) throw new Error(`${f}: unmapped import ${m[1]}`);

const modules = MODULES.map(([id, f]) => {
  const code = Buffer.from(read(f)), gz = id.startsWith('three');
  return `<script type="text/plain" data-module="${id}"${gz ? ' data-gzip' : ''}>${b64(gz ? zlib.gzipSync(code, {level: 9}) : code)}</script>`;
}).join('\n');

// Page path -> embedded file. Empty rolls carry no images.
const assets = [];
for (const r of ROLLS) {
  if (r.placeholder) continue;
  assets.push([`assets/frames/${r.key}-strip.jpg`, `assets/embed/${r.key}-strip.webp`]);
  for (const c of r.chapters) assets.push([`assets/thumbs/${r.key}-amb-${c.key}.jpg`, `assets/embed/${r.key}-amb-${c.key}.webp`]);
  r.frames.forEach((_, i) => { const n = `${r.key}-${String(i + 1).padStart(2, '0')}`; assets.push([`assets/frames/${n}.jpg`, `assets/embed/${n}.webp`], [`assets/thumbs/${n}.jpg`, `assets/embed/${n}-t.webp`]); });
}
const assetTags = assets.map(([key, file]) => `<script type="text/plain" data-asset="${key}">${b64(fs.readFileSync(P(file)))}</script>`).join('\n');

const boot = `<script type="module">
const bytes = s => Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0));
const assets = {};
for (const el of document.querySelectorAll('script[data-asset]')) assets[el.dataset.asset] = URL.createObjectURL(new Blob([bytes(el.textContent)], {type: 'image/webp'}));
window.__FILM_ASSETS = assets;
const spec = ${JSON.stringify(SPEC)}, urls = {};
for (const el of document.querySelectorAll('script[data-module]')) {
  let code = el.hasAttribute('data-gzip') ? await new Response(new Blob([bytes(el.textContent)]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes(el.textContent));
  code = code.replace(/(from\\s+|import\\s*\\(\\s*)'([^']+)'/g, (m, a, s) => spec[s] && urls[spec[s]] ? a + "'" + urls[spec[s]] + "'" : m);
  urls[el.dataset.module] = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
}
await import(urls.main);
</script>`;

let html = read('index.html');
const swap = (a, b) => { if (!html.includes(a)) throw new Error('index.html: missing ' + a); html = html.replace(a, () => b); };
swap('<link rel="stylesheet" href="src/style.css">', `<style>\n${read('src/style.css')}\n</style>`);
swap('<script type="module" src="src/main.js"></script>', `${modules}\n${assetTags}\n${boot}`);
fs.mkdirSync(P('dist'), {recursive: true});
// One file for both presentations: no variant is injected, so ?v= decides (default orbit).
fs.writeFileSync(P('dist', 'elewen.html'), html);
// The same file as index.html in a folder of its own: this folder is what gets uploaded to a static host.
fs.mkdirSync(P('dist', 'deploy'), {recursive: true});
fs.writeFileSync(P('dist', 'deploy', 'index.html'), html);
console.log(`dist/elewen.html ${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB, ${MODULES.length} modules, ${assets.length} images`);
