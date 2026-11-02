// A scale-separated explanatory HBM cutaway. Eight DRAM layers are shown to
// explain stacking; this is not a claim about a specific H100/A100 supplier.
export function createHBMDetail(T, model = 'h100') {
  const ampere = model === 'a100';
  const specification = {
    name: ampere ? 'HBM2e' : 'HBM3', channels: ampere ? 8 : 16,
    channelBits: ampere ? 128 : 64, pseudoChannels: ampere ? 16 : 32,
    interfaceBits: 1024, illustrativeLayers: 8,
    scope: '八层教学剖面；层数、bank 位置和 TSV 数量不对应特定供应商版图。'
  };
  const root = new T.Group(); root.visible = false;
  const components = {}, anchors = {}, layerGroups = [], bumpGroups = [];
  const unit = new T.BoxGeometry(1, 1, 1);
  const materials = {
    silicon: new T.MeshPhysicalMaterial({ color: 0x304955, roughness: .28, metalness: .78, clearcoat: .7, clearcoatRoughness: .2 }),
    edge: new T.MeshStandardMaterial({ color: 0x14252f, roughness: .4, metalness: .65 }),
    array: new T.MeshStandardMaterial({ color: ampere ? 0x6b8e9c : 0x759c96, roughness: .36, metalness: .6 }),
    cell: new T.MeshStandardMaterial({ color: 0x2b4145, roughness: .42, metalness: .5 }),
    gold: new T.MeshStandardMaterial({ color: 0xc3a778, roughness: .27, metalness: .9 }),
    copper: new T.MeshStandardMaterial({ color: 0xb98055, roughness: .3, metalness: .84 }),
    silver: new T.MeshStandardMaterial({ color: 0xadb9c1, roughness: .27, metalness: .88 }),
    substrate: new T.MeshStandardMaterial({ color: 0x234b42, roughness: .5, metalness: .32 }),
    bus: new T.MeshStandardMaterial({ color: 0x77b7a9, roughness: .34, metalness: .72 }),
    black: new T.MeshStandardMaterial({ color: 0x16222a, roughness: .45, metalness: .45 })
  };
  function component(id, label, description, parent = root, parentId = null) {
    const group = new T.Group(); group.userData.componentId = id; parent.add(group);
    components[id] = { id, label, description, level: 'hbm', parent: parentId, group };
    return group;
  }
  function box(parent, x, y, z, w, h, d, material) {
    const mesh = new T.Mesh(unit, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function instances(parent, list, material, geometry = unit) {
    const mesh = new T.InstancedMesh(geometry, material, list.length), object = new T.Object3D();
    for (let i = 0; i < list.length; i++) {
      const p = list[i]; object.position.set(p.x, p.y, p.z); object.scale.set(p.w ?? 1, p.h ?? 1, p.d ?? 1);
      object.rotation.set(0, 0, 0); object.updateMatrix(); mesh.setMatrixAt(i, object.matrix);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function text(parent, content, x, y, z, width, depth, color = '#c6d5d1', font = '500 35px monospace') {
    // The texture and the physical engraving have the same aspect ratio.
    // Fit the font rather than stretching glyphs across an arbitrary plane.
    const canvas = document.createElement('canvas'), aspect = width / depth;
    canvas.height = Math.max(48, Math.min(128, Math.floor(3072 / aspect)));
    canvas.width = Math.round(canvas.height * aspect);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color;
    let pixels = Math.floor(canvas.height * .82);
    const setFont = () => { ctx.font = font.replace(/\d+(?:\.\d+)?px/, `${pixels}px`); };
    const measure = () => ctx.measureText(content) || { width: content.length * pixels * .6 };
    setFont();
    let metrics = measure();
    if(metrics.width > canvas.width * .94) {
      pixels = Math.max(12, Math.floor(pixels * canvas.width * .94 / metrics.width));
      setFont();metrics = measure();
    }
    const ascent = metrics.actualBoundingBoxAscent ?? pixels * .75;
    const descent = metrics.actualBoundingBoxDescent ?? pixels * .2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(content, canvas.width / 2, (canvas.height + ascent - descent) / 2);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;texture.anisotropy = 4;
    const material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new T.Mesh(new T.PlaneGeometry(width, depth), material);
    mesh.userData.surfaceText = content;
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }

  const interposer = component('hbm-interposer', '硅中介层 / 横向互连', 'HBM 的垂直 TSV 接到底部接口，再通过中介层横向连接 GPU 的 HBM PHY。这里的走线是教学路由。');
  box(interposer, 0, -.43, 0, 11.5, .25, 8.7, materials.edge);
  box(interposer, 0, -.295, 0, 11.3, .025, 8.5, materials.substrate);
  const stitch = [];
  for (let x = -5.25; x <= 5.25; x += .22) for (const z of [-4.05, 4.05]) stitch.push({ x, y: -.269, z, w: .035, h: .012, d: .035 });
  instances(interposer, stitch, materials.gold);
  text(interposer, 'SILICON INTERPOSER  /  TEACHING CUTAWAY', 0, -.266, 3.82, 9.9, .28, '#aebfba', '400 32px monospace');

  const stack = component('hbm-stack', specification.name + ' 堆叠剖面', specification.scope);
  const base = component('hbm-base', '底部接口芯片 / Base die', '底部接口将 DRAM 堆栈的信号连接到中介层；并非新增容量的存储层。实际电路功能和工艺依产品而异。', stack, 'hbm-stack');
  box(base, -1.7, .01, 0, 4.9, .30, 4.85, materials.black);
  box(base, -1.7, .172, 0, 4.73, .025, 4.68, materials.gold);
  box(base, -1.7, .193, 0, 4.65, .028, 4.60, materials.silicon);
  text(base, 'BASE / INTERFACE DIE', -2.4, .216, -2.05, 2.9, .26, '#c0d1d6');

  const dram = component('hbm-dram', 'DRAM 存储层', '八层代表性剖面展示存储裸片垂直堆叠。小阵列表示 bank 结构，具体层数、bank 位置和尺寸不是本标本的厂家版图。', stack, 'hbm-stack');
  const bumps = component('hbm-bumps', '层间微凸点 / Microbumps', '相邻裸片之间的微凸点形成电气连接。TSV 穿过硅片，微凸点跨过裸片之间的连接界面；两者共同构成垂直通路。', stack, 'hbm-stack');
  const layerPitch = .43, layerHeight = .18, firstY = .48;
  const plateSpec = [
    { x: -2.37, z: 0, w: 2.69, d: 4.30 },
    { x: -.35, z: -.84, w: 1.34, d: 2.62 }
  ];
  const bumpGeometry = new T.SphereGeometry(.5, 8, 6);
  for (let layer = 0; layer < 8; layer++) {
    const plate = new T.Group(); plate.position.y = firstY + layer * layerPitch; dram.add(plate);
    plate.userData.layerIndex = layer; layerGroups.push(plate);
    for (const p of plateSpec) {
      box(plate, p.x, 0, p.z, p.w, layerHeight, p.d, materials.silicon);
      box(plate, p.x, -.077, p.z, p.w + .015, .024, p.d + .015, materials.edge);
    }
    // Only symbolic memory banks. Channel count belongs to the stack interface,
    // not to each drawing layer or to one visible array tile.
    const banks = [], ribs = [];
    for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) {
      const x = -3.53 + col * .46, z = -1.84 + row * .49;
      banks.push({ x, y: .107, z, w: .37, h: .025, d: .36 });
      ribs.push({ x, y: .124, z: z - .08, w: .31, h: .008, d: .025 }, { x, y: .124, z: z + .08, w: .31, h: .008, d: .025 });
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
      banks.push({ x: -.65 + col * .51, y: .107, z: -1.80 + row * .52, w: .40, h: .025, d: .39 });
    }
    instances(plate, banks, materials.array); instances(plate, ribs, materials.cell);
    // Exposed cut edges make the cross section legible from the default camera.
    box(plate, -1.02, .105, .78, .021, .025, 2.73, materials.copper);
    box(plate, -.35, .105, .47, 1.34, .025, .021, materials.copper);
    text(plate, 'DRAM ' + String(layer + 1).padStart(2, '0'), -2.41, .129, 1.98, 1.85, .28, '#d0ddd6', '500 39px monospace');
    const bumpLayer = new T.Group(); bumpLayer.position.y = plate.position.y - .14; bumps.add(bumpLayer); bumpGroups.push(bumpLayer);
    const balls = [];
    for (let x = -3.57; x < -1.1; x += .29) for (const z of [-1.94, -.97, 0, .97, 1.94]) balls.push({ x, y: 0, z, w: .075, h: .075, d: .075 });
    for (let x = -.78; x <= .05; x += .28) for (const z of [-1.91, -1.1, -.3]) balls.push({ x, y: 0, z, w: .075, h: .075, d: .075 });
    instances(bumpLayer, balls, materials.silver, bumpGeometry);
  }
  const tsv = component('hbm-tsv', '硅通孔 / TSV', '代表性铜色束线显示信号穿过多层硅片；真实 TSV 数量远多于图中所画。剖面缺口与垂直间距经过放大，便于观察。', stack, 'hbm-stack');
  const tsvGeometry = new T.CylinderGeometry(.027, .027, 1, 8);
  const tsvList = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) tsvList.push({ x: -.74 + col * .20, y: 0, z: .80 + row * .25, w: 1, h: 1, d: 1 });
  const tsvMesh = instances(tsv, tsvList, materials.copper, tsvGeometry);
  // A companion landing-pad field makes TSV/bumps visibly different concepts.
  const lands = tsvList.map(p => ({ x: p.x, y: .226, z: p.z, w: .077, h: .018, d: .077 }));
  instances(base, lands, materials.gold);

  const channels = component('hbm-channel', specification.channels + ' 个独立通道', `${specification.name} 的堆栈接口为 ${specification.channels} × ${specification.channelBits} bit，共 1024 bit；可分为 ${specification.pseudoChannels} 个伪通道。通道是独立访问接口，不等于 DRAM 层数。`, base, 'hbm-base');
  const ports = [], portPads = [];
  const channelPitch = 4.30 / specification.channels;
  for (let i = 0; i < specification.channels; i++) {
    const x = -3.85 + channelPitch * (i + .5);
    ports.push({ x, y: .27, z: 2.12, w: channelPitch * .79, h: .055, d: .31 });
    for (let pin = 0; pin < 4; pin++) portPads.push({ x: x - channelPitch * .25 + pin * channelPitch / 6, y: .307, z: 2.12, w: .016, h: .009, d: .21 });
  }
  instances(channels, ports, materials.bus); instances(channels, portPads, materials.gold);
  text(channels, `${specification.channels} × ${specification.channelBits}-bit  /  1024-bit`, -1.7, -.266, 2.96, 4.6, .30, '#c4ded7');

  const controller = component('hbm-controller', 'GPU 侧 HBM PHY / 控制器', 'PHY 承担物理信号接口，控制器安排命令与访问。右侧方块表示 GPU 内部的接口角色，不是封装旁额外增加的一颗芯片。');
  box(controller, 3.88, -.02, -.10, 2.75, .29, 4.55, materials.black);
  box(controller, 3.88, .142, -.10, 2.64, .025, 4.44, materials.silicon);
  const phyLanes = [], controllerCells = [];
  for (let lane = 0; lane < specification.channels; lane++) phyLanes.push({ x: 2.76, y: .19, z: -1.97 + lane * 3.76 / (specification.channels - 1), w: .30, h: .06, d: .13 });
  for (let row = 0; row < 10; row++) for (let col = 0; col < 4; col++) controllerCells.push({ x: 3.29 + col * .43, y: .19, z: -1.80 + row * .37, w: .32, h: .045, d: .23 });
  instances(controller, phyLanes, materials.gold); instances(controller, controllerCells, materials.array);
  text(controller, 'GPU PHY / CTRL', 3.89, .223, 2.04, 2.44, .28, '#c2dcd6');
  const routes = [];
  for (let lane = 0; lane < specification.channels; lane++) {
    const z = -1.97 + lane * 3.76 / (specification.channels - 1);
    routes.push({ x: 1.66, y: -.257, z, w: 1.90, h: .012, d: .018 });
    routes.push({ x: .68, y: -.257, z: (z + 2.34) * .5, w: .018, h: .012, d: Math.abs(z - 2.34) });
  }
  instances(interposer, routes, materials.gold);
  text(interposer, '8 DRAM LAYERS  /  ILLUSTRATIVE', -1.7, -.266, -3.50, 5.6, .30, '#bfd0ca');

  // Engineering scale marks help read height without suggesting real dimensions.
  const ruler = [];
  for (let i = 0; i <= 8; i++) ruler.push({ x: -4.45, y: firstY - .2 + i * layerPitch, z: -1.98, w: .26, h: .018, d: .018 });
  instances(stack, ruler, materials.silver);
  box(stack, -4.58, 1.99, -1.98, .022, 3.7, .022, materials.edge);

  Object.assign(anchors, {
    'hbm-stack': new T.Vector3(-1.7, 2.8, -.4),
    'hbm-dram': new T.Vector3(-2.9, 3.6, .9),
    'hbm-tsv': new T.Vector3(-.35, 2.25, 1.3),
    'hbm-base': new T.Vector3(-2.3, .26, 2.2),
    'hbm-bumps': new T.Vector3(-3.6, 1.6, 1.94),
    'hbm-channel': new T.Vector3(-1.7, .34, 2.14),
    'hbm-interposer': new T.Vector3(1.5, -.20, 3.5),
    'hbm-controller': new T.Vector3(4.0, .26, -.5)
  });
  function setExplode(value) {
    const amount = Math.max(0, Math.min(1, Number(value) || 0));
    for (let i = 0; i < layerGroups.length; i++) {
      layerGroups[i].position.y = firstY + i * layerPitch + amount * (i + 1) * .22;
      bumpGroups[i].position.y = layerGroups[i].position.y - .14;
    }
    const top = firstY + 7 * layerPitch + amount * 8 * .22 + .16;
    const bottom = .25, height = top - bottom;
    const object = new T.Object3D();
    tsvList.forEach((p, i) => { object.position.set(p.x, (top + bottom) / 2, p.z); object.scale.set(1, height, 1); object.updateMatrix(); tsvMesh.setMatrixAt(i, object.matrix); });
    tsvMesh.instanceMatrix.needsUpdate = true;
    tsvMesh.computeBoundingBox();tsvMesh.computeBoundingSphere();
    anchors['hbm-dram'].y=3.6+amount*1.76;
    anchors['hbm-tsv'].y=2.25+amount*.88;
    anchors['hbm-bumps'].y=1.6+amount*.66;
    root.userData.explode = amount;
  }
  setExplode(0);
  return { root, components, anchors, specification, materials, layerGroups, bumpGroups, tsvMesh, setExplode,
    getBounds() { root.updateMatrixWorld(true); return new T.Box3().setFromObject(root); } };
}
