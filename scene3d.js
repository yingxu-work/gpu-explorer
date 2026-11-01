// GPU Explorer — real Three.js / WebGL 3D scene (local bundle, no CDN).
// Low-poly boxes only, Standard materials, no post-processing, so it
// stays interactive in SwiftShader headless Chrome as well as on a
// normal laptop GPU. Server side stays CPU-only; WebGL runs on the client.
//
// Round 10 look (reference-first, from r10 screenshots in
// ref-screenshots/ROUND10-REF-NOTES.md): GEX/PC Anatomy read as ONE
// framed die — flat stepped slabs, constant gaps, clean solid
// background, no grid floor, memory as FLAT slabs, 2-3 labels max.
// So: no GridHelper; a die slab with a raised rim frame; every block
// gets a darker plinth under it and a lighter inset top plate (the
// stepped-slab profile); GEMM HBM is two flat flanking slabs with a
// fine gold edge strip, not towers; die-journey labels show only for
// the active / selected / hovered block, larger; active = amber
// emissive, selected = indigo. Shell copy and text budgets are
// unchanged from Round 9.
//
// Round 11 (this round only, shell/copy/budgets/framed die/sparse
// labels unchanged): (1) die depth — block heights +~30% (in
// scene-map.js), plinth thickened and grounded to the slab top,
// shadow frustum widened to cover the whole package, key light
// stronger and ambient lower for harder shadow grounding, die
// cameras lowered (GEMM 43deg -> ~38deg elevation, other die
// ~43deg -> ~35deg) so the slab sides read; (2) active identity —
// the amber/indigo wash is cut back (active 0.45 -> 0.20, selected
// 1.0 -> 0.30) and the pop moves to a thin amber/indigo frame on
// the block's top face, so the base hue (e.g. smem teal) stays
// readable; (3) stacking side blocks — a shared base shelf under
// each side block spans the gap to the column face (see
// M.stackingShelf), so they no longer float detached.
//
// Round 12 (GEMM only, shell/copy/budgets unchanged): the die stops
// being a pipeline of solid-colour blocks and becomes a floorplan
// (see scene-map.js: west HBM inputs, L2 band, SM grid, shared
// front strip, east output). Surface detail is procedural, not
// more solid colours: a canvas die texture (interconnect traces,
// power grid, via dots, seal ring) on the slab, an instanced pin
// fringe around the package, and the SM region drawn as one
// InstancedMesh of 18 tiles (1 draw call) instead of one big
// block. No Blender/glTF: the procedural route keeps the site
// under 15MB and keeps step highlighting mapped to real nodes.
//
// Round 17 (this round only, A100 untouched, shell/copy/budgets
// unchanged): the same treatment reaches the other three
// journeys — die texture + pin fringe for every die journey
// (pagetable, pixel, not just GEMM), and per-journey instanced
// detail cells (see scene-map.js pagetableDetailCells,
// pixelDetailCells, stackingDetailCells) drawn as one
// InstancedMesh per role, riding their parent block on explode
// and dimming with it. Stacking keeps its front pin bar and
// its cross-section column; only its footprints step inward
// upward (scene-map.js) and its layers gain core/bank relief.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

var S = window.GpuExplorerState;
var M = window.GpuExplorerSceneMap;
var ACTIVE_EMISSIVE = 0xe8a33d; // one warm amber pop per step (Round 8 amber, not indigo-over-teal)
var SELECT_EMISSIVE = 0x5e6ad2; // explicit click selection keeps the chrome accent
var FLOW_HOT = 0xfab387; // flow lines share the data hue, so the 3-item legend stays honest
var FLOW_IDLE = 0x2f2f31;
var DIM_FACTOR = 0.78;
// Round 13 silicon sheen: PC Anatomy reads as hardware because
// its surfaces have metal variation, not one flat matte finish.
// Colour still carries the family, but metalness/roughness now
// carry the material: compute is the most metallic, memory is
// matte-er, data/control sit between. Flat matte single colours
// were a major Lego tell in Round 12.
var KIND_MAT = {
  compute: { roughness: 0.35, metalness: 0.55 },
  memory: { roughness: 0.45, metalness: 0.30 },
  data: { roughness: 0.40, metalness: 0.50 },
  control: { roughness: 0.40, metalness: 0.50 }
};
// Flat engraved label: text lying IN the slab face (PC Anatomy:
// "L1 / SHARED MEMORY" is engraved, not a floating sprite).
// A plane on the vertical front face of a band, light capitals
// on transparent dark, no border, no pill, no glow.
function makeFlatLabel(text, w, h) {
  var canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c8cdd6'; ctx.font = '600 64px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return mesh;
}

function makeLabelSprite(text, colorHex) {
  var canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  var ctx = canvas.getContext('2d');
  // Rectangular caption: surface fill, 1px hairline border, light
  // text. No pill shape, no glow — the label is a caption, not a badge.
  ctx.fillStyle = 'rgba(31,31,33,0.95)';
  ctx.strokeStyle = '#2f2f31'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(3, 3, 506, 90, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f4f4f5'; ctx.font = '600 34px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var label = text;
  if (label.length > 11) {
    var parts = label.split(' ');
    if (parts.length > 1) { ctx.fillText(parts.slice(0, -1).join(' '), 256, 30); ctx.fillText(parts.slice(-1)[0], 256, 66); }
    else { ctx.fillText(label.slice(0, 10), 256, 30); ctx.fillText(label.slice(10), 256, 66); }
  } else { ctx.fillText(label, 256, 48); }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // depthTest ON: a label behind a block must hide, otherwise labels
  // pile up on top of each other in exploded / orbited views.
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
  var sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  return sprite;
}
function colorHex(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

// Round 12 procedural die texture (GEMM only): a 1024x472 canvas
// painted with the surface a real die actually shows — fine
// interconnect traces, a coarser power grid, via dots, subtle
// material variation, and a seal ring at the edge. No text in the
// texture (canvas-to-plane orientation would mirror it); the L2
// band gets its own engraved-style sprite label instead. The
// pattern is deterministic (seeded LCG), so screenshots are
// reproducible and no image asset is added to the site.
function makeDieTexture() {
  var canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 472;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2e33'; ctx.fillRect(0, 0, 1024, 472);
  var seed = 12345;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  var i;
  for (i = 0; i < 900; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (rnd() * 0.03).toFixed(3) + ')';
    ctx.fillRect(rnd() * 1024, rnd() * 472, 8 + rnd() * 40, 4 + rnd() * 20);
  }
  ctx.strokeStyle = 'rgba(61,67,77,0.65)'; ctx.lineWidth = 2;
  for (i = 0; i <= 1024; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 472); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(61,67,77,0.65)';
  for (i = 0; i <= 1024; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 472); ctx.stroke(); }
  for (i = 0; i <= 472; i += 118) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke(); }
  var traceColors = ['#3a414c', '#4b5563', '#c9a86a'];
  for (i = 0; i < 240; i++) {
    var horiz = rnd() > 0.5;
    var x0 = rnd() * 1024, y0 = rnd() * 472, len = 40 + rnd() * 200;
    ctx.strokeStyle = traceColors[Math.floor(rnd() * 3)];
    ctx.globalAlpha = ctx.strokeStyle === '#c9a86a' ? 0.45 : 0.60;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (horiz) { ctx.moveTo(x0, y0); ctx.lineTo(Math.min(x0 + len, 1024), y0); }
    else { ctx.moveTo(x0, y0); ctx.lineTo(x0, Math.min(y0 + len, 472)); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(155,155,164,0.32)';
  for (var vx = 16; vx < 1024; vx += 32) for (var vy = 16; vy < 472; vy += 32) {
    ctx.beginPath(); ctx.arc(vx, vy, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(74,74,82,0.7)'; ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 1012, 460);
  ctx.strokeStyle = 'rgba(74,74,82,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, 988, 436);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function SceneView(container, isCompare) {
  this.container = container;
  this.isCompare = !!isCompare;
  this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = 1.0;
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  this.renderer.domElement.style.display = 'block';
  this.renderer.domElement.style.width = '100%';
  this.renderer.domElement.style.height = '520px';
  this.renderer.domElement.tabIndex = 0;
  container.appendChild(this.renderer.domElement);
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x161618);
  this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  this.camera.position.set(11, 13, 18);
  this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  this.controls.enableDamping = true;
  this.controls.dampingFactor = 0.08;
  this.controls.minDistance = 6;
  this.controls.maxDistance = 45;
  this.controls.maxPolarAngle = Math.PI * 0.49;
  this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  var key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  // Round 11: shadow frustum widened from +/-13 to +/-16 — the GEMM
  // package is 29 wide with HBM slabs out to +/-13.35, so at +/-13
  // the outer slabs and exploded edge blocks fell outside the shadow
  // map and lost their grounding shadow.
  key.shadow.camera.left = -16; key.shadow.camera.right = 16;
  key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  this.scene.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.30); fill.position.set(-8, 6, -8); this.scene.add(fill);
  this.group = new THREE.Group(); this.scene.add(this.group);
  this.meshes = {}; this.labels = {}; this.flowLines = [];
  this.journeyId = null; this.stepKey = null; this.explodeT = 0;
  this.target = new THREE.Vector3(0, 0.4, 0);
  this.controls.target.copy(this.target);
  var self = this;
  this.raycaster = new THREE.Raycaster();
  this.pointer = new THREE.Vector2();
  this.hovered = null;
  function pick(ev) {
    var rect = self.renderer.domElement.getBoundingClientRect();
    self.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    self.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    self.raycaster.setFromCamera(self.pointer, self.camera);
    var hits = self.raycaster.intersectObjects(Object.keys(self.meshes).map(function (k) { return self.meshes[k]; }), false);
    return hits.length ? hits[0].object : null;
  }
  this.renderer.domElement.addEventListener('pointermove', function (ev) {
    var hit = pick(ev);
    self.hovered = hit ? hit.userData.id : null;
    self.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    var tip = document.getElementById('tooltip');
    if (hit && tip) {
      var node = hit.userData.node;
      tip.textContent = node.label + '：' + (node.detail || '');
      tip.style.display = 'block'; tip.style.left = (ev.clientX + 12) + 'px'; tip.style.top = (ev.clientY + 12) + 'px';
    } else if (tip) { tip.style.display = 'none'; }
    self.applyHighlight();
  });
  this.renderer.domElement.addEventListener('pointerleave', function () {
    var tip = document.getElementById('tooltip'); if (tip) tip.style.display = 'none';
    self.hovered = null; self.applyHighlight();
  });
  this.renderer.domElement.addEventListener('click', function (ev) {
    var hit = pick(ev);
    if (hit && window.__gpuExplorerOnSelect) window.__gpuExplorerOnSelect(hit.userData.id);
  });
  this.resize();
  var self2 = this;
  window.addEventListener('resize', function () { self2.resize(); });
  this.animate();
}
SceneView.prototype.resize = function () {
  var w = this.container.clientWidth || 800;
  var h = 520;
  this.renderer.setSize(w, h, false);
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
};
SceneView.prototype.build = function (journeyId, journey, model) {
  // Clear previous scene (except lights/camera, which live on this.scene).
  while (this.group.children.length) {
    var c = this.group.children.pop();
    if (c.geometry) c.geometry.dispose();
  }
  this.meshes = {}; this.labels = {}; this.flowLines = [];
  this.details = []; this.tsvLines = []; this.smGrid = null; this.smSub = null; this.l2BanksMesh = null; this.journeyDetail = null;
  this.journeyId = journeyId;
  this.model = model || 'h100';
  var isA100 = journeyId === 'gemm' && this.model === 'a100';
  this.renderer.toneMapping = isA100 ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  var boxes = M.boxesFor(journeyId, journey, this.model);
  var isStack = journeyId === 'stacking';
  // Package stack, contiguous, die slab top at -0.30 (where die
  // boxes ground): substrate, interposer, die slab. Round 10: the
  // substrate is only slightly larger than the die (GEX: the package
  // frames the die, it does not dwarf it), and a raised rim frame
  // around the die slab makes the die read as one object. NO grid
  // floor — no reference has one; the background is solid #161618.
  var slabW = isStack ? 20 : (journeyId === 'gemm' ? 20.8 : 22), slabD = isStack ? 12 : 9.6;
  var interW = isStack ? 21 : (journeyId === 'gemm' ? (isA100 ? 25.0 : 28) : 23.5), interD = isStack ? 13 : (isA100 ? 11.2 : 11.5);
  var subW = isStack ? 22 : (journeyId === 'gemm' ? (isA100 ? 25.8 : 29) : 24.5), subD = isStack ? 14 : (isA100 ? 12.0 : 12.5);
  var slabZ = isStack ? 1 : 0;
  var dieSlab = new THREE.Mesh(
    new THREE.BoxGeometry(slabW, 0.5, slabD),
    new THREE.MeshStandardMaterial({ color: 0x232b36, roughness: 0.35, metalness: 0.55 }));
  dieSlab.position.set(0, -0.55, slabZ);
  dieSlab.receiveShadow = true;
  this.group.add(dieSlab);
  // Round 12 (GEMM) / Round 17 (every die journey): the die
  // surface itself carries the detail — a thin textured plane
  // just above the slab top, so blocks sit on traces and a power
  // grid instead of on flat grey. Stacking is not a die journey,
  // so its column keeps the plain slab.
  if (journeyId !== 'stacking') {
    var dieTex = new THREE.Mesh(
      new THREE.PlaneGeometry(slabW, slabD),
      new THREE.MeshStandardMaterial({ map: makeDieTexture(), roughness: 0.65, metalness: 0.35 }));
    dieTex.rotation.x = -Math.PI / 2;
    dieTex.position.set(0, -0.28, slabZ);
    dieTex.receiveShadow = true;
    this.group.add(dieTex);
  }
  // Raised rim frame (4 thin bars, GEX-style): the die's edge, so the
  // blocks inside it read as one chip even at overview zoom.
  var self = this;
  if (!isStack) {
    var rimMat = new THREE.MeshStandardMaterial({ color: 0x5a5a66, roughness: 0.35, metalness: 0.6 });
    [-(slabD / 2 + 0.18), slabD / 2 + 0.18].forEach(function (rz) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.22, 0.35), rimMat);
      bar.position.set(0, -0.22, slabZ + rz); bar.receiveShadow = true; self.group.add(bar);
    });
    [-(slabW / 2 + 0.18), slabW / 2 + 0.18].forEach(function (rx) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, slabD), rimMat);
      bar.position.set(rx, -0.22, slabZ); bar.receiveShadow = true; self.group.add(bar);
    });
  }
  var interposer = new THREE.Mesh(
    new THREE.BoxGeometry(interW, 0.3, interD),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.8, metalness: 0 }));
  interposer.position.set(0, -0.95, slabZ);
  interposer.receiveShadow = true;
  this.group.add(interposer);
  if (isA100) {
    var interTop = new THREE.Mesh(
      new THREE.BoxGeometry(interW - 0.6, 0.08, interD - 0.6),
      new THREE.MeshStandardMaterial({ color: 0x35353a, roughness: 0.6, metalness: 0.3 }));
    interTop.position.set(0, -0.76, slabZ);
    interTop.receiveShadow = true;
    this.group.add(interTop);
  }
  var substrate = new THREE.Mesh(
    new THREE.BoxGeometry(subW, 0.4, subD),
    new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.8, metalness: 0 }));
  substrate.position.set(0, -1.3, slabZ);
  substrate.receiveShadow = true;
  this.group.add(substrate);
  // Front pin bar (GEX): one fine gold line along the package front
  // edge, so the near-black package has a defined edge against the
  // near-black background instead of dissolving into it. Round 12
  // (GEMM) / Round 17 (every die journey): a full instanced pin
  // fringe around the package instead — still 1 draw call — so
  // the package reads as a real chip from every orbit angle, not
  // just the front. Stacking keeps the front bar: its package is
  // a column, not a die.
  if (journeyId !== 'stacking') {
    // Round 16: fine dense BGA fringe, sized from the actual
    // substrate (not hardcoded ranges), still 1 InstancedMesh.
    var pinGeo = new THREE.BoxGeometry(0.12, 0.10, 0.30);
    var pinMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.4, metalness: 0.6 });
    var pinStep = 0.45, pinX = subW / 2 - 0.3, pinZ = subD / 2 - 0.3;
    var pinCount = 0;
    for (var px = -pinX; px <= pinX; px += pinStep) pinCount += 2;
    for (var pz = -pinZ; pz <= pinZ; pz += pinStep) pinCount += 2;
    var pins = new THREE.InstancedMesh(pinGeo, pinMat, pinCount);
    var dummy = new THREE.Object3D(); var pi = 0;
    for (var px2 = -pinX; px2 <= pinX; px2 += pinStep) {
      dummy.rotation.set(0, 0, 0); dummy.position.set(px2, -1.12, slabZ + pinZ); dummy.updateMatrix(); pins.setMatrixAt(pi++, dummy.matrix);
      dummy.position.set(px2, -1.12, slabZ - pinZ); dummy.updateMatrix(); pins.setMatrixAt(pi++, dummy.matrix);
    }
    for (var pz2 = -pinZ; pz2 <= pinZ; pz2 += pinStep) {
      dummy.rotation.set(0, Math.PI / 2, 0); dummy.position.set(pinX, -1.12, slabZ + pz2); dummy.updateMatrix(); pins.setMatrixAt(pi++, dummy.matrix);
      dummy.position.set(-pinX, -1.12, slabZ + pz2); dummy.updateMatrix(); pins.setMatrixAt(pi++, dummy.matrix);
    }
    this.group.add(pins);
  } else {
    var pinBar = new THREE.Mesh(
      new THREE.BoxGeometry(subW - 1.5, 0.08, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.4, metalness: 0.6 }));
    pinBar.position.set(0, -1.12, slabZ + subD / 2 - 0.3);
    this.group.add(pinBar);
  }
  var self = this;
  // Round 14 (A100 only): HBM as 5 stacks (official GA100/Ampere
  // count for A100; flank split 2 west / 3 east is a teaching
  // arrangement), not the two generic flanking slabs. Each stack is
  // a flat slab with 2 inset layers above it, so the edge reads
  // as a stack from any orbit angle, still flat in plan.
  if (isA100) {
    // HBM stack layers are one InstancedMesh per layer level
    // (2 draw calls for 10 layers), not 10 meshes — draw calls
    // are the frame-rate budget, not block count.
    var hbmStacks = M.a100HbmStacks();
    var hbmLayersByLevel = [[], []];
    hbmStacks.forEach(function (st) {
      var base = new THREE.Mesh(
        new THREE.BoxGeometry(st.w + 0.3, 0.15, st.d + 0.3),
        new THREE.MeshStandardMaterial({ color: 0x1f1f21, roughness: 0.8, metalness: 0 }));
      base.position.set(st.x, -0.18, st.z); base.receiveShadow = true; self.group.add(base);
      var slab = new THREE.Mesh(
        new THREE.BoxGeometry(st.w, 0.6, st.d),
        new THREE.MeshStandardMaterial({ color: 0x313131, roughness: 0.7, metalness: 0.1 }));
      slab.position.set(st.x, 0.05, st.z); slab.castShadow = true; slab.receiveShadow = true;
      slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry),
        new THREE.LineBasicMaterial({ color: 0x161618, transparent: true, opacity: 0.6 })));
      self.group.add(slab);
      var li;
      for (li = 0; li < 2; li++) hbmLayersByLevel[li].push({ x: st.x, z: st.z, w: st.w - 0.15 * (li + 1), d: st.d - 0.15 * (li + 1), y: 0.35 + li * 0.14 });
    });
    hbmLayersByLevel.forEach(function (level) {
      var im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 1),
        new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.45, metalness: 0.30 }), level.length);
      var dd = new THREE.Object3D();
      level.forEach(function (ly, li) {
        dd.position.set(ly.x, ly.y, ly.z); dd.scale.set(ly.w, 1, ly.d); dd.updateMatrix(); im.setMatrixAt(li, dd.matrix);
      });
      im.castShadow = true; im.receiveShadow = true; self.group.add(im);
    });
    // Figure 4 flanks: HBM2 Memory Controller strips, dark, both sides.
    M.a100HbmControllers().forEach(function (ct) {
      var strip = new THREE.Mesh(
        new THREE.BoxGeometry(ct.w, 0.6, ct.d),
        new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.5, metalness: 0.5 }));
      strip.position.set(ct.x, 0.05, ct.z); strip.castShadow = true; strip.receiveShadow = true;
      self.group.add(strip);
    });
    // Figure 4 north edge: PCIe Gen4 Host Interface (grey) +
    // GigaThread Engine with MIG Control (orange). South edge:
    // NVLink strip, 12 segments (A100 link count in the article).
    M.a100TopStrips().forEach(function (ts) {
      var strip2 = new THREE.Mesh(
        new THREE.BoxGeometry(ts.w, 0.5, ts.d),
        new THREE.MeshStandardMaterial({ color: ts.color, roughness: 0.6, metalness: 0.2 }));
      strip2.position.set(0, 0, ts.z); strip2.castShadow = true; strip2.receiveShadow = true;
      self.group.add(strip2);
    });
    // NVLink: 12 segments as one InstancedMesh (1 draw call).
    var nvSegs = M.a100Nvlink();
    var nvIm = new THREE.InstancedMesh(new THREE.BoxGeometry(nvSegs[0].w, 0.5, nvSegs[0].d),
      new THREE.MeshStandardMaterial({ color: 0x00cc00, roughness: 0.6, metalness: 0.2 }), nvSegs.length);
    var nvD = new THREE.Object3D();
    nvSegs.forEach(function (nv, ni) {
      nvD.position.set(nv.x, 0, nv.z); nvD.updateMatrix(); nvIm.setMatrixAt(ni, nvD.matrix);
    });
    nvIm.castShadow = true; nvIm.receiveShadow = true; self.group.add(nvIm);
  }
  if (journeyId === 'gemm' && !isA100) {
    // HBM package context (scenery, not selectable nodes): FLAT slabs
    // flanking the die, same height as die blocks (GEX global memory),
    // dark base + fine gold strip on the outer edge. No towers: in a
    // top view, height must not be the thing that says "memory".
    [-11.9, 11.9].forEach(function (tx) {
      var base = new THREE.Mesh(
        new THREE.BoxGeometry(2.9, 0.15, 7.5),
        new THREE.MeshStandardMaterial({ color: 0x1f1f21, roughness: 0.8, metalness: 0 }));
      base.position.set(tx, -0.18, 0); base.receiveShadow = true; self.group.add(base);
      var slab = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.6, 7.2),
        new THREE.MeshStandardMaterial({ color: 0x94e2d5, roughness: 0.7, metalness: 0.1 }));
      slab.position.set(tx, 0.05, 0); slab.castShadow = true; slab.receiveShadow = true;
      var ledges = new THREE.LineSegments(
        new THREE.EdgesGeometry(slab.geometry),
        new THREE.LineBasicMaterial({ color: 0x161618, transparent: true, opacity: 0.5 }));
      slab.add(ledges); self.group.add(slab);
      var gold = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.1, 7.2),
        new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.4, metalness: 0.6 }));
      gold.position.set(tx + (tx < 0 ? -1.4 : 1.4), -0.05, 0); self.group.add(gold);
      // Round 13 HBM layers: 3 stepped layers on each slab, so the
      // edge reads as a stack from any orbit angle (still flat in
      // plan — no Round 9 towers). Layers are scenery, not nodes.
      M.hbmLayers().filter(function (ly) { return (tx < 0) === (ly.x < 0); }).forEach(function (ly, li) {
        var layer = new THREE.Mesh(
          new THREE.BoxGeometry(ly.w, ly.h, ly.d),
          new THREE.MeshStandardMaterial({ color: ly.color, roughness: 0.45, metalness: 0.30 }));
        layer.position.set(tx, 0.35 + li * 0.14, 0); layer.castShadow = true; layer.receiveShadow = true;
        self.group.add(layer);
      });
    });
  }
  // Round 14 (A100 only): L2 as 2 partitions across the central
  // band (Figure 4: the band separates the top and bottom GPC
  // rows, with a seam in the middle), raised just above the SM
  // region plate so it reads across the die, plus a small L2
  // caption. No vertical west band and no interconnect bus here:
  // in Figure 4, L2 is the horizontal band between the GPC rows,
  // not a west-side strip.
  if (isA100) {
    M.a100L2Partitions().forEach(function (pt) {
      var part = new THREE.Mesh(
        new THREE.BoxGeometry(pt.w, pt.h, pt.d),
        new THREE.MeshStandardMaterial({ color: pt.color, roughness: 0.40, metalness: 0.50 }));
      part.position.set(pt.x, 0.75, pt.z); part.castShadow = true; part.receiveShadow = true;
      part.add(new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry),
        new THREE.LineBasicMaterial({ color: 0x161618, transparent: true, opacity: 0.6 })));
      self.group.add(part);
    });
    var l2Sprite2 = makeLabelSprite('L2', '#9b9ba4');
    l2Sprite2.scale.set(2.6, 0.57, 1);
    l2Sprite2.position.set(0, 1.55, 0);
    self.group.add(l2Sprite2);
    // GPC group outlines (scenery): thin frames around each of
    // the 7 enabled GPC groups and the 1 disabled position, so
    // the GPC -> TPC -> SM hierarchy reads at overview. The
    // disabled outline has no tiles inside it.
    M.a100GpcGroups().forEach(function (g) {
      var frameGeo = new THREE.BoxGeometry(g.w, 0.06, g.d);
      var frameMat = new THREE.LineBasicMaterial({ color: 0x8a8a96, transparent: true, opacity: g.enabled ? 0.9 : 0.5 });
      var frame = new THREE.LineSegments(new THREE.EdgesGeometry(frameGeo), frameMat);
      frame.position.set(g.x, 1.10, g.z);
      self.group.add(frame);
    });
  }
  // Round 13 (GEMM only): L2 as 6 banks, not one band, plus
  // a varying-width interconnect bus to the SM grid, plus an
  // engraved front-face label. PC Anatomy: repetition + width
  // variation + engraved text are what make a region read as
  // hardware instead of one solid brick.
  if (journeyId === 'gemm' && !isA100) {
    var l2b = M.l2Banks();
    var bankGeo = new THREE.BoxGeometry(l2b[0].w, l2b[0].h, l2b[0].d);
    var bankMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.40, metalness: 0.50 });
    var banks = new THREE.InstancedMesh(bankGeo, bankMat, l2b.length);
    var bd = new THREE.Object3D(); var bc = new THREE.Color();
    l2b.forEach(function (bk, bi) {
      bd.position.set(bk.x, bk.h / 2 - 0.25, bk.z); bd.updateMatrix(); banks.setMatrixAt(bi, bd.matrix);
      banks.setColorAt(bi, bc.setHex(bk.shade ? 0x7d7d88 : 0x9b9ba4));
    });
    banks.castShadow = true; banks.receiveShadow = true;
    self.group.add(banks);
    self.l2BanksMesh = banks;
    // Round 13, revised after screenshots: the engraved front-face
    // L2 label proved illegible at overview (foreshortened to a few
    // pixels), worse than Round 12's floating caption — dropped.
    // The small floating caption is restored; it is scenery, not
    // a node label, so the sparse node-label rule is unaffected.
    var l2 = M.floorplanL2();
    var l2Sprite = makeLabelSprite('L2', '#9b9ba4');
    l2Sprite.scale.set(2.2, 0.48, 1);
    l2Sprite.position.set(l2.x, l2.h / 2 + 0.45, l2.z);
    self.group.add(l2Sprite);
    M.interconnectBus().forEach(function (rb) {
      var ribbon = new THREE.Mesh(
        new THREE.BoxGeometry(rb.w, rb.h, rb.d),
        new THREE.MeshStandardMaterial({ color: rb.color, roughness: 0.30, metalness: 0.60 }));
      ribbon.position.set(rb.x, -0.27, rb.z); ribbon.receiveShadow = true;
      self.group.add(ribbon);
    });
  }
  boxes.forEach(function (box) {
    var node = journey.nodes.filter(function (n) { return n.id === box.id; })[0];
    var km = KIND_MAT[box.kind] || KIND_MAT.control;
    var mat = new THREE.MeshStandardMaterial({ color: box.color, roughness: km.roughness, metalness: km.metalness, transparent: !!box.disabled, opacity: box.disabled ? 0.45 : 1 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d), mat);
    mesh.position.set(box.x, box.y, box.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { id: box.id, node: node, box: box, baseColor: box.color };
    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x161618, transparent: true, opacity: 0.5 }));
    mesh.add(edges);
    // Stepped-slab profile (GEX): a darker plinth under the block and a
    // lighter inset top plate. Children of the mesh, so they follow it
    // on explode and on raycast-free rendering; their colours dim with
    // the parent in applyHighlight via userData.plinthMat/topMat.
    var plinthMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(box.color).multiplyScalar(0.55), roughness: 0.7, metalness: 0.1, transparent: !!box.disabled, opacity: box.disabled ? 0.45 : 1 });
    // Round 11: plinth thickened 0.14 -> 0.20 and dropped so its
    // bottom meets the die slab top (-0.30 world; die centre y is
    // h/2 - 0.25, so the plinth bottom must sit at -h/2 - 0.05
    // relative to the mesh centre). A floating plinth reads as a
    // floating block; a grounded one reads as a slab on silicon.
    var plinth = new THREE.Mesh(new THREE.BoxGeometry(box.w + 0.28, 0.20, box.d + 0.28), plinthMat);
    plinth.position.set(0, -box.h / 2 + 0.05, 0); plinth.receiveShadow = true; mesh.add(plinth);
    var topMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(box.color).multiplyScalar(1.12), roughness: 0.55, metalness: 0.2, transparent: !!box.disabled, opacity: box.disabled ? 0.45 : 1 });
    var topPlate = new THREE.Mesh(new THREE.BoxGeometry(Math.max(box.w - 0.45, 0.5), 0.12, Math.max(box.d - 0.45, 0.5)), topMat);
    topPlate.position.set(0, box.h / 2 - 0.05, 0); mesh.add(topPlate);
    mesh.userData.plinthMat = plinthMat; mesh.userData.topMat = topMat;
    mesh.userData.plinthBase = plinthMat.color.clone(); mesh.userData.topBase = topMat.color.clone();
    // Round 11 active/selected frame: a thin amber (active) or
    // indigo (selected) border on the block's top face, toggled in
    // applyHighlight. The pop is the frame, not a wash over the
    // whole block, so the base hue stays identifiable. Child of the
    // mesh, so it follows explode and is not raycast-pickable
    // (pick() uses recursive=false on the meshes dict only).
    var frameMat = new THREE.MeshStandardMaterial({ color: ACTIVE_EMISSIVE, emissive: ACTIVE_EMISSIVE, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.2 });
    var frame = new THREE.Group();
    var fxA = new THREE.Mesh(new THREE.BoxGeometry(box.w, 0.09, 0.20), frameMat);
    fxA.position.set(0, box.h / 2 + 0.055, box.d / 2 - 0.10); frame.add(fxA);
    var fxB = new THREE.Mesh(new THREE.BoxGeometry(box.w, 0.09, 0.20), frameMat);
    fxB.position.set(0, box.h / 2 + 0.055, -(box.d / 2 - 0.10)); frame.add(fxB);
    var fzA = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.09, Math.max(box.d - 0.40, 0.3)), frameMat);
    fzA.position.set(box.w / 2 - 0.10, box.h / 2 + 0.055, 0); frame.add(fzA);
    var fzB = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.09, Math.max(box.d - 0.40, 0.3)), frameMat);
    fzB.position.set(-(box.w / 2 - 0.10), box.h / 2 + 0.055, 0); frame.add(fzB);
    frame.visible = false; mesh.add(frame);
    mesh.userData.frame = frame; mesh.userData.frameMat = frameMat;
    // Round 11 stacking shelf: a shared base under each side block,
    // spanning the gap to the column face (pure geometry from
    // scene-map.js, so it is unit-tested there). Child of the mesh,
    // so on explode it rides its block outwards and separates with
    // it, as exploded parts should; at explode 0 it grounds the
    // block to the column instead of floating.
    if (isStack && (box.id === 'cut-core' || box.id === 'gpu-block')) {
      var sh = M.stackingShelf(box);
      var shelf = new THREE.Mesh(
        new THREE.BoxGeometry(sh.w, sh.h, sh.d),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.8, metalness: 0 }));
      shelf.position.set(sh.dx, sh.dy, sh.dz); shelf.receiveShadow = true; mesh.add(shelf);
    }
    self.group.add(mesh); self.meshes[box.id] = mesh;
    var sprite = makeLabelSprite(box.label + (box.disabled ? ' ×' : ''), colorHex(box.color));
    var lw = Math.min(Math.max(box.w + 0.5, 2.0), 3.4);
    sprite.scale.set(lw, lw * 0.22, 1);
    sprite.position.set(box.x, box.y + box.h / 2 + (box.labelDy || 0.55), box.z + (box.labelZ || 0));
    self.group.add(sprite); self.labels[box.id] = sprite;
  });
  // Round 12 SM grid (GEMM only): the SM region is drawn as one
  // InstancedMesh of 18 tiles (pure offsets from scene-map.js),
  // so the region reads as an array of SMs — the single most
  // Lego-breaking change, since one big blue block was the
  // clearest "toy brick" in Round 11. Non-pickable (not in the
  // meshes dict, so raycasts still hit the SM region slab under
  // it); it follows the SM box on explode (see update) and dims
  // with it (see applyHighlight). The old 2x2 smDetails are kept
  // in scene-map.js for tests but are no longer drawn: 4 giant
  // subpartitions on an 8-wide region read as 4 more bricks.
  if (journeyId === 'gemm') {
    var smBox = boxes.filter(function (b) { return b.id === 'sm'; })[0];
    var smMesh = self.meshes['sm'];
    if (smBox && smMesh) {
      // Round 14 (A100 only): tiles are the 28 GPC-group tiles
      // (7 groups x 2x2), not the generic 6x3 grid; sub-cells are
      // the Figure 5 bands (L0 / scheduler / dispatch / register /
      // datapath / tensor / LD-ST / SFU), grouped by role into
      // one InstancedMesh each, exactly as the generic path does.
      var tiles = isA100 ? M.a100SmTiles(smBox) : M.smGridTiles(smBox);
      var tileGeo = new THREE.BoxGeometry(tiles[0].w, 0.22, tiles[0].d);
      var tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.25 });
      var grid = new THREE.InstancedMesh(tileGeo, tileMat, tiles.length);
      var gd = new THREE.Object3D(); var gc = new THREE.Color();
      tiles.forEach(function (t, ti) {
        gd.position.set(smBox.x + t.dx, smBox.y + smBox.h / 2 + 0.11, smBox.z + t.dz);
        gd.updateMatrix(); grid.setMatrixAt(ti, gd.matrix);
        var v = 0.92 + ((ti * 37) % 5) * 0.03;
        grid.setColorAt(ti, gc.setHex(isA100 ? 0x598b00 : 0x89b4fa).multiplyScalar(isA100 ? 1 : v));
      });
      grid.castShadow = true; grid.receiveShadow = true;
      self.group.add(grid);
      self.smGrid = { mesh: grid, box: smBox, tiles: tiles };
      // Round 13 sub-cells: every tile subdivided PC-Anatomy-style
      // (scheduler / core grid / tensor / register), as 4
      // InstancedMeshes (4 draw calls for 414 small geometries).
      // Unit-box geometry scaled per instance; colours are the
      // PC-Anatomy subpart colours from scene-map.js. They ride
      // the SM box on explode (see update) and dim with it (see
      // applyHighlight); they are never separate selections.
      var subCells = isA100 ? M.a100SmSubCells(smBox) : M.smTileSubCells(smBox);
      var subMeshes = {};
      var subRoles = [];
      subCells.forEach(function (c) { if (subRoles.indexOf(c.role) < 0) subRoles.push(c.role); });
      subRoles.forEach(function (role) {
        var cells = subCells.filter(function (c) { return c.role === role; });
        var rm = { l0: [0.50, 0.30], scheduler: [0.50, 0.30], dispatch: [0.55, 0.25], register: [0.45, 0.40], int32: [0.35, 0.55], fp32: [0.35, 0.55], fp64: [0.35, 0.55], tensor: [0.30, 0.65], ldst: [0.50, 0.35], sfu: [0.50, 0.35] }[role];
        var mat = isA100 && rm
          ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rm[0], metalness: rm[1] })
          : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.55 });
        var im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cells.length);
        var d2 = new THREE.Object3D(); var cc = new THREE.Color();
        cells.forEach(function (c, ci) {
          d2.position.set(smBox.x + c.dx, smBox.y + smBox.h / 2 + 0.22 + c.h / 2, smBox.z + c.dz);
          d2.scale.set(c.w, c.h, c.d); d2.updateMatrix(); im.setMatrixAt(ci, d2.matrix);
          var v = 0.92 + ((ci * 37) % 5) * 0.03;
          im.setColorAt(ci, cc.setHex(c.color).multiplyScalar(isA100 ? 1 : v));
        });
        im.castShadow = true; im.receiveShadow = true;
        self.group.add(im);
        subMeshes[role] = { mesh: im, cells: cells };
      });
      self.smSub = { meshes: subMeshes, box: smBox };
    }
  }
  // Round 17 detail cells (pagetable, pixel, stacking only;
  // GEMM keeps its SM grid/sub-cells above, A100 keeps its
  // Figure 5 bands): one InstancedMesh per role, cells sitting
  // on their parent block's top plate (parent top = box.y +
  // box.h/2 + 0.01, the top plate's top face). Non-pickable,
  // like the SM detail: they are relief, never selections.
  // They ride their parent on explode (see update) and dim
  // with it (see applyHighlight).
  (function () {
    var detailCells = null;
    if (journeyId === 'pagetable') detailCells = M.pagetableDetailCells(boxes);
    else if (journeyId === 'pixel') detailCells = M.pixelDetailCells(boxes);
    else if (journeyId === 'stacking') detailCells = M.stackingDetailCells(boxes);
    if (!detailCells || !detailCells.length) return;
    var byId2 = {}; boxes.forEach(function (b) { byId2[b.id] = b; });
    var roles = [];
    detailCells.forEach(function (c) { if (roles.indexOf(c.role) < 0) roles.push(c.role); });
    var meshes = {};
    roles.forEach(function (role) {
      var cells = detailCells.filter(function (c) { return c.role === role; });
      var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.55 });
      var im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cells.length);
      var dd = new THREE.Object3D(); var cc2 = new THREE.Color();
      cells.forEach(function (c, ci) {
        var parent = byId2[c.parent];
        dd.position.set(parent.x + c.dx, parent.y + parent.h / 2 + 0.01 + c.h / 2, parent.z + c.dz);
        dd.scale.set(c.w, c.h, c.d); dd.updateMatrix(); im.setMatrixAt(ci, dd.matrix);
        var v = 0.92 + ((ci * 37) % 5) * 0.03;
        im.setColorAt(ci, cc2.setHex(c.color).multiplyScalar(v));
      });
      im.castShadow = true; im.receiveShadow = true;
      self.group.add(im);
      meshes[role] = { mesh: im, cells: cells };
    });
    self.journeyDetail = { meshes: meshes, boxes: byId2 };
  })();
  // TSV hints (stacking only): sparse vertical lines between
  // adjacent layers, updated every frame in animate() so they
  // stretch across the gap as the stack explodes. At explode 0 the
  // layers already stand apart, so the lines read as the vertical
  // interconnect field between layers.
  if (isStack) {
    [['logic-top', 'bond'], ['bond', 'logic-low'], ['logic-low', 'mem-layer']].forEach(function (pair) {
      [-2.4, -0.8, 0.8, 2.4].forEach(function (dx) {
        [-1.6, 1.6].forEach(function (dz) {
          var geo = new THREE.BufferGeometry();
          geo.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
          var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9b9ba4, transparent: true, opacity: 0.55 }));
          self.group.add(line);
          self.tsvLines.push({ line: line, upper: pair[0], lower: pair[1], dx: dx, dz: dz });
        });
      });
    });
  }
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  (journey.flows || []).forEach(function (f) {
    var a = byId[f.from], b = byId[f.to]; if (!a || !b) return;
    var geo = new THREE.BufferGeometry();
    var pts = f.route === 'return'
      ? [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(a.x, -0.1, a.z + 2), new THREE.Vector3(b.x, -0.1, b.z + 2), new THREE.Vector3(b.x, b.y, b.z)]
      : [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
    geo.setFromPoints(pts);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.5 }));
    line.userData = { from: f.from, to: f.to, route: f.route || null, key: f.from + '>' + f.to };
    self.group.add(line); self.flowLines.push(line);
  });
  // Camera framing is fixed per journey and is a flattering 3/4 view
  // (offset on both axes, showing depth), never flat top-down. Step
  // changes highlight blocks and update the inspector, but must NOT
  // shift the camera: shifting camera + target together moves the
  // whole die and cuts edge blocks out of frame (verified bug in the
  // first 3D screenshots).
  if (isStack) { this.camera.position.set(4, 12, 20); this.target.set(0, 2.6, 0.5); }
  // Round 11: die cameras lowered (GEMM elevation ~44deg -> ~38deg,
  // other die ~43deg -> ~35deg) and pulled slightly out, so the
  // taller slabs' sides read at overview without clipping the
  // 29-wide GEMM package — verified against screenshots, not assumed.
  else if (journeyId === 'gemm') { this.camera.position.set(8, 17, 20); this.target.set(0, 0.3, 0); }
  else { this.camera.position.set(9, 15, 19); this.target.set(0, 0.4, 0); }
  this.controls.target.copy(this.target); this.stepKey = null;
};
SceneView.prototype.applyHighlight = function (step, selectedId) {
  var self = this;
  // Hover calls applyHighlight() with no args; keep the last step and
  // selection so a hover does not wipe the step highlight or the
  // selected label.
  if (step) this.lastStep = step;
  if (selectedId !== undefined) this.lastSelected = selectedId;
  step = this.lastStep; selectedId = this.lastSelected;
  var active = {};
  if (step) (step.active || []).forEach(function (id) { active[id] = true; });
  var noDim = this.journeyId === 'gemm' && this.model === 'a100';
  Object.keys(this.meshes).forEach(function (id) {
    var mesh = self.meshes[id]; var base = new THREE.Color(mesh.userData.baseColor);
    var isActive = !!active[id]; var isSel = selectedId === id; var isHover = self.hovered === id;
    mesh.material.color.copy(base);
    // Gentle dim for non-active blocks; active pops via full colour
    // + amber emissive only (indigo is reserved for explicit selection,
    // so active never turns into muddy lavender over teal/blue).
    var dim = noDim ? 1 : ((!isActive && !isSel) ? (isHover ? 0.92 : DIM_FACTOR) : 1);
    if (dim !== 1) mesh.material.color.multiplyScalar(dim);
    if (mesh.userData.plinthMat) { mesh.userData.plinthMat.color.copy(mesh.userData.plinthBase); if (dim !== 1) mesh.userData.plinthMat.color.multiplyScalar(dim); }
    if (mesh.userData.topMat) { mesh.userData.topMat.color.copy(mesh.userData.topBase); if (dim !== 1) mesh.userData.topMat.color.multiplyScalar(dim); }
    // Round 11: wash cut back — active 0.45 -> 0.20, selected
    // 1.0 -> 0.30 — so a teal block stays teal instead of washing
    // toward cream under amber + a brightened top plate. The pop
    // is now the top-face frame below, not the emissive.
    mesh.material.emissive = new THREE.Color(isSel ? SELECT_EMISSIVE : (isActive ? ACTIVE_EMISSIVE : 0x000000));
    mesh.material.emissiveIntensity = noDim ? 0 : (isSel ? 0.30 : (isActive ? 0.20 : 0));
    mesh.scale.setScalar((isSel || isHover) ? 1.05 : 1);
    var frame = mesh.userData.frame;
    if (frame) {
      frame.visible = !!(isSel || isActive);
      if (isSel || isActive) {
        var fc = isSel ? SELECT_EMISSIVE : ACTIVE_EMISSIVE;
        mesh.userData.frameMat.color.setHex(fc);
        mesh.userData.frameMat.emissive.setHex(fc);
      }
    }
    // Round 10 label rule (GEX/PC Anatomy): die journeys show a label
    // ONLY for the active / selected / hovered block, larger than
    // before, so the frame is not 40% label rectangles. Stacking keeps
    // all front callouts: a cross-section's layer names are its content.
    var spr = self.labels[id];
    if (spr) {
      var bw = Math.min(Math.max(mesh.userData.box.w + 0.5, 2.0), 3.4);
      var ls = (isSel || isActive) ? 1.12 : 1;
      spr.scale.set(bw * ls, bw * ls * 0.22, 1);
      spr.material.color.setHex(0xffffff);
      if (self.journeyId !== 'stacking') spr.visible = !!(isSel || isActive || isHover);
    }
  });
  // SM detail dims with its parent block; it is never a separate
  // selection, so it never gets its own accent.
  (this.details || []).forEach(function (d) {
    var parentActive = !!active[d.mesh.userData.parentId];
    var parentSel = selectedId === d.mesh.userData.parentId;
    d.mesh.material.color.setHex(d.mesh.userData.baseColor);
    if (!parentActive && !parentSel && !noDim) d.mesh.material.color.multiplyScalar(DIM_FACTOR);
    d.mesh.material.emissive = new THREE.Color((parentSel || parentActive) ? ACTIVE_EMISSIVE : 0x000000);
    d.mesh.material.emissiveIntensity = noDim ? 0 : ((parentSel || parentActive) ? 0.20 : 0);
  });
  // Round 12: the SM grid dims with its region slab the same way
  // (material colour multiplies the per-tile instance colours).
  if (this.smGrid) {
    var gridActive = !!active['sm']; var gridSel = selectedId === 'sm';
    this.smGrid.mesh.material.color.setScalar(noDim ? 1 : ((gridActive || gridSel) ? 1 : DIM_FACTOR));
    this.smGrid.mesh.material.emissive = new THREE.Color((gridSel || gridActive) ? ACTIVE_EMISSIVE : 0x000000);
    this.smGrid.mesh.material.emissiveIntensity = noDim ? 0 : ((gridSel || gridActive) ? 0.20 : 0);
  }
  // Round 13: sub-cells dim with their SM region, L2 banks stay
  // neutral scenery (no step names L2, so no highlight of it).
  if (this.smSub) {
    var subActive = !!active['sm']; var subSel = selectedId === 'sm';
    Object.keys(this.smSub.meshes).forEach(function (role) {
      var mm = self.smSub.meshes[role].mesh;
      mm.material.color.setScalar(noDim ? 1 : ((subActive || subSel) ? 1 : DIM_FACTOR));
      mm.material.emissive = new THREE.Color((subSel || subActive) ? ACTIVE_EMISSIVE : 0x000000);
      mm.material.emissiveIntensity = noDim ? 0 : ((subSel || subActive) ? 0.20 : 0);
    });
  }
  // Round 17: journey detail cells dim with their parents. A role
  // mesh spans several parents (e.g. pt-entry spans 4 levels), so
  // it stays bright if ANY of its parents is active/selected.
  if (this.journeyDetail) {
    Object.keys(this.journeyDetail.meshes).forEach(function (role) {
      var entry = self.journeyDetail.meshes[role];
      var lit = entry.cells.some(function (c) { return !!active[c.parent] || selectedId === c.parent; });
      entry.mesh.material.color.setScalar(lit ? 1 : DIM_FACTOR);
      entry.mesh.material.emissive = new THREE.Color(lit ? ACTIVE_EMISSIVE : 0x000000);
      entry.mesh.material.emissiveIntensity = lit ? 0.20 : 0;
    });
  }
  if (step) {
    var live = {}; (step.flows || []).forEach(function (f) { live[f] = true; });
    this.flowLines.forEach(function (line) {
      var hot = !!live[line.userData.key];
      line.material.color.setHex(hot ? FLOW_HOT : FLOW_IDLE);
      line.material.opacity = hot ? 1 : 0.3;
    });
  }
};
SceneView.prototype.update = function (journeyId, journey, step, selectedId, explodeT, model) {
  // Round 14: model is part of the scene identity — switching
  // model (e.g. H100 teaching layout -> A100 Ampere layout)
  // rebuilds the scene, just as switching journey does, so
  // GA100/Ampere geometry can never linger in another model's
  // diagram, and vice versa.
  if (this.journeyId !== journeyId || (model && this.model !== model)) this.build(journeyId, journey, model);
  this.explodeT = explodeT;
  var self = this;
  Object.keys(this.meshes).forEach(function (id) {
    var mesh = self.meshes[id]; var box = mesh.userData.box;
    var p = M.explodePos(box, explodeT);
    mesh.position.set(p.x, p.y, p.z);
    var spr = self.labels[id];
    if (spr) spr.position.set(p.x, p.y + box.h / 2 + (box.labelDy || 0.55), p.z + (box.labelZ || 0));
  });
  // Detail meshes ride their parent block's exploded position.
  (this.details || []).forEach(function (d) {
    var p = M.explodePos(d.box, explodeT);
    d.mesh.position.set(p.x + d.dx, p.y + d.dy, p.z + d.dz);
  });
  // Round 12: the SM grid rides its region slab on explode, as one
  // instanced mesh (matrix update only, no new draw calls).
  if (this.smGrid) {
    var gp = M.explodePos(this.smGrid.box, explodeT);
    var gd2 = new THREE.Object3D();
    this.smGrid.tiles.forEach(function (t, ti) {
      gd2.position.set(gp.x + t.dx, gp.y + this.smGrid.box.h / 2 + 0.11, gp.z + t.dz);
      gd2.updateMatrix(); this.smGrid.mesh.setMatrixAt(ti, gd2.matrix);
    }, this);
    this.smGrid.mesh.instanceMatrix.needsUpdate = true;
  }
  // Round 13: sub-cell instances ride the same exploded SM centre.
  if (this.smSub) {
    var sp = M.explodePos(this.smSub.box, explodeT);
    var sd = new THREE.Object3D();
    Object.keys(this.smSub.meshes).forEach(function (role) {
      var entry = self.smSub.meshes[role];
      entry.cells.forEach(function (c, ci) {
        sd.position.set(sp.x + c.dx, sp.y + self.smSub.box.h / 2 + 0.22 + c.h / 2, sp.z + c.dz);
        sd.scale.set(c.w, c.h, c.d); sd.updateMatrix(); entry.mesh.setMatrixAt(ci, sd.matrix);
      });
      entry.mesh.instanceMatrix.needsUpdate = true;
    });
  }
  // Round 17: journey detail cells ride their own parent block on
  // explode (each cell's parent may differ, unlike the SM case).
  if (this.journeyDetail) {
    var jd = new THREE.Object3D();
    var jdBoxes = this.journeyDetail.boxes;
    Object.keys(this.journeyDetail.meshes).forEach(function (role) {
      var entry = self.journeyDetail.meshes[role];
      entry.cells.forEach(function (c, ci) {
        var pb = jdBoxes[c.parent];
        var pp = M.explodePos(pb, explodeT);
        jd.position.set(pp.x + c.dx, pp.y + pb.h / 2 + 0.01 + c.h / 2, pp.z + c.dz);
        jd.scale.set(c.w, c.h, c.d); jd.updateMatrix(); entry.mesh.setMatrixAt(ci, jd.matrix);
      });
      entry.mesh.instanceMatrix.needsUpdate = true;
    });
  }
  this.applyHighlight(step, selectedId);
  // Deliberately no camera move on step change: the active blocks are
  // highlighted in place and the inspector follows; the user keeps
  // whatever orbit/zoom they chose. focusCentroid stays available for
  // tests and for a future explicit "focus" button, not auto-applied.
};
SceneView.prototype.setCameraPreset = function (name) {
  // Preset viewpoints per hierarchy level (research manual): the
  // default three-quarter view, a top-down view, and a side /
  // cross-section view. Step changes never move the camera; only
  // this explicit control does.
  var t = this.target;
  if (name === 'top') { this.camera.position.set(t.x, 24, t.z + 0.01); }
  else if (name === 'side') { this.camera.position.set(0, t.y + 0.8, 26); }
  else { // three-quarter: journey default framing (Round 11 values)
    if (this.journeyId === 'stacking') { this.camera.position.set(4, 12, 20); }
    else if (this.journeyId === 'gemm') { this.camera.position.set(8, 17, 20); }
    else { this.camera.position.set(9, 15, 19); }
  }
  this.controls.target.copy(t);
  this.controls.update();
};
SceneView.prototype.animate = function () {
  var self = this;
  function loop() {
    requestAnimationFrame(loop);
    // TSV hint lines follow their layer faces every frame, so they
    // stretch across the gap as the stack explodes.
    (self.tsvLines || []).forEach(function (tv) {
      var up = self.meshes[tv.upper], lo = self.meshes[tv.lower];
      if (!up || !lo) return;
      var pos = tv.line.geometry.attributes.position;
      pos.setXYZ(0, up.position.x + tv.dx, up.position.y - up.userData.box.h / 2, up.position.z + tv.dz);
      pos.setXYZ(1, lo.position.x + tv.dx, lo.position.y + lo.userData.box.h / 2, lo.position.z + tv.dz);
      pos.needsUpdate = true;
    });
    // Flow lines follow exploded block positions every frame.
    self.flowLines.forEach(function (line) {
      var a = self.meshes[line.userData.from], b = self.meshes[line.userData.to];
      if (!a || !b) return;
      var pos = line.geometry.attributes.position;
      if (line.userData.route === 'return') {
        pos.setXYZ(0, a.position.x, a.position.y, a.position.z);
        pos.setXYZ(1, a.position.x, -0.1, a.position.z + 2);
        pos.setXYZ(2, b.position.x, -0.1, b.position.z + 2);
        pos.setXYZ(3, b.position.x, b.position.y, b.position.z);
      } else {
        pos.setXYZ(0, a.position.x, a.position.y, a.position.z);
        pos.setXYZ(1, b.position.x, b.position.y, b.position.z);
      }
      pos.needsUpdate = true;
    });
    self.controls.update();
    self.renderer.render(self.scene, self.camera);
  }
  loop();
};

var mainView = null, compareView = null, explodeT = 0;
if (typeof window.__gpuExplorerExplode === 'number') explodeT = window.__gpuExplorerExplode;
function init() {
  var mainEl = document.getElementById('scene3d');
  if (!mainEl) return;
  mainView = new SceneView(mainEl, false);
  var cmpEl = document.getElementById('scene3d-compare');
  if (cmpEl) compareView = new SceneView(cmpEl, true);
  window.GpuExplorer3D = {
    setCamera: function (name) { if (mainView) mainView.setCameraPreset(name); },
    setExplode: function (t) { explodeT = M.clamp01(t); if (window.__gpuExplorerRender) window.__gpuExplorerRender(); },
    getExplode: function () { return explodeT; },
    update: function (journey, step, state) {
      if (mainView) mainView.update(state.journey, journey, step, state.selected, explodeT, state.model);
      var cmpBox = document.getElementById('compare-diagram');
      if (state.compareModel && compareView && cmpBox && cmpBox.style.display !== 'none') {
        compareView.update(state.journey, journey, step, state.selected, explodeT, state.compareModel);
      }
    }
  };
  if (window.__gpuExplorerRender) window.__gpuExplorerRender();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
