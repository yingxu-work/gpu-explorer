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
      // Round 10: one framed die, not a sprawl. Pipeline left -> right
      // with constant ~0.9 gaps, all blocks flat (h <= 0.85, GEX/PC
      // Anatomy: height ~15-20% of footprint). Shared Memory is the
      // central spine block: tall in depth, spanning both input rows.
      // Total span x -9.9..8.1, z -3.7..3.7, inside a 20.8 x 9.6 die.
      'a-tile': { x: -8.0, z: -2.6, w: 3.8, d: 2.2, h: 0.7 },
      'b-tile': { x: -8.0, z: 2.6, w: 3.8, d: 2.2, h: 0.7 },
      smem:     { x: -3.2, z: 0,    w: 4.0, d: 5.6, h: 0.8 },
      warp:     { x: 1.8,  z: -2.6, w: 3.6, d: 1.8, h: 0.55 },
      sm:       { x: 1.8,  z: 2.6,  w: 3.6, d: 2.2, h: 0.85 },
      'c-out':  { x: 6.6,  z: 0,    w: 3.0, d: 3.0, h: 0.75 }
    },
    pagetable: {
      // Top row, evenly spaced left -> right; bottom row returns under
      // the right column, with a long clean return lane (cache -> cpu).
      cpu:   { x: -8.6,  z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      tlb:   { x: -5.16, z: -2.7, w: 2.9, d: 2.0, h: 0.8 },
      pgd:   { x: -1.72, z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      pud:   { x: 1.72,  z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      pmd:   { x: 5.16,  z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      pte:   { x: 8.6,   z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      ram:   { x: 8.6,   z: 2.7,  w: 2.9, d: 2.0, h: 0.85 },
      cache: { x: 1.72,  z: 2.7,  w: 2.9, d: 2.0, h: 0.8 }
    },
    pixel: {
      // Top row, evenly spaced left -> right; texture sits under the
      // shader (its sampling loop is vertical), target pixel under the
      // frame buffer (its write is vertical).
      tri:    { x: -8.4, z: -2.7, w: 3.0, d: 2.0, h: 0.85 },
      raster: { x: -4.2, z: -2.7, w: 3.0, d: 2.0, h: 0.85 },
      shader: { x: 0,    z: -2.7, w: 3.0, d: 2.0, h: 0.85 },
      depth:  { x: 4.2,  z: -2.7, w: 3.0, d: 2.0, h: 0.85 },
      fb:     { x: 8.4,  z: -2.7, w: 3.0, d: 2.0, h: 0.8 },
      tex:    { x: 0,    z: 2.7,  w: 3.0, d: 2.0, h: 0.8 },
      pixel:  { x: 8.4,  z: 2.7,  w: 3.0, d: 2.0, h: 0.85 }
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
      'cut-core': { x: 7.4, z: 2.2, w: 3.2, d: 3.0, h: 0.9, y: 3.15 },
      'gpu-block': { x: -7.4, z: 2.2, w: 3.2, d: 3.0, h: 0.9, y: 3.15 }
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
  var api = { KIND_COLOR: KIND_COLOR, TENSOR_COLOR: TENSOR_COLOR, clamp01: clamp01, boxFor: boxFor, explodePos: explodePos, boxesFor: boxesFor, focusCentroid: focusCentroid, smDetails: smDetails };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerSceneMap = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
