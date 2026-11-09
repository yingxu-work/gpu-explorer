// Every user-facing string exists in Chinese and English, and the static page,
// the controller and the 3D scene only use keys that exist.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from '../three/three.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const I18N = require('../i18n.js');
const S = require('../state.js');
const LAB = require('../journey-lab.js');
const context = new Proxy({}, { get: (o, k) => k in o ? o[k] : (() => {}), set: (o, k, v) => (o[k] = v, true) });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const { createHardwareModel, getSMResourceLegend } = await import('../hardware-model.js');
const { lessonPresentation, anatomyPaths, FLOW_PHASES } = await import('../teaching-flow.js');
const CJK = /[㐀-鿿]/;
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Walk any data structure. Chinese may only appear under a `zh` key; every
// {zh, en} pair must be complete and its English free of Chinese.
function audit(value, where, problems, underZh = false, seen = new Set()) {
  if (value == null || typeof value === 'function') return;
  if (typeof value === 'string') { if (CJK.test(value) && !underZh) problems.push(`${where}: untranslated "${value.slice(0, 40)}"`); return; }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value.isObject3D || value.isMaterial || value.isTexture || value.isBufferGeometry) return;
  if ('zh' in value || 'en' in value) {
    const zh = value.zh, en = value.en;
    const empty = v => v == null || (typeof v === 'string' ? !v.trim() : Array.isArray(v) ? !v.length : false);
    if (empty(zh) || empty(en)) problems.push(`${where}: missing ${empty(zh) ? 'zh' : 'en'}`);
    if (Array.isArray(zh) !== Array.isArray(en)) problems.push(`${where}: zh/en shape differs`);
    if (Array.isArray(zh) && zh.length !== en.length) problems.push(`${where}: zh/en line counts differ`);
    audit(zh, where + '.zh', problems, true, seen);
    const enText = Array.isArray(en) ? en.join(' ') : String(en ?? '');
    if (CJK.test(enText)) problems.push(`${where}: Chinese inside English "${enText.slice(0, 40)}"`);
    if (/[!！]/.test(String(zh) + enText)) problems.push(`${where}: exclamation mark`);
    return;
  }
  for (const [k, v] of Object.entries(value)) if (k !== 'group' && k !== 'parent') audit(v, `${where}.${k}`, problems, underZh, seen);
}

test('UI dictionary: every key has both languages; English has no Chinese', () => {
  const problems = [];
  for (const [key, entry] of Object.entries(I18N.STRINGS)) {
    assert.ok(entry.zh?.trim() && entry.en?.trim(), key);
    assert.ok(!CJK.test(entry.en), key + ' English contains Chinese');
    const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
    assert.equal(vars(entry.zh), vars(entry.en), key + ': same placeholders');
  }
  audit(I18N.STRINGS, 'STRINGS', problems);
  assert.deepEqual(problems, []);
});

test('walkthrough content, quick checks and models are fully bilingual', () => {
  const problems = [];
  audit(S.JOURNEYS, 'JOURNEYS', problems); audit(S.PREDICTS, 'PREDICTS', problems); audit(S.MODELS, 'MODELS', problems);
  assert.deepEqual(problems, []);
});

test('3D component names, descriptions and legends are bilingual for both models', () => {
  for (const model of ['h100', 'a100']) {
    const hw = createHardwareModel(THREE, model), problems = [];
    for (const c of Object.values(hw.components)) {
      assert.ok(c.label?.zh && c.label?.en, `${model} ${c.id}: label`);
      assert.ok(c.description?.zh && c.description?.en, `${model} ${c.id}: description`);
      audit({ label: c.label, description: c.description, shortLabel: c.shortLabel, precisionNote: c.precisionNote }, `${model}.${c.id}`, problems);
    }
    audit(getSMResourceLegend(model), model + '.legend', problems);
    audit(hw.hbmDetail.specification, model + '.hbm', problems);
    const surface = []; hw.root.traverse(o => { if (o.userData.surfaceLabel) surface.push(o.userData.surfaceLabel.source); });
    audit(surface, model + '.surfaceLabels', problems);
    assert.deepEqual(problems, []);
  }
});

test('overlay titles, notes and marker labels are bilingual for every step and level', () => {
  const problems = [];
  audit(FLOW_PHASES, 'FLOW_PHASES', problems);
  for (const [journey, data] of Object.entries(S.JOURNEYS)) data.steps.forEach((step, i) => {
    for (const model of ['h100', 'a100']) audit(lessonPresentation(step.level, i, model, journey), `${journey}.${i}.${model}`, problems);
  });
  for (const level of ['board', 'package', 'die', 'sm', 'hbm', 'power', 'interconnect']) audit(anatomyPaths(level), 'paths.' + level, problems);
  assert.deepEqual(problems, []);
});

test('worked-example panels render without Chinese in English, and with it in Chinese', () => {
  const problems = [];
  audit(LAB.SPECS, 'lab', problems);
  assert.deepEqual(problems, []);
});

// Static sources: Chinese text may only appear as the zh half of L(zh, en),
// code(zh, en) or a dictionary entry. Everything else must go through keys.
// Remove every L(zh, en) / code(zh, en) call (balanced, string-aware) and dictionary zh: entries.
function stripCalls(source, name) {
  let out = '', i = 0;
  const re = new RegExp('\\b' + name + '\\(', 'g');
  for (let m; (m = re.exec(source));) {
    let depth = 0, j = m.index + name.length, quote = null, args = 0;
    for (; j < source.length; j++) {
      const c = source[j];
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { depth--; if (depth === 0) break; }
      else if (c === ',' && depth === 1) args++;
    }
    if (args >= 1) { out += source.slice(i, m.index) + name + '()'; i = j + 1; re.lastIndex = j + 1; }
  }
  return out + source.slice(i);
}
function stripBilingual(source) {
  return stripCalls(stripCalls(source, 'L'), 'code').replace(/\bzh:\s*(['`])(?:\\.|(?!\1).)*\1/g, 'zh:""');
}
for (const file of ['app.js', 'state.js', 'journey-lab.js', 'teaching-flow.js', 'hardware-model.js', 'hbm-model.js', 'power-model.js', 'interconnect-model.js', 'scene3d.js', 'surface-label.js', 'surface-textures.js', 'i18n.js', 'interaction-state.js', 'selection-feedback.js']) {
  test(`${file}: no hard-coded Chinese outside bilingual pairs`, () => {
    const code = stripBilingual(read(file)).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    const lines = code.split('\n').filter(line => CJK.test(line));
    assert.deepEqual(lines.map(l => l.trim().slice(0, 80)), []);
  });
}

test('index.html: Chinese only in elements that the dictionary replaces', () => {
  const html = read('index.html'), problems = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>([^<]*)/gi)) {
    const [, closing, tag, attrs, text] = m;
    for (const a of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
      const [, name, value] = a;
      if (!CJK.test(value)) continue;
      const key = { 'aria-label': 'data-i18n-aria', title: 'data-i18n-title', content: 'data-i18n-content' }[name];
      if (!key || !attrs.includes(key + '=')) problems.push(`<${tag} ${name}="${value.slice(0, 30)}">`);
    }
    if (CJK.test(text)) {
      const owned = !closing && (/data-i18n="/.test(attrs) || /data-journey-(title|subtitle)/.test(attrs) || /lang="zh-CN"/.test(attrs) || tag === 'title');
      if (!owned) problems.push(`text after <${closing}${tag}>: ${text.trim().slice(0, 30)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every key referenced by the page and the code exists', () => {
  const keys = new Set(Object.keys(I18N.STRINGS)), used = new Set();
  for (const m of read('index.html').matchAll(/data-i18n(?:-aria|-title|-content)?="([^"]+)"/g)) used.add(m[1]);
  for (const file of ['app.js', 'scene3d.js']) for (const m of read(file).matchAll(/\bt[k]?\(\s*'([\w.]+)'/g)) used.add(m[1]);
  for (const m of read('app.js').matchAll(/t\(\s*'(level)\.'\s*\+/g)) for (const l of ['board', 'package', 'die', 'sm', 'hbm', 'power', 'interconnect']) used.add('level.' + l);
  const missing = [...used].filter(k => !k.endsWith('.') && !keys.has(k));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 60, 'the static page is driven by the dictionary');
});

test('language detection: URL beats storage beats browser; unknown falls back', () => {
  assert.equal(I18N.detect({ hash: '#lang=en', stored: 'zh', navigator: 'zh-CN' }), 'en');
  assert.equal(I18N.detect({ hash: '#j=gemm', stored: 'en', navigator: 'zh-CN' }), 'en');
  assert.equal(I18N.detect({ hash: '', stored: null, navigator: 'zh-TW' }), 'zh');
  assert.equal(I18N.detect({ hash: '', stored: null, navigator: 'en-GB' }), 'en');
  assert.equal(I18N.detect({ hash: '#lang=xx', stored: 'fr', navigator: 'de-DE' }), 'en');
  I18N.setLang('en', { persist: false }); assert.equal(I18N.t('nav.next'), 'Next');
  assert.equal(I18N.t('timeline.chip', { n: 3, label: 'Load' }), 'Step 3: Load');
  I18N.setLang('zh', { persist: false }); assert.equal(I18N.t('timeline.chip', { n: 3, label: '载入' }), '第 3 步：载入');
  assert.equal(I18N.pick({ zh: '甲', en: 'A' }), '甲'); assert.equal(I18N.pick('plain'), 'plain');
  assert.equal(I18N.t('no.such.key'), 'no.such.key');
});

test('storage access that throws does not break language switching', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.equal(I18N.detect({ hash: '', navigator: 'en-US' }), 'en');
    assert.doesNotThrow(() => I18N.setLang('en')); assert.equal(I18N.lang, 'en');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete globalThis.localStorage;
    I18N.setLang('zh', { persist: false });
  }
});
