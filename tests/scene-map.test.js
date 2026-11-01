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
test('Round 13 SM sub-cells: PC-Anatomy density, every tile subdivided, no overlaps', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0]);
  var cells = M.smTileSubCells(box);
  function byRole(r) { return cells.filter(function (c) { return c.role === r; }); }
  assert.strictEqual(cells.length, 414, '18 tiles x 23 sub-cells must be 414');
  assert.strictEqual(byRole('core').length, 216, '12 core cells per tile');
  assert.strictEqual(byRole('scheduler').length, 72, '4 scheduler segments per tile');
  assert.strictEqual(byRole('tensor').length, 54, '3 tensor segments per tile');
  assert.strictEqual(byRole('register').length, 72, '4 register segments per tile');
  cells.forEach(function (c) {
    assert.ok(Math.abs(c.dx) + c.w / 2 <= box.w / 2 + 0.001, c.role + ' must fit inside the SM region in x');
    assert.ok(Math.abs(c.dz) + c.d / 2 <= box.d / 2 + 0.001, c.role + ' must fit inside the SM region in z');
  });
  // Bands must not overlap in z within a tile: scheduler north, cores middle, tensor/register south.
  var t0 = cells.filter(function (c) { return c.tile === 0; });
  function band(role) { var cs = t0.filter(function (c) { return c.role === role; }); return { lo: Math.min.apply(null, cs.map(function (c) { return c.dz - c.d / 2; })), hi: Math.max.apply(null, cs.map(function (c) { return c.dz + c.d / 2; })) }; }
  assert.ok(band('scheduler').hi < band('core').lo, 'scheduler band must sit north of the core grid');
  assert.ok(band('core').hi < band('tensor').lo, 'core grid must sit north of the tensor band');
  assert.ok(band('tensor').hi < band('register').lo, 'tensor band must sit north of the register band');
});
test('Round 13 L2 banks, HBM layers, interconnect bus', function () {
  var l2 = M.floorplanL2();
  var banks = M.l2Banks();
  assert.strictEqual(banks.length, 6, 'L2 must be 6 banks, not one band');
  banks.forEach(function (b, i) {
    assert.ok(Math.abs(b.z - l2.z) + b.d / 2 <= l2.d / 2 + 0.001, 'bank must fit inside the L2 band');
    if (i) assert.ok(b.z > banks[i - 1].z + banks[i - 1].d / 2, 'banks must have a gap between them');
  });
  assert.strictEqual(banks.filter(function (b) { return b.shade === 1; }).length, 3, 'banks must alternate shade');
  var layers = M.hbmLayers();
  assert.strictEqual(layers.length, 6, '3 HBM layers per side');
  [-11.9, 11.9].forEach(function (tx) {
    var side = layers.filter(function (ly) { return ly.x === tx; });
    assert.strictEqual(side.length, 3, 'each side must have 3 layers');
    assert.ok(side[0].w > side[1].w && side[1].w > side[2].w, 'layers must inset monotonically');
  });
  var bus = M.interconnectBus();
  assert.strictEqual(bus.length, 5, 'bus must be 5 ribbons');
  var widths = {}; bus.forEach(function (rb) { widths[rb.d] = true; });
  assert.ok(Object.keys(widths).length > 1, 'bus ribbons must vary in width');
  bus.forEach(function (rb) {
    assert.ok(rb.x - rb.w / 2 <= -2.65 + 0.01 && rb.x + rb.w / 2 >= -1.5 - 0.01, 'bus must span L2 east edge to SM west edge');
  });
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
test('Round 17 pagetable: CPU/memory hierarchy floorplan, not a row', function () {
  var pt = M.boxesFor('pagetable', S.JOURNEYS.pagetable);
  var byId = {}; pt.forEach(function (b) { byId[b.id] = b; });
  // Core complex west, TLB immediately east of the core, page-table
  // region centre, RAM as an east flank. (Supersedes the old test
  // that required a single left-to-right row.)
  assert.ok(byId.cpu.x < byId.tlb.x, 'CPU core must sit west of its TLB');
  assert.ok(byId.tlb.x < byId.pgd.x && byId.tlb.x < byId.pte.x, 'TLB must sit west of the page-table region');
  assert.ok(byId.ram.x > byId.pte.x && byId.ram.x > byId.cache.x, 'RAM must sit east of the table region');
  assert.ok(byId.ram.d > byId.ram.w, 'RAM must be a tall flank slab, not a row cell');
  // Levels share one region x and stack north -> south in walk order.
  ['pgd', 'pud', 'pmd', 'pte', 'cache'].forEach(function (id) {
    assert.ok(byId[id].x === byId.pgd.x, id + ' must share the table region x');
  });
  assert.ok(byId.pgd.z < byId.pud.z && byId.pud.z < byId.pmd.z && byId.pmd.z < byId.pte.z, 'levels must stack PGD -> PUD -> PMD -> PTE north to south');
  assert.ok(byId.cache.z > byId.pte.z, 'cache strip must sit south of the last table level');
  // No two die blocks overlap in plan.
  pt.forEach(function (a) { pt.forEach(function (b) {
    if (a.id >= b.id) return;
    assert.ok(Math.abs(a.x - b.x) * 2 >= (a.w + b.w) || Math.abs(a.z - b.z) * 2 >= (a.d + b.d), a.id + ' must not overlap ' + b.id);
  }); });
  pt.forEach(function (b) {
    assert.ok(Math.abs(b.x) + b.w / 2 <= 10.5 && Math.abs(b.z) + b.d / 2 <= 4.9, b.id + ' must fit inside the die frame');
  });
});
test('Round 17 pixel: pipeline floorplan with a shader array region', function () {
  var px = M.boxesFor('pixel', S.JOURNEYS.pixel);
  var pxId = {}; px.forEach(function (b) { pxId[b.id] = b; });
  // Front-end west, shader array centre (largest block), back-end east column.
  assert.ok(pxId.tri.x < pxId.raster.x && pxId.raster.x < pxId.shader.x, 'geometry front-end must sit west of the shader array');
  assert.ok(pxId.shader.w > pxId.tri.w && pxId.shader.d > pxId.tri.d, 'shader must be the largest region, not an equal row cell');
  assert.ok(pxId.tex.x === pxId.shader.x, 'texture must sit under the shader');
  assert.ok(pxId.tex.z > pxId.shader.z, 'texture strip must sit south of the shader array');
  assert.ok(pxId.depth.x === pxId.fb.x && pxId.fb.x === pxId.pixel.x, 'back-end must share one east column x');
  assert.ok(pxId.depth.z < pxId.fb.z && pxId.fb.z < pxId.pixel.z, 'back-end must stack depth -> framebuffer -> target pixel north to south');
  assert.ok(pxId.pixel.d < pxId.fb.d, 'target pixel (display tile) must differ from the framebuffer block');
  px.forEach(function (a) { px.forEach(function (b) {
    if (a.id >= b.id) return;
    assert.ok(Math.abs(a.x - b.x) * 2 >= (a.w + b.w) || Math.abs(a.z - b.z) * 2 >= (a.d + b.d), a.id + ' must not overlap ' + b.id);
  }); });
  px.forEach(function (b) {
    assert.ok(Math.abs(b.x) + b.w / 2 <= 10.5 && Math.abs(b.z) + b.d / 2 <= 4.9, b.id + ' must fit inside the die frame');
  });
});
test('Round 17 detail cells: pagetable / pixel / stacking, inside parents, no A100 geometry', function () {
  function check(cells, boxes) {
    var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
    cells.forEach(function (c) {
      var p = byId[c.parent];
      assert.ok(p, 'detail cell parent must exist: ' + c.parent);
      assert.ok(Math.abs(c.dx) + c.w / 2 <= p.w / 2 + 0.001, c.role + ' must fit inside ' + c.parent + ' in x');
      assert.ok(Math.abs(c.dz) + c.d / 2 <= p.d / 2 + 0.001, c.role + ' must fit inside ' + c.parent + ' in z');
    });
  }
  var ptBoxes = M.boxesFor('pagetable', S.JOURNEYS.pagetable);
  var ptCells = M.pagetableDetailCells(ptBoxes);
  assert.strictEqual(ptCells.filter(function (c) { return c.role === 'tlb-entry'; }).length, 8, 'TLB must carry 8 entries (4x2)');
  assert.strictEqual(ptCells.filter(function (c) { return c.role === 'pt-entry'; }).length, 24, '4 table levels x 6 entries');
  assert.strictEqual(ptCells.filter(function (c) { return c.role === 'cache-line'; }).length, 6, 'cache strip must carry 6 lines');
  check(ptCells, ptBoxes);
  var pxBoxes = M.boxesFor('pixel', S.JOURNEYS.pixel);
  var pxCells = M.pixelDetailCells(pxBoxes);
  assert.strictEqual(pxCells.filter(function (c) { return c.role === 'shader-core'; }).length, 15, 'shader array must carry 15 cores (5x3)');
  assert.strictEqual(pxCells.filter(function (c) { return c.role === 'texel'; }).length, 4, 'texture strip must carry 4 texels');
  check(pxCells, pxBoxes);
  var stBoxes = M.boxesFor('stacking', S.JOURNEYS.stacking);
  var stCells = M.stackingDetailCells(stBoxes);
  assert.strictEqual(stCells.filter(function (c) { return c.role === 'top-core'; }).length, 4, 'top logic must carry 4 cores (2x2)');
  assert.strictEqual(stCells.filter(function (c) { return c.role === 'low-core'; }).length, 6, 'low logic must carry 2 big + 4 small cores');
  assert.strictEqual(stCells.filter(function (c) { return c.role === 'mem-bank'; }).length, 6, 'memory layer must carry 6 banks (3x2)');
  check(stCells, stBoxes);
  // Detail roles are journey-local: no A100 role (l0/scheduler-as-Fig.5-band etc.) leaks in.
  ptCells.concat(pxCells, stCells).forEach(function (c) {
    assert.ok(['tlb-entry', 'pt-entry', 'cache-line', 'shader-core', 'texel', 'top-core', 'low-core', 'mem-bank'].indexOf(c.role) >= 0, 'unexpected detail role: ' + c.role);
  });
});
test('Round 17 stacking: stepped cross-section, top view nests', function () {
  var boxes = M.boxesFor('stacking', S.JOURNEYS.stacking);
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  var order = ['substrate', 'mem-layer', 'logic-low', 'bond', 'logic-top', 'lid'];
  for (var i = 1; i < order.length; i++) {
    assert.ok(byId[order[i]].w <= byId[order[i - 1]].w, order[i] + ' must not be wider than the layer below');
    assert.ok(byId[order[i]].d <= byId[order[i - 1]].d, order[i] + ' must not be deeper than the layer below');
    assert.ok(byId[order[i]].y > byId[order[i - 1]].y, order[i] + ' must sit above ' + order[i - 1]);
  }
  assert.ok(byId.substrate.w > byId.lid.w, 'stepped stack must narrow from substrate to lid');
  assert.ok(byId['logic-low'].w === 8.6, 'logic-low width must stay 8.6 so the Round 11 shelf geometry is unchanged');
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

test('Round 14 A100 (GA100/Ampere, official): 7 GPC groups, L2 2 partitions, HBM 5 stacks, NVLink 12', function () {
  var groups = M.a100GpcGroups();
  assert.strictEqual(groups.length, 8, '8 GPC positions (full GA100), 7 enabled for A100');
  assert.strictEqual(groups.filter(function (g) { return g.enabled; }).length, 7, 'A100 uses 7 GPCs');
  assert.strictEqual(groups.filter(function (g) { return !g.enabled; }).length, 1, '1 disabled GPC position');
  var north = groups.filter(function (g) { return g.z < 0; });
  var south = groups.filter(function (g) { return g.z > 0; });
  assert.strictEqual(north.length, 4, 'north row 4 GPCs');
  assert.strictEqual(south.length, 4, 'south row 3 enabled + 1 disabled');
  var l2 = M.a100L2Partitions();
  assert.strictEqual(l2.length, 2, 'L2 must be 2 partitions (official Ampere text)');
  assert.ok(l2[0].x < 0 && l2[1].x > 0, 'partitions must sit left and right of the centre seam');
  assert.strictEqual(M.a100HbmStacks().length, 5, 'A100 HBM must be 5 stacks (official; full GA100 = 6)');
  assert.strictEqual(M.a100Nvlink().length, 12, 'A100 NVLink strip must be 12 segments');
  assert.strictEqual(M.a100TopStrips().length, 2, 'north edge must carry PCIe + GigaThread strips');
  var tiles = M.a100SmTiles(M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0], 'a100'));
  assert.strictEqual(tiles.length, 28, '7 enabled GPCs x 2x2 tiles = 28 tiles (teaching count, NOT 108 SMs)');
});
test('Round 14 A100 SM sub-cells: Figure 5 band order, no overlaps, inside tile', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0], 'a100');
  var cells = M.a100SmSubCells(box);
  assert.strictEqual(cells.length, 420, '28 tiles x 15 sub-cells = 420');
  function byRole(r) { return cells.filter(function (c) { return c.role === r; }); }
  assert.strictEqual(byRole('l0').length, 28, 'one L0 strip per tile');
  assert.strictEqual(byRole('scheduler').length, 28, 'one warp scheduler per tile');
  assert.strictEqual(byRole('dispatch').length, 28, 'one dispatch unit per tile');
  assert.strictEqual(byRole('register').length, 28, 'one register file per tile');
  assert.strictEqual(byRole('tensor').length, 28, 'one tensor core per tile (4 per SM in the article; one per tile here)');
  assert.strictEqual(byRole('ldst').length, 112, '4 LD/ST per tile');
  assert.strictEqual(byRole('sfu').length, 28, 'one SFU per tile');
  var t0 = cells.filter(function (c) { return c.tile === 0; });
  function band(role) { var cs = t0.filter(function (c) { return c.role === role; }); return { lo: Math.min.apply(null, cs.map(function (c) { return c.dz - c.d / 2; })), hi: Math.max.apply(null, cs.map(function (c) { return c.dz + c.d / 2; })) }; }
  assert.ok(band('l0').hi < band('scheduler').lo, 'L0 must sit north of the scheduler');
  assert.ok(band('scheduler').hi < band('dispatch').lo, 'scheduler must sit north of dispatch');
  assert.ok(band('dispatch').hi < band('register').lo, 'dispatch must sit north of the register file');
  assert.ok(band('register').hi < band('int32').lo, 'register file must sit north of the datapath row');
  assert.ok(band('int32').hi < band('ldst').lo, 'datapath row must sit north of the LD/ST+SFU foot row');
  cells.forEach(function (c) {
    assert.ok(Math.abs(c.dx) + c.w / 2 <= box.w / 2 + 0.001, c.role + ' must fit inside the SM region in x');
    assert.ok(Math.abs(c.dz) + c.d / 2 <= box.d / 2 + 0.001, c.role + ' must fit inside the SM region in z');
  });
});
test('Round 14 A100 layout differs from default and default is unchanged', function () {
  var a = {}, d = {};
  M.boxesFor('gemm', S.JOURNEYS.gemm, 'a100').forEach(function (b) { a[b.id] = b; });
  M.boxesFor('gemm', S.JOURNEYS.gemm).forEach(function (b) { d[b.id] = b; });
  assert.ok(a['sm'].z === 0 && a['smem'].z > a['sm'].z, 'A100 smem must sit south of the SM region');
  assert.ok(a['warp'].z < a['sm'].z, 'A100 warp must sit north of the SM region');
  assert.ok(a['a-tile'].x < d['a-tile'].x, 'A100 inputs must sit further west (HBM controller gap)');
  assert.ok(d['sm'].x === 2.5 && d['sm'].z === -0.9, 'default (H100 teaching) layout must be untouched by Round 14');
  assert.ok(d['smem'].z === 3.6, 'default smem position must be untouched');
});
test('Round 14 model notes are tagged by exact model, no 140B figure anywhere', function () {
  assert.ok(/GA100\/Ampere/.test(S.MODELS.a100.note), 'A100 note must tag GA100/Ampere');
  assert.ok(/GH100\/Hopper/.test(S.MODELS.h100.note), 'H100 note must tag GH100/Hopper');
  assert.ok(!/140/.test(S.MODELS.h100.note + S.MODELS.a100.note + S.MODELS.rtx5090.note), 'no 140B leak/rumor figure in model notes');
});

test('Round 11/17 die journeys: heights are raised flat slabs', function () {
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

test('Round 15 A100 colours sampled from NVIDIA Figures 4/5, model note is spec-source phrasing', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0], 'a100');
  var cells = M.a100SmSubCells(box);
  var byRole = {};
  cells.forEach(function (c) { byRole[c.role] = c.color; });
  assert.strictEqual(byRole.l0, 0x73b3dd, 'L0 must be sampled Fig.5 light blue');
  assert.strictEqual(byRole.scheduler, 0xf18712, 'Warp Scheduler must be sampled Fig.5 orange');
  assert.strictEqual(byRole.dispatch, 0x9c4a09, 'Dispatch must be sampled Fig.5 brown');
  assert.strictEqual(byRole.register, 0x205867, 'Register File must be sampled Fig.5 dark teal');
  assert.strictEqual(byRole.int32, 0x598b00, 'INT32 must be sampled Fig.5 olive');
  assert.strictEqual(byRole.fp32, 0x76b900, 'FP32 must be sampled Fig.5 lime');
  assert.strictEqual(byRole.fp64, 0x3b5d00, 'FP64 must be sampled Fig.5 dark green');
  assert.strictEqual(byRole.tensor, 0x598b00, 'Tensor Core must be sampled Fig.5 olive');
  assert.strictEqual(byRole.ldst, 0x612621, 'LD/ST must be sampled Fig.5 dark red');
  assert.strictEqual(byRole.sfu, 0x923931, 'SFU must be sampled Fig.5 red');
  var l2 = M.a100L2Partitions();
  assert.ok(l2.every(function (p) { return p.color === 0x73b3dd; }), 'L2 partitions must be sampled Fig.4 light blue');
  var tops = M.a100TopStrips();
  assert.ok(tops.every(function (t) { return t.color === 0xf3913f; }), 'PCIe + GigaThread must be sampled Fig.4 orange');
  var boxes = {}; M.boxesFor('gemm', S.JOURNEYS.gemm, 'a100').forEach(function (b) { boxes[b.id] = b; });
  assert.strictEqual(boxes.sm.color, 0x598b00, 'A100 SM region must be Fig.4 SM green');
  assert.strictEqual(boxes.smem.color, 0x73b3dd, 'A100 Shared Memory must be Fig.5 192KB light blue');
  assert.strictEqual(boxes.warp.color, 0xf18712, 'A100 warp must be Fig.5 Warp orange');
  assert.ok(/规格来源/.test(S.MODELS.a100.note), 'A100 note must say spec source, not imply this site is official');
  assert.ok(!/A100（GA100\/Ampere，官方）/.test(S.MODELS.a100.note), 'A100 note must not use bare official phrasing');
});


test('Round 16 A100 micro-proportions: package, L2, HBM, NVLink, top strips', function () {
  var boxes = {}; M.boxesFor('gemm', S.JOURNEYS.gemm, 'a100').forEach(function (b) { boxes[b.id] = b; });
  var l2 = M.a100L2Partitions();
  assert.strictEqual(l2.length, 2, 'L2 must stay 2 partitions');
  assert.ok(l2[0].d < 1.2, 'L2 band must be slimmer than Round 14');
  var gpcs = M.a100GpcGroups();
  var rowH = gpcs[0].d;
  assert.ok(l2[0].d / rowH < 0.45, 'L2 height must be under half a GPC row (Fig.4 ratio)');
  assert.ok(Math.abs((l2[1].x - l2[1].w / 2) - (l2[0].x + l2[0].w / 2) - 0.20) < 0.01, 'L2 seam must be 0.20');
  var hbm = M.a100HbmStacks();
  assert.strictEqual(hbm.length, 5, 'HBM must stay 5 stacks');
  hbm.forEach(function (st) {
    var outer = Math.abs(st.x) + st.w / 2;
    assert.ok(outer < 12.6, 'HBM outer edge must sit near the die edge, not as a separate board');
    var innerGap = Math.abs(st.x) - st.w / 2 - 10.4;
    assert.ok(innerGap > -0.1 && innerGap < 0.5, 'HBM inner edge must sit at the die edge (gap ~0)');
  });
  var nv = M.a100Nvlink();
  assert.strictEqual(nv.length, 12, 'NVLink must stay 12 segments');
  assert.ok(nv[1].x - nv[0].x - nv[0].w < 0.25, 'NVLink gaps must be small, segments wide');
  assert.ok(nv[0].x < -9 && nv[11].x > 9, 'NVLink must span the die width symmetrically');
  var tops = M.a100TopStrips();
  var warp = boxes.warp;
  tops.forEach(function (ts) {
    assert.ok(ts.z + ts.d / 2 < warp.z - warp.d / 2, 'top strips must not overlap the warp strip');
  });
  var tiles = M.a100SmTiles(boxes.sm);
  assert.strictEqual(tiles.length, 28, 'tile count must stay 28');
  assert.ok(tiles.every(function (tl) { return tl.w > tl.d; }), 'SM tiles must stay wider than deep (Fig.5 tile aspect)');
});

test('Piece 2 H100 (GH100/Hopper, official): 8 GPC groups, L2 2 partitions, HBM 5 active stacks, NVLink 18', function () {
  var groups = M.h100GpcGroups();
  assert.strictEqual(groups.length, 8, 'full GH100 must have 8 GPCs, all enabled');
  assert.strictEqual(groups.filter(function (g) { return g.enabled; }).length, 8, 'no disabled GPC position in full GH100');
  assert.strictEqual(groups.filter(function (g) { return g.z < 0; }).length, 4, 'north row 4 GPCs');
  assert.strictEqual(groups.filter(function (g) { return g.z > 0; }).length, 4, 'south row 4 GPCs');
  var l2 = M.h100L2Partitions();
  assert.strictEqual(l2.length, 2, 'L2 must be 2 partitions (official Hopper text)');
  assert.ok(l2[0].x < 0 && l2[1].x > 0, 'partitions must sit left and right of the centre seam');
  var hbm = M.h100HbmStacks();
  assert.strictEqual(hbm.length, 5, 'shipping H100 SXM uses five active HBM3 stacks');
  assert.strictEqual(hbm.filter(function (s) { return s.x < 0; }).length, 3, 'west flank 3 stacks as drawn in Figure 3');
  assert.strictEqual(hbm.filter(function (s) { return s.x > 0; }).length, 2, 'east flank has two active stacks in the schematic');
  hbm.forEach(function (st) {
    var outer = Math.abs(st.x) + st.w / 2;
    assert.ok(outer < 12.6, 'HBM outer edge must sit near the die edge');
  });
  var nv = M.h100Nvlink();
  assert.strictEqual(nv.length, 18, 'H100 NVLink strip must be 18 segments (counted from Figure 3)');
  assert.ok(nv[1].x - nv[0].x - nv[0].w < 0.25, 'NVLink gaps must be small, segments wide');
  assert.ok(nv[0].x < -9 && nv[17].x > 9, 'NVLink must span the die width symmetrically');
  var tops = M.h100TopStrips();
  assert.strictEqual(tops.length, 2, 'north edge must carry PCIe + GigaThread strips');
  assert.strictEqual(tops[0].color, 0x404040, 'Hopper PCIe strip must be sampled dark grey, not A100 orange');
  assert.strictEqual(tops[1].color, 0xf3913f, 'Hopper GigaThread strip must be sampled orange');
  var tma = M.h100TmaStrip();
  assert.strictEqual(tma.color, 0x76b900, 'TMA strip must be sampled Hopper bright green');
  var tiles = M.h100SmTiles(M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0], 'h100'));
  assert.strictEqual(tiles.length, 32, '8 enabled GPCs x 2x2 tiles = 32 tiles (teaching count, NOT 144 SMs)');
  assert.ok(tiles.every(function (tl) { return tl.w > tl.d; }), 'SM tiles must stay wider than deep');
});
test('Piece 2 H100 SM sub-cells: Figure 4 band order, Hopper datapath columns, inside tile', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0], 'h100');
  var cells = M.h100SmSubCells(box);
  assert.strictEqual(cells.length, 448, '32 tiles x 14 sub-cells = 448');
  function byRole(r) { return cells.filter(function (c) { return c.role === r; }); }
  assert.strictEqual(byRole('l0').length, 32, 'one L0 strip per tile');
  assert.strictEqual(byRole('scheduler').length, 32, 'one warp scheduler per tile');
  assert.strictEqual(byRole('dispatch').length, 32, 'one dispatch unit per tile');
  assert.strictEqual(byRole('register').length, 32, 'one register file per tile');
  assert.strictEqual(byRole('int32').length, 32, 'one INT32 column cell per tile');
  assert.strictEqual(byRole('fp32').length, 64, 'two FP32 column cells per tile (Figure 4 columns)');
  assert.strictEqual(byRole('fp64').length, 32, 'one FP64 column cell per tile');
  assert.strictEqual(byRole('tensor').length, 32, 'one tensor core per tile (4 per SM in the article; one per tile here)');
  assert.strictEqual(byRole('ldst').length, 128, '4 LD/ST per tile (Figure 4 has 8, compressed as in A100 tiles)');
  assert.strictEqual(byRole('sfu').length, 32, 'one SFU per tile');
  var t0 = cells.filter(function (c) { return c.tile === 0; });
  function band(role) { var cs = t0.filter(function (c) { return c.role === role; }); return { lo: Math.min.apply(null, cs.map(function (c) { return c.dz - c.d / 2; })), hi: Math.max.apply(null, cs.map(function (c) { return c.dz + c.d / 2; })) }; }
  assert.ok(band('l0').hi < band('scheduler').lo, 'L0 must sit north of the scheduler');
  assert.ok(band('scheduler').hi < band('dispatch').lo, 'scheduler must sit north of dispatch');
  assert.ok(band('dispatch').hi < band('register').lo, 'dispatch must sit north of the register file');
  assert.ok(band('register').hi < band('int32').lo, 'register file must sit north of the datapath row');
  assert.ok(band('int32').hi < band('ldst').lo, 'datapath row must sit north of the LD/ST+SFU foot row');
  cells.forEach(function (c) {
    assert.ok(Math.abs(c.dx) + c.w / 2 <= box.w / 2 + 0.001, c.role + ' must fit inside the SM region in x');
    assert.ok(Math.abs(c.dz) + c.d / 2 <= box.d / 2 + 0.001, c.role + ' must fit inside the SM region in z');
  });
});
test('Piece 2 H100 layout differs from generic default, A100 untouched', function () {
  var h = {}, d = {}, a = {};
  M.boxesFor('gemm', S.JOURNEYS.gemm, 'h100').forEach(function (b) { h[b.id] = b; });
  M.boxesFor('gemm', S.JOURNEYS.gemm).forEach(function (b) { d[b.id] = b; });
  M.boxesFor('gemm', S.JOURNEYS.gemm, 'a100').forEach(function (b) { a[b.id] = b; });
  assert.ok(h['sm'].z === 0 && h['smem'].z > h['sm'].z, 'H100 smem must sit south of the SM region');
  assert.ok(h['warp'].z < h['sm'].z, 'H100 warp must sit north of the SM region');
  assert.ok(h['a-tile'].x < d['a-tile'].x, 'H100 inputs must sit further west (HBM controller gap)');
  assert.ok(d['sm'].x === 2.5 && d['sm'].z === -0.9, 'generic default layout must be untouched by Piece 2');
  assert.ok(d['smem'].z === 3.6, 'generic default smem position must be untouched');
  assert.strictEqual(M.a100SmTiles(a['sm']).length, 28, 'A100 tiles must stay 28');
  assert.strictEqual(M.a100HbmStacks().length, 5, 'A100 HBM must stay 5 stacks');
  assert.strictEqual(M.a100Nvlink().length, 12, 'A100 NVLink must stay 12 segments');
  assert.strictEqual(M.a100GpcGroups().filter(function (g) { return g.enabled; }).length, 7, 'A100 enabled GPCs must stay 7');
});
test('Piece 2 H100 colours sampled from NVIDIA Hopper Figures 3/4, note tagged, no rumor figure', function () {
  var box = M.boxFor('gemm', S.JOURNEYS.gemm.nodes.filter(function (n) { return n.id === 'sm'; })[0], 'h100');
  var cells = M.h100SmSubCells(box);
  var byRole = {};
  cells.forEach(function (c) { byRole[c.role] = c.color; });
  assert.strictEqual(byRole.l0, 0x73b3dd, 'L0 must be sampled Fig.4 light blue');
  assert.strictEqual(byRole.scheduler, 0xf18712, 'Warp Scheduler must be sampled Fig.4 orange');
  assert.strictEqual(byRole.dispatch, 0x9c4a09, 'Dispatch must be sampled Fig.4 brown');
  assert.strictEqual(byRole.register, 0x205867, 'Register File must be sampled Fig.4 dark teal');
  assert.strictEqual(byRole.int32, 0x597800, 'INT32 must be sampled Fig.4 datapath olive');
  assert.strictEqual(byRole.fp32, 0x597800, 'Hopper FP32 must be sampled Fig.4 datapath olive, NOT A100 lime');
  assert.strictEqual(byRole.fp64, 0x3b5d00, 'FP64 must be sampled Fig.4 dark green');
  assert.strictEqual(byRole.tensor, 0x598b00, 'Tensor Core must be sampled Fig.4 olive');
  assert.strictEqual(byRole.ldst, 0x612621, 'LD/ST must be sampled Fig.4 dark red');
  assert.strictEqual(byRole.sfu, 0x923931, 'SFU must be sampled Fig.4 red');
  var l2 = M.h100L2Partitions();
  assert.ok(l2.every(function (p) { return p.color === 0x73b3dd; }), 'L2 partitions must be sampled Fig.3 light blue');
  var boxes = {}; M.boxesFor('gemm', S.JOURNEYS.gemm, 'h100').forEach(function (b) { boxes[b.id] = b; });
  assert.strictEqual(boxes.sm.color, 0x598b00, 'H100 SM region must be Fig.3 SM green');
  assert.strictEqual(boxes.smem.color, 0x73b3dd, 'H100 Shared Memory must be Fig.4 256KB light blue');
  assert.strictEqual(boxes.warp.color, 0xf18712, 'H100 warp must be Fig.4 Warp orange');
  assert.ok(/GH100\/Hopper/.test(S.MODELS.h100.note), 'H100 note must tag GH100/Hopper');
  assert.ok(/132 SM/.test(S.MODELS.h100.note), 'H100 note must carry shipping SXM SM count');
  assert.ok(/50MB/.test(S.MODELS.h100.note), 'H100 note must carry shipping SXM L2 size');
  assert.ok(/规格来源/.test(S.MODELS.h100.note), 'H100 note must say spec source, not imply this site is official');
  assert.ok(!/140/.test(S.MODELS.h100.note), 'no rumor transistor figure in the H100 note');
  var tma = M.h100TmaStrip();
  assert.ok(tma.z > box.d / 2 - 0.5 && tma.z < boxes.smem.z - boxes.smem.d / 2 + 0.5, 'TMA strip must sit between the SM region and the smem strip');
});

console.log('UNIT ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
