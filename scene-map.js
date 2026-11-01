// GPU Explorer — pure 3D mapping, no DOM, no WebGL.
// Maps the teaching-model nodes in state.js (1100x520 SVG coordinates) to
// low-poly 3D boxes. Shared by the browser Three.js scene and the Node
// tests, so step -> active blocks, explode positions and camera focus are
// testable without a GPU. All numbers are teaching geometry, not a real
// die floorplan and not measured performance.
//
// Round 8 layout: the old mapping projected scattered SVG coordinates
// straight into 3D, which read as random boxes. Each journey now has an
// explicit layout table below, so a die reads as one coherent chip:
// inputs on the left, a central block, compute in a regular grid, output
// at the end of the pipeline; chains run left-to-right with a clean
// return lane; the stacking journey is one centred vertical column with
// side blocks flanking it at logic-layer height. Node coordinates in
// state.js are untouched — only this 3D presentation changes.
//
// Palette (GEX-inspired, muted; amber is reserved for the active block):
//   memory  sage green  0x93ad8d, compute warm tan 0xc4a173,
//   data    slate blue  0x7e93ad, control slate grey 0x66707e,
//   substrate charcoal, pins muted gold. No saturated rainbow colours.
(function (root) {
  var KIND_COLOR = { data: 0x7e93ad, compute: 0xc4a173, memory: 0x93ad8d, control: 0x66707e };
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
      // Pipeline left -> right: A row / B column (symmetric about z 0),
      // one distinct central Shared Memory, compute as a 2-row grid,
      // output at the end of the pipeline.
      'a-tile': { x: -7.4, z: -2.6, w: 4.2, d: 2.0, h: 0.85 },
      'b-tile': { x: -7.4, z: 2.6, w: 4.2, d: 2.0, h: 0.85 },
      smem:     { x: -1.6, z: 0,    w: 4.4, d: 3.6, h: 1.15 },
      warp:     { x: 3.6,  z: -2.6, w: 3.6, d: 2.0, h: 1.05 },
      sm:       { x: 3.6,  z: 2.6,  w: 3.6, d: 2.0, h: 1.05 },
      'c-out':  { x: 8.3,  z: 0,    w: 3.4, d: 2.6, h: 0.85 }
    },
    pagetable: {
      // Top row, evenly spaced left -> right; bottom row returns under
      // the right column, with a long clean return lane (cache -> cpu).
      cpu:   { x: -8.6,  z: -2.7, w: 2.9, d: 2.0, h: 1.05 },
      tlb:   { x: -5.16, z: -2.7, w: 2.9, d: 2.0, h: 1.0 },
      pgd:   { x: -1.72, z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      pud:   { x: 1.72,  z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      pmd:   { x: 5.16,  z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      pte:   { x: 8.6,   z: -2.7, w: 2.9, d: 2.0, h: 0.85 },
      ram:   { x: 8.6,   z: 2.7,  w: 2.9, d: 2.0, h: 0.85 },
      cache: { x: 1.72,  z: 2.7,  w: 2.9, d: 2.0, h: 1.0 }
    },
    pixel: {
      // Top row, evenly spaced left -> right; texture sits under the
      // shader (its sampling loop is vertical), target pixel under the
      // frame buffer (its write is vertical).
      tri:    { x: -8.4, z: -2.7, w: 3.0, d: 2.0, h: 0.85 },
      raster: { x: -4.2, z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      shader: { x: 0,    z: -2.7, w: 3.0, d: 2.0, h: 1.05 },
      depth:  { x: 4.2,  z: -2.7, w: 3.0, d: 2.0, h: 0.85 },
      fb:     { x: 8.4,  z: -2.7, w: 3.0, d: 2.0, h: 1.0 },
      tex:    { x: 0,    z: 2.7,  w: 3.0, d: 2.0, h: 1.0 },
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
  var api = { KIND_COLOR: KIND_COLOR, clamp01: clamp01, boxFor: boxFor, explodePos: explodePos, boxesFor: boxesFor, focusCentroid: focusCentroid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerSceneMap = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
