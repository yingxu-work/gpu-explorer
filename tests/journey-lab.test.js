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
test('every non-GEMM step has three stages in both languages', function () {
  assert.deepStrictEqual(Object.keys(L.SPECS), ['pagetable','pixel','stacking']);
  Object.keys(L.SPECS).forEach(function (journey) {
    assert.strictEqual(L.SPECS[journey].length, 8);
    L.SPECS[journey].forEach(function (spec, i) {
      ['zh', 'en'].forEach(function (lang) {
        var stages = Array.isArray(spec.stages) ? spec.stages.map(function (s) { return typeof s === 'string' ? s : s[lang]; }) : spec.stages[lang].split(' · ');
        assert.strictEqual(stages.length, 3, journey + ' ' + i + ' ' + lang);
        if (lang === 'en') stages.forEach(function (s) { assert.ok(!/[㐀-鿿]/.test(s), 'English stage has no Chinese: ' + s); });
      });
    });
  });
});
Object.keys(L.SPECS).forEach(function (journey) {
  L.SPECS[journey].forEach(function (spec, step) {
    test(journey + ' step ' + (step + 1) + ': illustration loops on its own clock and freezes at equal phase', function () {
      var first = L.visualState(journey, step, .17, 1), later = L.visualState(journey, step, .67, 1);
      assert.ok(first.particles.length > 0, 'each step draws a moving signal');
      assert.notDeepStrictEqual(first.particles, later.particles, 'signals keep moving after the result is complete');
      assert.deepStrictEqual(L.visualState(journey, step, .17, 1), first, 'same phase is an exact freeze');
      assert.deepStrictEqual(L.visualState(journey, step, 3.17, 1).particles, first.particles, 'the loop repeats every cycle');
      first.particles.concat(later.particles).forEach(function (p) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert.ok(p.x >= 0 && p.x <= 340 && p.y >= 0 && p.y <= 160, 'signal stays inside the figure');
      });
      assert.notStrictEqual(first.signal, later.signal, 'the status line follows the signal');
    });
  });
});
test('translation walk visits L1 TLB, shared TLB, then the directories in order', function () {
  var at = function (step, phase) { return L.visualState('pagetable', step, phase, 1).particles[0]; };
  assert.deepStrictEqual(at(1, 0), { x: 34, y: 26 });
  assert.deepStrictEqual(at(1, .999).x > 100, true);
  assert.deepStrictEqual(at(2, .999).x > 230, true);
  assert.ok(at(4, .999).x > 300, 'lower walk ends at the 2 MiB page');
});
console.log('Journey lab: ' + passed + ' tests passed');
