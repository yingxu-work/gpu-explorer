// Check that the displayed teaching examples are mathematically consistent.
var assert = require('assert');
var L = require('../journey-lab.js');
var passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

test('matrix arithmetic gives the canonical rectangular product', function () {
  assert.deepStrictEqual(L.multiply([[1,2,3],[4,5,6]], [[7,8],[9,10],[11,12]]), [[58,64],[139,154]]);
  assert.throws(function () { L.multiply([[1,2]], [[3,4]]); }, /Incompatible/);
});
test('C[3,7] comes from exactly A row 3 and B column 7', function () {
  var M = L.GEMM;
  assert.strictEqual(M.A.length,4);
  assert.strictEqual(M.B[0].length,8);
  assert.deepStrictEqual(M.A[3],[2,1,3,2,4,1,2,3]);
  assert.deepStrictEqual(M.B.map(function(row){return row[7];}),[1,3,2,4,1,2,3,2]);
  assert.strictEqual(M.C[3][7],37);
  assert.strictEqual(M.result,37);
  assert.deepStrictEqual(M.trace.map(function(t){return t.product;}),[2,3,6,8,4,2,6,6]);
});
test('two K-tiles produce 19 then 37 without double counting', function () {
  var result = [];
  [0,.21,.41,.61,1].forEach(function(p){result.push(L.accumulation(5,p).value);});
  assert.deepStrictEqual(result,[0,2,5,11,19]);
  result = [];
  [0,.21,.41,.61,1].forEach(function(p){result.push(L.accumulation(6,p).value);});
  assert.deepStrictEqual(result,[19,23,25,31,37]);
  assert.strictEqual(L.accumulation(6,1).complete,true);
  assert.strictEqual(L.accumulation(7,0).value,37);
  assert.strictEqual(L.accumulation(3,.9).value,0);
});
test('scrubbing clamps at numerical boundaries', function () {
  assert.strictEqual(L.accumulation(5,-10).value,0);
  assert.strictEqual(L.accumulation(6,100).value,37);
  assert.strictEqual(L.accumulation(5,NaN).value,0);
});
test('GPU virtual address splits into the Hopper GMMU fields and recombines exactly', function () {
  var f = L.gpuAddressFields(BigInt('0x7f3ac2d64a40'));
  assert.deepStrictEqual(f, { pd4: 0, pd3: 0, pd2: 508, pd1: 470, pd0: 22, offset: 0x164a40 });
  var rebuilt = (BigInt(f.pd4) << 56n) + (BigInt(f.pd3) << 47n) + (BigInt(f.pd2) << 38n) + (BigInt(f.pd1) << 29n) + (BigInt(f.pd0) << 21n) + BigInt(f.offset);
  assert.strictEqual(rebuilt, BigInt('0x7f3ac2d64a40'));
  var top = (1n << 57n) - 1n, all = L.gpuAddressFields(top);
  assert.deepStrictEqual([all.pd4, all.pd3, all.pd2, all.pd1, all.pd0, all.offset], [1, 511, 511, 511, 255, (1 << 21) - 1], 'field widths 1/9/9/9/8/21 bits');
  assert.throws(function () { L.gpuAddressFields(1n << 57n); });
  assert.strictEqual(L.physicalAddress(L.PAGE.pageBase, L.PAGE.va, 21).toString(16), '24e164a40');
  assert.strictEqual(BigInt(L.PAGE.pageBase) % (1n << 21n), 0n, '2 MiB pages are 2 MiB aligned');
});
test('lab numbers agree with the step text in state.js', function () {
  var S = require('../state.js');
  assert.strictEqual(S.ADDRESS.physical, L.PAGE.physical);
  S.ADDRESS.fields.forEach(function (f) { assert.strictEqual(L.PAGE.fields[f.id], f.index, f.id); });
  assert.ok(S.JOURNEYS.pagetable.steps[5].trace.indexOf(L.PAGE.physical) >= 0);
  assert.ok(S.JOURNEYS.pagetable.steps[3].body.en.indexOf('PD2[508]') >= 0);
  assert.ok(S.JOURNEYS.pagetable.steps[4].body.en.indexOf('PD1[470]') >= 0 && S.JOURNEYS.pagetable.steps[4].body.en.indexOf('PD0[22]') >= 0);
  assert.ok(Math.abs(L.perLineRate(3.35e12, 5, 1024) / 1e9 - 5.2) < .05, 'H100 ≈ 5.2 Gb/s per line');
  assert.ok(Math.abs(L.perLineRate(2.039e12, 5, 1024) / 1e9 - 3.2) < .05, 'A100 ≈ 3.2 Gb/s per line');
  assert.ok(S.JOURNEYS.stacking.steps[3].hardware.en.indexOf('5.2 Gb/s') >= 0);
  var rgb = L.barycentricColor([.2, .5, .3], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).map(function (x) { return Math.round(x * 255); });
  assert.deepStrictEqual(rgb, [51, 128, 77]);
  assert.ok(S.JOURNEYS.pixel.steps[6].body.en.indexOf('(51, 128, 77)') >= 0);
});
test('RGB interpolation preserves barycentric normalization and primary contributions', function () {
  assert.deepStrictEqual(L.barycentricColor([.2,.5,.3],[[1,0,0],[0,1,0],[0,0,1]]),[.2,.5,.3]);
  assert.deepStrictEqual(L.barycentricColor([0,1,0],[[1,0,0],[0,1,0],[0,0,1]]),[0,1,0]);
});
var JOURNEYS = ['gemm', 'pagetable', 'pixel', 'stacking'];
var CJK = /[　-〿㐀-鿿＀-￯]/;
function text(html) { return html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' '); }
function pick(v, lang) { return v && typeof v === 'object' ? v[lang] : v; }

test('every step of every walkthrough draws a figure in both languages', function () {
  JOURNEYS.forEach(function (journey) {
    for (var step = 0; step < 8; step++) ['h100', 'a100'].forEach(function (model) {
      var zh = L.markup(journey, step, model, 'zh'), en = L.markup(journey, step, model, 'en');
      assert.ok(zh.length > 200 && en.length > 200, journey + ' ' + step);
      assert.notStrictEqual(zh, en, journey + ' ' + step + ' is translated');
      assert.ok(!CJK.test(en), journey + ' ' + step + ' English figure has Chinese text: ' + (en.match(CJK) || [''])[0]);
      assert.ok(/[一-鿿]/.test(text(zh)), journey + ' ' + step + ' Chinese figure has Chinese text');
      assert.ok(!/[!！]/.test(text(zh) + text(en)), journey + ' ' + step + ' has no exclamation marks');
      assert.ok(!/undefined|NaN|\[object/.test(zh + en), journey + ' ' + step + ' has no leaked value');
    });
  });
});
test('figure text is at least 11px and uses no gradients or glow', function () {
  var sizes = (L.STYLE.match(/font(?:-size)?:\s*(\d+)px/g) || []).map(function (m) { return Number(m.match(/(\d+)px/)[1]); });
  assert.ok(sizes.length > 5);
  sizes.forEach(function (px) { assert.ok(px >= 11, px + 'px text'); });
  JOURNEYS.forEach(function (journey) {
    for (var step = 0; step < 8; step++) (L.markup(journey, step, 'h100', 'en').match(/font-size="(\d+(?:\.\d+)?)"/g) || []).forEach(function (m) {
      assert.ok(Number(m.match(/"([\d.]+)"/)[1]) >= 11, journey + ' ' + step + ' ' + m);
    });
  });
  assert.ok(!/gradient|box-shadow|text-shadow|letter-spacing|uppercase/.test(L.STYLE));
});
test('the figure only moves with step progress: there is no looping animation', function () {
  assert.strictEqual(L.setVisualPhase, undefined);
  assert.strictEqual(L.visualState, undefined);
  assert.ok(!/@keyframes|animation:/.test(L.STYLE));
});
test('the same example stays on screen for all eight matrix steps', function () {
  for (var step = 0; step < 8; step++) {
    var html = L.markup('gemm', step, 'h100', 'en');
    assert.ok(html.indexOf('C[3,7]') >= 0, 'step ' + step + ' names the target');
    assert.strictEqual((html.match(/data-lab-p="/g) || []).length, 8, 'step ' + step + ' keeps all eight products');
    assert.strictEqual(html.indexOf('data-lab-acc') >= 0, step >= 5, 'the accumulator appears once the Tensor Core runs');
    assert.strictEqual(/Round 1/.test(html), step >= 2, 'rounds are named from the step that introduces them');
    assert.strictEqual((html.match(/data-lab-round="/g) || []).length, step >= 2 ? 2 : 1, 'step ' + step + ': the location sits under the numbers');
    var active = L.activeRound(step);
    assert.strictEqual((html.match(/class="lab-at lab-active"/g) || []).length, active >= 0 ? 1 : 0, 'step ' + step + ': one round outlined when the step works on it');
    if (active >= 0) assert.ok(new RegExp('lab-at lab-active" data-lab-round="' + active + '"').test(html), 'step ' + step + ': the outlined round is the one the step works on');
  }
  assert.ok(L.markup('gemm', 7, 'h100', 'en').indexOf('37') >= 0);
});
test('each round of four pairs is somewhere definite at every matrix step', function () {
  var en = function (step) { return L.roundStatus(step).map(function (s) { return s.en; }); };
  assert.deepStrictEqual(en(0), en(2));
  assert.deepStrictEqual(en(3), ['HBM → shared memory', 'still in HBM']);
  assert.deepStrictEqual(en(4), ['shared memory → registers', 'still in HBM']);
  assert.strictEqual(en(5)[1], 'still in HBM');
  assert.strictEqual(en(6)[0], 'added to the accumulator');
  assert.deepStrictEqual(en(7), ['added to the accumulator', 'added to the accumulator']);
  assert.deepStrictEqual(en(-3), en(0)); assert.deepStrictEqual(en(99), en(7));
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map(L.activeRound), [-1, -1, -1, 0, 0, 0, 1, -1], 'round 1 moves in steps 4 to 6, round 2 in step 7');
  ['pagetable', 'stacking'].forEach(function (journey) {
    for (var step = 0; step < 8; step++) assert.strictEqual(/class="lab-note"/.test(L.markup(journey, step, 'h100', 'en')), step === 0, journey + ' ' + step + ': the how-to-read note is on the first step only');
  });
});
test('the running record adds one line per step and marks the current one', function () {
  ['pagetable', 'pixel', 'stacking'].forEach(function (journey) {
    assert.strictEqual(L.LOGS[journey].length, 8);
    for (var step = 0; step < 8; step++) {
      var rows = L.logRows(journey, step, 'h100');
      assert.strictEqual(rows.length, step + 1);
      assert.deepStrictEqual(rows.map(function (r) { return r.n; }), rows.map(function (_, i) { return i + 1; }));
      assert.deepStrictEqual(rows.filter(function (r) { return r.now; }).map(function (r) { return r.n; }), [step + 1]);
      rows.forEach(function (r) { ['zh', 'en'].forEach(function (lang) {
        assert.ok(String(pick(r.k, lang)).length > 1 && String(pick(r.v, lang)).length > 1, journey + ' row ' + r.n + ' ' + lang);
        if (lang === 'en') assert.ok(!CJK.test(pick(r.k, lang) + pick(r.v, lang)), journey + ' row ' + r.n);
      }); });
      var html = L.markup(journey, step, 'h100', 'en');
      assert.strictEqual((html.match(/class="lab-n"/g) || []).length, step + 1, journey + ' ' + step + ' record length');
      assert.strictEqual((html.match(/aria-current="step"/g) || []).length, 1);
    }
  });
  assert.deepStrictEqual(L.logRows('gemm', 3, 'h100'), [], 'the matrix figure carries its own record');
});
test('translation record carries the real addresses through the walk', function () {
  var rows = L.logRows('pagetable', 7, 'h100').map(function (r) { return pick(r.k, 'en') + ' ' + pick(r.v, 'en'); });
  assert.ok(rows[0].indexOf(L.PAGE.va) >= 0);
  assert.ok(/L1 TLB/.test(rows[1]) && /miss/.test(rows[1]));
  assert.ok(/shared TLB/.test(rows[2]) && /GMMU/.test(rows[2]));
  assert.ok(rows[3].indexOf('PD2[508]') >= 0);
  assert.ok(rows[4].indexOf('PD1[470]') >= 0 && rows[4].indexOf('PD0[22]') >= 0 && rows[4].indexOf(L.PAGE.pageBase) >= 0);
  assert.ok(rows[5].indexOf(L.PAGE.physical) >= 0);
  assert.ok(rows[7].indexOf('A[3,0] = ' + L.GEMM.A[3][0]) >= 0);
});
test('the address strip lights the fields each translation step uses', function () {
  assert.strictEqual(L.PAGE_BITS.length, 8);
  assert.deepStrictEqual(L.PAGE_BITS[3], [0, 1, 2], 'upper walk uses PD4, PD3, PD2');
  assert.deepStrictEqual(L.PAGE_BITS[4], [3, 4], 'lower walk uses PD1, PD0');
  assert.deepStrictEqual(L.PAGE_BITS[5], [5], 'the offset is added last');
  for (var step = 0; step < 8; step++) {
    var html = L.markup('pagetable', step, 'h100', 'en');
    assert.strictEqual((html.match(/data-field="/g) || []).length, 6, 'all six fields stay visible');
    assert.strictEqual((html.match(/class="lab-bit lab-on"/g) || []).length, L.PAGE_BITS[step].length, 'step ' + step);
    assert.ok(html.indexOf(L.PAGE.va) >= 0);
  }
});
test('the pixel figure uses the triangle the text describes', function () {
  var w = L.barycentricWeights(L.PIXEL.vertices, L.PIXEL.center);
  w.forEach(function (x, i) { assert.ok(Math.abs(x - L.PIXEL.weights[i]) < 1e-9, 'weight ' + i + ' = ' + x); });
  assert.ok(Math.abs(w[0] + w[1] + w[2] - 1) < 1e-9);
  assert.deepStrictEqual(L.PIXEL.rgb, [51, 128, 77]);
  assert.deepStrictEqual(L.PIXEL.center, [L.PIXEL.target[0] + .5, L.PIXEL.target[1] + .5]);
  assert.ok(L.barycentricWeights(L.PIXEL.vertices, [0.5, 0.5]).some(function (x) { return x < 0; }), 'a corner pixel is outside');
  assert.ok(L.markup('pixel', 1, 'h100', 'en').indexOf('<polygon') < 0, 'no triangle before the vertices are read');
  assert.ok(L.markup('pixel', 2, 'h100', 'en').indexOf('<polygon') >= 0);
  assert.ok(L.markup('pixel', 5, 'h100', 'en').indexOf('fill="rgb(51,128,77)"') < 0, 'the pixel is not coloured before it is written');
  assert.ok(L.markup('pixel', 6, 'h100', 'en').indexOf('fill="rgb(51,128,77)"') >= 0);
});
test('the package cross-section lights the parts each step is about and follows the model', function () {
  assert.strictEqual(L.STACK_ON.length, 8);
  L.STACK_ON.forEach(function (parts, step) { assert.ok(parts.length >= 1 && parts.length <= 6, 'step ' + step); });
  assert.ok(L.STACK_ON[2].indexOf('tsv') >= 0 && L.STACK_ON[4].indexOf('interposer') >= 0 && L.STACK_ON[6].indexOf('cold') >= 0);
  assert.ok(L.markup('stacking', 3, 'h100', 'en').indexOf('5.2 Gb/s') >= 0);
  assert.ok(L.markup('stacking', 3, 'a100', 'en').indexOf('3.2 Gb/s') >= 0);
  assert.ok(L.markup('stacking', 7, 'h100', 'en').indexOf('132 / 144 SMs') >= 0);
  assert.ok(L.markup('stacking', 7, 'a100', 'en').indexOf('108 / 128 SMs') >= 0);
  assert.ok(L.markup('stacking', 0, 'h100', 'en').indexOf('3.35 TB/s') >= 0 && L.markup('stacking', 0, 'a100', 'en').indexOf('2.04 TB/s') >= 0);
});
console.log('Journey lab: ' + passed + ' tests passed');
