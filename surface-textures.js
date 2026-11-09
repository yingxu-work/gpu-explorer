// Procedural surface textures. Each one imitates what the eye actually sees on
// that material: solder mask over copper on the board, a ground silicon back
// on bare dies, regular SRAM arrays and irregular standard-cell logic on the
// functional floorplans. None of them reproduces a real vendor layout.
function canvas2d(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return { canvas, c: canvas.getContext('2d') };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); }
function finish(T, canvas, repeat = 1, color = true) {
  const texture = new T.CanvasTexture(canvas);
  if (color) texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat !== 1) { texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(repeat, repeat); }
  return texture;
}

// Board: 17 × 17 scene units mapped onto 2048 px; (x, z) → canvas.
export function boardTexture(T, layout) {
  const size = 2048, k = size / 17, P = (x, z) => [(x + 8.5) * k, (z + 8.5) * k];
  const { canvas, c } = canvas2d(size, size);
  if (!c.fillRect) return finish(T, canvas);
  const random = rng(1931);
  c.fillStyle = '#163f33'; c.fillRect(0, 0, size, size);
  // Copper pours show through the mask as slightly lighter, flatter areas.
  c.fillStyle = '#1b4a3c';
  for (const side of [-1, 1]) {
    const [x0, z0] = P(side < 0 ? -8.1 : 5.05, -6.6), [x1, z1] = P(side < 0 ? -5.05 : 8.1, 6.6);
    c.fillRect(x0, z0, x1 - x0, z1 - z0);
  }
  const [px0, pz0] = P(-5.7, -5.45), [px1, pz1] = P(5.7, 5.45);
  c.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
  // Routed traces: parallel groups with 45° bends, the way a router fans out.
  c.lineCap = 'round'; c.lineJoin = 'round';
  const bundle = (x, z, dx, dz, count, pitch, bend) => {
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const o = i * pitch;
      const [ax, az] = P(x + (dz ? o : 0), z + (dx ? o : 0));
      const [bx, bz] = P(x + (dz ? o : 0) + dx, z + (dx ? o : 0) + dz);
      c.moveTo(ax, az); c.lineTo(bx, bz); c.lineTo(bx + (dx ? 0 : bend * k), bz + (dz ? 0 : bend * k));
    }
    c.stroke();
  };
  c.strokeStyle = 'rgba(122,170,132,.28)'; c.lineWidth = 2.2;
  for (const side of [-1, 1]) {
    bundle(-5.2, side * 5.6, 0, side * 1.5, 30, .34, .25);
    bundle(side * 5.55, -5.0, side * .7, 0, 26, .38, 0);
  }
  c.strokeStyle = 'rgba(122,170,132,.18)'; c.lineWidth = 1.4;
  for (let i = 0; i < 140; i++) {
    const x = -8 + random() * 16, z = -8 + random() * 16;
    if (Math.abs(x) < 5.8 && Math.abs(z) < 5.6) continue;
    const [ax, az] = P(x, z), len = (0.3 + random() * 1.2) * k, dir = random() < .5;
    c.beginPath(); c.moveTo(ax, az); c.lineTo(ax + (dir ? len : len * .5), az + (dir ? 0 : len * .5)); c.lineTo(ax + len, az + (dir ? len * .3 : len)); c.stroke();
  }
  // Stitching and fan-out vias: dark rings with a copper centre.
  const via = (x, z, r = 3.2) => { const [vx, vz] = P(x, z); c.fillStyle = '#0f2b23'; c.beginPath(); c.arc(vx, vz, r + 1.6, 0, 7); c.fill(); c.fillStyle = '#a98a5a'; c.beginPath(); c.arc(vx, vz, r * .55, 0, 7); c.fill(); };
  for (const side of [-1, 1]) for (let z = -6.2; z <= 6.2; z += .26) for (const dx of [0, .22]) via(side * (5.2 + dx), z, 2.4);
  for (let x = -5.5; x <= 5.5; x += .28) for (const side of [-1, 1]) via(x, side * 5.62, 2.2);
  // Silkscreen: outlines, reference designators, pin-1 marks, fiducials.
  c.strokeStyle = 'rgba(222,228,214,.62)'; c.fillStyle = 'rgba(222,228,214,.70)'; c.lineWidth = 2;
  c.font = '500 19px ui-monospace,Consolas,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  (layout?.inductors || []).forEach((p, i) => {
    const [x, z] = P(p.x - p.w / 2 - .06, p.z - p.d / 2 - .06); c.strokeRect(x, z, (p.w + .12) * k, (p.d + .12) * k);
    const [tx, tz] = P(p.x + (p.x > 0 ? 0.62 : -0.62), p.z - .38); c.fillText('L' + (i + 1), tx, tz);
  });
  (layout?.controllers || []).forEach((p, i) => {
    const [x, z] = P(p.x - p.w / 2 - .05, p.z - p.d / 2 - .05); c.strokeRect(x, z, (p.w + .1) * k, (p.d + .1) * k);
    const [dx, dz] = P(p.x - p.w / 2 + .06, p.z - p.d / 2 + .06); c.beginPath(); c.arc(dx, dz, 3, 0, 7); c.fill();
    const [tx, tz] = P(p.x, p.z + p.d / 2 + .2); c.fillText('Q' + (i + 1), tx, tz);
  });
  c.font = '500 15px ui-monospace,Consolas,monospace';
  for (let i = 0; i < 26; i += 3) for (const side of [-1, 1]) { const [tx, tz] = P(-5.55 + i * .44, side * 6.48); c.fillText('C' + (300 + i + (side > 0 ? 100 : 0)), tx, tz); }
  c.font = '600 24px ui-monospace,Consolas,monospace';
  { const [tx, tz] = P(-5.95, -5.75); c.fillText('U1', tx, tz); }
  c.lineWidth = 2.4; { const [x, z] = P(-5.5, -5.3); c.strokeRect(x, z, 11 * k, 10.6 * k); }
  for (const [fx, fz] of [[-7.9, -7.0], [7.9, 7.0], [-7.9, 7.0]]) {
    const [x, z] = P(fx, fz); c.fillStyle = '#c9a76a'; c.beginPath(); c.arc(x, z, 7, 0, 7); c.fill();
    c.strokeStyle = 'rgba(16,40,32,1)'; c.lineWidth = 6; c.beginPath(); c.arc(x, z, 13, 0, 7); c.stroke();
  }
  // Board edge keep-out line.
  c.strokeStyle = 'rgba(222,228,214,.25)'; c.lineWidth = 2; c.strokeRect(22, 22, size - 44, size - 44);
  // Faint mask unevenness so large areas are not perfectly flat.
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${(random() * .018).toFixed(3)})`; c.fillRect(random() * size, random() * size, 2 + random() * 6, 2 + random() * 6); }
  return finish(T, canvas);
}

// Ground silicon backside: near-uniform grey with faint grinding arcs.
export function siliconBackTexture(T, seed = 7) {
  const { canvas, c } = canvas2d(512, 512);
  if (!c.fillRect) return finish(T, canvas);
  const random = rng(seed);
  c.fillStyle = '#9aa1a6'; c.fillRect(0, 0, 512, 512);
  c.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const r = 380 + random() * 900;
    c.strokeStyle = `rgba(${random() < .5 ? '255,255,255' : '40,46,52'},${(.025 + random() * .035).toFixed(3)})`;
    c.beginPath(); c.arc(-260 + random() * 120, 980 + random() * 160, r, 0, 7); c.stroke();
  }
  return finish(T, canvas);
}

// Regular SRAM arrays: a fine repeating grid, multiplied by the block colour.
export function sramTexture(T) {
  const { canvas, c } = canvas2d(256, 256);
  if (!c.fillRect) return finish(T, canvas);
  c.fillStyle = '#d7dbd8'; c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
    c.fillStyle = (x / 8 + y / 8) % 2 ? '#c4c9c6' : '#e8ebe8'; c.fillRect(x + 1, y + 1, 6, 6);
  }
  c.fillStyle = 'rgba(30,36,34,.35)';
  for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 2, 256);
  for (let y = 0; y < 256; y += 64) c.fillRect(0, y, 256, 2);
  return finish(T, canvas, 1);
}

// Standard-cell logic: rows of cells with irregular widths.
export function logicTexture(T, seed = 3) {
  const { canvas, c } = canvas2d(256, 256);
  if (!c.fillRect) return finish(T, canvas);
  const random = rng(seed);
  c.fillStyle = '#cfd3d0'; c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) {
    let x = 0;
    while (x < 256) { const w = 3 + Math.floor(random() * 11); const v = 180 + Math.floor(random() * 70); c.fillStyle = `rgb(${v},${v + 3},${v + 1})`; c.fillRect(x, y, w - 1, 5); x += w; }
  }
  return finish(T, canvas, 1);
}

// Organic package substrate: dark laminate with a fine capacitor-land pattern.
export function substrateTexture(T) {
  const { canvas, c } = canvas2d(512, 512);
  if (!c.fillRect) return finish(T, canvas);
  const random = rng(11);
  c.fillStyle = '#26302a'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) { c.fillStyle = `rgba(255,255,255,${(random() * .03).toFixed(3)})`; c.fillRect(random() * 512, random() * 512, 3, 3); }
  return finish(T, canvas);
}
