import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../three/three.module.js';
import { createSelectionFeedback } from '../selection-feedback.js';

function fixture(options) {
  const root = new THREE.Group(), module = new THREE.Group(), other = new THREE.Group();
  root.add(module, other);
  const material = new THREE.MeshStandardMaterial({ color: 0x739c7a, roughness: .37, metalness: .72 });
  const geometry = new THREE.BoxGeometry();
  const first = new THREE.Mesh(geometry, material), second = new THREE.InstancedMesh(geometry, material, 4);
  const context = new THREE.Mesh(geometry, material);
  module.add(first, second); other.add(context);
  return { root, module, other, first, second, context, material, geometry,
    feedback: createSelectionFeedback(root, options) };
}

test('whole-module selection includes every instance without changing shared original materials', () => {
  const f = fixture(), source = f.material.color.clone(), matrix = f.second.instanceMatrix.array.slice();
  f.feedback.set({ selected: f.module }); f.feedback.update(140);
  assert.equal(f.feedback.stats.selectedMeshes, 2);
  assert.notEqual(f.first.material, f.material); assert.notEqual(f.second.material, f.material);
  assert.notEqual(f.first.material, f.context.material);
  assert.ok(f.first.material.color.r > source.r);
  assert.ok(f.context.material.color.r < source.r);
  assert.deepEqual(f.material.color, source);
  assert.deepEqual(f.second.instanceMatrix.array, matrix);
  assert.equal(f.first.geometry, f.geometry); assert.equal(f.second.count, 4);
  assert.equal(f.root.children.length, 2, 'feedback adds no overlay geometry');
  assert.equal(f.first.material.roughness, .37); assert.equal(f.first.material.metalness, .72);
  f.feedback.dispose();
});

test('hover lifts the real surface without dimming context; selection remains stronger', () => {
  const f = fixture(); f.feedback.set({ hovered: f.module }); f.feedback.update(140);
  const hover = f.first.material.color.r;
  assert.equal(f.context.material, f.material);
  assert.equal(f.feedback.stats.hoveredMeshes, 2);
  f.feedback.set({ selected: f.module, hovered: null }); f.feedback.update(140);
  assert.ok(f.first.material.color.r > hover);
  assert.ok(f.first.material.emissive.r > 0);
  f.feedback.dispose();
});

test('transitions interpolate, settle, and restore exact material references when cleared', () => {
  const f = fixture(); f.feedback.set({ selected: f.module }); f.feedback.update(70);
  const halfway = f.first.material.color.r;
  assert.equal(f.feedback.stats.settled, false);
  f.feedback.update(70);
  assert.ok(f.first.material.color.r > halfway); assert.equal(f.feedback.stats.settled, true);
  assert.equal(f.feedback.update(16), false, 'settled update skips material work');
  f.feedback.set({ selected: null }); f.feedback.update(70);
  assert.notEqual(f.first.material, f.material, 'clearing fades rather than popping');
  f.feedback.update(70);
  assert.equal(f.first.material, f.material); assert.equal(f.second.material, f.material);
  assert.equal(f.context.material, f.material); assert.equal(f.feedback.stats.activeMeshes, 0);
  f.feedback.dispose();
});

test('switching modules moves emphasis without leaking shared material changes', () => {
  const f = fixture(); f.feedback.set({ selected: f.module }); f.feedback.update(140);
  f.feedback.set({ selected: f.other }); f.feedback.update(140);
  assert.equal(f.feedback.stats.selectedMeshes, 1);
  assert.ok(f.context.material.color.r > f.material.color.r);
  assert.ok(f.first.material.color.r < f.material.color.r);
  assert.notEqual(f.first.material, f.context.material);
  f.feedback.dispose();
});

test('disabled Learn feedback immediately restores originals and supports later source changes', () => {
  const f = fixture(); f.feedback.set({ selected: f.module }); f.feedback.update(140);
  f.feedback.set({ enabled: false });
  assert.equal(f.first.material, f.material); assert.equal(f.context.material, f.material);
  assert.equal(f.feedback.update(140), false); assert.equal(f.feedback.stats.activeMeshes, 0);
  f.material.transparent = true; f.material.opacity = .11; f.material.depthWrite = false;
  f.feedback.set({ selected: f.module, enabled: true }); f.feedback.update(140);
  assert.equal(f.first.material.opacity, .11); assert.equal(f.first.material.transparent, true);
  assert.equal(f.first.material.depthWrite, false);
  f.feedback.reset(); assert.equal(f.first.material, f.material);
  f.feedback.dispose();
});

test('hidden target ancestors cannot dim the rest of the model', () => {
  const f = fixture(); f.module.visible = false;
  f.feedback.set({ selected: f.module }); f.feedback.update(140);
  assert.equal(f.context.material, f.material); assert.equal(f.feedback.stats.selectedMeshes, 0);
  f.module.visible = true; f.feedback.update(140);
  assert.equal(f.feedback.stats.selectedMeshes, 2);
  f.module.visible = false; f.feedback.update(140);
  assert.equal(f.context.material, f.material); assert.equal(f.first.material, f.material);
  f.feedback.dispose();
});

test('refresh handles child visibility changes without highlighting hidden geometry', () => {
  const f = fixture(); f.feedback.set({ selected: f.module }); f.feedback.update(140);
  f.second.visible = false; f.feedback.refresh(); f.feedback.update(140);
  assert.equal(f.feedback.stats.selectedMeshes, 1); assert.equal(f.second.material, f.material);
  f.feedback.dispose();
});

test('array materials and Basic surface labels retain textures, alpha and depth settings', () => {
  const root = new THREE.Group(), module = new THREE.Group(); root.add(module);
  const texture = new THREE.Texture();
  const basic = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff,
    transparent: true, opacity: .81, depthWrite: false, depthTest: false, toneMapped: false });
  const standard = new THREE.MeshStandardMaterial({ map: texture, color: 0xbba266, alphaTest: .2 });
  const original = [basic, standard], mesh = new THREE.Mesh(new THREE.BoxGeometry(), original); module.add(mesh);
  const feedback = createSelectionFeedback(root); feedback.set({ selected: module }); feedback.update(140);
  assert.notEqual(mesh.material, original); assert.equal(mesh.material[0].map, texture);
  assert.equal(mesh.material[1].map, texture); assert.equal(mesh.material[0].opacity, .81);
  assert.equal(mesh.material[0].transparent, true); assert.equal(mesh.material[0].depthWrite, false);
  assert.equal(mesh.material[0].depthTest, false); assert.equal(mesh.material[0].toneMapped, false);
  assert.equal(mesh.material[1].alphaTest, .2); assert.equal(mesh.material[0].color.r, mesh.material[0].color.g);
  feedback.reset(); assert.equal(mesh.material, original); feedback.dispose();
});

test('repeated interactions reuse owned materials; disposing twice never disposes sources or maps', () => {
  const f = fixture(); let sourceDisposals = 0, textureDisposals = 0, cloneDisposals = 0;
  const texture = new THREE.Texture(); f.material.map = texture;
  f.material.addEventListener('dispose', () => sourceDisposals++);
  texture.addEventListener('dispose', () => textureDisposals++);
  f.feedback.set({ selected: f.module }); f.feedback.update(140);
  const count = f.feedback.stats.ownedMaterials;
  for (const mesh of [f.first, f.second, f.context]) mesh.material.addEventListener('dispose', () => cloneDisposals++);
  for (let i = 0; i < 100; i++) {
    f.feedback.set({ selected: i % 2 ? f.module : f.other, hovered: null }); f.feedback.update(140);
    f.feedback.set({ selected: null, hovered: f.module }); f.feedback.update(140);
    f.feedback.set({ selected: null, hovered: null }); f.feedback.update(140);
  }
  assert.equal(f.feedback.stats.ownedMaterials, count);
  f.feedback.dispose(); f.feedback.dispose();
  assert.equal(cloneDisposals, count); assert.equal(sourceDisposals, 0); assert.equal(textureDisposals, 0);
  assert.equal(f.first.material, f.material); assert.equal(f.second.material, f.material);
});

test('reduced motion applies selection and clearing immediately', () => {
  const f = fixture({ reducedMotion: true }); f.feedback.set({ selected: f.module });
  assert.equal(f.feedback.stats.settled, true); assert.equal(f.feedback.stats.selectedMeshes, 2);
  assert.notEqual(f.first.material, f.material);
  f.feedback.set({ selected: null }); assert.equal(f.first.material, f.material);
  f.feedback.dispose();
});
