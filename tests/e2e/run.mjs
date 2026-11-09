// Whole-page click-through tests in a real Chromium (WebGL via SwiftShader is fine).
//
//   node tests/e2e/run.mjs                       run everything
//   node tests/e2e/run.mjs --grep language       run tests whose name matches
//
// Environment:
//   GX_CHROME       Chromium/Chrome executable (default: newest ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome)
//   GX_PLAYWRIGHT   directory that contains node_modules/playwright-core, or the playwright-core package itself
//                   (default: resolve from this repo, then ~/devbrowser)
//   GX_BASE_URL     test an already running site instead of the built-in static server (e.g. the live Pages URL)
//   GX_SHOTS        directory to save screenshots of key views (optional)
//   GX_HEADFUL=1    show the browser window
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const grep = args.includes('--grep') ? new RegExp(args[args.indexOf('--grep') + 1], 'i') : null;

function loadPlaywright() {
  const candidates = [process.env.GX_PLAYWRIGHT, ROOT, path.join(os.homedir(), 'devbrowser')].filter(Boolean);
  for (const base of candidates) {
    try {
      if (fs.existsSync(path.join(base, 'package.json')) && JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).name === 'playwright-core') return createRequire(path.join(base, 'index.js'))(base);
      return createRequire(path.join(base, 'noop.js'))('playwright-core');
    } catch { /* try the next location */ }
  }
  throw new Error('playwright-core not found; set GX_PLAYWRIGHT');
}
function findChrome() {
  if (process.env.GX_CHROME) return process.env.GX_CHROME;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort() : [];
  for (const dir of dirs.reverse()) for (const sub of ['chrome-linux', 'chrome-linux64']) {
    const exe = path.join(cache, dir, sub, 'chrome'); if (fs.existsSync(exe)) return exe;
  }
  throw new Error('Chromium not found; set GX_CHROME');
}
function startServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(req.url.split('?')[0]) === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
    const p = path.resolve(ROOT, '.' + file);
    if (!p.startsWith(ROOT + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const { chromium } = loadPlaywright();
const server = process.env.GX_BASE_URL ? null : await startServer();
const BASE = (process.env.GX_BASE_URL || `http://127.0.0.1:${server.address().port}`).replace(/\/$/, '') + '/';
const SHOTS = process.env.GX_SHOTS ? path.resolve(process.env.GX_SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), headless: !process.env.GX_HEADFUL,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const JOURNEYS = { gemm: 8, pagetable: 8, pixel: 8, stacking: 8 };
const LEVEL_OF = {
  gemm: ['board', 'hbm', 'die', 'package', 'sm', 'sm', 'sm', 'package'],
  pagetable: ['sm', 'sm', 'die', 'package', 'package', 'die', 'hbm', 'sm'],
  pixel: ['die', 'package', 'sm', 'die', 'sm', 'sm', 'package', 'board'],
  stacking: ['board', 'hbm', 'hbm', 'hbm', 'package', 'package', 'package', 'die']
};
const CJK = /[㐀-鿿]/;
const tests = [];
const test = (name, fn, options = {}) => tests.push({ name, fn, options });

const live = new Set();
async function open(hash = '', options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 800 }, locale: options.locale || 'zh-CN', reducedMotion: options.reducedMotion || 'no-preference' });
  if (options.storage) await context.addInitScript(s => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } catch {} }, options.storage);
  live.add(context); context.on('close', () => live.delete(context));
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
  await page.goto(BASE + (hash ? '#' + hash.replace(/^#/, '') : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.GpuExplorer3D && document.getElementById('scene-loading').hidden, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  return { page, context, problems };
}
const scene = page => page.evaluate(() => ({ ...document.getElementById('scene3d').dataset, status: window.GpuExplorer3D?.getStatus() }));
const app = page => page.evaluate(() => ({
  hash: location.hash, mode: document.body.dataset.mode, journey: document.body.dataset.currentJourney,
  counter: document.getElementById('step-counter').textContent, title: document.getElementById('step-title').textContent,
  body: document.getElementById('step-body').textContent, revision: document.getElementById('diagram').dataset.guideRevision,
  lab: document.querySelector('#journey-lab .lab-root')?.dataset || null, progress: Number(document.getElementById('journey-lab').dataset.progress),
  prevDisabled: document.getElementById('prev-btn').disabled, nextDisabled: document.getElementById('next-btn').disabled,
  playLabel: document.getElementById('play-btn').getAttribute('aria-label'), lang: document.documentElement.lang,
  route: [...document.querySelectorAll('#route-nodes span')].map(n => n.textContent)
}));
async function waitStep(page, journey, index, timeout = 45000) {
  await page.waitForFunction(([j, i]) => document.body.dataset.currentJourney === j && document.getElementById('step-counter').textContent.startsWith(String(i + 1).padStart(2, '0')) && document.getElementById('scene3d').dataset.flowJourney === j, [journey, index], { timeout });
}
async function checkStep(page, journey, index) {
  await waitStep(page, journey, index);
  await page.waitForFunction(level => document.getElementById('scene3d').dataset.level === level, LEVEL_OF[journey][index], { timeout: 45000 });
  const s = await scene(page), a = await app(page);
  assert.equal(s.level, LEVEL_OF[journey][index], `${journey} step ${index + 1}: scene level`);
  assert.equal(s.flowJourney, journey, `${journey} step ${index + 1}: overlay belongs to the journey`);
  assert.equal(s.sceneKind, 'hardware', 'walkthroughs play on the hardware model');
  assert.ok(Number(s.signalRoutes) + Number(s.flowMarkers) > 0, `${journey} step ${index + 1}: something is drawn on the hardware`);
  assert.equal(a.lab.journey, journey); assert.equal(Number(a.lab.step), index);
  assert.ok(a.title.trim().length > 3 && a.body.trim().length > 10, 'step text present');
  assert.ok(a.route.length >= 2, 'route chips present');
  assert.match(a.hash, new RegExp(`j=${journey}&.*s=${index}`));
  return { s, a };
}
const noProblems = (problems, label = '') => assert.deepEqual(problems, [], 'console/page errors ' + label + ':\n' + problems.join('\n'));
async function settle(page) { await page.waitForFunction(() => document.getElementById('scene3d').dataset.cameraMoving === 'false', null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(250); }
async function shot(page, name) { if (!SHOTS) return; await settle(page); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
async function noOverflow(page) {
  const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  assert.ok(o.doc <= o.win + 1, `horizontal overflow ${o.doc} > ${o.win}`);
}

// ---------------- tests ----------------
test('first load: walkthrough, scene ready, accessible names, no errors', async () => {
  const { page, context, problems } = await open();
  const a = await app(page);
  assert.equal(a.mode, 'learn'); assert.equal(a.journey, 'gemm'); assert.equal(a.counter, '01 / 08');
  assert.ok(a.prevDisabled); assert.ok(!a.nextDisabled);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button,select,input,[role=toolbar]')].filter(el => el.offsetParent && !(el.getAttribute('aria-label') || el.textContent.trim() || el.labels?.length)).map(el => el.id || el.className));
  assert.deepEqual(unnamed, [], 'every visible control has an accessible name');
  await checkStep(page, 'gemm', 0); await shot(page, 'load-gemm-1');
  noProblems(problems); await context.close();
});

for (const journey of Object.keys(JOURNEYS)) test(`${journey}: every step with Next, then back with Previous`, async () => {
  const { page, context, problems } = await open(`j=${journey}&s=0&mode=learn`);
  for (let i = 0; i < JOURNEYS[journey]; i++) {
    await checkStep(page, journey, i);
    await shot(page, `${journey}-${i + 1}`);
    if (i < JOURNEYS[journey] - 1) await page.click('#next-btn');
  }
  assert.ok((await app(page)).nextDisabled, 'Next is disabled on the last step');
  for (let i = JOURNEYS[journey] - 1; i > 0; i--) { await page.click('#prev-btn'); await waitStep(page, journey, i - 1); }
  assert.ok((await app(page)).prevDisabled);
  noProblems(problems, journey); await context.close();
});

test('timeline chips jump to any step and mark the current one', async () => {
  const { page, context, problems } = await open('j=pixel&s=0&mode=learn');
  for (const i of [5, 2, 7, 0]) {
    await page.click(`#overview [data-step="${i}"]`);
    await checkStep(page, 'pixel', i);
    assert.equal(await page.getAttribute(`#overview [data-step="${i}"]`, 'aria-current'), 'step');
  }
  noProblems(problems); await context.close();
});

test('switching walkthroughs mid-animation leaves no stale overlay or lab', async () => {
  const { page, context, problems } = await open('j=gemm&s=3&mode=learn');
  await page.click('#play-btn'); await page.waitForTimeout(400);
  for (const journey of ['stacking', 'pagetable', 'pixel', 'gemm', 'stacking']) {
    await page.click(`[data-journey=${journey}]`);
    const { a } = await checkStep(page, journey, 0);
    assert.equal(a.lab.journey, journey);
  }
  // The newly chosen walkthrough starts at step 1 and is not stuck in sequence playback.
  assert.equal((await app(page)).counter, '01 / 08');
  noProblems(problems); await context.close();
});

test('autoplay advances, pauses, and restarts from step 1 at the end', async () => {
  const { page, context, problems } = await open('j=pagetable&s=5&mode=learn');
  await page.selectOption('#speed-select', '2');
  await page.click('#play-btn');
  // Autoplay runs on the frame clock; a software-rendered browser is slow, so allow time.
  await waitStep(page, 'pagetable', 6, 90000);
  assert.equal((await app(page)).playLabel, await page.evaluate(() => window.GpuExplorerI18n.t('play.pause')));
  await page.click('#play-btn');
  const paused = await app(page); await page.waitForTimeout(1500);
  assert.equal((await app(page)).counter, paused.counter, 'pause holds the step');
  await page.click('#overview [data-step="7"]'); await waitStep(page, 'pagetable', 7);
  await page.waitForFunction(() => Number(document.getElementById('journey-lab').dataset.progress) >= 1, null, { timeout: 90000 });
  await page.click('#play-btn');
  await waitStep(page, 'pagetable', 0, 30000);
  noProblems(problems); await context.close();
});

test('replay restarts the current step; pause freezes the visual clock', async () => {
  const { page, context, problems } = await open('j=stacking&s=2&mode=learn');
  await page.waitForFunction(() => Number(document.getElementById('journey-lab').dataset.progress) > .4, null, { timeout: 90000 });
  const before = await app(page);
  await page.click('#replay-btn');
  await page.waitForFunction(r => document.getElementById('diagram').dataset.guideRevision !== r, before.revision);
  await page.waitForFunction(() => Number(document.getElementById('journey-lab').dataset.progress) < .3, null, { timeout: 30000 }); // replay starts the step again
  await page.click('#motion-btn');
  const cycle = (await scene(page)).flowCycle; await page.waitForTimeout(700);
  assert.equal((await scene(page)).flowCycle, cycle, 'visual phase frozen while paused');
  await page.click('#motion-btn');
  await page.waitForFunction(c => document.getElementById('scene3d').dataset.flowCycle !== c, cycle, { timeout: 30000 }); // visual phase resumes
  noProblems(problems); await context.close();
});

test('stacking walkthrough takes the package apart on the steps that need it', async () => {
  const { page, context, problems } = await open('j=stacking&s=4&mode=learn');
  await checkStep(page, 'stacking', 4);
  await page.waitForFunction(() => Number(document.getElementById('scene3d').dataset.explode) > .5);
  await page.click('#next-btn'); await checkStep(page, 'stacking', 5);
  await page.waitForFunction(() => Number(document.getElementById('scene3d').dataset.explode) > .95 && document.getElementById('scene3d').dataset.cameraPreset === 'side');
  await shot(page, 'stacking-layers-side');
  await page.click('#next-btn'); await checkStep(page, 'stacking', 6);
  await page.waitForFunction(() => Number(document.getElementById('scene3d').dataset.explode) < .01);
  await page.waitForFunction(() => document.getElementById('scene3d').dataset.cameraPreset === '3d' && document.querySelector('[data-cam].active')?.dataset.cam === 'three-quarter');
  noProblems(problems); await context.close();
});

test('model switch keeps the walkthrough on the hardware for every journey', async () => {
  const { page, context, problems } = await open('j=gemm&s=0&mode=learn');
  for (const journey of Object.keys(JOURNEYS)) {
    await page.click(`[data-journey=${journey}]`); await page.click('#overview [data-step="3"]');
    await checkStep(page, journey, 3);
    await page.selectOption('#model-select', 'a100');
    await page.waitForFunction(() => document.getElementById('scene3d').dataset.model === 'a100');
    await checkStep(page, journey, 3);
    await page.selectOption('#model-select', 'h100');
    await page.waitForFunction(() => document.getElementById('scene3d').dataset.model === 'h100');
  }
  noProblems(problems); await context.close();
});

test('tab switch mid-animation: anatomy context is restored, walkthrough resumes at its step', async () => {
  const { page, context, problems } = await open('j=pixel&s=0&mode=learn');
  await page.click('[data-mode=explore]');
  await page.click('[data-level=hbm]'); await page.waitForFunction(() => document.getElementById('scene3d').dataset.level === 'hbm');
  await page.fill('#explode-slider', '60');
  await page.click('[data-mode=learn]'); await page.click('#overview [data-step="4"]');
  await page.click('#play-btn'); await page.waitForTimeout(300);
  await page.click('[data-mode=explore]');
  await page.waitForFunction(() => document.getElementById('scene3d').dataset.level === 'hbm' && Math.abs(Number(document.getElementById('diagram').dataset.explode) - .6) < .01);
  assert.equal((await scene(page)).flowJourney, 'anatomy');
  assert.equal(await page.isVisible('.bottombar'), false);
  await page.click('[data-mode=learn]');
  await checkStep(page, 'pixel', 4);
  noProblems(problems); await context.close();
});

test('language switch: every visible string changes, persists in URL and storage', async () => {
  const { page, context, problems } = await open('j=pagetable&s=3&mode=learn', { locale: 'zh-CN' });
  assert.equal((await app(page)).lang, 'zh-CN');
  await page.click('.lang-switch [data-lang=en]');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await checkStep(page, 'pagetable', 3);
  for (const target of ['learn', 'explore']) {
    if (target === 'explore') { await page.click('[data-mode=explore]'); await page.click('[data-level=sm]'); await page.click('#labels-btn'); await page.waitForTimeout(300); }
    const leaks = await page.evaluate(re => {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement; if (!el || !el.offsetParent || el.closest('[lang=zh-CN]')) continue;
        if (new RegExp(re).test(n.textContent)) out.push(n.textContent.trim().slice(0, 60));
      }
      for (const el of document.querySelectorAll('[aria-label],[title]')) for (const attr of ['aria-label', 'title']) { const v = el.getAttribute(attr); if (v && new RegExp(re).test(v) && !el.closest('[lang=zh-CN]')) out.push(attr + ': ' + v.slice(0, 60)); }
      return out;
    }, CJK.source);
    assert.deepEqual(leaks, [], `Chinese text left in English UI (${target})`);
  }
  const labels = await page.evaluate(() => [...document.querySelectorAll('.hardware-label')].map(n => n.textContent));
  assert.ok(labels.length && labels.every(l => !/[㐀-鿿]/.test(l)), '3D labels are English');
  const surface = await page.evaluate(() => window.GpuExplorer3D.getComponents().length);
  assert.ok(surface > 20);
  assert.match((await app(page)).hash, /lang=en/);
  assert.equal(await page.evaluate(() => localStorage.getItem('gpu-explorer-lang')), 'en');
  await page.goto(BASE, { waitUntil: 'load' }); await page.waitForFunction(() => window.GpuExplorer3D);
  assert.equal((await app(page)).lang, 'en', 'saved language survives a reload without the URL parameter');
  await page.click('.lang-switch [data-lang=zh]');
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN' && /[㐀-鿿]/.test(document.getElementById('step-title').textContent));
  noProblems(problems); await context.close();
});

test('English browsers start in English; storage failures fall back safely', async () => {
  const { page, context, problems } = await open('', { locale: 'en-US' });
  assert.equal((await app(page)).lang, 'en');
  assert.ok(!CJK.test((await app(page)).title));
  await context.close();
  const blocked = await browser.newContext({ locale: 'en-US' }); live.add(blocked);
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const p2 = await blocked.newPage(); const errs = []; p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(BASE + '#lang=zh', { waitUntil: 'load' }); await p2.waitForFunction(() => window.GpuExplorer3D);
  await p2.click('.lang-switch [data-lang=en]'); await p2.waitForFunction(() => document.documentElement.lang === 'en');
  assert.deepEqual(errs, []); noProblems(problems); await blocked.close();
});

test('URL hash restores walkthrough, model, step and language; bad values are normalised', async () => {
  const { page, context, problems } = await open('j=pixel&m=a100&s=4&mode=learn&lang=en');
  await checkStep(page, 'pixel', 4);
  assert.equal((await scene(page)).model, 'a100'); assert.equal((await app(page)).lang, 'en');
  await page.evaluate(() => { location.hash = '#j=stacking&m=h100&s=6&mode=learn&lang=zh'; });
  await checkStep(page, 'stacking', 6); assert.equal((await app(page)).lang, 'zh-CN');
  await page.evaluate(() => { location.hash = '#j=nope&m=rtx&s=99&mode=explore&level=moon&part=ghost&x=500'; });
  await page.waitForFunction(() => document.body.dataset.mode === 'explore');
  const s = await scene(page); assert.equal(s.model, 'h100'); assert.equal(s.level, 'board');
  noProblems(problems); await context.close();
});

test('explore link restores level, part and explosion', async () => {
  const { page, context, problems } = await open('j=gemm&m=h100&mode=explore&level=package&part=interposer&x=60');
  await page.waitForFunction(() => document.getElementById('scene3d').dataset.level === 'package');
  await page.waitForFunction(() => document.getElementById('component-name').textContent.length > 0);
  assert.equal((await scene(page)).selected, 'interposer');
  assert.equal(await page.inputValue('#explode-slider'), '60');
  noProblems(problems); await context.close();
});

test('anatomy: every level, parts list, isolate, focus, reset, paths, labels, Escape', async () => {
  const { page, context, problems } = await open('mode=explore&level=board');
  for (const level of ['board', 'package', 'die', 'sm', 'hbm', 'power', 'interconnect']) {
    await page.click(`[data-level=${level}]`);
    await page.waitForFunction(l => document.getElementById('scene3d').dataset.level === l, level);
    await page.click('.components-section summary').catch(() => {});
    const parts = await page.$$('#component-tree button'); assert.ok(parts.length > 0, 'parts for ' + level);
    await parts[0].click();
    await page.waitForFunction(() => !document.getElementById('selection-card').hidden);
    await page.click('#isolate-btn'); await page.waitForFunction(() => document.getElementById('scene3d').dataset.isolated === 'true');
    await page.click('#focus-btn');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('selection-card').hidden && document.getElementById('scene3d').dataset.isolated === 'false');
    if (level !== 'interconnect') {
      await page.click('#paths-btn'); await page.waitForFunction(() => Number(document.getElementById('scene3d').dataset.anatomyPaths) > 0);
      assert.ok(await page.isVisible('#paths-note'));
      await shot(page, `anatomy-${level}-paths`);
      await page.click('#paths-btn'); await page.waitForFunction(() => document.getElementById('scene3d').dataset.anatomyPaths === '0');
    }
    await shot(page, `anatomy-${level}`);
    await page.click('.components-section summary').catch(() => {});
  }
  await page.click('#labels-btn'); assert.equal(await page.getAttribute('#labels-btn', 'aria-pressed'), 'true');
  await page.click('[data-level=die]'); await page.waitForTimeout(400);
  assert.ok((await page.$$eval('.hardware-label', n => n.filter(x => x.style.display !== 'none').length)) > 0, 'labels visible');
  await page.fill('#explode-slider', '100'); await page.waitForFunction(() => document.getElementById('scene3d').dataset.level === 'die' || document.getElementById('scene3d').dataset.level === 'package');
  await page.click('#home-btn'); await page.waitForFunction(() => document.getElementById('diagram').dataset.explode === '0.000');
  noProblems(problems); await context.close();
});

test('anatomy: click and double-click on the model select and enter parts', async () => {
  const { page, context, problems } = await open('mode=explore&level=board');
  const box = await page.locator('#scene3d canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.getElementById('scene3d').dataset.selected !== '');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.getElementById('scene3d').dataset.level !== 'board');
  noProblems(problems); await context.close();
});

test('keyboard: arrows and Space drive steps; F/I/R in anatomy; dialogs trap and close', async () => {
  const { page, context, problems } = await open('j=gemm&s=0&mode=learn');
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('ArrowRight'); await waitStep(page, 'gemm', 1);
  await page.keyboard.press('ArrowRight'); await waitStep(page, 'gemm', 2);
  await page.keyboard.press('ArrowLeft'); await waitStep(page, 'gemm', 1);
  await page.click('#overview [data-step="7"]'); await waitStep(page, 'gemm', 7);
  const rev = (await app(page)).revision; await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
  assert.equal((await app(page)).revision, rev, 'ArrowRight on the last step does nothing');
  await page.locator('#step-title').click();
  await page.keyboard.press('Space'); await page.waitForFunction(() => document.body.dataset.playback === 'sequence');
  await page.keyboard.press('Space'); await page.waitForFunction(() => document.body.dataset.playback !== 'sequence');
  await page.click('[data-mode=explore]'); await page.click('[data-level=package]');
  await page.click('.components-section summary'); await page.click('#component-tree button >> nth=0'); await page.locator('#explore-title').click();
  await page.keyboard.press('i'); await page.waitForFunction(() => document.getElementById('scene3d').dataset.isolated === 'true');
  await page.keyboard.press('r'); await page.waitForFunction(() => document.getElementById('scene3d').dataset.isolated === 'false');
  await page.click('#help-btn'); assert.ok(await page.isVisible('#help-dialog'));
  await page.keyboard.press('Escape'); assert.ok(!(await page.isVisible('#help-dialog')));
  await page.click('#sources-btn'); assert.ok(await page.isVisible('#sources-dialog'));
  await page.click('#sources-dialog .dialog-close'); assert.ok(!(await page.isVisible('#sources-dialog')));
  noProblems(problems); await context.close();
});

test('compare panel shows both products', async () => {
  const { page, context, problems } = await open('mode=explore&level=board');
  await page.selectOption('#compare-select', 'a100');
  await page.waitForSelector('#compare-diagram table');
  const text = await page.textContent('#compare-diagram'); assert.match(text, /132/); assert.match(text, /108/); assert.match(text, /3\.35 TB\/s/);
  await page.click('#compare-close'); assert.ok(await page.isHidden('#compare-diagram'));
  noProblems(problems); await context.close();
});

for (const [width, height] of [[375, 812], [768, 1024]]) test(`${width}px: layout fits, controls reachable, a full walkthrough by chips`, async () => {
  const { page, context, problems } = await open('j=stacking&s=0&mode=learn', { viewport: { width, height } });
  await noOverflow(page);
  assert.ok(await page.isVisible('#overview'), 'step chips visible');
  for (let i = 0; i < 8; i++) {
    await page.locator(`#overview [data-step="${i}"]`).click();
    await checkStep(page, 'stacking', i);
    await noOverflow(page);
  }
  await shot(page, `mobile-${width}`);
  await page.click('[data-journey=pagetable]'); await checkStep(page, 'pagetable', 0);
  await page.locator('#next-btn').scrollIntoViewIfNeeded(); await page.locator('#next-btn').click(); await checkStep(page, 'pagetable', 1);
  await page.click('.lang-switch [data-lang=en]'); await page.waitForFunction(() => document.documentElement.lang === 'en');
  await noOverflow(page); await shot(page, `mobile-${width}-en`);
  await page.click('[data-mode=explore]'); await page.click('[data-level=sm]');
  await page.waitForFunction(() => document.getElementById('scene3d').dataset.level === 'sm'); await noOverflow(page);
  await shot(page, `mobile-${width}-sm`);
  noProblems(problems); await context.close();
});

test('reduced motion: steps complete immediately and nothing loops', async () => {
  const { page, context, problems } = await open('j=gemm&s=5&mode=learn', { reducedMotion: 'reduce' });
  await page.waitForFunction(() => Number(document.getElementById('journey-lab').dataset.progress) >= 1);
  assert.equal(await page.textContent('[data-lab-acc]'), '19');
  noProblems(problems); await context.close();
});

// ---------------- runner ----------------
let passed = 0, failed = 0;
const selected = tests.filter(t => !grep || grep.test(t.name));
for (const t of selected) {
  const started = Date.now();
  try { await t.fn(); passed++; console.log(`ok   ${t.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`); }
  catch (error) { failed++; console.log(`FAIL ${t.name}\n     ${String(error.stack || error).split('\n').slice(0, 6).join('\n     ')}`); }
  finally { for (const c of [...live]) await c.close().catch(() => {}); }
}
await browser.close(); server?.close();
console.log(`\n${passed} passed, ${failed} failed (${selected.length} e2e tests)`);
process.exitCode = failed ? 1 : 0;
