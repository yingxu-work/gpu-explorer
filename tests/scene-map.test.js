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

test('GEMM layout reads as one pipeline, not scattered boxes', function () {
  var boxes = M.boxesFor('gemm', S.JOURNEYS.gemm);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  assert.ok(byId['a-tile'].x < byId['smem'].x, 'inputs must sit left of shared memory');
  assert.ok(byId['smem'].x < byId['warp'].x && byId['warp'].x < byId['c-out'].x, 'smem -> compute -> output must run left to right');
  assert.ok(Math.abs(byId['smem'].z) < 0.01 && Math.abs(byId['c-out'].z) < 0.01, 'smem and output must sit on the central spine');
  assert.ok(Math.abs(byId['a-tile'].z + byId['b-tile'].z) < 0.01, 'A row and B column must be symmetric about the spine');
  assert.ok(Math.abs(byId['warp'].z + byId['sm'].z) < 0.01, 'compute grid must be symmetric about the spine');
  assert.ok(byId['smem'].w > byId['warp'].w, 'shared memory must read as one distinct central block');
});
test('stacking layout is one centred column with symmetric side blocks', function () {
  var boxes = M.boxesFor('stacking', S.JOURNEYS.stacking);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  ['lid', 'logic-top', 'bond', 'logic-low', 'mem-layer', 'substrate'].forEach(function (id) {
    assert.ok(Math.abs(byId[id].x) < 0.01 && Math.abs(byId[id].z) < 0.01, id + ' must sit on the central column');
  });
  assert.ok(Math.abs(byId['cut-core'].x + byId['gpu-block'].x) < 0.01, 'side blocks must flank symmetrically');
  assert.ok(byId['cut-core'].y === byId['gpu-block'].y, 'side blocks must share logic-layer height');
});
test('chain journeys run in regular left-to-right rows', function () {
  var pt = M.boxesFor('pagetable', S.JOURNEYS.pagetable);
  var byId = {}; pt.forEach(function (b) { byId[b.id] = b; });
  var chain = ['cpu', 'tlb', 'pgd', 'pud', 'pmd', 'pte'];
  for (var i = 1; i < chain.length; i++) {
    assert.ok(byId[chain[i]].x > byId[chain[i - 1]].x, chain[i] + ' must sit right of ' + chain[i - 1]);
    assert.ok(byId[chain[i]].z === byId[chain[i - 1]].z, 'chain row must share one depth');
  }
  var px = M.boxesFor('pixel', S.JOURNEYS.pixel);
  var pxId = {}; px.forEach(function (b) { pxId[b.id] = b; });
  assert.ok(pxId['tex'].x === pxId['shader'].x, 'texture must sit under the shader');
  assert.ok(pxId['pixel'].x === pxId['fb'].x, 'target pixel must sit under the frame buffer');
});


test('Round 9 palette: one fixed colour per hardware family', function () {
  eq(M.KIND_COLOR.compute, 0x89b4fa);
  eq(M.KIND_COLOR.memory, 0x94e2d5);
  eq(M.KIND_COLOR.data, 0xfab387);
  eq(M.KIND_COLOR.control, 0x9b9ba4);
  assert.ok(M.TENSOR_COLOR !== M.KIND_COLOR.compute, 'tensor tile must be a darker shade, not a new hue');
});
test('Round 9 SM detail: 4 subpartitions, tensor + scheduler + register each, shared strip at front', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0]);
  var d = M.smDetails(box);
  function byRole(r) { return d.filter(function (x) { return x.role === r; }); }
  eq(byRole('subpartition').length, 4);
  eq(byRole('tensor').length, 4);
  eq(byRole('scheduler').length, 4);
  eq(byRole('register').length, 4);
  eq(byRole('shared-strip').length, 1);
  byRole('scheduler').forEach(function (x) { assert.ok(x.d < 0.5, 'scheduler must be a narrow strip, not a block'); });
  assert.ok(byRole('shared-strip')[0].dz > box.d / 2, 'shared strip must sit at the SM front face');
  assert.ok(byRole('tensor')[0].color !== M.KIND_COLOR.compute, 'tensor uses the darker compute shade');
});
test('Round 9 GEMM: warp is a narrow dispatch strip, smem the wide central block', function () {
  var boxes = M.boxesFor('gemm', S.JOURNEYS.gemm);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  assert.ok(byId['warp'].d < byId['sm'].d, 'warp strip must be narrower than the SM block');
  assert.ok(byId['smem'].w > byId['warp'].w, 'smem must stay the wide central block');
});

console.log('UNIT ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
