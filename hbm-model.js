// A scale-separated explanatory HBM cutaway. Eight DRAM layers are shown to
// explain stacking; this is not a claim about a specific H100/A100 supplier.
import { createLabelFactory } from './surface-label.js?v=20261110a';
const L = (zh, en) => ({ zh, en });
export function createHBMDetail(T, model = 'h100', labelFactory = null) {
  const labels = labelFactory || createLabelFactory(T);
  const ampere = model === 'a100';
  const specification = {
    name: ampere ? 'HBM2e' : 'HBM3', channels: ampere ? 8 : 16,
    channelBits: ampere ? 128 : 64, pseudoChannels: ampere ? 16 : 32,
    interfaceBits: 1024, illustrativeLayers: 8,
    scope: L('八层剖面是示意，层数、bank 位置和 TSV 数量不对应任何供应商的版图。', 'The eight-layer cutaway is illustrative; layer count, bank positions and TSV count don’t match any vendor’s layout.')
  };
  const root = new T.Group(); root.visible = false;
  const components = {}, anchors = {}, layerGroups = [], bumpGroups = [];
  const unit = new T.BoxGeometry(1, 1, 1);
  const materials = {
    silicon: new T.MeshPhysicalMaterial({ color: 0x5c656c, roughness: .24, metalness: .62, clearcoat: .35, clearcoatRoughness: .2 }),
    edge: new T.MeshStandardMaterial({ color: 0x23292e, roughness: .4, metalness: .55 }),
    array: new T.MeshStandardMaterial({ color: ampere ? 0x6b8e9c : 0x759c96, roughness: .36, metalness: .6 }),
    cell: new T.MeshStandardMaterial({ color: 0x2b4145, roughness: .42, metalness: .5 }),
    gold: new T.MeshStandardMaterial({ color: 0xc3a778, roughness: .27, metalness: .9 }),
    copper: new T.MeshStandardMaterial({ color: 0xb98055, roughness: .3, metalness: .84 }),
    silver: new T.MeshStandardMaterial({ color: 0xadb9c1, roughness: .27, metalness: .88 }),
    substrate: new T.MeshStandardMaterial({ color: 0x3b4248, roughness: .36, metalness: .52 }),
    bus: new T.MeshStandardMaterial({ color: 0x77b7a9, roughness: .34, metalness: .72 }),
    black: new T.MeshStandardMaterial({ color: 0x1d2226, roughness: .5, metalness: .35 })
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
  function text(parent, content, x, y, z, width, depth, color = 'rgba(222,230,226,.78)', mono = false) {
    const mesh = labels.label(parent, content, x, y, z, width, depth, { color, mono, weight: 500 });
    mesh.userData.surfaceText = mesh.userData.surfaceLabel?.text;
    return mesh;
  }

  const interposer = component('hbm-interposer', L('硅中介层', 'Silicon interposer'), L('HBM 底部接口芯片的信号从这里横向走到 GPU 的 HBM PHY。', 'Signals from the HBM base die run sideways through here to the GPU’s HBM PHY.'));
  box(interposer, 0, -.43, 0, 11.5, .25, 8.7, materials.edge);
  box(interposer, 0, -.295, 0, 11.3, .025, 8.5, materials.substrate);
  const stitch = [];
  for (let x = -5.25; x <= 5.25; x += .22) for (const z of [-4.05, 4.05]) stitch.push({ x, y: -.269, z, w: .035, h: .012, d: .035 });
  instances(interposer, stitch, materials.gold);
  text(interposer, L('硅中介层', 'Silicon interposer'), 0, -.266, 3.82, 2.6, .24, 'rgba(222,230,226,.55)');

  const stack = component('hbm-stack', L(specification.name + ' 堆叠剖面', specification.name + ' stack cutaway'), L(specification.name + ' 把几层 DRAM 叠在一起，靠硅通孔和微凸点上下相连，用 1024 位宽的接口和 GPU 交换数据。', specification.name + ' stacks several DRAM dies, joined vertically by TSVs and microbumps, and talks to the GPU over a 1024-bit interface.'));
  const base = component('hbm-base', L('底部接口芯片', 'Base die'), L('收拢上面各层 DRAM 的信号，经焊盘接到中介层，再连到 GPU。', 'Gathers the signals of the DRAM layers above and connects them through its pads to the interposer and the GPU.'), stack, 'hbm-stack');
  box(base, -1.7, .01, 0, 4.9, .30, 4.85, materials.black);
  box(base, -1.7, .172, 0, 4.73, .025, 4.68, materials.gold);
  box(base, -1.7, .193, 0, 4.65, .028, 4.60, materials.silicon);
  text(base, L('底部接口芯片', 'Base die'), -2.4, .216, -2.05, 1.6, .22);

  const dram = component('hbm-dram', L('DRAM 层', 'DRAM dies'), L('一层层 DRAM 芯片，数据存在每层的 bank 阵列里。读写请求沿垂直通路送到对应的那一层。', 'Stacked DRAM dies; data sits in each layer’s bank arrays. Requests travel the vertical path to the right layer.'), stack, 'hbm-stack');
  const bumps = component('hbm-bumps', L('微凸点', 'Microbumps'), L('相邻两层芯片之间的小焊点。TSV 穿过一层硅片，微凸点把它接到下一层，两者连成垂直通路。', 'Tiny solder joints between neighbouring dies. A TSV goes through one die and a microbump joins it to the next, forming the vertical path.'), stack, 'hbm-stack');
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
    text(plate, 'DRAM ' + String(layer + 1), -2.41, .129, 1.98, 1.0, .2, 'rgba(222,230,226,.7)', true);
    const bumpLayer = new T.Group(); bumpLayer.position.y = plate.position.y - .14; bumps.add(bumpLayer); bumpGroups.push(bumpLayer);
    const balls = [];
    for (let x = -3.57; x < -1.1; x += .29) for (const z of [-1.94, -.97, 0, .97, 1.94]) balls.push({ x, y: 0, z, w: .075, h: .075, d: .075 });
    for (let x = -.78; x <= .05; x += .28) for (const z of [-1.91, -1.1, -.3]) balls.push({ x, y: 0, z, w: .075, h: .075, d: .075 });
    instances(bumpLayer, balls, materials.silver, bumpGeometry);
  }
  const tsv = component('hbm-tsv', L('硅通孔（TSV）', 'Through-silicon vias (TSV)'), L('竖直穿过每层 DRAM 芯片的铜柱，把信号和供电送到各层。', 'Copper columns straight through each DRAM die, carrying signals and power to every layer.'), stack, 'hbm-stack');
  const tsvGeometry = new T.CylinderGeometry(.027, .027, 1, 8);
  const tsvList = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) tsvList.push({ x: -.74 + col * .20, y: 0, z: .80 + row * .25, w: 1, h: 1, d: 1 });
  const tsvMesh = instances(tsv, tsvList, materials.copper, tsvGeometry);
  // A companion landing-pad field makes TSV/bumps visibly different concepts.
  const lands = tsvList.map(p => ({ x: p.x, y: .226, z: p.z, w: .077, h: .018, d: .077 }));
  instances(base, lands, materials.gold);

  const channels = component('hbm-channel', L(specification.channels + ' 个独立通道', specification.channels + ' independent channels'), L(`${specification.name} 每组接口是 ${specification.channels} × ${specification.channelBits} 位，共 1024 位，可再分成 ${specification.pseudoChannels} 个伪通道。每个通道各自独立读写。`, `Each ${specification.name} stack interface is ${specification.channels} × ${specification.channelBits} bits, 1024 in total, further split into ${specification.pseudoChannels} pseudo-channels. Each channel reads and writes independently.`), base, 'hbm-base');
  const ports = [], portPads = [];
  const channelPitch = 4.30 / specification.channels;
  for (let i = 0; i < specification.channels; i++) {
    const x = -3.85 + channelPitch * (i + .5);
    ports.push({ x, y: .27, z: 2.12, w: channelPitch * .79, h: .055, d: .31 });
    for (let pin = 0; pin < 4; pin++) portPads.push({ x: x - channelPitch * .25 + pin * channelPitch / 6, y: .307, z: 2.12, w: .016, h: .009, d: .21 });
  }
  instances(channels, ports, materials.bus); instances(channels, portPads, materials.gold);
  text(channels, `${specification.channels} × ${specification.channelBits} bit = 1024 bit`, -1.7, -.266, 2.96, 2.8, .24, 'rgba(222,230,226,.72)', true);

  const controller = component('hbm-controller', L('GPU 一侧的 HBM PHY 与控制器', 'HBM PHY and controller on the GPU'), L('PHY 负责收发电信号，存储控制器安排读写命令和时序。它们在 GPU 裸片边上，不是另一颗芯片。', 'The PHY drives and receives the signals; the memory controller schedules reads, writes and timing. Both sit on the edge of the GPU die, not on a separate chip.'));
  box(controller, 3.88, -.02, -.10, 2.75, .29, 4.55, materials.black);
  box(controller, 3.88, .142, -.10, 2.64, .025, 4.44, materials.silicon);
  const phyLanes = [], controllerCells = [];
  for (let lane = 0; lane < specification.channels; lane++) phyLanes.push({ x: 2.76, y: .19, z: -1.97 + lane * 3.76 / (specification.channels - 1), w: .30, h: .06, d: .13 });
  for (let row = 0; row < 10; row++) for (let col = 0; col < 4; col++) controllerCells.push({ x: 3.29 + col * .43, y: .19, z: -1.80 + row * .37, w: .32, h: .045, d: .23 });
  instances(controller, phyLanes, materials.gold); instances(controller, controllerCells, materials.array);
  text(controller, L('GPU 侧 PHY', 'GPU-side PHY'), 3.89, .223, 2.04, 1.4, .22);
  const routes = [];
  for (let lane = 0; lane < specification.channels; lane++) {
    const z = -1.97 + lane * 3.76 / (specification.channels - 1);
    routes.push({ x: 1.66, y: -.257, z, w: 1.90, h: .012, d: .018 });
    routes.push({ x: .68, y: -.257, z: (z + 2.34) * .5, w: .018, h: .012, d: Math.abs(z - 2.34) });
  }
  instances(interposer, routes, materials.gold);
  text(interposer, L('DRAM 叠层与垂直互连', 'DRAM stack and vertical links'), -1.7, -.266, -3.50, 3.4, .24, 'rgba(222,230,226,.55)');

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
