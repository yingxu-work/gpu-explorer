// GPU Explorer — real Three.js / WebGL 3D scene (local bundle, no CDN).
// Low-poly boxes only, Standard materials, no post-processing, so it
// stays interactive in SwiftShader headless Chrome as well as on a
// normal laptop GPU. Server side stays CPU-only; WebGL runs on the client.
//
// Round 9 look: the research manual's fixed hardware legend
// (compute blue, memory teal, data sand, control grey; movement lines
// pale yellow; single accent indigo for selection/active only), canvas
// #161618, matte MeshStandardMaterial (silicon roughness 0.6 /
// metalness 0.2, substrate rougher at 0.8 / 0), a three-light rig with
// NO coloured lights and no bloom/post-processing, thin dark edge
// lines on every block, and rectangular caption labels (no pills).
// The die reads as a package: substrate slab, interposer slab, die
// slab; the GEMM die is flanked by tall layered HBM towers on the
// interposer as package context (scenery, not selectable nodes).
// Stacking layers carry sparse TSV hint lines between layers, which
// stretch as the stack explodes. Shadows: one small 1024px map on the
// key light only.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

var S = window.GpuExplorerState;
var M = window.GpuExplorerSceneMap;
var ACTIVE_EMISSIVE = 0x5e6ad2;
var SELECT_EMISSIVE = 0x5e6ad2;
var FLOW_HOT = 0xfab387; // flow lines share the data hue, so the 3-item legend stays honest
var FLOW_IDLE = 0x4a4a4e;
var DIM_FACTOR = 0.78;
// One matte material recipe for all silicon: roughness 0.6,
// metalness 0.2. Colour, not finish, carries the hardware meaning.
var KIND_MAT = {
  compute: { roughness: 0.6, metalness: 0.2 },
  memory: { roughness: 0.6, metalness: 0.2 },
  data: { roughness: 0.6, metalness: 0.2 },
  control: { roughness: 0.6, metalness: 0.2 }
};

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
  this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  var key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -13; key.shadow.camera.right = 13;
  key.shadow.camera.top = 13; key.shadow.camera.bottom = -13;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  this.scene.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-8, 6, -8); this.scene.add(fill);
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
SceneView.prototype.build = function (journeyId, journey) {
  // Clear previous scene (except lights/camera, which live on this.scene).
  while (this.group.children.length) {
    var c = this.group.children.pop();
    if (c.geometry) c.geometry.dispose();
  }
  this.meshes = {}; this.labels = {}; this.flowLines = [];
  this.details = []; this.tsvLines = [];
  this.journeyId = journeyId;
  var boxes = M.boxesFor(journeyId, journey);
  var isStack = journeyId === 'stacking';
  // Package stack, contiguous, die slab top at -0.30 (where die
  // boxes ground): substrate, interposer, die slab. No pin fringe,
  // no spine: the palette allows no extra hue, and the slabs plus
  // edge lines already read as a package.
  var slabW = isStack ? 20 : 23, slabD = isStack ? 12 : 12;
  var interW = isStack ? 21 : 30, interD = isStack ? 13 : 16;
  var subW = isStack ? 22 : 31, subD = isStack ? 14 : 17;
  var dieSlab = new THREE.Mesh(
    new THREE.BoxGeometry(slabW, 0.5, slabD),
    new THREE.MeshStandardMaterial({ color: 0x1f1f21, roughness: 0.6, metalness: 0.2 }));
  dieSlab.position.set(0, -0.55, isStack ? 1 : 0);
  dieSlab.receiveShadow = true;
  this.group.add(dieSlab);
  var interposer = new THREE.Mesh(
    new THREE.BoxGeometry(interW, 0.3, interD),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.8, metalness: 0 }));
  interposer.position.set(0, -0.95, isStack ? 1 : 0);
  interposer.receiveShadow = true;
  this.group.add(interposer);
  var substrate = new THREE.Mesh(
    new THREE.BoxGeometry(subW, 0.4, subD),
    new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.8, metalness: 0 }));
  substrate.position.set(0, -1.3, isStack ? 1 : 0);
  substrate.receiveShadow = true;
  this.group.add(substrate);
  var grid = new THREE.GridHelper(26, 26, 0x2f2f31, 0x1f1f21);
  grid.position.y = -0.28; this.group.add(grid);
  var self = this;
  if (journeyId === 'gemm') {
    // HBM package context (scenery, not selectable nodes): tall
    // layered towers flanking the die on the interposer slab. Five
    // layers each, sand hue = off-die memory, so height reads as
    // "stacked" against the flat die. One caption label per tower.
    [-13.5, 13.5].forEach(function (tx) {
      var layerGeo = new THREE.BoxGeometry(2.8, 0.5, 5.0);
      var baseGeo = new THREE.BoxGeometry(3.0, 0.35, 5.2);
      for (var li = 0; li < 5; li++) {
        var lm = new THREE.MeshStandardMaterial({ color: 0xfab387, roughness: 0.6, metalness: 0.2 });
        var layer = new THREE.Mesh(li === 0 ? baseGeo : layerGeo, lm);
        layer.position.set(tx, -0.55 + li * 0.62, 0);
        layer.receiveShadow = true;
        var ledges = new THREE.LineSegments(
          new THREE.EdgesGeometry(layer.geometry),
          new THREE.LineBasicMaterial({ color: 0x161618, transparent: true, opacity: 0.5 }));
        layer.add(ledges);
        self.group.add(layer);
      }
      var hbmLabel = makeLabelSprite('HBM', '#fab387');
      hbmLabel.scale.set(2.0, 0.4, 1);
      hbmLabel.position.set(tx, 2.9, 0);
      self.group.add(hbmLabel);
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
    self.group.add(mesh); self.meshes[box.id] = mesh;
    var sprite = makeLabelSprite(box.label + (box.disabled ? ' ×' : ''), colorHex(box.color));
    var lw = Math.min(Math.max(box.w + 0.5, 1.7), 2.7);
    sprite.scale.set(lw, lw * 0.20, 1);
    sprite.position.set(box.x, box.y + box.h / 2 + (box.labelDy || 0.55), box.z + (box.labelZ || 0));
    self.group.add(sprite); self.labels[box.id] = sprite;
  });
  // SM subpartition detail (GEMM only): non-pickable detail meshes
  // from the pure mapping in scene-map.js. They follow the SM box on
  // explode (see update) and dim with it (see applyHighlight).
  if (journeyId === 'gemm') {
    var smBox = boxes.filter(function (b) { return b.id === 'sm'; })[0];
    var smMesh = self.meshes['sm'];
    if (smBox && smMesh) {
      M.smDetails(smBox).forEach(function (d) {
        var dmat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6, metalness: 0.2 });
        var dmesh = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), dmat);
        dmesh.receiveShadow = true;
        var dedges = new THREE.LineSegments(
          new THREE.EdgesGeometry(dmesh.geometry),
          new THREE.LineBasicMaterial({ color: 0x161618, transparent: true, opacity: 0.5 }));
        dmesh.add(dedges);
        dmesh.userData = { baseColor: d.color, parentId: 'sm' };
        self.group.add(dmesh);
        self.details.push({ mesh: dmesh, box: smBox, dx: d.dx, dy: d.dy, dz: d.dz });
      });
    }
  }
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
  else if (journeyId === 'gemm') { this.camera.position.set(10, 15, 24); this.target.set(0, 0.6, 0); }
  else { this.camera.position.set(11, 13, 18); this.target.set(0, 0.4, 0); }
  this.controls.target.copy(this.target); this.stepKey = null;
};
SceneView.prototype.applyHighlight = function (step, selectedId) {
  var self = this;
  var active = {};
  if (step) (step.active || []).forEach(function (id) { active[id] = true; });
  Object.keys(this.meshes).forEach(function (id) {
    var mesh = self.meshes[id]; var base = new THREE.Color(mesh.userData.baseColor);
    var isActive = !!active[id]; var isSel = selectedId === id; var isHover = self.hovered === id;
    mesh.material.color.copy(base);
    // Gentle dim for non-active blocks; active pops via full colour
    // + the single accent emissive only.
    if (!isActive && !isSel) mesh.material.color.multiplyScalar(isHover ? 0.92 : DIM_FACTOR);
    mesh.material.emissive = new THREE.Color((isSel || isActive) ? ACTIVE_EMISSIVE : 0x000000);
    mesh.material.emissiveIntensity = isSel ? 1.0 : (isActive ? 0.7 : 0);
    mesh.scale.setScalar((isSel || isHover) ? 1.05 : 1);
    // The active block's label grows slightly, so the eye finds it
    // even where the block itself is small on screen. Labels stay
    // white: colour in this scene means hardware family, not emphasis.
    var spr = self.labels[id];
    if (spr) {
      var bw = Math.min(Math.max(mesh.userData.box.w + 0.5, 1.7), 2.7);
      var ls = (isSel || isActive) ? 1.12 : 1;
      spr.scale.set(bw * ls, bw * ls * 0.20, 1);
      spr.material.color.setHex(0xffffff);
    }
  });
  // SM detail dims with its parent block; it is never a separate
  // selection, so it never gets its own accent.
  (this.details || []).forEach(function (d) {
    var parentActive = !!active[d.mesh.userData.parentId];
    var parentSel = selectedId === d.mesh.userData.parentId;
    d.mesh.material.color.setHex(d.mesh.userData.baseColor);
    if (!parentActive && !parentSel) d.mesh.material.color.multiplyScalar(DIM_FACTOR);
    d.mesh.material.emissive = new THREE.Color((parentSel || parentActive) ? ACTIVE_EMISSIVE : 0x000000);
    d.mesh.material.emissiveIntensity = (parentSel || parentActive) ? 0.5 : 0;
  });
  if (step) {
    var live = {}; (step.flows || []).forEach(function (f) { live[f] = true; });
    this.flowLines.forEach(function (line) {
      var hot = !!live[line.userData.key];
      line.material.color.setHex(hot ? FLOW_HOT : FLOW_IDLE);
      line.material.opacity = hot ? 1 : 0.5;
    });
  }
};
SceneView.prototype.update = function (journeyId, journey, step, selectedId, explodeT) {
  if (this.journeyId !== journeyId) this.build(journeyId, journey);
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
  else { // three-quarter: journey default framing
    if (this.journeyId === 'stacking') { this.camera.position.set(4, 12, 20); }
    else if (this.journeyId === 'gemm') { this.camera.position.set(10, 15, 24); }
    else { this.camera.position.set(11, 13, 18); }
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
      if (mainView) mainView.update(state.journey, journey, step, state.selected, explodeT);
      var cmpBox = document.getElementById('compare-diagram');
      if (state.compareModel && compareView && cmpBox && cmpBox.style.display !== 'none') {
        compareView.update(state.journey, journey, step, state.selected, explodeT);
      }
    }
  };
  if (window.__gpuExplorerRender) window.__gpuExplorerRender();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
