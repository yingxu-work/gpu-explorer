// Text printed or etched on a 3D surface. Labels accept a plain string or
// {zh, en}; setLanguage() redraws every label in place, so switching the
// interface language never rebuilds the model or loses the camera.
const SANS = '"Inter","Segoe UI",Roboto,Arial,"Liberation Sans","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
const MONO = 'ui-monospace,"SFMono-Regular","JetBrains Mono",Consolas,monospace';
const currentLanguage = () => globalThis.GpuExplorerI18n?.lang || 'zh';
const resolve = (text, lang) => (text && typeof text === 'object' ? (text[lang] ?? text.en ?? text.zh ?? '') : String(text ?? ''));

export function createLabelFactory(T) {
  const registry = [];
  let language = currentLanguage();
  function draw(entry) {
    const { canvas, options } = entry;
    const text = resolve(entry.text, language);
    const ctx = canvas.getContext('2d');
    ctx.clearRect?.(0, 0, canvas.width, canvas.height);
    const family = options.mono ? MONO : SANS;
    const weight = options.weight || 500;
    ctx.font = `${weight} 100px ${family}`;
    const measured = ctx.measureText?.(text);
    const width = Number.isFinite(measured?.width) && measured.width > 0 ? measured.width : text.length * 60;
    const size = Math.min(canvas.height * (options.fill || .72), canvas.width * .9 / width * 100);
    ctx.font = `${weight} ${size.toFixed(2)}px ${family}`;
    ctx.fillStyle = options.color || 'rgba(226,232,228,.78)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = options.align === 'left' ? 'left' : 'center';
    ctx.fillText?.(text, options.align === 'left' ? canvas.width * .04 : canvas.width / 2, canvas.height * .53);
    entry.mesh.userData.surfaceLabel = { text, source: entry.text, worldAspect: entry.aspect, textureAspect: canvas.width / canvas.height, fontSize: size, language };
    entry.mesh.name = 'surface-label:' + text;
    if (entry.texture) entry.texture.needsUpdate = true;
  }
  // w × d is the physical size of the label on the surface (x by z).
  function label(parent, text, x, y, z, w, d, options = {}) {
    const canvas = document.createElement('canvas'), aspect = w / d;
    canvas.width = Math.min(2048, Math.max(128, Math.round(112 * aspect)));
    canvas.height = Math.max(24, Math.round(canvas.width / aspect));
    const mesh = new T.Mesh(new T.PlaneGeometry(w, d));
    const entry = { text, canvas, aspect, options, mesh, texture: null };
    draw(entry);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8; texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter;
    entry.texture = texture;
    mesh.material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: options.opacity ?? 1 });
    mesh.rotation.x = -Math.PI / 2;
    if (options.rotate) mesh.rotation.z = options.rotate;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    parent.add(mesh);
    registry.push(entry);
    return mesh;
  }
  return {
    label,
    labels: registry,
    setLanguage(lang) {
      if (!['zh', 'en'].includes(lang) || lang === language) return false;
      language = lang;
      for (const entry of registry) draw(entry);
      return true;
    },
    get language() { return language; }
  };
}
export { resolve as resolveText };
