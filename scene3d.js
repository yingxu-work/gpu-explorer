// GPU Explorer — real Three.js / WebGL 3D scene (local bundle, no CDN).
// Low-poly boxes only, Standard materials, no post-processing, so it
// stays interactive in SwiftShader headless Chrome as well as on a
// normal laptop GPU. Server side stays CPU-only; WebGL runs on the client.
//
// Round 8 look: one cohesive muted palette (sage memory, warm tan
// compute, slate-blue data, slate-grey control; amber ONLY for the
// active / selected block), deep dark background, warm key + cool fill
// lighting, one small shadow map (dropped if it ever costs visible
// frame rate — see the shadow note in build()). The die reads as a chip:
// charcoal substrate, muted-gold pin fringe around the slab edge, and a
// central spine/bus under the blocks.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

var S = window.GpuExplorerState;
var M = window.GpuExplorerSceneMap;
var ACTIVE_EMISSIVE = 0xe8a33d;
var SELECT_EMISSIVE = 0xe8a33d;
var DIM_FACTOR = 0.78;
var KIND_MAT = {
  compute: { roughness: 0.42, metalness: 0.38 },
  memory: { roughness: 0.85, metalness: 0.05 },
  data: { roughness: 0.6, metalness: 0.22 },
  control: { roughness: 0.7, metalness: 0.15 }
};

function makeLabelSprite(text, colorHex) {
  var canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  var ctx = canvas.getContext('2d');
  // Dark pill, near-black at ~0.92 opacity, thin muted border, light text:
  // the label reads as a caption, not a coloured badge.
  ctx.fillStyle = 'rgba(8,12,18,0.92)';
  ctx.strokeStyle = '#5b6b80'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(3, 3, 506, 90, 20); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#eef2f7'; ctx.font = '600 34px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
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
  this.renderer.toneMappingExposure = 1.05;
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  this.renderer.domElement.style.display = 'block';
  this.renderer.domElement.style.width = '100%';
  this.renderer.domElement.style.height = '520px';
  this.renderer.domElement.tabIndex = 0;
  container.appendChild(this.renderer.domElement);
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x0a0e14);
  this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  this.camera.position.set(11, 13, 18);
  this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  this.controls.enableDamping = true;
  this.controls.dampingFactor = 0.08;
  this.controls.minDistance = 6;
  this.controls.maxDistance = 45;
  this.controls.maxPolarAngle = Math.PI * 0.49;
  this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  var key = new THREE.DirectionalLight(0xfff1dd, 1.1); key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -13; key.shadow.camera.right = 13;
  key.shadow.camera.top = 13; key.shadow.camera.bottom = -13;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  this.scene.add(key);
  var fill = new THREE.DirectionalLight(0xbfd4ff, 0.45); fill.position.set(-8, 6, -8); this.scene.add(fill);
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
  this.journeyId = journeyId;
  var boxes = M.boxesFor(journeyId, journey);
  var isStack = journeyId === 'stacking';
  var slab = new THREE.Mesh(
    new THREE.BoxGeometry(isStack ? 20 : 23, 0.5, isStack ? 12 : 12),
    new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.95, metalness: 0.05 }));
  slab.position.set(0, -0.55, isStack ? 1 : 0);
  slab.receiveShadow = true;
  this.group.add(slab);
  var grid = new THREE.GridHelper(26, 26, 0x1e293b, 0x141b26);
  grid.position.y = -0.28; this.group.add(grid);
  var self = this;
  if (!isStack) {
    // Central spine/bus: visible in the gaps between blocks, hidden
    // where blocks sit over it — the chip's backbone, not a connector.
    var spine = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.1, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.7, metalness: 0.25 }));
    spine.position.set(0, -0.25, 0);
    this.group.add(spine);
    // Gold pin fringe around the slab perimeter: small shared-geometry
    // boxes, muted gold, so the slab reads as a packaged chip.
    var pinMat = new THREE.MeshStandardMaterial({ color: 0xa88f5a, roughness: 0.45, metalness: 0.55 });
    var pinX = new THREE.BoxGeometry(0.5, 0.22, 0.28);
    var pinZ = new THREE.BoxGeometry(0.28, 0.22, 0.5);
    var px, pz, zz, xx;
    for (px = -11; px <= 11; px++) {
      for (zz = 0; zz < 2; zz++) {
        var pinH = new THREE.Mesh(pinX, pinMat);
        pinH.position.set(px, -0.19, zz === 0 ? -6 : 6); self.group.add(pinH);
      }
    }
    for (pz = -5; pz <= 5; pz++) {
      for (xx = 0; xx < 2; xx++) {
        var pinV = new THREE.Mesh(pinZ, pinMat);
        pinV.position.set(xx === 0 ? -11.5 : 11.5, -0.19, pz); self.group.add(pinV);
      }
    }
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
      new THREE.LineBasicMaterial({ color: 0x0a0e14, transparent: true, opacity: 0.45 }));
    mesh.add(edges);
    self.group.add(mesh); self.meshes[box.id] = mesh;
    var sprite = makeLabelSprite(box.label + (box.disabled ? ' ×' : ''), colorHex(box.color));
    var lw = Math.min(Math.max(box.w + 0.5, 1.7), 2.7);
    sprite.scale.set(lw, lw * 0.20, 1);
    sprite.position.set(box.x, box.y + box.h / 2 + (box.labelDy || 0.55), box.z + (box.labelZ || 0));
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
    // Gentle dim for non-active blocks (was 0.52, which washed the
    // scene out); active pops via full colour + amber emissive only.
    if (!isActive && !isSel) mesh.material.color.multiplyScalar(isHover ? 0.92 : DIM_FACTOR);
    mesh.material.emissive = new THREE.Color((isSel || isActive) ? ACTIVE_EMISSIVE : 0x000000);
    mesh.material.emissiveIntensity = isSel ? 1.0 : (isActive ? 0.7 : 0);
    mesh.scale.setScalar((isSel || isHover) ? 1.05 : 1);
    // The active block's label warms and grows slightly, so the eye
    // finds it even where the block itself is small on screen.
    var spr = self.labels[id];
    if (spr) {
      var bw = Math.min(Math.max(mesh.userData.box.w + 0.5, 1.7), 2.7);
      var ls = (isSel || isActive) ? 1.12 : 1;
      spr.scale.set(bw * ls, bw * ls * 0.20, 1);
      spr.material.color.setHex((isSel || isActive) ? 0xffdf9e : 0xffffff);
    }
  });
  if (step) {
    var live = {}; (step.flows || []).forEach(function (f) { live[f] = true; });
    this.flowLines.forEach(function (line) {
      var hot = !!live[line.userData.key];
      line.material.color.setHex(hot ? 0xe8a33d : 0x475569);
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
