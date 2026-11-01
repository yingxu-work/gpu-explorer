// Unit tests for scene-map.js (3D mapping, no WebGL needed).
// Plain Node so they also run on gpuserver's older Node.
var assert = require('assert');
var S = require('../state.js');
var M = require('../scene-map.js');
var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg || (a + ' !== ' + b)); }

test('every journey node maps to a finite 3D box inside the scene', function () {
  Object.keys(S.JOURNEYS).forEach(function (key) {
    var j = S.JOURNEYS[key];
    M.boxesFor(key, j).forEach(function (b) {
      assert.ok(isFinite(b.x) && isFinite(b.y) && isFinite(b.z), key + ':' + b.id + ' non-finite');
      assert.ok(b.w > 0 && b.h > 0 && b.d > 0, key + ':' + b.id + ' bad size');
      assert.ok(Math.abs(b.x) <= 12 && Math.abs(b.z) <= 12, key + ':' + b.id + ' out of scene');
    });
  });
});
test('stacking maps SVG y to world height, not depth', function () {
  var j = S.JOURNEYS.stacking;
  var boxes = M.boxesFor('stacking', j);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  assert.ok(byId['lid'].y > byId['substrate'].y, 'lid must be above substrate');
  assert.ok(byId['logic-top'].y > byId['logic-low'].y, 'top logic must be above low logic');
  assert.ok(byId['cut-core'].z > byId['logic-top'].z, 'side tier block must sit beside the stack');
});
test('die journeys map SVG y to depth and keep boxes on the slab', function () {
  var j = S.JOURNEYS.gemm;
  var boxes = M.boxesFor('gemm', j);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  assert.ok(byId['a-tile'].z < byId['b-tile'].z, 'A row (top of SVG) must be behind B column in depth');
  boxes.forEach(function (b) { assert.ok(b.y > 0, 'die box must sit above the slab'); });
});
test('explode moves blocks apart and clamps to [0,1]', function () {
  var j = S.JOURNEYS.gemm;
  var box = M.boxFor('gemm', j.nodes[0]);
  var p0 = M.explodePos(box, 0);
  var p1 = M.explodePos(box, 1);
  assert.ok(p1.x !== p0.x || p1.z !== p0.z, 'explode must move the block');
  var pNeg = M.explodePos(box, -5); var pBig = M.explodePos(box, 9);
  eq(pNeg.x, p0.x); eq(pBig.x, p1.x);
});
test('stacking explode separates layers vertically', function () {
  var j = S.JOURNEYS.stacking;
  var lid = M.boxFor('stacking', j.nodes.filter(function (n) { return n.id === 'lid'; })[0]);
  var sub = M.boxFor('stacking', j.nodes.filter(function (n) { return n.id === 'substrate'; })[0]);
  var gap0 = M.explodePos(lid, 0).y - M.explodePos(sub, 0).y;
  var gap1 = M.explodePos(lid, 1).y - M.explodePos(sub, 1).y;
  assert.ok(gap1 > gap0, 'explode must widen the vertical gap');
});
test('focus centroid follows the active step blocks', function () {
  var s = S.createState({});
  var j = S.currentJourney(s); var step = S.currentStep(s);
  var c = M.focusCentroid('gemm', j, step);
  assert.ok(isFinite(c.x) && isFinite(c.y) && isFinite(c.z));
  S.goto(s, 3);
  var c2 = M.focusCentroid('gemm', S.currentJourney(s), S.currentStep(s));
  assert.ok(c2.x !== c.x || c2.z !== c.z, 'focus must move when the active step changes');
});
test('step active ids always map to boxes', function () {
  Object.keys(S.JOURNEYS).forEach(function (key) {
    var j = S.JOURNEYS[key];
    var ids = {}; M.boxesFor(key, j).forEach(function (b) { ids[b.id] = true; });
    j.steps.forEach(function (step) {
      step.active.forEach(function (id) { assert.ok(ids[id], key + ' active id without a box: ' + id); });
    });
  });
});

console.log('UNIT ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
