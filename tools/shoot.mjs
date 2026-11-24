// Headless Chrome walk-through of one presentation: the home page and its pointer follower, the way in frame by
// frame, then the rolls (ring / pager, pulling film, chapters, lightbox) and the sections below. Saves to verification/<variant>/.
// Usage: node tools/shoot.mjs [url] --v orbit|pages [--w 1440 --h 900] [--only name,name] [--out dir] [--hic 0]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// playwright-core: an installed copy if there is one (npm i -D playwright-core), else the copy in the author's workspace.
const {chromium} = await import('playwright-core').catch(() => import(pathToFileURL(path.resolve(root, '../../Video Gen/node_modules/playwright-core/index.mjs')).href));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const V = arg('--v', 'orbit'), W = +arg('--w', 1440), H = +arg('--h', 900), only = arg('--only', ''), hic = arg('--hic', '1');
const base = /^(https?|file):/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:4262/';
const url = base + (base.includes('?') ? '&' : '?') + `v=${V}&motion=full` + (hic === '0' ? '&hic=0' : '');
const out = path.join(root, 'verification', arg('--out', V)); fs.mkdirSync(out, {recursive: true});

const browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--no-sandbox']});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
const logs = []; page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url()}`));
await page.goto(url);
await page.waitForFunction(() => window.__site?.state.ready, null, {timeout: 60000}).catch(async e => { console.log(logs.join(' | ')); await browser.close(); throw e; });
await page.waitForTimeout(1200);
const shot = async name => { if (!only || only.split(',').includes(name)) { await page.screenshot({path: path.join(out, `${name}.png`)}); console.log('shot', name); } };
const settle = ms => page.waitForTimeout(ms);
const st = () => page.evaluate(() => { const o = window.__site, c = o.centre(); return {home: o.state.home, scrollY: Math.round(scrollY), orb: +o.state.orb.toFixed(2), roll: c ? c.i + 1 : null, pull: c ? +c.pull.value.toFixed(1) : null, card: document.querySelector('.card .stock').textContent, chap: document.querySelector('.chap .stock').textContent, visible: o.rolls.filter(r => r.rig.visible).length}; });
console.log('boot', JSON.stringify(await page.evaluate(() => ({variant: document.documentElement.dataset.variant, hic: document.documentElement.dataset.hic, backend: document.documentElement.dataset.backend, kind: window.__site.home.kind}))));

// ---- home: the follower trails the pointer ----
await shot('00-home-idle');
await page.mouse.move(W * .3, H * .4); await settle(60);
for (let k = 0; k <= 24; k++) { await page.mouse.move(W * (.3 + .4 * k / 24), H * (.4 + .16 * Math.sin(k / 4))); await settle(16); }
await shot('01-home-follow-moving'); await settle(900); await shot('02-home-follow-settled');
await page.mouse.move(W * .52, H * .52); await settle(900); await shot('03-home-centre');
// ---- the way in, held at fixed progress, then played for real with the wheel ----
for (const p of [.08, .22, .4, .6, .82]) { await page.evaluate(p => window.__site.home.freeze(p), p); await settle(450); await shot(`04-enter-${String(Math.round(p * 100)).padStart(2, '0')}`); }
await page.reload(); await page.waitForFunction(() => window.__site?.state.ready, null, {timeout: 60000}); await settle(900);
const t0 = Date.now(); await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 120);
await page.waitForFunction(() => !window.__site.home.on, null, {timeout: 8000}); console.log('entered by wheel in', Date.now() - t0, 'ms', JSON.stringify(await st()));
await settle(1800); await shot('10-rolls-rest');

if (V === 'orbit') {
  // Each wheel gesture moves one roll; drag pulls the centre roll's film.
  for (let i = 1; i < 5; i++) { await page.mouse.wheel(0, 120); await settle(1700); if (i < 3) await shot(`1${i}-roll${i + 1}`); console.log('wheel', JSON.stringify(await st())); }
  await page.evaluate(() => window.__site.goRoll(0, false)); await settle(1800);
  await page.mouse.move(760, 470); await page.mouse.down(); for (let k = 1; k <= 30; k++) { await page.mouse.move(760 + k * 20, 470); await settle(16); } await settle(200); await shot('15-dragging'); await page.mouse.up(); await settle(1200);
  console.log('drag right 600px', JSON.stringify(await st()));
} else {
  // Scrolling pulls the film of the page's roll; the pager turns to another roll.
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 100); await settle(120); } await settle(1200); console.log('wheel 600px', JSON.stringify(await st()));
  await page.click('.pager [data-i="1"]'); await settle(500); await shot('11-page-turning'); await settle(1700); await shot('12-page2-empty'); console.log('pager 2', JSON.stringify(await st()));
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 100); await settle(100); } await settle(1300); await shot('13-page2-pulled'); console.log('page 2 wheel 800px', JSON.stringify(await st()));
  await page.click('.pager [data-d="-1"]'); await settle(2200); console.log('pager prev', JSON.stringify(await st()));
}
// ---- roll one: chapters, the end of the roll, hover, lightbox ----
const anchors = await page.evaluate(() => { const o = window.__site, r = o.centre(); return r.roll.chapters.map((_, i) => o.anchor(r, i)); });
for (const [i, mm] of anchors.entries()) { await page.evaluate(mm => window.__site.setPull(mm, false), mm); await settle(1700); if ([0, 1, 3, 5].includes(i)) await shot(`2${i + 1}-chapter${i + 1}`); console.log('chapter', i + 1, JSON.stringify(await st())); }
await page.evaluate(() => window.__site.setPull(9999, false)); await settle(1700); await shot('27-end'); console.log('end', JSON.stringify(await st()));
await page.evaluate(mm => window.__site.setPull(mm, false), anchors[2]); await settle(1700);
const fr = await page.evaluate(() => { const o = window.__site, r = o.centre(); let best = null; r.roll.frames.forEach((f, k) => { if (r.pull.value < f.b) return; const b = o.frameRect(r, k), cx = b.x + b.w / 2; if (cx > 0 && cx < innerWidth && (!best || Math.abs(cx - innerWidth * .6) < Math.abs(best.cx - innerWidth * .6))) best = {k, cx, cy: b.y + b.h / 2, w: Math.round(b.w), h: Math.round(b.h)}; }); return best; });
console.log('frame', JSON.stringify(fr));
if (fr) {
  await page.mouse.move(fr.cx, fr.cy); await settle(800); await shot('30-hover');
  await page.mouse.down(); await page.mouse.up(); await settle(1700); await shot('31-lightbox');
  await page.keyboard.press('Escape'); await settle(500);
}
// ---- the site below the hero ----
for (const id of ['sheet', 'selects', 'about', 'contact']) { await page.evaluate(id => document.getElementById(id).scrollIntoView({behavior: 'instant'}), id); await settle(1400); await shot(`40-${id}`); }
await page.evaluate(() => { document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); document.querySelector('.after').scrollIntoView({behavior: 'instant'}); }); await settle(1200);
if (!only || only.includes('50-site')) { await page.locator('.after').screenshot({path: path.join(out, '50-site.png')}); console.log('shot 50-site'); }
// ---- back to the home page from the mark ----
await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'})); await settle(400); await page.click('.mark'); await settle(900); console.log('mark -> home', JSON.stringify(await st()));
fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
console.log(logs.filter(l => /error|warn|failed/i.test(l)).slice(0, 20).join('\n'));
await browser.close();
