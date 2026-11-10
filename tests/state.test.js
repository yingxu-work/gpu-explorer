// Walkthrough content and the pure domain state machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../state.js');
const I = require('../interaction-state.js');
const CJK = /[㐀-鿿]/;

test('starts at step 0 of GEMM on H100, not playing', () => {
  const s = S.createState();
  assert.equal(s.journey, 'gemm'); assert.equal(s.model, 'h100'); assert.equal(s.stepIndex, 0); assert.equal(s.playing, false);
});
test('next/prev/goto clamp at both ends; goto ignores junk', () => {
  const s = S.createState();
  S.prev(s); assert.equal(s.stepIndex, 0);
  for (let i = 0; i < 20; i++) S.next(s);
  assert.equal(s.stepIndex, 7); assert.ok(S.isAtEnd(s));
  S.goto(s, -5); assert.equal(s.stepIndex, 0);
  S.goto(s, 99); assert.equal(s.stepIndex, 7);
  S.goto(s, 'x'); assert.equal(s.stepIndex, 0);
  S.goto(s, 2.9); assert.equal(s.stepIndex, 2);
});
test('journey switch resets step and selection; model switch keeps step', () => {
  const s = S.createState(); S.goto(s, 4); S.select(s, 'smem');
  S.setModel(s, 'a100'); assert.equal(s.stepIndex, 4); assert.equal(s.selected, 'smem');
  S.setJourney(s, 'pixel'); assert.equal(s.stepIndex, 0); assert.equal(s.selected, null);
  S.setJourney(s, 'nonsense'); assert.equal(s.journey, 'pixel');
  S.setModel(s, 'rtx5090'); assert.equal(s.model, 'a100', 'only the two modelled products are accepted');
});
test('select only accepts GEMM data aliases; selectNext wraps', () => {
  const s = S.createState();
  S.select(s, 'not-a-node'); assert.equal(s.selected, null);
  S.selectNext(s, 1); assert.equal(s.selected, 'a-tile');
  S.selectNext(s, -1); assert.equal(s.selected, 'c-out');
  S.setJourney(s, 'pagetable'); S.selectNext(s, 1); assert.equal(s.selected, null);
});
test('playStep advances while playing and stops at the end', () => {
  const s = S.createState(); s.playing = true;
  for (let i = 0; i < 10; i++) S.playStep(s);
  assert.equal(s.stepIndex, 7); assert.equal(s.playing, false);
});
test('encode/decode round-trips and rejects bad values', () => {
  const s = S.createState({ journey: 'stacking', model: 'a100', compareModel: 'h100' }); S.goto(s, 5);
  const back = S.decodeState('#' + S.encodeState(s));
  assert.equal(back.journey, 'stacking'); assert.equal(back.model, 'a100'); assert.equal(back.stepIndex, 5); assert.equal(back.compareModel, 'h100');
  const bad = S.decodeState('#j=evil&m=rtx&s=999&sel=<script>&cmp=h100');
  assert.equal(bad.journey, 'gemm'); assert.equal(bad.model, 'h100'); assert.equal(bad.stepIndex, 7); assert.equal(bad.selected, null); assert.equal(bad.compareModel, null);
  assert.equal(S.decodeState('').journey, 'gemm');
  assert.equal(S.decodeState('#j=pixel&s=-3').stepIndex, 0);
});
test('compare rejects the same or unknown model; setModel to the compare model clears it', () => {
  const s = S.createState();
  S.setCompare(s, 'h100'); assert.equal(s.compareModel, null);
  S.setCompare(s, 'mi300'); assert.equal(s.compareModel, null);
  S.setCompare(s, 'a100'); assert.equal(s.compareModel, 'a100');
  S.setModel(s, 'a100'); assert.equal(s.compareModel, null);
});
test('predictions: valid options, right and wrong answers, reset clears', () => {
  for (const [key, p] of Object.entries(S.PREDICTS)) {
    const [journey, step] = key.split(':');
    assert.ok(S.JOURNEYS[journey] && S.JOURNEYS[journey].steps[Number(step)], key + ' points at a real step');
    assert.ok(p.options.length >= 3 && p.answer >= 0 && p.answer < p.options.length, key);
  }
  for (const journey of Object.keys(S.JOURNEYS)) assert.ok(Object.keys(S.PREDICTS).filter(k => k.startsWith(journey + ':')).length >= 2, journey + ' needs two quick checks');
  const s = S.createState(); S.goto(s, 1);
  assert.equal(S.predict(s, 0).correct, false); assert.equal(S.predict(s, 1).correct, true); assert.equal(S.predict(s, 99), null);
  S.reset(s); assert.deepEqual(s.predictions, {});
});
test('every step names where it happens on the 3D model', () => {
  for (const [key, journey] of Object.entries(S.JOURNEYS)) {
    assert.equal(journey.steps.length, 8, key);
    journey.steps.forEach((step, i) => {
      assert.ok(I.LEVELS.includes(step.level), `${key} ${i + 1}: level`);
      const guide = S.guideFor(key, i);
      assert.equal(guide.level, step.level); assert.ok(guide.explode >= 0 && guide.explode <= 1);
      assert.ok(['three-quarter', 'top', 'side'].includes(guide.camera));
    });
    assert.ok(new Set(journey.steps.map(s => s.level)).size >= 3, key + ' moves across at least three hardware levels');
  }
  assert.deepEqual(S.JOURNEYS.gemm.steps.map(s => s.level), I.GEMM_LEVELS, 'GEMM keeps its established camera path');
  assert.ok(S.JOURNEYS.stacking.steps.some(s => s.explode > .5), 'stacking takes the package apart');
});
test('step text: bilingual, sentence-length bodies, no shouting', () => {
  for (const [key, journey] of Object.entries(S.JOURNEYS)) journey.steps.forEach((step, i) => {
    for (const field of ['title', 'body', 'hardware']) {
      assert.ok(step[field].zh && step[field].en, `${key} ${i + 1} ${field}`);
      assert.ok(!CJK.test(step[field].en), `${key} ${i + 1} ${field}: English has no Chinese`);
      assert.ok(!/[!！]/.test(step[field].zh + step[field].en), 'no exclamation marks');
    }
    assert.ok(!/[.。]$/.test(step.title.zh) && !/\.$/.test(step.title.en), `${key} ${i + 1}: headings have no trailing period`);
    assert.ok(step.title.en.length <= 60 && step.title.zh.length <= 24, `${key} ${i + 1}: short heading`);
    assert.ok(step.body.zh.length <= 120 && step.body.en.length <= 300, `${key} ${i + 1}: body fits a few lines`);
    assert.ok(step.code.zh.length >= 1 && step.code.zh.length === step.code.en.length && step.code.zh.length <= 8, `${key} ${i + 1}: code`);
    assert.ok(step.code.en.every(line => !CJK.test(line)));
    assert.ok(Array.isArray(step.terms) && step.terms.length <= 3, `${key} ${i + 1}: at most three new terms`);
    step.terms.forEach(id => assert.ok(S.GLOSSARY[id], `${key} ${i + 1}: term ${id} is in the glossary`));
    assert.ok(step.chip.label.zh.length <= 6 && step.chip.label.en.length <= 10, `${key} ${i + 1}: chip label`);
    assert.ok(step.trace && step.trace.length <= 60 && !CJK.test(step.trace), 'trace is a short formula');
  });
});
test('GEMM keeps its worked numbers and separates scalar checking from MMA', () => {
  const steps = S.JOURNEYS.gemm.steps;
  assert.ok(steps[4].code.en.join('\n').includes('mma('));
  assert.ok(steps[5].code.en.join('\n').includes('for k in range(0, 4):'));
  assert.ok(steps[5].code.en.join('\n').includes('acc += A[3][k] * B[k][7]'));
  assert.ok(steps[5].trace.includes('19')); assert.ok(steps[7].trace.includes('37'));
});
test('product metadata uses shipping numbers, not the full-die maximums', () => {
  assert.match(S.MODELS.h100.note.en, /132 SMs/); assert.match(S.MODELS.h100.note.en, /50MB/); assert.match(S.MODELS.h100.note.en, /80GB HBM3/);
  assert.ok(!/144|60MB/.test(S.MODELS.h100.note.en));
  assert.match(S.MODELS.a100.note.en, /108 SMs/); assert.match(S.MODELS.a100.note.en, /HBM2e/);
  const yieldStep = S.JOURNEYS.stacking.steps[7];
  assert.match(yieldStep.body.en, /144 SMs/); assert.match(yieldStep.body.en, /132 SMs/);
});
test('address translation uses the GPU page-table layout, not a CPU one', () => {
  const text = S.JOURNEYS.pagetable.steps.map(s => s.body.en + s.hardware.en).join(' ');
  assert.ok(!/x86|CPU core|PGD|PUD|PMD/.test(text));
  assert.match(text, /GMMU/); assert.match(text, /2 MiB/);
  assert.deepEqual(S.ADDRESS.fields.map(f => f.width), [1, 9, 9, 9, 8, 21], 'Hopper GMMU field widths (57-bit VA)');
  assert.equal(S.ADDRESS.fields.reduce((n, f) => n + f.width, 0), 57);
});
test('glossary: every term has a short bilingual line and is used by a walkthrough', () => {
  const used = new Set();
  for (const key of Object.keys(S.JOURNEYS)) {
    const list = S.glossaryFor(key);
    assert.ok(list.length >= 8, `${key} has a glossary`);
    assert.equal(new Set(list.map(t => t.id)).size, list.length, `${key}: no term twice`);
    list.forEach(t => used.add(t.id));
    const seen = new Set();
    S.JOURNEYS[key].steps.forEach((step, i) => {
      assert.deepEqual(S.termsFor(key, i).map(t => t.id), step.terms);
      step.terms.forEach(id => { assert.ok(!seen.has(id), `${key} ${i + 1}: ${id} is introduced once`); seen.add(id); });
    });
  }
  for (const [id, entry] of Object.entries(S.GLOSSARY)) {
    assert.ok(used.has(id), `${id} is used`);
    for (const field of ['name', 'gloss']) {
      assert.ok(entry[field].zh && entry[field].en, `${id} ${field}`);
      assert.ok(!CJK.test(entry[field].en), `${id} ${field}: English has no Chinese`);
      assert.ok(!/[!！]/.test(entry[field].zh + entry[field].en));
    }
    assert.ok(entry.gloss.zh.length <= 48 && entry.gloss.en.length <= 120, `${id}: one short line`);
  }
  assert.deepEqual(S.termsFor('nope', 0), []); assert.deepEqual(S.glossaryFor('nope'), []);
});
test('one name per thing: the walkthroughs do not mix synonyms', () => {
  const text = Object.values(S.JOURNEYS).flatMap(j => j.steps.flatMap(s => [s.title, s.body, s.hardware, s.chip.label, s.chip.gloss]));
  const zh = text.map(t => t.zh).join('\n'), en = text.map(t => t.en).join('\n');
  assert.ok(!/L2 TLB/.test(zh + en + S.JOURNEYS.pagetable.steps.map(s => s.trace + s.code.en.join(' ')).join(' ')), 'the second TLB is always the shared TLB');
  assert.ok(!/GEMM|lane\b|\[3\]\[/.test(zh + en), 'no GEMM, lane or A[3][0] notation in prose');
  assert.ok(!/点任意一项|Click any term/.test(zh + en), 'the text does not point at controls that are not there');
});

test('each walkthrough has its own title, distinct from its step titles', () => {
  const titles = Object.values(S.JOURNEYS).map(j => j.title.zh);
  assert.equal(new Set(titles).size, titles.length);
  for (const [key, j] of Object.entries(S.JOURNEYS)) for (const step of j.steps) {
    assert.notEqual(step.title.zh, j.title.zh, `${key}: a step title was copied over the walkthrough title`);
    assert.notEqual(step.title.en, j.title.en);
  }
  assert.deepEqual(Object.values(S.JOURNEYS).map(j => j.title.en), ['One matrix multiply', 'One address translation', 'One pixel’s journey', 'Why the chips are stacked']);
});
