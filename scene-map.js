// GPU Explorer — pure 3D mapping, no DOM, no WebGL.
// Maps the teaching-model nodes in state.js (1100x520 SVG coordinates) to
// low-poly 3D boxes. Shared by the browser Three.js scene and the Node
// tests, so step -> active blocks, explode positions and camera focus are
// testable without a GPU. All numbers are teaching geometry, not a real
// die floorplan and not measured performance.
//
// Round 9 layout: Round 8's coherent-chip tables, re-tinted to the
// research manual's fixed hardware legend and sharpened to its
// component dictionary where the node set allows it. GEMM: the warp
// block is now a narrow dispatch strip, Shared Memory a wide central
// block, and the SM carries subpartition detail (see smDetails) —
// 4 subpartitions, each with a tensor tile, a narrow scheduler strip
// and a register strip, plus a shared-memory strip at the SM front.
// No L2 or HBM node exists in any journey, so no L2 band or HBM tower
// is invented in this mapping; the HBM towers flanking the GEMM die
// are scenery built in scene3d.js, not selectable nodes, and are
// labelled as package context there. Stacking stays one centred
// column; TSV hints between its layers are drawn in scene3d.js.
//
// Fixed hardware palette (one colour per family, every zoom level):
//   compute blue 0x89b4fa, memory teal 0x94e2d5, data sand 0xfab387,
//   control grey 0x9b9ba4. Data-movement lines share the data hue
//   0xfab387, and the single chrome accent 0x5e6ad2 marks
//   selection/active only, so the legend needs just 3 items.
(function (root) {
  var KIND_COLOR = { data: 0xfab387, compute: 0x89b4fa, memory: 0x94e2d5, control: 0x9b9ba4 };
  var TENSOR_COLOR = 0x6d8fd0; // tensor tile: same compute hue, darker, larger block motif
  function clamp01(t) {
    if (isNaN(t)) return 0;
    return Math.max(0, Math.min(1, t));
  }
  // Per-journey layout tables: x/z in world units, w/d footprint, h height.
  // Die boxes sit grounded on the slab: centre y = h/2 - 0.25, so the base
  // rests just above the slab top (-0.30). Stacking layers are centred
  // columns (x 0, z 0) with explicit heights; side blocks flank at the
  // logic band height (y 3.15) with cut-core forward (z 1.8 > 0).
  var LAYOUT = {
    gemm: {
      // Round 12: PHYSICAL FLOORPLAN, not a pipeline. The Round 11
      // layout read as Lego because it ordered blocks by step
      // (A -> B -> smem -> SM -> output in a line). A real die
      // orders blocks by place: inputs at the west HBM edge, a
      // central L2 band (scenery, see floorplanL2) west of the SM
      // array, SMs as one grid region in the centre-east, warp
      // schedulers as a narrow dispatch strip on the grid's north
      // edge, Shared Memory as the strip on the grid's front
      // (south) edge — part of the SM tile, not a floating block
      // in the middle of a pipeline — and output at the east
      // HBM edge. Step highlighting is unchanged: each step still
      // highlights its node, which now sits in its floorplan place
      // (e.g. step 4 highlights smem + both input tiles at the
      // west edge and the shared strip). All boxes stay inside
      // the 20.8 x 9.6 die frame; heights stay flat slabs.
      'a-tile': { x: -8.6, z: -2.4, w: 2.8, d: 2.0, h: 0.95 },
      'b-tile': { x: -8.6, z: 2.4, w: 2.8, d: 2.0, h: 0.95 },
      smem:     { x: 2.5,  z: 3.6,  w: 8.0, d: 1.2, h: 0.85 },
      warp:     { x: 2.5,  z: -3.9, w: 7.2, d: 0.9, h: 1.0 },
      sm:       { x: 2.5,  z: -0.9, w: 8.0, d: 4.2, h: 1.1 },
      'c-out':  { x: 8.9,  z: 0,    w: 2.4, d: 2.4, h: 1.0 }
    },
    pagetable: {
      // Top row, evenly spaced left -> right; bottom row returns under
      // the right column, with a long clean return lane (cache -> cpu).
      // Round 11: same ~30% height raise as GEMM, footprints unchanged.
      cpu:   { x: -8.6,  z: -2.7, w: 2.9, d: 2.0, h: 1.05 },
      tlb:   { x: -5.16, z: -2.7, w: 2.9, d: 2.0, h: 1.0 },
      pgd:   { x: -1.72, z: -2.7, w: 2.9, d: 2.0, h: 1.05 },
      pud:   { x: 1.72,  z: -2.7, w: 2.9, d: 2.0, h: 1.05 },
      pmd:   { x: 5.16,  z: -2.7, w: 2.9, d: 2.0, h: 1.05 },
      pte:   { x: 8.6,   z: -2.7, w: 2.9, d: 2.0, h: 1.05 },
      ram:   { x: 8.6,   z: 2.7,  w: 2.9, d: 2.0, h: 1.05 },
      cache: { x: 1.72,  z: 2.7,  w: 2.9, d: 2.0, h: 1.0 }
    },
    pixel: {
      // Top row, evenly spaced left -> right; texture sits under the
      // shader (its sampling loop is vertical), target pixel under the
      // frame buffer (its write is vertical).
      // Round 11: same ~30% height raise as GEMM, footprints unchanged.
      tri:    { x: -8.4, z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      raster: { x: -4.2, z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      shader: { x: 0,    z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      depth:  { x: 4.2,  z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      fb:     { x: 8.4,  z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      tex:    { x: 0,    z: 2.7,  w: 3.0, d: 2.0, h: 1.0 },
      pixel:  { x: 8.4,  z: 2.7,  w: 3.0, d: 2.0, h: 1.05 }
    },
    stacking: {
      // Centred vertical column (x 0, z 0), base grounded on the slab.
      // Layer labels sit in FRONT of the column (labelZ 3.8, past the
      // front face at z 2.8): a label centred under the slab above it
      // is occluded by that slab from any elevated camera, so centred
      // labels vanish in the stack — front callouts stay readable.
      substrate: { x: 0, z: 0, w: 8.6, d: 5.6, h: 0.5, y: 0.0, labelZ: 3.8 },
      'mem-layer': { x: 0, z: 0, w: 8.6, d: 5.6, h: 0.6, y: 0.95, labelZ: 3.8 },
      'logic-low': { x: 0, z: 0, w: 8.6, d: 5.6, h: 0.9, y: 2.05, labelZ: 3.8 },
      bond:      { x: 0, z: 0, w: 8.6, d: 5.6, h: 0.35, y: 2.95, labelZ: 3.8 },
      'logic-top': { x: 0, z: 0, w: 8.6, d: 5.6, h: 0.9, y: 4.0, labelZ: 3.8 },
      lid:       { x: 0, z: 0, w: 8.6, d: 5.6, h: 0.45, y: 5.0, labelZ: 3.8 },
      // Side tier blocks flank the column symmetrically in x, both at
      // logic-band height, forward of the column so they read as tiers.
      // Round 11: moved inward (7.4 -> 6.9) so the gap to the column
      // face (x +/-4.3) is 1.0, not 1.5; stackingShelf() below then
      // spans that gap with a shared base, so the blocks no longer
      // float detached from the column.
      'cut-core': { x: 6.9, z: 2.2, w: 3.2, d: 3.0, h: 0.9, y: 3.15 },
      'gpu-block': { x: -6.9, z: 2.2, w: 3.2, d: 3.0, h: 0.9, y: 3.15 }
    }
  };
  // Explode offsets per journey. Die: radial from the chip centre, so the
  // grid stays regular when opened. Stacking: layers rise monotonically
  // (nothing sinks below the slab) and side blocks slide outward.
  var EXPLODE = {
    stacking: {
      substrate: [0, 0, 0], 'mem-layer': [0, 0.35, 0], 'logic-low': [0, 0.75, 0],
      bond: [0, 1.15, 0], 'logic-top': [0, 1.55, 0], lid: [0, 2.0, 0],
      'cut-core': [1.8, 0.35, 0.6], 'gpu-block': [-1.8, 0.35, 0.6]
    }
  };
  function boxFor(journeyId, node) {
    var color = KIND_COLOR[node.kind] || 0x66707e;
    var lay = LAYOUT[journeyId] && LAYOUT[journeyId][node.id];
    if (lay) {
      var isStack = journeyId === 'stacking';
      var ex = EXPLODE.stacking && EXPLODE.stacking[node.id];
      var y = (typeof lay.y === 'number') ? lay.y : lay.h / 2 - 0.25;
      var explode;
      if (isStack) {
        explode = ex || [0, 0.5, 0];
      } else {
        var len = Math.sqrt(lay.x * lay.x + lay.z * lay.z) || 1;
        explode = [lay.x / len * 1.4, 0.45, lay.z / len * 1.4];
      }
      return {
        id: node.id, label: node.label, kind: node.kind, color: color,
        x: lay.x, y: y, z: lay.z, w: lay.w, h: lay.h, d: lay.d,
        disabled: !!node.disabled, explode: explode,
        labelDy: isStack ? 0.45 : 0.55, labelZ: lay.labelZ || 0
      };
    }
    // Fallback for any node without a layout row: the old SVG projection,
    // so an unlisted node still renders instead of vanishing.
    var cx = node.x + node.w / 2;
    var cy = node.y + node.h / 2;
    if (journeyId === 'stacking') {
      var side = node.x >= 850;
      var sy = (510 - cy) * 0.012;
      return {
        id: node.id, label: node.label, kind: node.kind, color: color,
        x: (cx - 550) / 55, y: sy, z: side ? 4.5 : 0,
        w: node.w / 55, h: Math.max(0.45, node.h / 90), d: side ? 2.5 : 4.5,
        disabled: !!node.disabled,
        explode: [0, (sy - 2.7) * 0.9, side ? 1.4 : 0], labelDy: 0.45
      };
    }
    var x = (cx - 550) / 55;
    var z = (cy - 260) / 55;
    var llen = Math.sqrt(x * x + z * z) || 1;
    return {
      id: node.id, label: node.label, kind: node.kind, color: color,
      x: x, y: 0.7, z: z,
      w: node.w / 55, h: node.kind === 'compute' ? 1.15 : 0.85, d: node.h / 55,
      disabled: !!node.disabled,
      explode: [x / llen * 1.7, 0.45, z / llen * 1.7], labelDy: 0.55
    };
  }
  // SM internal detail (GEMM only, pure geometry, no DOM/WebGL).
  // Returns small boxes relative to the SM box centre, so scene3d.js
  // can draw them as non-pickable detail that follows the SM on
  // explode. 4 subpartitions in a 2x2 grid; each carries one tensor
  // tile (same compute hue, darker), one narrow scheduler strip at
  // its front edge and one register strip at its back edge; one
  // shared-memory strip runs along the SM front face (the SM
  // diagram's "L1/shared strip at the bottom", front = bottom in
  // this top-down reading). Front is +z (toward the default camera).
  function smDetails(box) {
    var out = [];
    var qw = box.w / 2 - 0.12, qd = box.d / 2 - 0.12;
    var qx = [-box.w / 4, box.w / 4], qz = [-box.d / 4, box.d / 4];
    var i, j;
    for (i = 0; i < 2; i++) {
      for (j = 0; j < 2; j++) {
        var dx = qx[i], dz = qz[j];
        out.push({ role: 'subpartition', dx: dx, dy: box.h / 2 + 0.04, dz: dz, w: qw, h: 0.08, d: qd, color: KIND_COLOR.compute });
        out.push({ role: 'tensor', dx: dx, dy: box.h / 2 + 0.14, dz: dz, w: 0.55, h: 0.12, d: 0.55, color: TENSOR_COLOR });
        out.push({ role: 'scheduler', dx: dx, dy: box.h / 2 + 0.10, dz: dz + qd / 2 - 0.09, w: qw - 0.2, h: 0.06, d: 0.18, color: KIND_COLOR.control });
        out.push({ role: 'register', dx: dx, dy: box.h / 2 + 0.10, dz: dz - qd / 2 + 0.09, w: qw - 0.2, h: 0.06, d: 0.18, color: KIND_COLOR.memory });
      }
    }
    out.push({ role: 'shared-strip', dx: 0, dy: 0, dz: box.d / 2 + 0.10, w: box.w, h: 0.5, d: 0.2, color: KIND_COLOR.memory });
    return out;
  }
  // Round 12 floorplan scenery (GEMM only, pure geometry, no DOM).
  // The central L2 band: a vertical strip immediately west of the
  // SM grid, aligned with it in depth, so data flows west HBM ->
  // L2 -> SM array. It is scenery, not a selectable node (no
  // journey step names an L2 block), and scene3d.js draws it with
  // an engraved-style label so the floorplan reads without adding
  // a panel or a word to the inspector.
  function floorplanL2() {
    return { x: -3.4, z: -0.9, w: 1.5, d: 4.2, h: 0.7, color: KIND_COLOR.control };
  }
  // SM grid tiles (GEMM only): the tiles drawn inside the SM
  // region box by one InstancedMesh in scene3d.js. Returns offsets
  // relative to the SM box centre, all strictly inside the box,
  // in a regular grid with constant gaps — the thing that makes
  // the region read as an array of SMs instead of one big block.
  // Default 6 columns x 3 rows = 18 tiles (teaching count, not a
  // datasheet SM count for any model).
  function smGridTiles(box, cols, rows) {
    var c = (typeof cols === 'number') ? cols : 6;
    var r = (typeof rows === 'number') ? rows : 3;
    var gap = 0.18;
    var tw = (box.w - (c + 1) * gap) / c;
    var td = (box.d - (r + 1) * gap) / r;
    var out = [], i, j;
    for (i = 0; i < c; i++) {
      for (j = 0; j < r; j++) {
        out.push({
          dx: -box.w / 2 + gap + tw / 2 + i * (tw + gap),
          dz: -box.d / 2 + gap + td / 2 + j * (td + gap),
          w: tw, d: td
        });
      }
    }
    return out;
  }
  // Round 11 shared base for a stacking side block: a flat shelf
  // under the block, spanning from the column face (x +/-4.3, the
  // column width is 8.6) to the block's outer edge, its top exactly
  // meeting the block's bottom. Returns offsets relative to the
  // block centre, so scene3d.js can attach it as a child mesh that
  // rides the block on explode and grounds it at explode 0.
  // Column half-width is a parameter so the test can pin it.
  function stackingShelf(box, columnHalfW) {
    var halfW = (typeof columnHalfW === 'number') ? columnHalfW : 4.3;
    var side = box.x >= 0 ? 1 : -1;
    var outer = box.x + side * box.w / 2;
    var innerEdge = side * halfW;
    var w = Math.abs(outer - innerEdge);
    var cx = (innerEdge + outer) / 2;
    return { dx: cx - box.x, dy: -box.h / 2 - 0.10, dz: 0, w: w, h: 0.20, d: box.d };
  }
  function explodePos(box, t) {
    t = clamp01(t);
    return {
      x: box.x + box.explode[0] * t,
      y: box.y + box.explode[1] * t,
      z: box.z + box.explode[2] * t
    };
  }
  function boxesFor(journeyId, journey) {
    return journey.nodes.map(function (n) { return boxFor(journeyId, n); });
  }
  function focusCentroid(journeyId, journey, step) {
    var boxes = boxesFor(journeyId, journey);
    var active = boxes.filter(function (b) { return step.active.indexOf(b.id) >= 0; });
    if (!active.length) active = boxes;
    var sx = 0, sy = 0, sz = 0;
    active.forEach(function (b) { sx += b.x; sy += b.y; sz += b.z; });
    return { x: sx / active.length, y: sy / active.length, z: sz / active.length };
  }
  var api = { KIND_COLOR: KIND_COLOR, TENSOR_COLOR: TENSOR_COLOR, clamp01: clamp01, boxFor: boxFor, explodePos: explodePos, boxesFor: boxesFor, focusCentroid: focusCentroid, smDetails: smDetails, stackingShelf: stackingShelf, floorplanL2: floorplanL2, smGridTiles: smGridTiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerSceneMap = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
