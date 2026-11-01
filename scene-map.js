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
  // Round 14 — A100 (GA100/Ampere) layout, ONLY when model === 'a100'.
  // Source (official, NOT a leak): NVIDIA, "NVIDIA Ampere Architecture
  // In-Depth", Figure 4 (GA100 full GPU) and Figure 5 (GA100 SM).
  // Figure 4, transcribed from a fresh gpuserver Chrome screenshot
  // (r14-fig4-ga100-full.png): top edge PCIe Gen4 Host Interface +
  // GigaThread Engine with MIG Control; 8 GPCs in 4 top + 4 bottom
  // rows; a central L2 Cache band across the full width, in 2
  // partitions; HBM2 Memory Controllers on both flanks; bottom
  // edge High-Speed Hub + NVLink strip. Text: full GA100 = 8 GPCs,
  // 8 TPCs/GPC, 2 SMs/TPC, 16 SMs/GPC, 128 SMs; A100 = 7 GPCs,
  // 108 SMs, 64 FP32/SM (6912 total), 32 FP64/SM (3456), 64 INT32/SM
  // (6912), 4 Tensor Cores/SM (432), L1/shared 192KB/SM, L2 40MB in
  // 2 partitions outside the GPCs, HBM2 5 stacks / 10 controllers /
  // 40GB / 1555 GB/s, die 826 mm2, 54.2B transistors, TSMC 7nm.
  // Figure 5, transcribed (r14-fig5-sm-full.png): one SM = 4
  // subpartitions (2x2); each subpartition, top to bottom: L0
  // Instruction Cache, Warp Scheduler (32 thread/clk), Dispatch
  // Unit (32 thread/clk), Register File (16384 x 32-bit), datapath
  // columns INT32 / FP32 / FP64 + a large TENSOR CORE, LD/ST +
  // SFU at the foot; whole SM topped by L1 Instruction Cache and
  // footed by 192KB L1 Data Cache / Shared Memory, then Tex units.
  // Teaching simplifications, labelled here and in the report, NOT
  // as official specs: (a) the SM region shows 7 GPC groups, each
  // with 2x2 = 4 SM tiles (28 tiles), NOT 108 SMs — 108 individual
  // tiles would be unreadable dots and would break step mapping;
  // the 8th GPC position is shown as an empty outline, because
  // A100 uses 7 of the full GA100's 8 GPCs; (b) Shared Memory is
  // shown as one die-level strip for step tracing — in Figure 5 it
  // is 192KB per SM at the foot of each SM; (c) HBM stack
  // distribution across the two flanks (2 west / 3 east) is a
  // teaching arrangement — the official count is 5 stacks, the
  // flank split is not stated in the article; (d) colours follow
  // Figure 5's bands (light blue / orange / brown / teal / greens),
  // not a photorealistic silicon colour.
  // Other models keep their Round 13 layout: this table is never
  // used unless model === 'a100', so GA100/Ampere can never leak
  // into the H100 (GH100/Hopper), RTX 5090 (GB202/Blackwell) or
  // MI300X diagrams.
  var A100_LAYOUT = {
    'a-tile': { x: -9.0, z: -2.4, w: 2.8, d: 2.0, h: 0.95 },
    'b-tile': { x: -9.0, z: 2.4, w: 2.8, d: 2.0, h: 0.95 },
    warp:     { x: 0,    z: -3.80, w: 12.0, d: 0.8, h: 1.0 },
    sm:       { x: 0,    z: 0,    w: 12.0, d: 6.4, h: 1.1 },
    smem:     { x: 0,    z: 4.0,  w: 12.0, d: 1.0, h: 0.85 },
    'c-out':  { x: 9.0,  z: 0,    w: 2.4, d: 2.4, h: 1.0 }
  };
  // 7 GPC groups: north row 4 groups, south row 3 groups + 1 empty
  // outline (the 8th, unused GPC position). Group centres in SM
  // region coordinates (SM box centre = 0,0; region 12 x 6.4).
  function a100GpcGroups() {
    var out = [];
    var gx = [-4.525, -1.575, 1.375, 4.325];
    var i;
    for (i = 0; i < 4; i++) out.push({ gpc: i, x: gx[i], z: -1.85, w: 2.75, d: 2.55, enabled: true });
    for (i = 0; i < 3; i++) out.push({ gpc: 4 + i, x: gx[i], z: 1.85, w: 2.75, d: 2.55, enabled: true });
    out.push({ gpc: 7, x: gx[3], z: 1.85, w: 2.75, d: 2.55, enabled: false });
    return out;
  }
  // SM tiles inside the GPC groups: 2x2 per enabled group = 28 tiles.
  function a100SmTiles(box) {
    var groups = a100GpcGroups();
    var out = [];
    groups.forEach(function (g) {
      if (!g.enabled) return;
      var tw = (g.w - 3 * 0.12) / 2, td = (g.d - 3 * 0.12) / 2;
      var ci, cj;
      for (ci = 0; ci < 2; ci++) {
        for (cj = 0; cj < 2; cj++) {
          out.push({
            gpc: g.gpc,
            dx: g.x - g.w / 2 + 0.12 + tw / 2 + ci * (tw + 0.12),
            dz: g.z - g.d / 2 + 0.12 + td / 2 + cj * (td + 0.12),
            w: tw, d: td
          });
        }
      }
    });
    return out;
  }
  var A100_SUB_COLOR = { l0: 0x73b3dd, scheduler: 0xf18712, dispatch: 0x9c4a09, register: 0x205867, int32: 0x598b00, fp32: 0x76b900, fp64: 0x3b5d00, tensor: 0x598b00, ldst: 0x612621, sfu: 0x923931 };
  // Figure 5 bands per SM tile, north to south: L0, warp scheduler,
  // dispatch, register file, datapath (INT32/FP32/FP64 + tensor),
  // LD/ST + SFU. Heights are relief steps on the tile top.
  function a100SmSubCells(box) {
    var tiles = a100SmTiles(box);
    var out = [];
    tiles.forEach(function (t, ti) {
      var w = t.w - 0.08;
      function strip(role, dz, d, h, color) { out.push({ role: role, tile: ti, gpc: t.gpc, dx: t.dx, dz: t.dz + dz, w: w, d: d, h: h, color: color }); }
      strip('l0', -0.40, 0.12, 0.10, A100_SUB_COLOR.l0);
      strip('scheduler', -0.26, 0.12, 0.10, A100_SUB_COLOR.scheduler);
      strip('dispatch', -0.12, 0.12, 0.10, A100_SUB_COLOR.dispatch);
      strip('register', 0.02, 0.12, 0.10, A100_SUB_COLOR.register);
      // Datapath row: 2 INT32 + 2 FP32 + 1 FP64 + 1 tensor block.
      var x0 = t.dx - w / 2, seg = w / 6;
      [['int32', 0], ['int32', 1], ['fp32', 2], ['fp32', 3], ['fp64', 4]].forEach(function (p) {
        out.push({ role: p[0], tile: ti, gpc: t.gpc, dx: x0 + (p[1] + 0.5) * seg, dz: t.dz + 0.20, w: seg - 0.03, d: 0.20, h: 0.10, color: A100_SUB_COLOR[p[0]] });
      });
      out.push({ role: 'tensor', tile: ti, gpc: t.gpc, dx: x0 + 5.5 * seg, dz: t.dz + 0.20, w: seg - 0.03, d: 0.20, h: 0.14, color: A100_SUB_COLOR.tensor });
      // Foot row: 4 LD/ST + 1 SFU.
      var fseg = w / 5;
      var fi;
      for (fi = 0; fi < 4; fi++) out.push({ role: 'ldst', tile: ti, gpc: t.gpc, dx: x0 + (fi + 0.5) * fseg, dz: t.dz + 0.40, w: fseg - 0.03, d: 0.14, h: 0.10, color: A100_SUB_COLOR.ldst });
      out.push({ role: 'sfu', tile: ti, gpc: t.gpc, dx: x0 + 4.5 * fseg, dz: t.dz + 0.40, w: fseg - 0.03, d: 0.14, h: 0.10, color: A100_SUB_COLOR.sfu });
    });
    return out;
  }
  // Figure 4 scenery, A100 only: L2 in 2 partitions across the
  // central band; HBM 5 stacks (2 west / 3 east, teaching split);
  // HBM controllers on both flanks; NVLink 12 segments on the
  // south edge; PCIe + GigaThread strips on the north edge.
  function a100L2Partitions() {
    return [
      { x: -3.05, z: 0, w: 5.9, d: 1.0, h: 1.0, color: 0x73b3dd },
      { x: 3.05, z: 0, w: 5.9, d: 1.0, h: 1.0, color: 0x73b3dd }
    ];
  }
  function a100HbmStacks() {
    return [
      { x: -11.35, z: -2.2, w: 1.95, d: 2.4 }, { x: -11.35, z: 2.2, w: 1.95, d: 2.4 },
      { x: 11.35, z: -2.7, w: 1.95, d: 1.7 }, { x: 11.35, z: 0, w: 1.95, d: 1.7 }, { x: 11.35, z: 2.7, w: 1.95, d: 1.7 }
    ];
  }
  function a100HbmControllers() {
    return [{ x: -7.0, z: 0, w: 0.8, d: 6.4 }, { x: 7.0, z: 0, w: 0.8, d: 6.4 }];
  }
  function a100Nvlink() {
    var out = [], i;
    for (i = 0; i < 12; i++) out.push({ x: -9.35 + i * 1.70, z: 4.62, w: 1.50, d: 0.28 });
    return out;
  }
  function a100TopStrips() {
    return [
      { label: 'pcie', z: -4.68, w: 20.8, d: 0.25, color: 0xf3913f },
      { label: 'gigathread', z: -4.40, w: 20.8, d: 0.25, color: 0xf3913f }
    ];
  }
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
  function boxFor(journeyId, node, model) {
    var color = KIND_COLOR[node.kind] || 0x66707e;
    if (journeyId === 'gemm' && model === 'a100') {
      var a100NodeColor = { sm: 0x598b00, smem: 0x73b3dd, warp: 0xf18712 };
      if (a100NodeColor[node.id] !== undefined) color = a100NodeColor[node.id];
    }
    var lay = (journeyId === 'gemm' && model === 'a100' && A100_LAYOUT[node.id]) || (LAYOUT[journeyId] && LAYOUT[journeyId][node.id]);
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
  // Round 13 PC-Anatomy density (GEMM only, pure geometry, no DOM).
  // PC Anatomy's SM view (fresh gpuserver screenshot
  // r13-pc-anatomy-sm-crop.png, 2026-11-01) is NOT 18 large tiles:
  // one SM = 4 subpartition columns, each with ~50 tiny blue cells
  // in a grid, an orange segmented strip + a teal segmented strip
  // at the head, and a tensor (orange, segmented) + texture
  // (purple, segmented) strip at the foot, with the L1/Shared
  // text engraved into the front slab face. Our 18-tile grid was
  // 10x sparser than that, which is why it still read as Lego.
  // smTileSubCells therefore subdivides EVERY SM tile the same
  // way, so the die reads as a pattern at overview and as real
  // sub-geometry at zoom: per tile, 12 core cells (4x3), 4
  // scheduler segments (orange, north edge), 3 tensor segments
  // (purple, south band) and 4 register segments (teal, south
  // band) = 23 small geometries per tile, 414 in total, drawn
  // as 4 InstancedMeshes in scene3d.js (4 draw calls, not 414).
  // Offsets are relative to the SM box centre; heights are
  // per-role step heights, so the tile top is a stepped relief,
  // not a flat colour. Colours are the PC-Anatomy subpart
  // colours (steel blue / orange / purple / teal), used only
  // for sub-cell detail, not as new legend families.
  var SUB_COLOR = { core: 0x6f9fd0, scheduler: 0xc67a2e, tensor: 0x5b4a8a, register: 0x4fa8a0 };
  function smTileSubCells(box) {
    var tiles = smGridTiles(box);
    var out = [];
    tiles.forEach(function (t, ti) {
      var i, j;
      // North band: 4 scheduler segments.
      for (i = 0; i < 4; i++) {
        out.push({ role: 'scheduler', tile: ti, dx: t.dx - t.w / 2 + 0.06 + (i + 0.5) * (t.w - 0.12) / 4, dz: t.dz - t.d / 2 + 0.11, w: (t.w - 0.12) / 4 - 0.03, d: 0.16, h: 0.14, color: SUB_COLOR.scheduler });
      }
      // Middle: 4x3 core cells, in the band between the north
      // scheduler strip and the south tensor/register strips
      // (no overlap: scheduler -0.56..-0.40, cores -0.355..0.155,
      // tensor 0.17..0.33, register 0.35..0.49, tile edge 0.58).
      for (i = 0; i < 4; i++) {
        for (j = 0; j < 3; j++) {
          out.push({ role: 'core', tile: ti, dx: t.dx - t.w / 2 + 0.06 + (i + 0.5) * (t.w - 0.12) / 4, dz: t.dz - 0.28 + j * 0.18, w: (t.w - 0.12) / 4 - 0.03, d: 0.15, h: 0.10, color: SUB_COLOR.core });
        }
      }
      // South band, two rows: tensor (purple, 3) above register (teal, 4).
      for (i = 0; i < 3; i++) {
        out.push({ role: 'tensor', tile: ti, dx: t.dx - t.w / 2 + 0.06 + (i + 0.5) * (t.w - 0.12) / 3, dz: t.dz + t.d / 2 - 0.33, w: (t.w - 0.12) / 3 - 0.03, d: 0.16, h: 0.12, color: SUB_COLOR.tensor });
      }
      for (i = 0; i < 4; i++) {
        out.push({ role: 'register', tile: ti, dx: t.dx - t.w / 2 + 0.06 + (i + 0.5) * (t.w - 0.12) / 4, dz: t.dz + t.d / 2 - 0.16, w: (t.w - 0.12) / 4 - 0.03, d: 0.14, h: 0.10, color: SUB_COLOR.register });
      }
    });
    return out;
  }
  // L2 as banks, not one band (PC Anatomy: repetition is the
  // beauty). 6 banks along the L2 band depth, constant gaps,
  // alternating shade index for material variation.
  function l2Banks() {
    var l2 = floorplanL2();
    var gap = 0.08, n = 6, d = (l2.d - (n + 1) * gap) / n, out = [], i;
    for (i = 0; i < n; i++) {
      out.push({ x: l2.x, z: l2.z - l2.d / 2 + gap + d / 2 + i * (d + gap), w: l2.w, d: d, h: l2.h, shade: i % 2 });
    }
    return out;
  }
  // HBM as stacked layers with a stepped edge, not one flat slab:
  // 3 layers per side, each inset and raised, so the edge reads
  // as a stack from any orbit angle (still flat in plan view —
  // no Round 9 towers).
  function hbmLayers() {
    var out = [];
    [-11.9, 11.9].forEach(function (tx) {
      var i;
      for (i = 0; i < 3; i++) {
        out.push({ x: tx, y: 0.05 + i * 0.14, w: 2.6 - i * 0.15, d: 7.2 - i * 0.15, h: 0.14, color: 0x7fb8ad });
      }
    });
    return out;
  }
  // Interconnect bus between L2 and the SM grid: 5 ribbons of
  // varying width (data wide, control narrow), dark metal, at
  // slab-top level. A single 1px flow line cannot carry this;
  // width variation is what makes a bus read as physical wiring.
  function interconnectBus() {
    var widths = [0.08, 0.18, 0.06, 0.14, 0.10];
    var zs = [-2.6, -1.4, -0.2, 1.0, 2.2];
    var out = [], i;
    for (i = 0; i < 5; i++) {
      out.push({ x: -2.05, z: zs[i], w: 1.3, d: widths[i], h: 0.06, color: 0x3a4350 });
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
  function boxesFor(journeyId, journey, model) {
    return journey.nodes.map(function (n) { return boxFor(journeyId, n, model); });
  }
  function focusCentroid(journeyId, journey, step) {
    var boxes = boxesFor(journeyId, journey);
    var active = boxes.filter(function (b) { return step.active.indexOf(b.id) >= 0; });
    if (!active.length) active = boxes;
    var sx = 0, sy = 0, sz = 0;
    active.forEach(function (b) { sx += b.x; sy += b.y; sz += b.z; });
    return { x: sx / active.length, y: sy / active.length, z: sz / active.length };
  }
  var api = { KIND_COLOR: KIND_COLOR, TENSOR_COLOR: TENSOR_COLOR, SUB_COLOR: SUB_COLOR, clamp01: clamp01, boxFor: boxFor, explodePos: explodePos, boxesFor: boxesFor, focusCentroid: focusCentroid, smDetails: smDetails, stackingShelf: stackingShelf, floorplanL2: floorplanL2, smGridTiles: smGridTiles, smTileSubCells: smTileSubCells, l2Banks: l2Banks, hbmLayers: hbmLayers, interconnectBus: interconnectBus, a100GpcGroups: a100GpcGroups, a100SmTiles: a100SmTiles, a100SmSubCells: a100SmSubCells, a100L2Partitions: a100L2Partitions, a100HbmStacks: a100HbmStacks, a100HbmControllers: a100HbmControllers, a100Nvlink: a100Nvlink, a100TopStrips: a100TopStrips };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerSceneMap = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
