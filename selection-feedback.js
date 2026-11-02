// Emphasize the existing component surfaces. Geometry and source materials stay
// untouched, including when several components share a material or texture.
const HOVER = .42;
const EPSILON = 1e-7;
const WHITE = { r: 1, g: 1, b: 1 };

function visible(object) {
  if (!object) return false;
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

export function createSelectionFeedback(root, { reducedMotion = false, duration = 140 } = {}) {
  const records = [], byMesh = new WeakMap();
  let groupCache = new WeakMap(), selected = null, hovered = null, enabled = true;
  let dirty = false, disposed = false, visibilityMask = -1;
  const stats = { selectedMeshes: 0, hoveredMeshes: 0, activeMeshes: 0,
    ownedMaterials: 0, settled: true, enabled: true };
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material) return;
    const record = { mesh, original: mesh.material, clones: null, from: 0,
      current: 0, target: 0, elapsed: 0, applied: 0 };
    records.push(record); byMesh.set(mesh, record);
  });

  function members(group) {
    if (!group) return null;
    let found = groupCache.get(group);
    if (!found) {
      found = new Set();
      group.traverse(object => { const record = byMesh.get(object); if (record) found.add(record); });
      groupCache.set(group, found);
    }
    return found;
  }

  function restore(record) {
    if (record.mesh.material !== record.original) record.mesh.material = record.original;
    record.applied = 0;
  }

  function materialsFor(record) {
    const sources = Array.isArray(record.original) ? record.original : [record.original];
    if (!record.clones) {
      record.clones = sources.map(source => source.clone());
      stats.ownedMaterials += record.clones.length;
    }
    if (record.mesh.material === record.original) {
      // Original properties may have changed while feedback was disabled, for
      // example the lesson's translucent silicon cover. Reuse the owned clones.
      record.clones.forEach((material, i) => {
        const source = sources[i], version = material.userData.feedbackSourceVersion;
        material.copy(source);
        material.userData.feedbackSourceVersion = source.version;
        if (version !== source.version) material.needsUpdate = true;
      });
      record.mesh.material = Array.isArray(record.original) ? record.clones : record.clones[0];
    }
    return sources;
  }

  function apply(record) {
    const amount = record.current;
    if (Math.abs(amount) < EPSILON) { restore(record); return; }
    if (Math.abs(record.applied - amount) < EPSILON && record.mesh.material !== record.original) return;
    const sources = materialsFor(record), positive = Math.max(0, amount);
    record.clones.forEach((material, i) => {
      const source = sources[i];
      if (source.color && material.color) {
        material.color.copy(source.color);
        if (amount < 0) material.color.multiplyScalar(1 + amount * .22);
        else if (source.isMeshBasicMaterial) material.color.multiplyScalar(1 + positive * .055);
        else material.color.lerp(WHITE, positive * .065).multiplyScalar(1 + positive * .045);
      }
      if (source.emissive && material.emissive) {
        material.emissive.copy(source.emissive);
        material.emissive.r += positive * .025;
        material.emissive.g += positive * .025;
        material.emissive.b += positive * .025;
      }
    });
    record.applied = amount;
  }

  function reset() {
    if (disposed) return;
    selected = null; hovered = null; dirty = false; visibilityMask = -1;
    records.forEach(record => {
      record.from = record.current = record.target = record.elapsed = 0;
      restore(record);
    });
    stats.selectedMeshes = stats.hoveredMeshes = stats.activeMeshes = 0;
    stats.settled = true;
  }

  function set(options = {}) {
    if (disposed) return;
    const nextSelected = options.selected === undefined ? selected : options.selected || null;
    const nextHovered = options.hovered === undefined ? hovered : options.hovered || null;
    const nextEnabled = options.enabled === undefined ? enabled : !!options.enabled;
    if (!nextEnabled) {
      if (enabled || selected || hovered || !stats.settled) reset();
      enabled = stats.enabled = false;
      return;
    }
    if (selected !== nextSelected || hovered !== nextHovered || enabled !== nextEnabled) dirty = true;
    selected = nextSelected; hovered = nextHovered; enabled = stats.enabled = true;
    if (reducedMotion) update(0);
  }

  function update(dtMs = 0) {
    if (disposed || !enabled) return false;
    const mask = (visible(root) ? 1 : 0) | (visible(selected) ? 2 : 0) | (visible(hovered) ? 4 : 0);
    if (mask !== visibilityMask) { visibilityMask = mask; dirty = true; }
    if (!dirty && stats.settled) return false;
    if (dirty) {
      const selectedSet = members(selected), hoveredSet = members(hovered);
      const selectedActive = !!(mask & 1) && !!(mask & 2) && selectedSet && [...selectedSet].some(record => visible(record.mesh));
      const hoveredActive = !!(mask & 1) && !!(mask & 4) && hoveredSet && [...hoveredSet].some(record => visible(record.mesh));
      stats.selectedMeshes = stats.hoveredMeshes = 0;
      records.forEach(record => {
        const isVisible = !!(mask & 1) && visible(record.mesh);
        const target = !isVisible ? 0 : selectedActive && selectedSet.has(record) ? 1
          : hoveredActive && hoveredSet.has(record) ? HOVER : selectedActive ? -1 : 0;
        if (target === 1) stats.selectedMeshes++;
        if (target === HOVER) stats.hoveredMeshes++;
        if (!isVisible) {
          record.from = record.current = record.target = record.elapsed = 0; restore(record);
        } else if (record.target !== target) {
          record.from = record.current; record.target = target; record.elapsed = 0;
        }
      });
      dirty = false;
    }
    const elapsed = Math.max(0, Number(dtMs) || 0);
    let active = 0, settled = true;
    records.forEach(record => {
      if (record.current !== record.target) {
        record.elapsed += elapsed;
        const t = reducedMotion || duration <= 0 ? 1 : Math.min(1, record.elapsed / duration);
        const ease = t * t * (3 - 2 * t);
        record.current = t === 1 ? record.target : record.from + (record.target - record.from) * ease;
        if (record.current !== record.target) settled = false;
      }
      apply(record);
      if (Math.abs(record.current) >= EPSILON) active++;
    });
    stats.activeMeshes = active; stats.settled = settled;
    return true;
  }

  function refresh() { if (!disposed) { groupCache = new WeakMap(); dirty = true; } }
  function dispose() {
    if (disposed) return;
    reset();
    records.forEach(record => record.clones?.forEach(material => material.dispose()));
    stats.ownedMaterials = 0; stats.enabled = false;
    records.length = 0; disposed = true;
  }
  return { set, update, reset, refresh, dispose, get stats() { return { ...stats }; } };
}
