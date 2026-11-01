// Unit tests for state.js. Plain Node (no node:test) so they also run on
// gpuserver's older Node. Run: node tests/state.test.js
var assert = require('assert');
var S = require('../state.js');
var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg || (a + ' !== ' + b)); }

test('starts at step 0, not playing', function () {
  var s = S.createState({});
  eq(s.stepIndex, 0); eq(s.playing, false); eq(S.isAtStart(s), true);
});
test('next/prev clamp at both ends', function () {
  var s = S.createState({});
  S.prev(s); eq(s.stepIndex, 0);
  for (var i = 0; i < 50; i++) S.next(s);
  eq(S.isAtEnd(s), true); eq(s.stepIndex, S.currentJourney(s).steps.length - 1);
  S.next(s); eq(s.stepIndex, S.currentJourney(s).steps.length - 1);
});
test('view switch preserves journey, model, step and selection', function () {
  var s = S.createState({ model: 'a100' });
  S.next(s); S.next(s); S.select(s, 'smem'); S.setView(s, 'data');
  eq(s.journey, 'gemm'); eq(s.model, 'a100'); eq(s.stepIndex, 2); eq(s.selected, 'smem'); eq(s.view, 'data');
});
test('model switch preserves journey, step and view', function () {
  var s = S.createState({});
  S.next(s); S.setView(s, 'timeline'); S.setModel(s, 'mi300x');
  eq(s.journey, 'gemm'); eq(s.stepIndex, 1); eq(s.view, 'timeline'); eq(s.model, 'mi300x');
});
test('journey switch resets step and selection (steps differ)', function () {
  var s = S.createState({});
  S.next(s); S.select(s, 'smem'); S.setJourney(s, 'pagetable');
  eq(s.journey, 'pagetable'); eq(s.stepIndex, 0); eq(s.selected, null);
});
test('select rejects nodes not in the current journey', function () {
  var s = S.createState({});
  S.select(s, 'pte'); eq(s.selected, null);
  S.select(s, 'smem'); eq(s.selected, 'smem');
});
test('playStep advances while playing and stops at the end', function () {
  var s = S.createState({}); s.playing = true;
  S.playStep(s); eq(s.stepIndex, 1); eq(s.playing, true);
  while (!S.isAtEnd(s)) S.playStep(s);
  S.playStep(s); eq(s.playing, false);
});
test('reset returns to start and clears play/selection', function () {
  var s = S.createState({}); S.next(s); S.select(s, 'smem'); s.playing = true;
  S.reset(s); eq(s.stepIndex, 0); eq(s.playing, false); eq(s.selected, null);
});
test('encode/decode round-trips state and rejects bad values', function () {
  var s = S.createState({ model: 'a20pro' });
  S.next(s); S.next(s); S.setView(s, 'data'); S.select(s, 'warp');
  var d = S.decodeState('#' + S.encodeState(s));
  eq(d.journey, 'gemm'); eq(d.model, 'a20pro'); eq(d.stepIndex, 2); eq(d.view, 'data'); eq(d.selected, 'warp');
  var bad = S.decodeState('#j=nope&m=nope&v=nope&s=999');
  eq(bad.journey, 'gemm'); eq(bad.model, 'h100'); eq(bad.view, 'structure');
});
test('pixel journey walks from a pixel to the framebuffer', function () {
  var s = S.createState({});
  S.setJourney(s, 'pixel');
  eq(S.currentJourney(s).title, '一个像素是怎么画出来的');
  while (!S.isAtEnd(s)) S.next(s);
  eq(S.currentStep(s).title, '显示与倒查');
  eq(S.currentJourney(s).steps.length, 8);
});
test('goto jumps and clamps', function () {
  var s = S.createState({});
  S.goto(s, 5); eq(s.stepIndex, 5); eq(s.playing, false);
  S.goto(s, 999); eq(s.stepIndex, S.currentJourney(s).steps.length - 1);
  S.goto(s, -3); eq(s.stepIndex, 0);
});
test('diagram geometry, flows, verdict and trace are consistent', function () {
  Object.keys(S.JOURNEYS).forEach(function (key) {
    var j = S.JOURNEYS[key];
    assert.ok(j.verdict && j.verdict.length > 10, key + ' needs a verdict');
    var ids = {};
    j.nodes.forEach(function (n) {
      ids[n.id] = true;
      assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= 1100 && n.y + n.h <= 520, 'node out of canvas: ' + n.id);
      assert.ok(n.detail && n.detail.length > 5, 'node needs detail: ' + n.id);
      assert.ok(['data', 'compute', 'memory', 'control'].indexOf(n.kind) >= 0, 'bad kind: ' + n.id);
    });
    (j.flows || []).forEach(function (f) {
      assert.ok(ids[f.from] && ids[f.to], 'flow endpoint missing: ' + f.from + '>' + f.to);
    });
    j.steps.forEach(function (step) {
      assert.ok(step.trace && step.trace.length > 3, 'step needs trace: ' + step.title);
      (step.flows || []).forEach(function (f) {
        var parts = f.split('>');
        assert.ok(ids[parts[0]] && ids[parts[1]], 'step flow endpoint missing: ' + f);
      });
    });
  });
});
test('predict-then-play: valid options, correct/wrong, reset clears', function () {
  var counts = {};
  Object.keys(S.PREDICTS).forEach(function (k) {
    var p = S.PREDICTS[k];
    counts[k.split(':')[0]] = (counts[k.split(':')[0]] || 0) + 1;
    assert.ok(p.q && p.options.length >= 3 && p.answer >= 0 && p.answer < p.options.length && p.explain);
  });
  Object.keys(counts).forEach(function (j) { assert.ok(counts[j] >= 2, j + ' needs >=2 predictions'); });
  var s = S.createState({});
  S.goto(s, 1);
  assert.ok(S.getPredict('gemm', 1));
  var wrong = (S.getPredict('gemm', 1).answer + 1) % 3;
  var r1 = S.predict(s, wrong); assert.strictEqual(r1.correct, false);
  var r2 = S.predict(s, S.getPredict('gemm', 1).answer); assert.strictEqual(r2.correct, true);
  assert.strictEqual(S.predict(s, 99), null);
  S.reset(s); assert.deepStrictEqual(s.predictions, {});
});
test('all journeys have steps, nodes, code and view text', function () {
  Object.keys(S.JOURNEYS).forEach(function (key) {
    var j = S.JOURNEYS[key];
    assert.ok(j.steps.length >= 7, 'journey needs >=7 steps');
    assert.ok(j.nodes.length >= 6);
    j.steps.forEach(function (step) {
      assert.ok(step.title && step.body && step.code.length >= 1);
      assert.ok(step.active.length >= 1);
      step.active.forEach(function (id) {
        assert.ok(j.nodes.some(function (n) { return n.id === id; }), 'active node must exist: ' + id);
      });
    });
    S.VIEWS.forEach(function (v) { assert.ok(j.views[v]); });
  });
  assert.ok(Object.keys(S.MODELS).length >= 6);
});

console.log('UNIT ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
