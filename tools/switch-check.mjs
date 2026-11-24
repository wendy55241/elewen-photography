// Checks the presentation switches of the single file: the home-page switch changes variant without entering, the
// top-bar link changes it from inside the site, and the keyboard works on the switch. Usage: node tools/switch-check.mjs [url] [--hic 0]
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// playwright-core: an installed copy if there is one (npm i -D playwright-core), else the copy in the author's workspace.
const {chromium} = await import('playwright-core').catch(() => import(pathToFileURL(path.resolve(root, '../../Video Gen/node_modules/playwright-core/index.mjs')).href));
const base = /^(https?|file):/.test(process.argv[2] || '') ? process.argv[2] : pathToFileURL(path.join(root, 'dist', 'elewen.html')).href;
const hic = process.argv.includes('--hic') ? '?hic=0' : '';
const browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--no-sandbox']});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const ready = () => page.waitForFunction(() => window.__site?.state.ready, null, {timeout: 60000});
const st = () => page.evaluate(() => ({variant: document.documentElement.dataset.variant, hic: document.documentElement.dataset.hic, home: window.__site.state.home, search: location.search}));
const log = [];
await page.goto(base + hic); await ready(); await page.waitForTimeout(800); log.push(['open, no ?v', await st()]);
await Promise.all([page.waitForNavigation(), page.click('.h-switch a[data-v="pages"]')]); await ready(); await page.waitForTimeout(800); log.push(['click home switch -> pages', await st()]);
await page.focus('.h-switch a[data-v="orbit"]'); await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]); await ready(); await page.waitForTimeout(800); log.push(['keyboard Enter on home switch -> orbit', await st()]);
await page.mouse.click(720, 600); await page.waitForFunction(() => !window.__site.home.on, null, {timeout: 8000}); await page.waitForTimeout(900); log.push(['click page -> entered', await st()]);
await Promise.all([page.waitForNavigation(), page.click('.switches a.variant[data-v="pages"]')]); await ready(); await page.waitForTimeout(800); log.push(['click top-bar link -> pages', await st()]);
console.log(JSON.stringify({log, errs}, null, 1));
await browser.close();
