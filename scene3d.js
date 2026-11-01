// GPU Explorer — real Three.js / WebGL 3D scene (local bundle, no CDN).
// Low-poly boxes only, Lambert materials, no shadows, no post-processing,
// so it stays interactive in SwiftShader headless Chrome as well as on a
// normal laptop GPU. Server side stays CPU-only; WebGL runs on the client.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

var S = window.GpuExplorerState;
var M = window.GpuExplorerSceneMap;
var ACTIVE_EMISSIVE = 0xf59e0b;
var SELECT_EMISSIVE = 0x22d3ee;

function makeLabelSprite(text, colorHex) {
  var canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15,23,42,0.88)';
  ctx.strokeStyle = colorHex; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f8fafc'; ctx.font = '600 42px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var label = text;
  if (label.length > 11) {
    var parts = label.split(' ');
    if (parts.length > 1) { ctx.fillText(parts.slice(0, -1).join(' '), 256, 42); ctx.fillText(parts.slice(-1)[0], 256, 88); }
    else { ctx.fillText(label.slice(0, 10), 256, 42); ctx.fillText(label.slice(10), 256, 88); }
  } else { ctx.fillText(label, 256, 64); }
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
  this.renderer.domElement.style.display = 'block';
  this.renderer.domElement.style.width = '100%';
  this.renderer.domElement.style.height = '520px';
  this.renderer.domElement.tabIndex = 0;
  container.appendChild(this.renderer.domElement);
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x0b1220);
  this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  this.camera.position.set(0, 14, 21);
  this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  this.controls.enableDamping = true;
  this.controls.dampingFactor = 0.08;
  this.controls.minDistance = 6;
  this.controls.maxDistance = 45;
  this.controls.maxPolarAngle = Math.PI * 0.49;
  this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  var dir = new THREE.DirectionalLight(0xffffff, 1.4); dir.position.set(6, 12, 8); this.scene.add(dir);
  var dir2 = new THREE.DirectionalLight(0x93c5fd, 0.5); dir2.position.set(-6, 6, -8); this.scene.add(dir2);
  this.group = new THREE.Group(); this.scene.add(this.group);
  this.meshes = {}; this.labels = {}; this.flowLines = [];
  this.journeyId = null; this.stepKey = null; this.explodeT = 0;
  this.target = new THREE.Vector3(0, 0.5, 0);
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
  this.journeyId = journeyId;
  var boxes = M.boxesFor(journeyId, journey);
  var isStack = journeyId === 'stacking';
  var slab = new THREE.Mesh(
    new THREE.BoxGeometry(isStack ? 15 : 23, 0.5, isStack ? 11 : 12),
    new THREE.MeshLambertMaterial({ color: 0x1e293b }));
  slab.position.set(isStack ? 0.5 : 0, -0.55, isStack ? 1 : 0);
  this.group.add(slab);
  var grid = new THREE.GridHelper(26, 26, 0x334155, 0x1e293b);
  grid.position.y = -0.28; this.group.add(grid);
  var self = this;
  boxes.forEach(function (box) {
    var node = journey.nodes.filter(function (n) { return n.id === box.id; })[0];
    var mat = new THREE.MeshLambertMaterial({ color: box.color, transparent: !!box.disabled, opacity: box.disabled ? 0.45 : 1 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d), mat);
    mesh.position.set(box.x, box.y, box.z);
    mesh.userData = { id: box.id, node: node, box: box, baseColor: box.color };
    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.55 }));
    mesh.add(edges);
    self.group.add(mesh); self.meshes[box.id] = mesh;
    var sprite = makeLabelSprite(box.label + (box.disabled ? ' ×' : ''), colorHex(box.color));
    sprite.scale.set(Math.min(Math.max(box.w + 0.6, 1.8), 3.4), 0.78, 1);
    sprite.position.set(box.x, box.y + box.h / 2 + 0.75, box.z);
    self.group.add(sprite); self.labels[box.id] = sprite;
  });
  var byId = {}; boxes.forEach(function (b) { byId[b.id] = b; });
  (journey.flows || []).forEach(function (f) {
    var a = byId[f.from], b = byId[f.to]; if (!a || !b) return;
    var geo = new THREE.BufferGeometry();
    var pts = f.route === 'return'
      ? [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(a.x, -0.1, a.z + 2), new THREE.Vector3(b.x, -0.1, b.z + 2), new THREE.Vector3(b.x, b.y, b.z)]
      : [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
    geo.setFromPoints(pts);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.85 }));
    line.userData = { from: f.from, to: f.to, route: f.route || null, key: f.from + '>' + f.to };
    self.group.add(line); self.flowLines.push(line);
  });
  // Camera framing is fixed per journey. Step changes highlight blocks
  // and update the inspector, but must NOT shift the camera: shifting
  // camera + target together moves the whole die and cuts edge blocks
  // out of frame (verified bug in the first 3D screenshots).
  if (isStack) { this.camera.position.set(14, 10, 18); this.target.set(0, 2.6, 1); }
  else { this.camera.position.set(0, 14, 21); this.target.set(0, 0.5, 0); }
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
    if (!isActive && !isSel) mesh.material.color.multiplyScalar(0.52);
    mesh.material.emissive = new THREE.Color(isSel ? SELECT_EMISSIVE : (isActive ? ACTIVE_EMISSIVE : 0x000000));
    mesh.material.emissiveIntensity = (isSel || isActive) ? 0.85 : 0;
    mesh.scale.setScalar((isSel || isHover) ? 1.05 : 1);
  });
  if (step) {
    var live = {}; (step.flows || []).forEach(function (f) { live[f] = true; });
    this.flowLines.forEach(function (line) {
      var hot = !!live[line.userData.key];
      line.material.color.setHex(hot ? 0xf59e0b : 0x94a3b8);
      line.material.opacity = hot ? 1 : 0.55;
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
    if (spr) spr.position.set(p.x, p.y + box.h / 2 + 0.75, p.z);
  });
  this.applyHighlight(step, selectedId);
  // Deliberately no camera move on step change: the active blocks are
  // highlighted in place and the inspector follows; the user keeps
  // whatever orbit/zoom they chose. focusCentroid stays available for
  // tests and for a future explicit "focus" button, not auto-applied.
};
SceneView.prototype.animate = function () {
  var self = this;
  function loop() {
    requestAnimationFrame(loop);
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
