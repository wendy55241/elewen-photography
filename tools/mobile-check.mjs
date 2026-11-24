// Phone check with real touch input (CDP): swipe up on the home page to enter, an up/down swipe turns to the next
// roll, a sideways drag pulls the film, the site sheet opens, scrolls and opens a frame.
// Usage: node tools/mobile-check.mjs [url] --v orbit|pages
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// playwright-core: an installed copy if there is one (npm i -D playwright-core), else the copy in the author's workspace.
const {chromium} = await import('playwright-core').catch(() => import(pathToFileURL(path.resolve(root, '../../Video Gen/node_modules/playwright-core/index.mjs')).href));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const V = arg('--v', 'orbit'), base = /^(https?|file):/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:4262/';
const url = base + (base.includes('?') ? '&' : '?') + `v=${V}&motion=full`;
const out = path.join(root, 'verification', `${V}-mobile`); fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--no-sandbox']});
const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await ctx.newCDPSession(page);
await page.goto(url);
await page.waitForFunction(() => window.__site?.state.ready, null, {timeout: 60000}); await page.waitForTimeout(2200);
const wait = ms => page.waitForTimeout(ms);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]});
async function swipe(x0, y0, x1, y1, steps = 12, hold = 16) {
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await wait(hold); }
  await touch('touchEnd');
}
const shot = n => page.screenshot({path: path.join(out, n + '.png')});
const st = () => page.evaluate(() => { const o = window.__site, c = o.centre(); return {home: o.state.home, orb: +o.state.orb.toFixed(2), roll: c ? c.i + 1 : null, pull: c ? Math.round(c.pull.value) : null, card: document.querySelector('.card .stock').textContent, chap: document.querySelector('.chap .stock').textContent, visible: o.rolls.filter(r => r.rig.visible).map(r => r.i + 1), scrollY}; });
const log = [];
await shot('00-home'); log.push(['home', await st()]);
await swipe(195, 640, 195, 420, 10, 16); await wait(500); await shot('01-entering'); await wait(1900); await shot('02-rest'); log.push(['swipe up on home -> entered', await st()]);
await swipe(120, 420, 330, 424, 14, 16); await wait(1400); await shot('03-dragged'); log.push(['drag right 210px', await st()]);
await swipe(80, 420, 340, 420, 14, 30); await wait(1400); log.push(['drag right again', await st()]);
await swipe(195, 640, 195, 420, 10, 16); await wait(1900); await shot('04-next-roll'); log.push(['swipe up -> next roll', await st()]);
await swipe(120, 420, 330, 424, 14, 16); await wait(1400); await shot('05-empty-roll-dragged'); log.push(['drag on empty roll', await st()]);
await swipe(195, 420, 195, 640, 10, 16); await wait(1900); log.push(['swipe down -> back', await st()]);
await page.evaluate(() => window.__site.setPull(9999)); await wait(1900); await shot('06-end'); log.push(['end', await st()]);
await page.tap('.index-btn'); await wait(800); await shot('07-sheet');
await page.evaluate(() => { const a = document.querySelector('.after'); a.scrollTop = document.querySelector('#selects').offsetTop - 60; }); await wait(1300); await shot('08-sheet-selects');
await page.evaluate(() => { document.querySelector('.after').scrollTop = document.querySelector('#sheet').offsetTop; }); await wait(600);
await page.tap('.fr'); await wait(1800); await shot('09-lightbox'); await page.keyboard.press('Escape'); await wait(500);
await page.tap('.sheet-close'); await wait(700);
console.log(JSON.stringify({variant: V, log, errs}));
await browser.close();
