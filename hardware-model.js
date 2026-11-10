import { createHBMDetail } from './hbm-model.js?v=20261110a';
import { createPowerDetail } from './power-model.js?v=20261110a';
import { createInterconnectDetail } from './interconnect-model.js?v=20261110a';
import { createLabelFactory } from './surface-label.js?v=20261110a';
import { boardTexture, siliconBackTexture, sramTexture, logicTexture, substrateTexture } from './surface-textures.js?v=20261110a';

const L = (zh, en) => ({ zh, en });

// Hide every sibling subtree along the selected object's ancestor path.
export function isolateHardwareSubtree(root, selected) {
  const path = new Set();
  for (let node = selected; node; node = node.parent) { path.add(node); if (node === root) break; }
  if (!path.has(root)) return [];
  const hidden = [];
  function prune(node) {
    if (node === selected) return;
    for (const child of node.children) {
      if (path.has(child)) prune(child);
      else if (child.visible) { child.visible = false; hidden.push(child); }
    }
  }
  prune(root); return hidden;
}

// Fit all eight bounds corners in camera space and return matching orbit limits.
export function calculateCameraFit(T, bounds, viewDirection, fov, aspect, margin = 1.1) {
  const target = bounds.getCenter(new T.Vector3()), direction = viewDirection.clone().normalize();
  const right = new T.Vector3(0, 1, 0).cross(direction).normalize(); if (right.lengthSq() < .01) right.set(1, 0, 0);
  const up = direction.clone().cross(right).normalize(), tangent = Math.tan(T.MathUtils.degToRad(fov / 2));
  let distance = 3.5;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new T.Vector3(x, y, z).sub(target), near = point.dot(direction);
    distance = Math.max(distance, near + Math.abs(point.dot(right)) * margin / (tangent * aspect), near + Math.abs(point.dot(up)) * margin / tangent);
  }
  distance += .2;
  const maxDistance = Math.max(52, distance * 1.8), far = Math.max(180, maxDistance + bounds.getSize(new T.Vector3()).length() * 2);
  return { position: target.clone().addScaledVector(direction, distance), target, distance, maxDistance, far };
}

// A semantic legend for the functional SM view, not a physical silicon palette.
// Counts: CUDA C++ Programming Guide 12.4.1 §16.7.1 / §16.8.1; GH100 Fig. 4, GA100 Fig. 5.
export function getSMResourceLegend(model = 'h100') {
  const a = model === 'a100', name = a ? 'A100' : 'H100';
  const arithmeticSource = 'https://docs.nvidia.com/cuda/archive/12.4.1/cuda-c-programming-guide/index.html#' + (a ? 'compute-capability-8-x' : 'compute-capability-9-0');
  const diagramSource = 'https://developer.nvidia.com/blog/nvidia-' + (a ? 'ampere' : 'hopper') + '-architecture-in-depth/';
  const gen = a ? L('第三代', 'third-generation') : L('第四代', 'fourth-generation');
  const resources = [
    { id: 'fp32', label: L('FP32 运算通道', 'FP32 lanes'), shortLabel: L('FP32', 'FP32'), color: '#79aa80', category: 'execution', countPerSM: a ? 64 : 128, countPerPartition: a ? 16 : 32, countUnit: 'lanes',
      description: L(`绿色格子是 FP32 通道，每个线程的单精度浮点指令在这里执行。${name} 每个子分区 ${a ? 16 : 32} 个，每 SM ${a ? 64 : 128} 个。`, `Green cells are FP32 lanes, where each thread’s single-precision float instructions run. ${name} has ${a ? 16 : 32} per partition and ${a ? 64 : 128} per SM.`),
      precisionNote: L('逐线程的 FP16 / BF16 运算有自己的半精度指令。', 'Per-thread FP16 / BF16 math uses its own half-precision instructions.') },
    { id: 'fp64', label: L('FP64 运算通道', 'FP64 lanes'), shortLabel: L('FP64', 'FP64'), color: '#669dce', category: 'execution', countPerSM: a ? 32 : 64, countPerPartition: a ? 8 : 16, countUnit: 'lanes',
      description: L(`蓝色是双精度通道。每个子分区 ${a ? 8 : 16} 个，每 SM ${a ? 32 : 64} 个。`, `Blue cells are double-precision lanes: ${a ? 8 : 16} per partition, ${a ? 32 : 64} per SM.`) },
    { id: 'int32', label: L('INT32 运算通道', 'INT32 lanes'), shortLabel: L('INT32', 'INT32'), color: '#59aaa4', category: 'execution', countPerSM: 64, countPerPartition: 16, countUnit: 'lanes',
      description: L('青色是整数通道，地址计算和循环计数多在这里。每个子分区 16 个，每 SM 64 个。', 'Teal cells are integer lanes, used for address math and loop counters. 16 per partition, 64 per SM.') },
    { id: 'sfu', label: L('特殊函数单元（SFU）', 'Special function units (SFU)'), shortLabel: L('SFU', 'SFU'), color: '#ce9078', category: 'execution', countPerSM: 16, countPerPartition: 4, countUnit: 'units',
      description: L('做正弦、倒数、平方根这类超越函数的近似。每个子分区 4 个，每 SM 16 个。', 'Approximate sine, reciprocal, square root and similar functions. 4 per partition, 16 per SM.') },
    { id: 'tensor', label: L(`${gen.zh} Tensor Core`, `${gen.en[0].toUpperCase() + gen.en.slice(1)} Tensor Cores`), shortLabel: L('Tensor Core', 'Tensor Core'), color: '#d1ad69', category: 'matrix', countPerSM: 4, countPerPartition: 1, countUnit: 'cores',
      description: L(`做矩阵乘加。每个子分区 1 个，每 SM 4 个；支持 FP16、BF16、TF32、FP64 等矩阵格式${a ? '' : '，Hopper 还支持 FP8'}。`, `Matrix multiply-add units. One per partition, four per SM; they handle FP16, BF16, TF32, FP64 and other matrix formats${a ? '' : ', plus FP8 on Hopper'}.`),
      precisionNote: L('常见用法是 FP16 / BF16 输入、FP32 累加。', 'A common setup is FP16 / BF16 inputs with FP32 accumulation.') },
    { id: 'registers', label: L('寄存器文件', 'Register file'), shortLabel: L('寄存器', 'Registers'), color: '#a79bc7', category: 'storage', countPerSM: 65536, countPerPartition: 16384, countUnit: '32-bit registers',
      description: L('紫色是存储，不是运算单元：放线程的操作数和累加器。每个子分区 16,384 个 32 位寄存器（64 KiB），每 SM 共 256 KiB。', 'Purple is storage, not compute: it holds thread operands and accumulators. 16,384 32-bit registers (64 KiB) per partition, 256 KiB per SM.') },
    { id: 'lsu', label: L('载入 / 存储单元（LD/ST）', 'Load/store units (LD/ST)'), shortLabel: L('LD/ST', 'LD/ST'), color: '#b77c4b', category: 'data-movement', countPerSM: 32, countPerPartition: 8, countUnit: 'units',
      description: L('执行线程的读写内存请求，连接寄存器和 L1 / 共享内存。每个子分区 8 个，每 SM 32 个。', 'Carry out threads’ memory reads and writes between registers and L1 / shared memory. 8 per partition, 32 per SM.') },
    { id: 'warp', label: L('Warp 调度器', 'Warp scheduler'), shortLabel: L('调度器', 'Scheduler'), color: '#b88959', category: 'control', countPerSM: 4, countPerPartition: 1, countUnit: 'schedulers',
      description: L('每个周期从就绪的 warp 里挑一条指令发出。每个子分区 1 个，每 SM 4 个。它只管控制，不经手数据。', 'Each cycle it picks an instruction from a ready warp. One per partition, four per SM. It handles control only; data doesn’t pass through it.') },
    { id: 'dispatch', label: L('指令派发', 'Dispatch unit'), shortLabel: L('派发', 'Dispatch'), color: '#9b8c75', category: 'control', countPerSM: 4, countPerPartition: 1, countUnit: 'dispatch units',
      description: L('把调度器选中的指令送到对应的运算单元。每个子分区 1 个。', 'Sends the instruction the scheduler picked to the right execution units. One per partition.') },
    { id: 'l0-instruction-cache', label: L('L0 指令缓存', 'L0 instruction cache'), shortLabel: L('L0 指令', 'L0 I-cache'), color: '#8398ab', category: 'storage', countPerSM: 4, countPerPartition: 1, countUnit: 'local caches',
      description: L('每个子分区自己的小指令缓存，调度器从这里取指令。', 'A small instruction cache in each partition that the scheduler reads from.') },
    { id: 'instruction-cache', label: L('L1 指令缓存', 'L1 instruction cache'), shortLabel: L('L1 指令', 'L1 I-cache'), color: '#8398ab', category: 'storage',
      description: L('四个子分区共用，给各自的 L0 指令缓存供指令。', 'Shared by the four partitions; it refills their L0 instruction caches.') },
    { id: 'texture', label: L('纹理单元', 'Texture units'), shortLabel: L('TEX', 'TEX'), color: '#789aad', category: 'sampling', countPerSM: 4, countPerPartition: null, countUnit: 'units',
      description: L('四个纹理单元负责纹理寻址、采样和过滤。', 'Four texture units handle texture addressing, sampling and filtering.') },
    { id: 'smem', label: L('L1 数据缓存 / 共享内存', 'L1 data cache / shared memory'), shortLabel: L('L1 / 共享', 'L1 / shared'), color: '#4f9b94', category: 'storage', capacityKB: a ? 192 : 256, sharedMaxKB: a ? 164 : 228,
      description: L(`四个子分区共用的一块 ${a ? 192 : 256} KB 存储，可以分出最多 ${a ? 164 : 228} KB 当共享内存。共享内存分 32 banks，同一线程块里的线程靠它交换和复用数据。`, `${a ? 192 : 256} KB of storage shared by the four partitions; up to ${a ? 164 : 228} KB can be used as shared memory. Shared memory has 32 banks and is how threads in one block share and reuse data.`) }
  ];
  if (!a) resources.push({ id: 'tma', label: L('张量内存加速器（TMA）', 'Tensor Memory Accelerator (TMA)'), shortLabel: L('TMA', 'TMA'), color: '#b9b2a3', category: 'data-movement',
    description: L('Hopper 新增的搬运硬件，在显存和共享内存之间异步搬整块张量，线程不用逐个发地址。', 'Hopper’s copy engine for moving whole tensors between global and shared memory asynchronously, without threads issuing every address.') });
  return resources.map(item => ({ ...item, sourceUrls: [arithmeticSource, diagramSource], colorMeaning: 'functional' }));
}

// Die floorplan after NVIDIA's full-GPU block diagrams (GH100 Fig. 3,
// GA100 Fig. 4): two rows of four GPCs around a two-part L2, memory
// controllers along the HBM edges, host interface on one end and NVLink on
// the other. Positions are functional, not the transistor layout.
export function dieFloorplan(model = 'h100') {
  const ampere = model === 'a100';
  const tpcRows = ampere ? 8 : 9, gpcDepth = 2.8, pitch = gpcDepth / tpcRows;
  const columns = [-1.56, -.52, .52, 1.56], rowCentres = [-1.95, 1.95];
  // Shipping products: H100 SXM 66 of 72 TPCs; A100 54 of 64 TPCs in 7 GPCs.
  const disabled = gpc => ampere
    ? (gpc === 7 ? Array.from({ length: tpcRows }, (_, r) => r) : gpc >= 5 ? [(gpc * 3 + 2) % tpcRows] : [])
    : (gpc < 6 ? [(gpc * 5 + 3) % tpcRows] : []);
  const gpcs = [];
  for (let g = 0; g < 8; g++) {
    const x = columns[g % 4], z = rowCentres[Math.floor(g / 4)], off = disabled(g);
    const tpcs = Array.from({ length: tpcRows }, (_, row) => {
      // Rows count outward from the L2 so row 0 is always nearest the cache.
      const zz = z < 0 ? z + gpcDepth / 2 - pitch * (row + .5) : z - gpcDepth / 2 + pitch * (row + .5);
      return { row, z: zz, active: !off.includes(row), sms: [x - .235, x + .235].map(sx => ({ x: sx, z: zz })) };
    });
    gpcs.push({ index: g, x, z, w: .96, d: gpcDepth, pitch, tpcs, active: tpcs.some(t => t.active) });
  }
  const sites = [-2.6, 0, 2.6];
  const memoryControllers = [];
  for (const side of [-1, 1]) for (const z of sites) memoryControllers.push({ x: side * 2.38, z, w: .42, d: 2.3, active: !(side > 0 && z === 2.6) });
  const activeSMs = gpcs.reduce((n, g) => n + g.tpcs.filter(t => t.active).length * 2, 0);
  // The SM used by the GEMM lesson and the TPC used by the pixel lesson are
  // illustrative choices; NVIDIA does not publish which units are enabled.
  const lessonTPC = gpcs[1].tpcs[2], graphicsTPC = gpcs[0].tpcs[3];
  return { ampere, tpcRows, gpcs, memoryControllers, activeSMs, totalSMs: 8 * tpcRows * 2,
    l2: [{ x: -1.04, z: 0, w: 2.0, d: .78 }, { x: 1.04, z: 0, w: 2.0, d: .78 }],
    host: { x: 0, z: -3.58, w: 4.1, d: .26 }, nvlink: { x: 0, z: 3.58, w: 4.1, d: .26 },
    lessonSM: { x: lessonTPC.sms[0].x, z: lessonTPC.z }, graphicsTPC: { x: gpcs[0].x, z: graphicsTPC.z }, gmmu: { x: 0, z: -.62 } };
}

export const HBM_SITES = [
  { x: -3.75, z: -2.6, active: true }, { x: -3.75, z: 0, active: true }, { x: -3.75, z: 2.6, active: true },
  { x: 3.75, z: -2.6, active: true }, { x: 3.75, z: 0, active: true }, { x: 3.75, z: 2.6, active: false }
];

// Procedural SXM anatomy. Package/board geometry is a recognizable physical
// reconstruction, not a vendor CAD model.
export function createHardwareModel(T, model = 'h100') {
  const ampere = model === 'a100';
  const specification = ampere
    ? { name: 'A100', die: 'GA100', sm: 108, gpc: 7, l2: '40 MB', l2Half: '20 MB', hbm: 'HBM2e', memory: '80 GB', pcie: 'PCIe 4.0', nvlink: 'NVLink 3', links: 12 }
    : { name: 'H100', die: 'GH100', sm: 132, gpc: 8, l2: '50 MB', l2Half: '25 MB', hbm: 'HBM3', memory: '80 GB', pcie: 'PCIe 5.0', nvlink: 'NVLink 4', links: 18 };
  const floorplan = dieFloorplan(model);
  const labels = createLabelFactory(T);
  const root = new T.Group();
  const components = {};
  const layers = [];
  const hbmSlices = [];
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const textures = { sram: sramTexture(T), logic: logicTexture(T), silicon: siliconBackTexture(T), substrate: substrateTexture(T) };
  const std = (color, roughness, metalness, extra = {}) => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const textured = (color, map, roughness = .55, metalness = .22) => std(color, roughness, metalness, { map });
  const mats = {
    // Board: glossy green solder mask over FR-4.
    pcbEdge: std(0x2a3a2c, .8, 0),
    substrate: std(0x262f2a, .62, .05, { map: textures.substrate }),
    ceramic: std(0x9c8a6b, .68, 0),
    silver: std(0xc3c8cb, .34, .92),
    bright: std(0xdfe3e5, .22, .95),
    nickel: std(0xb6bcc0, .4, .95),
    darkMetal: std(0x3e4549, .38, .7),
    black: std(0x15191b, .62, .04),
    epoxy: std(0x121517, .5, .06),
    mold: std(0x0f1214, .82, 0),
    ferrite: std(0x2c3033, .78, .08),
    plastic: std(0x16191b, .74, 0),
    chip: std(0x1b2024, .55, .05),
    silicon: new T.MeshPhysicalMaterial({ color: 0x59626a, map: textures.silicon, roughness: .2, metalness: .7, clearcoat: .35, clearcoatRoughness: .18 }),
    siliconSide: std(0x2a3036, .32, .55),
    interposer: std(0x3b4248, .36, .52),
    underfill: std(0x22201b, .55, .02),
    gold: std(0xd0a64e, .26, 1),
    copper: std(0xb87a4c, .34, .95),
    solder: std(0xb9bec0, .36, .85),
    rdl: std(0xb98a55, .32, .9),
    // Functional floorplans: legend colour multiplied by an SRAM or logic pattern.
    activeSM: textured(0x79aa80, textures.logic, .52, .24),
    inactiveSM: std(0x262e2e, .7, .12),
    l2: textured(0xb9a46e, textures.sram, .48, .3),
    memoryController: textured(0x8b98a8, textures.logic, .5, .28),
    io: textured(0x7f8c96, textures.logic, .5, .28),
    trace: std(0x9da48a, .4, .7),
    smem: textured(0x4f9b94, textures.sram, .5, .22),
    tensor: textured(0xd1ad69, textures.logic, .45, .3),
    register: textured(0xa79bc7, textures.sram, .5, .2),
    scheduler: textured(0xb88959, textures.logic, .5, .22),
    fp64: textured(0x669dce, textures.logic, .5, .22),
    int32: textured(0x59aaa4, textures.logic, .5, .22),
    sfu: textured(0xce9078, textures.logic, .5, .22),
    instruction: textured(0x8398ab, textures.sram, .5, .22),
    texture: textured(0x789aad, textures.logic, .5, .22),
    dispatch: textured(0x9b8c75, textures.logic, .5, .22),
    tma: textured(0xb9b2a3, textures.logic, .5, .22),
    lsu: textured(0xb77c4b, textures.logic, .5, .24),
    partition: std(0x1a1f22, .6, .2),
    smBase: std(0x23292d, .45, .4)
  };
  const box = (parent, x, y, z, w, h, d, mat, shadow = true) => {
    const mesh = new T.Mesh(unitBox, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  };
  const instances = (parent, list, mat, geometry = unitBox) => {
    const mesh = new T.InstancedMesh(geometry, mat, list.length);
    const dummy = new T.Object3D();
    list.forEach((item, index) => {
      dummy.position.set(item.x || 0, item.y || 0, item.z || 0);
      dummy.scale.set(item.w || 1, item.h || 1, item.d || 1);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  };
  const component = (id, label, description, level, parent = root, parentId = null) => {
    const group = new T.Group(); group.userData.componentId = id; parent.add(group);
    components[id] = { id, label, description, level, parent: parentId, group };
    return group;
  };
  const text = labels.label;

  // ---------- Board ----------
  const pcb = component('pcb', L('SXM 模组电路板', 'SXM module board'), L('多层电路板，承载 GPU 封装、供电器件，背面是连接服务器的高密度连接器。', 'A multilayer board that carries the GPU package and power parts, with the high-density server connector underneath.'), 'board');
  const outline = new T.Shape(); const s = 8.5, r = .38;
  outline.moveTo(-s + r, -s); outline.lineTo(s - r, -s); outline.quadraticCurveTo(s, -s, s, -s + r);
  outline.lineTo(s, s - r); outline.quadraticCurveTo(s, s, s - r, s); outline.lineTo(-s + r, s);
  outline.quadraticCurveTo(-s, s, -s, s - r); outline.lineTo(-s, -s + r); outline.quadraticCurveTo(-s, -s, -s + r, -s);
  [-7.65, 7.65].forEach(x => [-7.65, 7.65].forEach(z => { const hole = new T.Path(); hole.absarc(x, z, .32, 0, Math.PI * 2, true); outline.holes.push(hole); }));
  const pcbGeometry = new T.ExtrudeGeometry(outline, { depth: .2, bevelEnabled: false, curveSegments: 12 });
  pcbGeometry.rotateX(-Math.PI / 2);
  const pcbBody = new T.Mesh(pcbGeometry, [mats.pcbEdge, mats.pcbEdge]); pcbBody.position.y = -.51; pcb.add(pcbBody); pcbBody.castShadow = true; pcbBody.receiveShadow = true;
  const inductors = [], inductorCaps = [], controllers = [], caps = [], capEnds = [];
  const powerLeads = [], powerLands = [], magneticSeams = [];
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = -5.85 + i * 1.62;
    inductors.push({ x: side * 6.55, y: .05, z, w: .82, h: .62, d: 1.03 });
    inductorCaps.push({ x: side * 6.55, y: .37, z, w: .74, h: .02, d: .9 });
    controllers.push({ x: side * 7.45, y: -.17, z, w: .36, h: .22, d: .82 });
    for (const end of [-1, 1]) {
      powerLands.push({ x: side * 6.55, y: -.265, z: z + end * .46, w: .90, h: .05, d: .18 });
      magneticSeams.push({ x: side * 6.55 + end * .315, y: .383, z, w: .012, h: .008, d: .76 });
      for (let pin = 0; pin < 6; pin++) powerLeads.push({ x: side * 7.45 + end * .2, y: -.265, z: z - .32 + pin * .128, w: .1, h: .04, d: .07 });
    }
    for (let k = 0; k < 3; k++) {
      const cz = z - .42 + k * .42;
      caps.push({ x: side * 5.56, y: -.2, z: cz, w: .22, h: .18, d: .2 });
      capEnds.push({ x: side * 5.56, y: -.2, z: cz - .115, w: .23, h: .19, d: .05 }, { x: side * 5.56, y: -.2, z: cz + .115, w: .23, h: .19, d: .05 });
    }
  }
  const faceGeo = new T.ShapeGeometry(outline, 12); faceGeo.rotateX(-Math.PI / 2);
  const uv = faceGeo.attributes.uv, pos = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 8.5) / 17, (8.5 - pos.getZ(i)) / 17);
  const solderMask = new T.MeshPhysicalMaterial({ color: 0xa8b4ae, map: boardTexture(T, { inductors, controllers }), roughness: .46, metalness: 0, clearcoat: .55, clearcoatRoughness: .32 });
  const face = new T.Mesh(faceGeo, solderMask); face.position.y = -.302; face.receiveShadow = true; pcb.add(face);
  const vias = [];
  for (let p = -7; p <= 7; p += .3) vias.push({ x: p, y: -.296, z: 8.18, w: .05, h: .01, d: .05 }, { x: p, y: -.296, z: -8.18, w: .05, h: .01, d: .05 }, { x: 8.18, y: -.296, z: p, w: .05, h: .01, d: .05 }, { x: -8.18, y: -.296, z: p, w: .05, h: .01, d: .05 });
  instances(pcb, vias, mats.copper);
  const washerGeo = new T.TorusGeometry(.33, .05, 8, 28);
  const boltGeo = new T.CylinderGeometry(.235, .235, .14, 28);
  [-7.65, 7.65].forEach(x => [-7.65, 7.65].forEach(z => {
    const washer = new T.Mesh(washerGeo, mats.nickel); washer.rotation.x = Math.PI / 2; washer.position.set(x, -.285, z); pcb.add(washer);
    const screw = new T.Mesh(boltGeo, mats.silver); screw.position.set(x, -.24, z); pcb.add(screw); screw.castShadow = true;
    box(pcb, x, -.168, z, .25, .012, .035, mats.black, false); box(pcb, x, -.167, z, .035, .012, .25, mats.black, false);
  }));
  const power = component('power', L('多相供电（VRM）', 'Multiphase power (VRM)'), L('把服务器给的电压降到 GPU 需要的约 1 伏，同时提供几百安的电流。两侧每一组电感加功率级就是一相。', 'Steps the server’s supply down to the roughly one volt the GPU runs at, while delivering hundreds of amps. Each inductor with its power stage on either side is one phase.'), 'board', pcb, 'pcb');
  instances(power, inductors, mats.ferrite); instances(power, inductorCaps, mats.black); instances(power, controllers, mats.chip);
  instances(power, caps, mats.ceramic); instances(power, capEnds, mats.solder);
  instances(power, powerLands, mats.solder); instances(power, powerLeads, mats.solder); instances(power, magneticSeams, mats.black);
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) text(power, 'R22', side * 6.55, .384, -5.85 + i * 1.62 + .1, .42, .18, { mono: true, color: 'rgba(170,176,178,.55)' });
  const smallCaps = [], smallEnds = [], resistors = [];
  for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {
    const x = -5.55 + i * .44, z = side * 6.2;
    smallCaps.push({ x, y: -.235, z, w: .16, h: .12, d: .26 });
    smallEnds.push({ x: x - .085, y: -.235, z, w: .05, h: .13, d: .27 }, { x: x + .085, y: -.235, z, w: .05, h: .13, d: .27 });
    if (i % 2 === 0) resistors.push({ x, y: -.25, z: side * 6.7, w: .26, h: .07, d: .14 });
  }
  instances(pcb, smallCaps, mats.ceramic); instances(pcb, smallEnds, mats.solder); instances(pcb, resistors, mats.chip);
  const sxm = component('sxm', L('SXM 高密度连接器', 'SXM connectors'), L('在模组背面，把供电、PCIe 和 NVLink 信号接到服务器主板上。', 'On the back of the module, carrying power, PCIe and NVLink to the server board.'), 'board', pcb, 'pcb');
  const contacts = [];
  for (const side of [-1, 1]) {
    box(sxm, 0, -.66, side * 6.85, 10.5, .28, 1.0, mats.plastic);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 70; i++) contacts.push({ x: -5.08 + i * .147, y: -.8, z: side * 6.85 + (row - 1) * .24, w: .08, h: .06, d: .10 });
  }
  instances(sxm, contacts, mats.gold);

  // ---------- Package ----------
  const serial = component('package', L('GPU 封装', 'GPU package'), L('有机基板上放着硅中介层，中介层上并排放 GPU 裸片和 HBM。这种 2.5D 封装让几千根线只走一毫米左右。', 'An organic substrate holds a silicon interposer with the GPU die and HBM side by side on it. This 2.5D package lets thousands of wires run only about a millimeter.'), 'package');
  const substrate = new T.Group(); serial.add(substrate); layers.push({ group: substrate, factor: .9 });
  box(substrate, 0, -.105, 0, 10.7, .32, 10.2, mats.substrate);
  const bga = [];
  for (let x = -4.9; x <= 4.9; x += .24) for (let z = -4.65; z <= 4.65; z += .24) if (Math.abs(x) > 4.1 || Math.abs(z) > 3.9) bga.push({ x, y: -.29, z, w: .11, h: .11, d: .11 });
  instances(substrate, bga, mats.solder, new T.SphereGeometry(.5, 8, 6));
  const substrateEdges = [];
  for (const x of [-5.355, 5.355]) for (let band = 0; band < 3; band++) substrateEdges.push({ x, y: -.205 + band * .075, z: 0, w: .012, h: .009, d: 9.72 });
  for (const z of [-5.105, 5.105]) for (let band = 0; band < 3; band++) substrateEdges.push({ x: 0, y: -.205 + band * .075, z, w: 10.15, h: .009, d: .012 });
  instances(substrate, substrateEdges, mats.copper);
  // Stiffener frame: nickel-plated, keeps the large substrate flat.
  for (const z of [-4.8, 4.8]) box(substrate, 0, .2, z, 10.45, .28, .35, mats.nickel);
  for (const x of [-5.05, 5.05]) box(substrate, x, .2, 0, .35, .28, 9.28, mats.nickel);
  const packageCaps = [], packageEnds = [];
  for (let x = -4.5; x <= 4.5; x += .34) for (const side of [-1, 1]) {
    packageCaps.push({ x, y: .12, z: side * 4.45, w: .12, h: .08, d: .2 });
    packageEnds.push({ x: x - .06, y: .12, z: side * 4.45, w: .03, h: .09, d: .21 }, { x: x + .06, y: .12, z: side * 4.45, w: .03, h: .09, d: .21 });
  }
  instances(substrate, packageCaps, mats.ceramic); instances(substrate, packageEnds, mats.solder);

  const interposer = component('interposer', L('硅中介层', 'Silicon interposer'), L('一整块硅，表层的金属层里布着 GPU 和 HBM 之间的几千根线。装配好后这些线被芯片盖住，拆开才看得到（图中走线为示意）。', 'A single piece of silicon whose metal layers carry the thousands of wires between the GPU and HBM. Once assembled the wiring is hidden under the dies; take it apart to see it (routing shown is illustrative).'), 'package', serial, 'package');
  layers.push({ group: interposer, factor: 1.8 });
  box(interposer, 0, .145, 0, 9.75, .10, 8.4, mats.siliconSide);
  box(interposer, 0, .2, 0, 9.58, .016, 8.24, mats.interposer);
  // Microbump fields and RDL wiring live on the interposer top. Assembled, the
  // dies and underfill cover them; exploded, they show what joins the chips.
  const bumps = [], rdl = [];
  for (let x = -2.5; x <= 2.5; x += .2) for (let z = -3.6; z <= 3.6; z += .2) if (Math.abs(x) > 1.9 || Math.abs(z) > 3.3 || (Math.round((x + z) * 5) % 3 === 0)) bumps.push({ x, y: .212, z, w: .05, h: .014, d: .05 });
  for (const site of HBM_SITES) {
    for (let x = site.x - .7; x <= site.x + .7; x += .14) for (let z = site.z - .82; z <= site.z + .82; z += .16) bumps.push({ x, y: .212, z, w: .045, h: .014, d: .045 });
    if (!site.active) continue;
    const dir = Math.sign(site.x), inner = site.x - dir * .55, phy = dir * 2.3;
    for (let i = 0; i < 24; i++) {
      const z = site.z - .78 + i * .068, zDie = site.z * .92 - .72 + i * .062;
      rdl.push({ x: (inner + phy) / 2, y: .211, z: (z + zDie) / 2, w: Math.abs(inner - phy), h: .006, d: .018 });
    }
  }
  instances(interposer, bumps, mats.solder, new T.CylinderGeometry(.5, .5, 1, 8));
  instances(interposer, rdl, mats.rdl);

  // Six HBM sites; the sixth is present on the package but not enabled.
  const hbm = component('hbm', L(`5 组 ${specification.hbm}`, `5 × ${specification.hbm} stacks`), L(`五组启用的 HBM，共 ${specification.memory}。每组是几层 DRAM 芯片叠在一块底部接口芯片上，四周包着黑色塑封料，顶面露出硅。`, `Five active HBM stacks, ${specification.memory} in total. Each is several DRAM dies on a base interface die, wrapped in black mold compound with bare silicon on top.`), 'package', serial, 'package');
  layers.push({ group: hbm, factor: 3.1 });
  const inactive = component('hbm-inactive', L('第六个 HBM 位置（未启用）', 'Sixth HBM site (not enabled)'), L(`封装上有六个 HBM 位置，这款产品只启用五组。图中把第六个画成同样外形、但没有启用的块。完整的 ${specification.die} 设计支持六组。`, `The package has six HBM sites and this product enables five. The sixth is drawn with the same outline but switched off. The full ${specification.die} design supports six.`), 'package', serial, 'package');
  layers.push({ group: inactive, factor: 3.1 });
  const hbmBasePads = [];
  HBM_SITES.forEach((p, i) => {
    const parent = p.active ? hbm : inactive;
    box(parent, p.x, .245, p.z, 1.64, .05, 1.93, mats.siliconSide);
    // Eight molded layers whose top lands level with the GPU die, so one cold
    // plate can sit on both (the die back is at y ≈ 0.54).
    for (let slice = 0; slice < 8; slice++) {
      const plate = box(parent, p.x, .29 + slice * .03, p.z, 1.56, .028, 1.84, mats.mold);
      hbmSlices.push({ mesh: plate, y: plate.position.y, index: slice });
    }
    const top = box(parent, p.x, .525, p.z, 1.56, .026, 1.84, p.active ? mats.silicon : mats.siliconSide);
    hbmSlices.push({ mesh: top, y: top.position.y, index: 8 });
    if (p.active) {
      const mark = text(parent, `${specification.hbm} · 16 GB`, p.x, .5395, p.z + .55, 1.1, .16, { mono: true, color: 'rgba(214,222,226,.34)' });
      hbmSlices.push({ mesh: mark, y: mark.position.y, index: 8 });
    }
    for (const side of [-1, 1]) for (let contact = 0; contact < 18; contact++) hbmBasePads.push({ x: p.x + side * .80, y: .25, z: p.z - .83 + contact * .098, w: .03, h: .04, d: .04 });
  });
  instances(hbm, hbmBasePads, mats.solder);
  // Underfill fillets close the gaps at the die and stack edges.
  const fillets = [];
  for (const p of HBM_SITES) fillets.push({ x: p.x, y: .222, z: p.z, w: 1.72, h: .03, d: 2.01 });
  fillets.push({ x: 0, y: .222, z: 0, w: 5.42, h: .03, d: 7.77 });
  instances(interposer, fillets, mats.underfill);

  // ---------- GPU die ----------
  const die = component('gpu-die', L(`${specification.die} GPU 裸片`, `${specification.die} GPU die`), L(`装配好时看到的是磨平的硅片背面。双击进入，看 ${specification.sm} 个启用的 SM、两半 ${specification.l2} L2 和四周的接口怎样排布。`, `Assembled, you see the ground silicon back. Double-click to go inside and see how the ${specification.sm} enabled SMs, the two halves of the ${specification.l2} L2 and the edge interfaces are laid out.`), 'die', serial, 'package');
  layers.push({ group: die, factor: 3.1 });
  box(die, 0, .31, 0, 5.30, .18, 7.65, mats.siliconSide);
  box(die, 0, .405, 0, 5.24, .012, 7.59, mats.smBase);
  const dieBumps = [];
  for (const side of [-1, 1]) for (let pin = 0; pin < 48; pin++) dieBumps.push({ x: side * 2.52, y: .223, z: -3.48 + pin * .148, w: .043, h: .03, d: .043 });
  instances(die, dieBumps, mats.solder, new T.SphereGeometry(.5, 6, 4));
  const fpY = .43;
  const l2 = component('l2', L(`${specification.l2} L2 缓存`, `${specification.l2} L2 cache`), L(`所有 SM 共用的片上缓存，分成两半，每半 ${specification.l2Half}。读写先查 L2，没命中才去 HBM。`, `On-die cache shared by every SM, split into two halves of ${specification.l2Half}. Reads and writes check L2 first and only go to HBM on a miss.`), 'die', die, 'gpu-die');
  for (const half of floorplan.l2) {
    box(l2, half.x, fpY, half.z, half.w, .04, half.d, mats.l2);
    text(l2, L(`L2 · ${specification.l2Half}`, `L2 · ${specification.l2Half}`), half.x, fpY + .022, half.z, 1.1, .2, { color: 'rgba(28,24,14,.72)', weight: 600 });
  }
  box(l2, 0, fpY - .004, 0, .07, .03, .78, mats.trace);
  const mc = component('memory-controller', L('存储控制器与 HBM PHY', 'Memory controllers and HBM PHY'), L(`沿两条长边排开，正对着旁边的 HBM。${ampere ? 'A100' : 'H100'} 启用 10 个 512 位控制器，每组 HBM 对应两个。`, `Along the two long edges, facing the HBM stacks. ${ampere ? 'A100' : 'H100'} enables ten 512-bit controllers, two per stack.`), 'die', die, 'gpu-die');
  for (const m of floorplan.memoryControllers) {
    box(mc, m.x, fpY, m.z, m.w, .04, m.d, m.active ? mats.memoryController : mats.inactiveSM);
    if (m.active) text(mc, 'HBM PHY', m.x, fpY + .022, m.z, .9, .17, { rotate: Math.sign(m.x) * Math.PI / 2, color: 'rgba(16,20,26,.62)', weight: 600 });
  }
  const host = component('pcie', L(`${specification.pcie} 主机接口与 GigaThread 引擎`, `${specification.pcie} host interface and GigaThread engine`), L('主机通过 PCIe 把命令和数据送进来，GigaThread 引擎把线程块分配到各个 SM。', 'The host sends commands and data over PCIe; the GigaThread engine hands thread blocks out to the SMs.'), 'die', die, 'gpu-die');
  box(host, floorplan.host.x, fpY, floorplan.host.z, floorplan.host.w, .04, floorplan.host.d, mats.io);
  text(host, L(`${specification.pcie} · GigaThread 引擎`, `${specification.pcie} · GigaThread engine`), 0, fpY + .022, floorplan.host.z, 3.0, .17, { color: 'rgba(14,18,22,.66)', weight: 600 });
  const link = component('nvlink', L(`${specification.nvlink}（${specification.links} 条链路）`, `${specification.nvlink} (${specification.links} links)`), L(`GPU 之间直接互连的高速链路，经 SXM 连接器接到其他 GPU。${specification.name} 有 ${specification.links} 条。`, `High-speed links that connect GPUs directly, through the SXM connector. ${specification.name} has ${specification.links}.`), 'die', die, 'gpu-die');
  box(link, floorplan.nvlink.x, fpY, floorplan.nvlink.z, floorplan.nvlink.w, .04, floorplan.nvlink.d, mats.io);
  text(link, L(`${specification.nvlink} · ${specification.links} 条链路`, `${specification.nvlink} · ${specification.links} links`), 0, fpY + .022, floorplan.nvlink.z, 3.0, .17, { color: 'rgba(14,18,22,.66)', weight: 600 });
  const sm = component('sm', L(`${specification.sm} 个启用的 SM`, `${specification.sm} enabled SMs`), L(`每两个 SM 组成一个 TPC，九个（A100 是八个）TPC 组成一个 GPC。暗色的是没启用的 TPC，位置每颗芯片不同。双击进入一个 SM。`, `Two SMs make a TPC and ${ampere ? 'eight' : 'nine'} TPCs make a GPC. Dark cells are disabled TPCs; which ones varies from chip to chip. Double-click to go inside one SM.`), 'die', die, 'gpu-die');
  const smCells = [], disabledCells = [], smPartitions = [], smL1 = [], gpcFrames = [];
  for (const gpc of floorplan.gpcs) {
    gpcFrames.push({ x: gpc.x, y: fpY - .01, z: gpc.z, w: gpc.w, h: .02, d: gpc.d });
    const nearL2 = gpc.z < 0 ? gpc.z + gpc.d / 2 : gpc.z - gpc.d / 2;
    text(sm, `GPC ${gpc.index}`, gpc.x, fpY + .006, gpc.z < 0 ? gpc.z - gpc.d / 2 - .06 : gpc.z + gpc.d / 2 + .06, .62, .1, { color: 'rgba(200,210,204,.6)', weight: 600 });
    for (const tpc of gpc.tpcs) for (const cell of tpc.sms) {
      const item = { x: cell.x, y: fpY + .012, z: cell.z, w: .4, h: .03, d: gpc.pitch * .8 };
      if (!tpc.active) { disabledCells.push(item); continue; }
      smCells.push(item);
      for (const dx of [-.1, .1]) for (const dz of [-.05, .03]) smPartitions.push({ x: cell.x + dx, y: fpY + .03, z: cell.z + dz * (gpc.pitch / .31), w: .16, h: .008, d: gpc.pitch * .22 });
      smL1.push({ x: cell.x, y: fpY + .03, z: cell.z + Math.sign(nearL2 - cell.z) * gpc.pitch * .3, w: .34, h: .01, d: gpc.pitch * .12 });
    }
  }
  instances(sm, gpcFrames, mats.partition);
  instances(sm, smCells, mats.activeSM); instances(sm, disabledCells, mats.inactiveSM);
  instances(sm, smPartitions, mats.scheduler); instances(sm, smL1, mats.smem);
  const siliconCover = new T.Mesh(unitBox, new T.MeshPhysicalMaterial({ color: 0x5a636b, map: textures.silicon, roughness: .18, metalness: .72, clearcoat: .4, clearcoatRoughness: .12 }));
  siliconCover.position.set(0, .486, 0); siliconCover.scale.set(5.255, .105, 7.605); siliconCover.castShadow = true; siliconCover.receiveShadow = true; die.add(siliconCover);

  // ---------- SM (functional organization after GH100 Fig. 4 / GA100 Fig. 5) ----------
  const smRoot = new T.Group(); smRoot.visible = false; root.add(smRoot);
  const smAssembly = component('sm-detail', L('SM 功能框图', 'SM block diagram'), L('四个子分区各有调度器、寄存器和运算单元，共用下方的 L1 数据缓存 / 共享内存。', 'Four partitions, each with its own scheduler, registers and execution units, share the L1 data cache / shared memory below.'), 'sm', smRoot, 'sm');
  box(smAssembly, 0, -.08, 0, 10.9, .28, 8.6, mats.siliconSide);
  box(smAssembly, 0, .07, 0, 10.6, .025, 8.3, mats.smBase);
  const registerGroup = component('registers', L('寄存器文件', 'Register file'), L('每个子分区的寄存器文件存放线程的操作数和累加器。', 'Each partition’s register file holds thread operands and accumulators.'), 'sm', smAssembly, 'sm-detail');
  const scheduler = component('warp', L('Warp 调度器', 'Warp scheduler'), L('每个子分区一个，从就绪的 warp 里挑指令发出。它在控制路径上，数据不经过它。', 'One per partition; it picks instructions from ready warps. It sits on the control path, and data doesn’t pass through it.'), 'sm', smAssembly, 'sm-detail');
  const dispatch = component('dispatch', L('指令派发', 'Dispatch unit'), L('把调度器选中的指令送到运算单元。', 'Sends the chosen instruction to the execution units.'), 'sm', smAssembly, 'sm-detail');
  const tensor = component('tensor', L('Tensor Core', 'Tensor Core'), ampere ? L('矩阵乘加单元。线程一起提供矩阵片段，操作数和累加器怎样分布由具体指令决定。', 'Matrix multiply-add unit. Threads supply matrix fragments together; how operands and accumulators are spread depends on the instruction.') : L('矩阵乘加单元。Hopper 的 wgmma 指令可以直接从共享内存取操作数。', 'Matrix multiply-add unit. Hopper’s wgmma instructions can read operands straight from shared memory.'), 'sm', smAssembly, 'sm-detail');
  const lsu = component('lsu', L('载入 / 存储单元', 'Load/store units'), L('执行读写请求，连接寄存器和 L1 / 共享内存。', 'Carry out loads and stores between registers and L1 / shared memory.'), 'sm', smAssembly, 'sm-detail');
  const smem = component('smem', L('L1 数据缓存 / 共享内存', 'L1 data cache / shared memory'), L(`四个子分区共用的 ${ampere ? '192' : '256'} KB，其中最多 ${ampere ? '164' : '228'} KB 可作共享内存，分 32 banks。`, `${ampere ? '192' : '256'} KB shared by the four partitions, up to ${ampere ? '164' : '228'} KB of it usable as shared memory, in 32 banks.`), 'sm', smAssembly, 'sm-detail');
  const instruction = component('instruction-cache', L('L1 指令缓存', 'L1 instruction cache'), L('SM 内共用的指令缓存。', 'The SM’s shared instruction cache.'), 'sm', smAssembly, 'sm-detail');
  const l0Instruction = component('l0-instruction-cache', L('L0 指令缓存', 'L0 instruction cache'), L('每个子分区自己的指令缓存。', 'Each partition’s own instruction cache.'), 'sm', smAssembly, 'sm-detail');
  const smBus = component('sm-bus', L('SM 内部互连', 'SM internal interconnect'), L('连接运算单元、LD/ST 和 L1 / 共享内存的数据通路（按功能画出）。', 'The data path joining execution units, LD/ST and L1 / shared memory (drawn by function).'), 'sm', smAssembly, 'sm-detail');
  const fp32Group = component('fp32', L('FP32 运算通道', 'FP32 lanes'), L('执行逐线程的 FP32 指令。', 'Run per-thread FP32 instructions.'), 'sm', smAssembly, 'sm-detail');
  const fp64Group = component('fp64', L('FP64 运算通道', 'FP64 lanes'), L('执行逐线程的双精度指令。', 'Run per-thread double-precision instructions.'), 'sm', smAssembly, 'sm-detail');
  const int32Group = component('int32', L('INT32 运算通道', 'INT32 lanes'), L('执行逐线程的整数指令。', 'Run per-thread integer instructions.'), 'sm', smAssembly, 'sm-detail');
  const sfuGroup = component('sfu', L('特殊函数单元', 'Special function units'), L('做超越函数近似。', 'Approximate transcendental functions.'), 'sm', smAssembly, 'sm-detail');
  const textureGroup = component('texture', L('纹理单元', 'Texture units'), L('纹理采样与过滤。', 'Texture sampling and filtering.'), 'sm', smAssembly, 'sm-detail');
  const fp32 = [], fp64 = [], int32 = [], sfuCells = [], registers = [], lsuCells = [], laneContacts = [], registerWordlines = [], tensorArrays = [], tensorBus = [];
  const partitionOrigins = [{ x: -2.65, z: -1.72 }, { x: 2.65, z: -1.72 }, { x: -2.65, z: 1.08 }, { x: 2.65, z: 1.08 }];
  const ink = 'rgba(244,246,240,.9)', darkInk = 'rgba(18,22,24,.78)';
  box(instruction, 0, .23, -3.65, 10.15, .12, .40, mats.instruction);
  text(instruction, L('L1 指令缓存', 'L1 instruction cache'), 0, .292, -3.65, 4.2, .26, { color: darkInk, weight: 600 });
  for (let partition = 0; partition < 4; partition++) {
    const { x, z } = partitionOrigins[partition];
    box(smAssembly, x, .13, z, 4.95, .08, 2.62, mats.partition);
    box(l0Instruction, x, .225, z - 1.10, 4.65, .07, .15, mats.instruction).userData.unitCount = 1;
    box(scheduler, x, .255, z - .87, 4.65, .14, .32, mats.scheduler).userData.unitCount = 1;
    text(scheduler, L(`子分区 ${partition} · Warp 调度器`, `Partition ${partition} · Warp scheduler`), x, .327, z - .87, 3.4, .22, { color: darkInk, weight: 600 });
    box(dispatch, x, .25, z - .64, 4.65, .10, .13, mats.dispatch).userData.unitCount = 1;
    for (let row = 0; row < 2; row++) for (let bank = 0; bank < 16; bank++) {
      const bx = x - 2.14 + bank * .285, bz = z - .43 + row * .16;
      registers.push({ x: bx, y: .25, z: bz, w: .22, h: .10, d: .105 });
      registerWordlines.push({ x: bx, y: .303, z: bz, w: .16, h: .006, d: .016 });
    }
    text(registerGroup, L('寄存器文件 · 64 KB', 'Register file · 64 KB'), x, .304, z - .11, 2.4, .17, { color: 'rgba(214,208,232,.85)', weight: 600 });
    for (let row = 0; row < (ampere ? 2 : 4); row++) for (let lane = 0; lane < 8; lane++) {
      const lx = x - 1.52 + lane * .31, lz = z + .10 + row * .19;
      fp32.push({ x: lx, y: .24, z: lz, w: .23, h: .13, d: .14 });
      laneContacts.push({ x: lx - .092, y: .307, z: lz, w: .022, h: .006, d: .1 }, { x: lx + .092, y: .307, z: lz, w: .022, h: .006, d: .1 });
    }
    for (let row = 0; row < 4; row++) for (let lane = 0; lane < 4; lane++) int32.push({ x: x - 2.19 + lane * .10, y: .24, z: z + .10 + row * .19, w: .075, h: .13, d: .14 });
    for (let row = 0; row < (ampere ? 2 : 4); row++) for (let lane = 0; lane < 4; lane++) fp64.push({ x: x + .86 + lane * .10, y: .24, z: z + .10 + row * .19, w: .075, h: .13, d: .14 });
    box(fp32Group, x - .435, .32, z + .835, 2.40, .02, .16, mats.partition);
    text(fp32Group, `FP32 ×${ampere ? 16 : 32}`, x - .435, .332, z + .835, 1.2, .13, { color: 'rgba(170,214,176,.95)', weight: 600 });
    box(int32Group, x - 2.04, .32, z + .835, .43, .02, .16, mats.partition);
    text(int32Group, 'INT32', x - 2.04, .332, z + .835, .4, .12, { color: 'rgba(150,212,206,.95)', weight: 600 });
    box(fp64Group, x + 1.01, .32, z + .835, .44, .02, .16, mats.partition);
    text(fp64Group, 'FP64', x + 1.01, .332, z + .835, .4, .12, { color: 'rgba(156,196,232,.95)', weight: 600 });
    box(tensor, x + 1.80, .27, z + .39, .98, .22, .93, mats.tensor).userData.unitCount = 1;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) tensorArrays.push({ x: x + 1.48 + col * .21, y: .385, z: z + .08 + row * .20, w: .15, h: .012, d: .14 });
    tensorBus.push({ x: x + 1.80, y: .39, z: z + .39, w: .84, h: .008, d: .03 }, { x: x + 1.80, y: .39, z: z + .39, w: .03, h: .008, d: .80 });
    text(tensor, 'Tensor Core', x + 1.80, .396, z + .80, .86, .12, { color: darkInk, weight: 600 });
    for (let lane = 0; lane < 8; lane++) lsuCells.push({ x: x - 2.10 + lane * .47, y: .25, z: z + 1.02, w: .37, h: .12, d: .17 });
    for (let unit = 0; unit < 4; unit++) sfuCells.push({ x: x + 1.77 + unit * .14, y: .25, z: z + 1.02, w: .11, h: .12, d: .17 });
    box(smBus, x * .5, .18, z + 1.18, Math.abs(x), .03, .045, mats.trace, false);
  }
  instances(registerGroup, registers, mats.register);
  instances(registerGroup, registerWordlines, mats.darkMetal);
  const countedInstances = (parent, id, cells, material) => { const mesh = instances(parent, cells, material); mesh.name = 'execution-lanes:' + id; mesh.userData.resourceId = id; mesh.userData.unitCount = cells.length; return mesh; };
  countedInstances(fp32Group, 'fp32', fp32, mats.activeSM); countedInstances(fp64Group, 'fp64', fp64, mats.fp64);
  countedInstances(int32Group, 'int32', int32, mats.int32); countedInstances(sfuGroup, 'sfu', sfuCells, mats.sfu); countedInstances(lsu, 'lsu', lsuCells, mats.lsu);
  instances(fp32Group, laneContacts, mats.trace); instances(tensor, tensorArrays, mats.darkMetal); instances(tensor, tensorBus, mats.copper);
  box(smBus, 0, .18, .50, .065, .03, 3.75, mats.trace, false);
  box(smBus, 0, .18, 2.40, 10.1, .03, .07, mats.trace, false);
  const tma = ampere ? null : component('tma', L('张量内存加速器（TMA）', 'Tensor Memory Accelerator (TMA)'), L('在显存和共享内存之间异步搬运整块张量。', 'Moves whole tensors between global and shared memory asynchronously.'), 'sm', smAssembly, 'sm-detail');
  if (tma) { box(tma, 0, .24, 2.65, 10.05, .10, .28, mats.tma); text(tma, L('张量内存加速器（TMA）', 'Tensor Memory Accelerator (TMA)'), 0, .292, 2.65, 4.4, .2, { color: darkInk, weight: 600 }); }
  box(smem, 0, .25, 3.20, 10.09, .25, .66, mats.smem);
  const sharedBanks = []; for (let bank = 0; bank < 32; bank++) sharedBanks.push({ x: -4.79 + bank * .309, y: .378, z: 3.20, w: .22, h: .008, d: .42 });
  instances(smem, sharedBanks, mats.darkMetal);
  box(smem, 0, .36, 3.63, 9.86, .12, .30, mats.smem);
  text(smem, L(`${ampere ? '192' : '256'} KB · L1 数据缓存 / 共享内存`, `${ampere ? '192' : '256'} KB · L1 data cache / shared memory`), 0, .422, 3.63, 6.2, .22, { color: ink, weight: 600 });
  for (let unit = 0; unit < 4; unit++) { const x = -3.84 + unit * 2.56; box(textureGroup, x, .21, 3.86, 2.32, .10, .24, mats.texture).userData.unitCount = 1; text(textureGroup, L('纹理', 'Texture'), x, .262, 3.86, .9, .15, { color: darkInk, weight: 600 }); }
  text(smAssembly, L(`${specification.name} · 一个 SM 的功能框图`, `${specification.name} · one SM, block diagram`), 0, .085, -4.06, 4.6, .2, { color: 'rgba(200,210,206,.6)' });

  const hbmDetail = createHBMDetail(T, model, labels), powerDetail = createPowerDetail(T, model, labels), interconnectDetail = createInterconnectDetail(T, model, labels);
  const hbmRoot = hbmDetail.root, powerRoot = powerDetail.root, interconnectRoot = interconnectDetail.root;
  root.add(hbmRoot, powerRoot, interconnectRoot);
  Object.assign(components, hbmDetail.components, powerDetail.components, interconnectDetail.components);
  const smResourceLegend = getSMResourceLegend(model);
  for (const entry of smResourceLegend) if (components[entry.id]) Object.assign(components[entry.id], entry);
  const lessonSM = floorplan.lessonSM;
  const anchors = {
    pcb: new T.Vector3(-6.5, .25, 6.1), package: new T.Vector3(-4.7, .3, 4.7), interposer: new T.Vector3(4.8, .35, 3.6),
    hbm: new T.Vector3(-3.75, .9, -2.6), 'hbm-inactive': new T.Vector3(3.75, .9, 2.6), 'gpu-die': new T.Vector3(0, .8, 0), l2: new T.Vector3(-1.04, .6, 0),
    power: new T.Vector3(6.55, .5, -3), sxm: new T.Vector3(0, -.65, 6.85), sm: new T.Vector3(lessonSM.x, .6, lessonSM.z),
    'memory-controller': new T.Vector3(-2.38, .6, -2.6), pcie: new T.Vector3(0, .6, -3.58), nvlink: new T.Vector3(0, .6, 3.58),
    'a-tile': new T.Vector3(-3.75, .9, -2.6), 'b-tile': new T.Vector3(-3.75, .9, 0), 'c-out': new T.Vector3(3.75, .9, 0),
    warp: new T.Vector3(-2.65, .5, -2.59), smem: new T.Vector3(0, .6, 3.20), tensor: new T.Vector3(-.85, .5, -1.33), registers: new T.Vector3(-2.65, .5, -2.03), lsu: new T.Vector3(-2.65, .4, -.70), tma: new T.Vector3(0, .4, 2.65),
    fp32: new T.Vector3(-3.085, .45, -1.33), fp64: new T.Vector3(-1.64, .45, -1.33), int32: new T.Vector3(-4.69, .45, -1.33), sfu: new T.Vector3(-.67, .45, -.70), texture: new T.Vector3(0, .35, 3.86), 'l0-instruction-cache': new T.Vector3(-2.65, .35, -2.82),
    ...hbmDetail.anchors, ...powerDetail.anchors, ...interconnectDetail.anchors
  };
  function setExplode(t) {
    t = Math.max(0, Math.min(1, Number(t) || 0));
    for (const layer of layers) layer.group.position.y = t * layer.factor;
    for (const slice of hbmSlices) slice.mesh.position.y = slice.y + slice.index * t * .12;
    hbmDetail.setExplode(t); powerDetail.setExplode(t); interconnectDetail.setExplode(t);
  }
  function setLevel(level) {
    siliconCover.visible = level === 'board' || level === 'package';
    pcb.visible = level === 'board'; serial.visible = ['board', 'package', 'die'].includes(level); smRoot.visible = level === 'sm';
    hbmRoot.visible = level === 'hbm'; powerRoot.visible = level === 'power'; interconnectRoot.visible = level === 'interconnect';
  }
  return { root, components, layers, smRoot, pcb, serial, hbmRoot, hbmDetail, powerRoot, powerDetail, interconnectRoot, interconnectDetail,
    siliconCover, siliconCoverMaterial: siliconCover.material, anchors, specification, materials: mats, partitionOrigins, smResourceLegend,
    floorplan, hbmSites: HBM_SITES, labels, setLanguage: lang => labels.setLanguage(lang), setExplode, setLevel };
}

export function sampleSignalPath(points, fraction) {
  if (!points.length) return [0, 0, 0];
  const segments = []; let length = 0;
  for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], d = Math.hypot(...b.map((v, k) => v - a[k])); segments.push(d); length += d; }
  if (!length) return points[0].slice();
  let position = Math.max(0, Math.min(1, Number(fraction) || 0)) * length;
  for (let i = 0; i < segments.length; i++) {
    if (position <= segments[i] || i === segments.length - 1) { const t = segments[i] ? position / segments[i] : 0; return points[i].map((v, k) => v + (points[i + 1][k] - v) * t); }
    position -= segments[i];
  }
  return points[points.length - 1].slice();
}
