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

test('Round 12 GEMM layout is a physical floorplan, not a pipeline', function () {
  var boxes = M.boxesFor('gemm', S.JOURNEYS.gemm);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  var l2 = M.floorplanL2();
  assert.ok(byId['a-tile'].x < l2.x && byId['b-tile'].x < l2.x, 'inputs must sit at the west HBM edge, west of L2');
  assert.ok(l2.x < byId['sm'].x, 'L2 band must sit west of the SM grid');
  assert.ok(Math.abs(l2.z - byId['sm'].z) < 0.01, 'L2 band must align with the SM grid in depth');
  assert.ok(byId['sm'].x < byId['c-out'].x, 'output must sit at the east edge, east of the SM grid');
  assert.ok(Math.abs(byId['a-tile'].z + byId['b-tile'].z) < 0.01, 'A row and B column must be symmetric about the spine');
  assert.ok(byId['warp'].d < 1.0 && byId['warp'].z < byId['sm'].z - byId['sm'].d / 2, 'warp must be a narrow strip on the grid north edge');
  assert.ok(byId['smem'].d <= 1.5 && byId['smem'].z > byId['sm'].z + byId['sm'].d / 2, 'smem must be a strip on the grid front (south) edge, part of the SM tile');
  assert.ok(Math.abs(byId['smem'].x - byId['sm'].x) < 0.01 && Math.abs(byId['smem'].w - byId['sm'].w) < 0.01, 'smem strip must span the same width as the SM grid');
});
test('Round 12 SM grid tiles: regular grid inside the SM region', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0]);
  var tiles = M.smGridTiles(box);
  assert.strictEqual(tiles.length, 18, 'grid must be 6 x 3 tiles');
  tiles.forEach(function (t) {
    assert.ok(Math.abs(t.dx) + t.w / 2 <= box.w / 2 + 0.001, 'tile must fit inside the SM region in x');
    assert.ok(Math.abs(t.dz) + t.d / 2 <= box.d / 2 + 0.001, 'tile must fit inside the SM region in z');
  });
  var xs = {}; tiles.forEach(function (t) { xs[t.dx.toFixed(3)] = true; });
  var zs = {}; tiles.forEach(function (t) { zs[t.dz.toFixed(3)] = true; });
  assert.strictEqual(Object.keys(xs).length, 6, 'tiles must form 6 columns');
  assert.strictEqual(Object.keys(zs).length, 3, 'tiles must form 3 rows');
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
test('Round 10 GEMM: one framed die — flat blocks inside 20.8 x 9.6, floorplan order (Round 12)', function () {
  var boxes = M.boxesFor('gemm', S.JOURNEYS.gemm);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  boxes.forEach(function (b) {
    assert.ok(b.h >= 0.8 && b.h <= 1.15, b.id + ' must be a taller flat slab, not thin or a tower (h=' + b.h + ')');
    assert.ok(Math.abs(b.x) + b.w / 2 <= 10.5, b.id + ' must fit inside the die frame in x');
    assert.ok(Math.abs(b.z) + b.d / 2 <= 4.9, b.id + ' must fit inside the die frame in z');
  });
  assert.ok(byId['sm'].w > byId['smem'].d, 'SM grid region must be the largest block on the die');
  assert.ok(byId['c-out'].x - byId['c-out'].w / 2 > byId['sm'].x + byId['sm'].w / 2, 'output must sit right of compute with a gap');
});

test('Round 11 stacking: side blocks sit 1.0 from the column, shelf spans the gap', function () {
  var boxes = M.boxesFor('stacking', S.JOURNEYS.stacking);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  // Column face is at x +/-4.3 (column width 8.6).
  ['cut-core', 'gpu-block'].forEach(function (id) {
    var b = byId[id];
    var inner = Math.abs(b.x) - b.w / 2;
    assert.ok(Math.abs(inner - 4.3 - 1.0) < 0.01, id + ' inner edge must be 1.0 from the column face, got gap ' + (inner - 4.3));
    var sh = M.stackingShelf(b);
    var shelfInner = Math.abs(b.x + sh.dx) - sh.w / 2;
    var shelfOuter = Math.abs(b.x + sh.dx) + sh.w / 2;
    assert.ok(Math.abs(shelfInner - 4.3) < 0.01, id + ' shelf must start at the column face');
    assert.ok(Math.abs(shelfOuter - (Math.abs(b.x) + b.w / 2)) < 0.01, id + ' shelf must reach the block outer edge');
    assert.ok(Math.abs((b.y - b.h / 2) - (b.y + sh.dy + sh.h / 2)) < 0.01, id + ' shelf top must meet the block bottom');
  });
  assert.ok(byId['cut-core'].x === -byId['gpu-block'].x, 'shelf geometry must stay symmetric');
});

test('Round 11 die journeys: heights raised, footprints unchanged', function () {
  ['pagetable', 'pixel'].forEach(function (key) {
    M.boxesFor(key, S.JOURNEYS[key]).forEach(function (b) {
      assert.ok(b.h >= 1.0 && b.h <= 1.15, key + ':' + b.id + ' height must be raised flat slab (h=' + b.h + ')');
    });
  });
});

test('Round 9 GEMM: warp is a narrow dispatch strip, smem the front strip (Round 12)', function () {
  var boxes = M.boxesFor('gemm', S.JOURNEYS.gemm);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  assert.ok(byId['warp'].d < byId['sm'].d, 'warp strip must be narrower than the SM block');
  assert.ok(byId['smem'].d < byId['sm'].d, 'smem must be a strip, not a block');
});

console.log('UNIT ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
