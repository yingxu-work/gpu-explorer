// GPU Explorer — pure 3D mapping, no DOM, no WebGL.
// Maps the teaching-model nodes in state.js (1100x520 SVG coordinates) to
// low-poly 3D boxes. Shared by the browser Three.js scene and the Node
// tests, so step -> active blocks, explode positions and camera focus are
// testable without a GPU. All numbers are teaching geometry, not a real
// die floorplan and not measured performance.
(function (root) {
  var KIND_COLOR = { data: 0x4ade80, compute: 0x60a5fa, memory: 0xfbbf24, control: 0x94a3b8 };
  function clamp01(t) {
    if (isNaN(t)) return 0;
    return Math.max(0, Math.min(1, t));
  }
  function boxFor(journeyId, node) {
    var cx = node.x + node.w / 2;
    var cy = node.y + node.h / 2;
    var color = KIND_COLOR[node.kind] || 0x94a3b8;
    if (journeyId === 'stacking') {
      // Vertical stack: SVG y becomes world height, so layers really pile
      // up. Side tier blocks (x >= 850) sit beside the stack in depth.
      var side = node.x >= 850;
      var y = (510 - cy) * 0.012;
      var box = {
        id: node.id, label: node.label, kind: node.kind, color: color,
        x: (cx - 550) / 55, y: y, z: side ? 4.5 : 0,
        w: node.w / 55, h: Math.max(0.45, node.h / 90), d: side ? 2.5 : 4.5,
        disabled: !!node.disabled,
        explode: [0, (y - 2.7) * 0.9, side ? 1.4 : 0]
      };
      return box;
    }
    // Die view: SVG x -> world X, SVG y -> world depth (Z). The camera
    // looks at the die from an angle, so depth reads as depth, not as a
    // flat top-down diagram.
    var x = (cx - 550) / 55;
    var z = (cy - 260) / 55;
    var len = Math.sqrt(x * x + z * z) || 1;
    return {
      id: node.id, label: node.label, kind: node.kind, color: color,
      x: x, y: 0.7, z: z,
      w: node.w / 55, h: node.kind === 'compute' ? 1.15 : 0.85, d: node.h / 55,
      disabled: !!node.disabled,
      explode: [x / len * 1.7, 0.45, z / len * 1.7]
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
