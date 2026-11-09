// Lesson overlays drawn on the hardware model. Dashed ribbons show a logical
// relation (a dependency, a work assignment); solid ribbons show a simplified
// transfer along the memory hierarchy. None of them is a vendor netlist.
import { dieFloorplan, HBM_SITES } from './hardware-model.js?v=20261109a';

const L = (zh, en) => ({ zh, en });
export const FLOW_COLORS = { a: 0x61ddc3, b: 0xefbe78, c: 0x94b9ff, control: 0xadbce7, addr: 0xc9a7f2, heat: 0xf08a5d, power: 0xe6c36a, path: 0x9fb3ad };
export const FLOW_PHASES = [
  { kind: 'dependency', title: L('找到输出', 'Find the output'), note: L('A、B、C 都在 HBM 里，这一步只看依赖，还没有搬运。', 'A, B and C are in HBM. This step only shows the dependency; nothing moves yet.') },
  { kind: 'dependency', title: L('一行乘一列', 'Row times column'), note: L('虚线是数学上的依赖，输入还在 HBM。', 'Dashed lines are a mathematical dependency; the inputs are still in HBM.') },
  { kind: 'placement', title: L('输出块交给 SM', 'Hand the tile to an SM'), note: L('CTA 3 被派到一个 SM。这是分配工作，不是搬数据。', 'CTA 3 is sent to one SM. This is assigning work, not moving data.') },
  { kind: 'transfer', title: L('HBM → L2 → SM', 'HBM → L2 → SM'), note: L('裸片盖面临时调成半透明，好看到 L2 和 SM。', 'The die’s top surface is made see-through for this step so L2 and the SM are visible.') },
  { kind: 'issue', title: L('共享内存 → 寄存器', 'Shared memory → registers'), note: L('指令派发和数据搬运走两条不同的路。', 'Instruction issue and data movement take different paths.') },
  { kind: 'compute', title: L('操作数 → MMA → 累加器', 'Operands → MMA → accumulator'), note: L('展开成一个标量内积；真实 MMA 的操作数分布由指令决定。', 'Unrolled into one scalar dot product; real MMA operand layout depends on the instruction.') },
  { kind: 'transfer', title: L('下一块进共享内存', 'Next tile into shared memory'), note: L('第二轮数据进来，累加器保留上一轮的结果。', 'Round two arrives; the accumulator keeps round one’s result.') },
  { kind: 'store', title: L('累加器 → L2 → HBM', 'Accumulator → L2 → HBM'), note: L('全部 K 轮做完后写回 C[3,7]。', 'After every K round, write C[3,7] back.') }
];

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
export function samplePath(points, fraction) {
  if (!points.length) return [0, 0, 0];
  const lengths = points.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - points[i][k])));
  let distance = clamp(fraction) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? distance / lengths[i] : 0;
      return points[i].map((v, k) => v + (points[i + 1][k] - v) * t);
    }
    distance -= lengths[i];
  }
  return points.at(-1).slice();
}
export function pathLength(points) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...p.map((v, k) => v - points[i][k])), 0);
}

const WIDTH = { sm: .22, die: .12, board: .24, package: .18, hbm: .16, power: .16, interconnect: .16 };
function builder(level, phase) {
  const result = { ...phase, routes: [], markers: [], xray: false };
  result.add = (id, host, stages, points, color = 'a', kind = phase.kind, start = 0, width) => {
    result.routes.push({ id, host, stages, points, color, kind, start, width: width ?? WIDTH[level] ?? .18,
      dashed: ['dependency', 'placement', 'structure'].includes(kind) });
  };
  result.marker = (id, host, point, label, color, role = 'location', size = [.52, .40]) => {
    result.markers.push({ id, host, point, label, color, role, size });
  };
  return result;
}
function finish(result) { delete result.add; delete result.marker; return result; }

// Shared coordinates on the die (host gpu-die, y = 0.59 above the silicon).
function dieGeometry(model) {
  const fp = dieFloorplan(model), y = .59;
  const sm = [fp.lessonSM.x, y, fp.lessonSM.z], gtpc = [fp.graphicsTPC.x + .235, y, fp.graphicsTPC.z];
  return { fp, y, sm, gtpc, gmmu: [0, y, -.47], l2Left: [-1.04, y, 0], l2Right: [1.04, y, 0], host: [0, y, -3.58], corridor: -1.04 };
}
const SM = { shared: [-4.75, .56, 3.20], lsu: [-4.72, .56, -.70], reg: [-4.72, .56, -2.03], tensor: [-.85, .56, -1.33], fp32: [-3.085, .56, -1.33], int32: [-4.69, .56, -1.33], texture: [-3.84, .56, 3.86], incoming: [4.8, .56, 2.4] };

function gemm(level, stepIndex, model) {
  const r = builder(level, FLOW_PHASES[Math.max(0, Math.min(7, stepIndex))]);
  r.xray = ['board', 'package'].includes(level) && [3, 6, 7].includes(stepIndex);
  const { add, marker } = r;
  const memoryMarkers = (includeOutput = true) => {
    marker('input-a', 'hbm', [-3.75, .6, -2.60], 'A · HBM', 'a', 'source', [1.22, .72]);
    marker('input-b', 'hbm', [-3.75, .6, 0], 'B · HBM', 'b', 'source', [1.22, .72]);
    if (includeOutput) marker('output-c', 'hbm', [3.75, .6, 0], 'C[3,7] · HBM', 'c', 'target', [1.22, .72]);
  };
  if (level === 'hbm') {
    marker('input-a', 'hbm-stack', [-2.7, 3.76, -.70], 'A[3,:]', 'a', 'source', [.80, .55]);
    marker('input-b', 'hbm-stack', [-.65, 3.76, -.70], 'B[:,7]', 'b', 'source', [.80, .55]);
    marker('output-c', 'hbm-stack', [-1.65, 3.76, .90], 'C[3,7]', 'c', 'target', [.90, .55]);
    add('depend-a', 'hbm-stack', ['A row', 'C target'], [[-2.7, 3.81, -.70], [-2.7, 3.81, .90], [-1.65, 3.81, .90]], 'a', 'dependency');
    add('depend-b', 'hbm-stack', ['B column', 'C target'], [[-.65, 3.81, -.70], [-.65, 3.81, .25], [-1.65, 3.81, .25], [-1.65, 3.81, .90]], 'b', 'dependency');
    return finish(r);
  }
  if (level === 'sm') {
    if ([3, 6].includes(stepIndex)) {
      marker('incoming', 'sm-detail', [4.8, .56, 2.65], model === 'a100' ? L('异步拷贝', 'Async copy') : 'TMA', 'a', 'source', [.6, .28]);
      add('global-to-shared', 'sm-detail', model === 'a100' ? ['L2/interconnect', 'async copy', 'Shared Memory'] : ['L2/interconnect', 'TMA', 'Shared Memory'], [[4.8, .56, 2.65], [0, .56, 2.65], [0, .56, 3.2], SM.shared], 'a', 'transfer');
    }
    marker('shared', 'sm-detail', SM.shared, L('L1 / 共享内存', 'L1 / shared'), 'a', 'source', [.70, .40]);
    marker('operands', 'sm-detail', SM.reg, L('寄存器', 'Registers'), 'b', stepIndex === 4 ? 'target' : 'operand', [.60, .36]);
    marker('mma', 'sm-detail', SM.tensor, 'Tensor Core', 'c', stepIndex === 4 ? 'location' : 'target', [.65, .58]);
    if ([4, 6].includes(stepIndex)) {
      add('shared-to-lsu', 'sm-detail', ['Shared Memory', 'LD/ST'], [SM.shared, [-5.10, .56, 3.2], [-5.10, .56, -.7], SM.lsu], 'a', 'transfer', stepIndex === 6 ? .16 : 0);
      add('lsu-to-register', 'sm-detail', ['LD/ST', 'Register File'], [SM.lsu, [-5.10, .56, -.7], [-5.10, .56, -2.03], SM.reg], 'b', 'transfer', .20);
      add('issue-control', 'sm-detail', ['Warp Scheduler', 'Dispatch'], [[-2.65, .46, -2.59], [-2.65, .46, -2.36]], 'control', 'control', .05);
    }
    if ([5, 6].includes(stepIndex)) {
      add('register-to-mma', 'sm-detail', ['Register File', 'Tensor Core'], [SM.reg, [-5.1, .56, -2.03], [-5.1, .56, -1.33], SM.tensor], 'b', 'compute', stepIndex === 6 ? .44 : 0);
      add('mma-to-accumulator', 'sm-detail', ['Tensor Core', 'Accumulator registers'], [SM.tensor, [0, .56, -1.33], [0, .56, -2.03], [-.5, .56, -2.03]], 'c', 'compute', .30);
      marker('accumulator', 'sm-detail', [-.5, .56, -2.03], stepIndex === 5 ? 'acc 0 → 19' : 'acc 19 → 37', 'c', 'target', [.65, .32]);
    }
    if (stepIndex === 7) add('store', 'sm-detail', ['Accumulator registers', 'LD/ST', 'L2/interconnect'], [SM.reg, [-5.1, .56, -2.03], [-5.1, .56, -.7], SM.lsu, [-4.72, .56, 2.4], [5.16, .56, 2.4]], 'c', 'store');
    return finish(r);
  }
  if (!['board', 'package', 'die'].includes(level)) return finish(r);
  const g = dieGeometry(model), { sm, y, corridor } = g;
  if (stepIndex <= 1) {
    memoryMarkers();
    add('depend-a', 'package', ['A row in HBM', 'C target in HBM'], [[-3.75, .66, -2.6], [-3.75, .66, -3.85], [3.75, .66, -3.85], [3.75, .66, 0]], 'a', 'dependency');
    add('depend-b', 'package', ['B column in HBM', 'C target in HBM'], [[-3.75, .66, 0], [-3.75, .66, 3.9], [3.75, .66, 3.9], [3.75, .66, 0]], 'b', 'dependency');
  } else if (stepIndex === 2) {
    marker('work-tile', 'gpu-die', [g.host[0], .61, g.host[2]], L('GigaThread · CTA 3', 'GigaThread · CTA 3'), 'c', 'work', [.9, .3]);
    marker('assigned-sm', 'gpu-die', sm, L('分到的 SM', 'Assigned SM'), 'c', 'target', [.42, .26]);
    add('place-cta', 'gpu-die', ['CTA 3', 'selected SM'], [[0, .61, -3.45], [corridor, .61, -3.45], [corridor, .61, sm[2]], [sm[0], .61, sm[2]]], 'c', 'placement');
  } else if ([3, 6].includes(stepIndex)) {
    memoryMarkers(false);
    marker('cache', 'gpu-die', g.l2Left, 'L2', 'a', 'cache', [.9, .5]);
    marker('assigned-sm', 'gpu-die', sm, L('SM · 共享内存', 'SM · shared'), 'a', 'target', [.42, .26]);
    for (const [i, z] of [[0, -2.6], [1, 0]]) {
      add('hbm-to-edge-' + i, 'package', ['HBM', 'memory controller'], [[-3.75, .64, z], [-2.9, .64, z], [-2.9, y, z], [-2.38, y, z]], i ? 'b' : 'a', 'transfer', i * .06);
      const lane = i ? .04 : -.04, zz = i ? .12 : -.12;
      add('edge-to-cache-' + i, 'gpu-die', ['memory controller', 'L2', 'SM'], [[-2.38, y, z], [-2.38, y, zz], [corridor + lane, y, zz], [corridor + lane, y, sm[2] + lane], [sm[0], y, sm[2] + lane]], i ? 'b' : 'a', 'transfer', .18 + i * .06);
    }
  } else if (stepIndex === 7) {
    marker('assigned-sm', 'gpu-die', sm, 'SM · acc = 37', 'c', 'source', [.42, .26]);
    marker('cache', 'gpu-die', g.l2Right, 'L2', 'c', 'cache', [.9, .5]);
    marker('output-c', 'hbm', [3.75, .6, 0], 'C[3,7] = 37', 'c', 'target', [1.22, .72]);
    add('store-to-cache', 'gpu-die', ['SM', 'L2', 'memory controller'], [sm, [corridor, y, sm[2]], [corridor, y, 0], [2.38, y, 0]], 'c', 'store');
    add('store-to-hbm', 'package', ['memory controller', 'HBM output'], [[2.38, y, 0], [2.9, y, 0], [2.9, .64, 0], [3.75, .64, 0]], 'c', 'store', .24);
  }
  return finish(r);
}

const PAGE_PHASES = [
  { kind: 'issue', title: L('LD/ST 算出虚拟地址', 'LD/ST forms a virtual address'), note: L('整数通道算出地址，交给 LD/ST。', 'Integer lanes compute the address and hand it to LD/ST.') },
  { kind: 'lookup', title: L('L1 TLB 未命中', 'L1 TLB miss'), note: L('TLB 的位置没有公开，按功能画在访存通路上。', 'The TLB location isn’t published; it is drawn on the memory path by function.') },
  { kind: 'lookup', title: L('共享 TLB 未命中，GMMU 接手', 'Shared TLB miss; the GMMU takes over'), note: L('GMMU 的位置没有公开，标在 L2 中间。', 'The GMMU location isn’t published; it is marked between the L2 halves.') },
  { kind: 'walk', title: L('读上层页目录', 'Read the upper directories'), note: L('页表在 HBM 里，每一层都是一次读。', 'The page table is in HBM; each level is one read.') },
  { kind: 'walk', title: L('PD0 指向 2 MiB 页', 'PD0 maps a 2 MiB page'), note: L('大页让遍历在 PD0 结束。', 'The big page ends the walk at PD0.') },
  { kind: 'compose', title: L('拼出物理地址并填回 TLB', 'Form the physical address and fill the TLBs'), note: L('页基址加 21 位偏移。', 'Page base plus the 21-bit offset.') },
  { kind: 'transfer', title: L('物理地址找到 DRAM', 'The physical address reaches DRAM'), note: L('地址到通道的映射没有公开，这里标出一个通道。', 'The address-to-channel mapping isn’t published; one channel is marked.') },
  { kind: 'return', title: L('数据回到寄存器', 'Data back to the registers'), note: L('经 L2、L1 回到发起请求的线程。', 'Back through L2 and L1 to the thread that asked.') }
];
function pagetable(level, stepIndex, model) {
  const r = builder(level, PAGE_PHASES[stepIndex] || PAGE_PHASES[0]);
  const { add, marker } = r, g = dieGeometry(model), { sm, y, corridor } = g;
  const ptSite = HBM_SITES[0];
  if (level === 'sm') {
    if (stepIndex === 0) {
      add('int-to-lsu', 'sm-detail', ['INT32', 'LD/ST'], [SM.int32, [-5.1, .56, -1.33], [-5.1, .56, -.7], SM.lsu], 'addr', 'transfer');
      marker('va', 'sm-detail', SM.lsu, 'VA 0x7f3ac2d64a40', 'addr', 'target', [.7, .3]);
    } else if (stepIndex === 1) {
      add('lsu-to-tlb', 'sm-detail', ['LD/ST', 'L1 TLB'], [SM.lsu, [-5.1, .56, -.7], [-5.1, .56, 2.4], [-3.6, .56, 2.4]], 'addr', 'transfer');
      marker('l1-tlb', 'sm-detail', [-3.6, .56, 2.4], L('L1 TLB · 未命中', 'L1 TLB · miss'), 'addr', 'target', [.8, .3]);
    } else {
      add('l2-to-register', 'sm-detail', ['L2/interconnect', 'L1', 'Register File'], [SM.incoming, [-5.1, .56, 2.4], [-5.1, .56, -2.03], SM.reg], 'a', 'transfer');
      marker('l1', 'sm-detail', [-.5, .56, 2.4], 'L1', 'a', 'cache', [.6, .3]);
      marker('register', 'sm-detail', SM.reg, L('A[3][0] → 寄存器', 'A[3][0] → register'), 'a', 'target', [.6, .36]);
    }
    return finish(r);
  }
  if (level === 'die') {
    if (stepIndex === 2) {
      marker('sm', 'gpu-die', sm, 'SM', 'addr', 'source', [.42, .26]);
      marker('gmmu', 'gpu-die', g.gmmu, L('共享 TLB → GMMU', 'Shared TLB → GMMU'), 'addr', 'target', [.5, .14]);
      add('sm-to-gmmu', 'gpu-die', ['SM', 'shared TLB', 'GMMU'], [sm, [corridor, y, sm[2]], [corridor, y, -.47], [0, y, -.47]], 'addr', 'transfer');
    } else {
      marker('gmmu', 'gpu-die', g.gmmu, 'PA 0x24e164a40', 'addr', 'source', [.5, .14]);
      marker('sm', 'gpu-die', sm, L('TLB 已填入', 'TLB filled'), 'addr', 'target', [.42, .26]);
      add('fill-tlb', 'gpu-die', ['GMMU', 'shared TLB', 'L1 TLB'], [[0, y, -.47], [corridor, y, -.47], [corridor, y, sm[2]], sm], 'addr', 'transfer');
    }
    return finish(r);
  }
  if (level === 'package') {
    r.xray = true;
    const label = stepIndex === 3 ? L('页表 · PD4 → PD2', 'Page table · PD4 → PD2') : L('页表 · PD1 → PD0', 'Page table · PD1 → PD0');
    marker('gmmu', 'gpu-die', g.gmmu, 'GMMU', 'addr', 'source', [.5, .14]);
    marker('page-table', 'hbm', [ptSite.x, .6, ptSite.z], label, 'addr', 'target', [1.22, .72]);
    add('walk-die', 'gpu-die', ['GMMU', 'L2', 'memory controller'], [[0, y, -.47], [-1.04, y, -.47], [-1.04, y, -.2], [-2.38, y, -.2], [-2.38, y, ptSite.z]], 'addr', 'transfer');
    add('walk-hbm', 'package', ['memory controller', 'page table in HBM'], [[-2.38, y, ptSite.z], [-2.9, y, ptSite.z], [-2.9, .64, ptSite.z], [ptSite.x, .64, ptSite.z]], 'addr', 'transfer', .2);
    add('entry-return', 'package', ['page-table entry', 'GMMU'], [[ptSite.x, .64, ptSite.z + .45], [-2.9, .64, ptSite.z + .45], [-2.9, y, ptSite.z + .45]], 'b', 'return', .45);
    return finish(r);
  }
  if (level === 'hbm') {
    marker('pa', 'hbm-stack', [3.88, .42, -.1], 'PA 0x24e164a40', 'addr', 'source', [1.0, .5]);
    marker('bank', 'hbm-stack', [-1.9, 2.8, 2.3], L('DRAM bank（示意）', 'DRAM bank (illustrative)'), 'a', 'target', [.8, .3]);
    add('controller-to-channel', 'hbm-stack', ['memory controller', 'channel'], [[2.76, .36, -.1], [.9, .36, -.1], [.9, .36, 2.3], [-1.2, .36, 2.3]], 'addr', 'transfer');
    add('channel-to-bank', 'hbm-stack', ['channel', 'DRAM layer'], [[-1.2, .36, 2.3], [-1.2, 2.8, 2.3], [-1.9, 2.8, 2.3]], 'a', 'transfer', .3);
    return finish(r);
  }
  return finish(r);
}

const PIXEL_PHASES = [
  { kind: 'placement', title: L('图形 TPC', 'Graphics TPC'), note: L('H100 只有两个 TPC 能跑图形，具体是哪两个没有公开。', 'Only two TPCs on H100 run graphics; which two isn’t published.') },
  { kind: 'transfer', title: L('读顶点', 'Fetch vertices'), note: L('顶点数据走和矩阵一样的访存通路。', 'Vertex data takes the same memory path as matrix data.') },
  { kind: 'compute', title: L('顶点着色', 'Vertex shading'), note: L('FP32 通道做坐标变换。', 'FP32 lanes do the transform.') },
  { kind: 'raster', title: L('光栅化', 'Rasterize'), note: L('光栅硬件按功能标在 GPC 上。', 'Raster hardware is marked on the GPC by function.') },
  { kind: 'compute', title: L('片元着色', 'Fragment shading'), note: L('按权重混合颜色。', 'Blend the colors by weight.') },
  { kind: 'transfer', title: L('纹理采样', 'Texture sample'), note: L('TEX 单元经 L1 取纹素。', 'TEX units fetch the texel through L1.') },
  { kind: 'store', title: L('深度测试并写入', 'Depth test and write'), note: L('ROP 按功能标在 L2 一侧。', 'ROPs are marked on the L2 side by function.') },
  { kind: 'output', title: L('拷出去', 'Copy it out'), note: L('没有显示输出，帧经 SXM 连接器离开。', 'No display output; the frame leaves through the SXM connector.') }
];
function pixel(level, stepIndex, model) {
  const r = builder(level, PIXEL_PHASES[stepIndex] || PIXEL_PHASES[0]);
  const { add, marker } = r, g = dieGeometry(model), { gtpc, y, corridor } = g;
  const vb = HBM_SITES[2], fb = HBM_SITES[3];
  if (level === 'die' && stepIndex === 0) {
    marker('graphics-tpc', 'gpu-die', gtpc, L('图形 TPC（示意）', 'Graphics TPC (illustrative)'), 'c', 'target', [.95, .26]);
    marker('host', 'gpu-die', [0, .61, -3.58], 'GigaThread', 'c', 'source', [.9, .3]);
    add('dispatch', 'gpu-die', ['GigaThread', 'graphics TPC'], [[0, .61, -3.45], [corridor, .61, -3.45], [corridor, .61, gtpc[2]], [gtpc[0] - .235, .61, gtpc[2]]], 'c', 'placement');
  } else if (level === 'die' && stepIndex === 3) {
    const gpc = g.fp.gpcs[0];
    marker('raster', 'gpu-die', [gpc.x, y, gpc.z - .6], L('光栅（按功能标注）', 'Raster (by function)'), 'c', 'source', [.9, .3]);
    marker('fragment', 'gpu-die', gtpc, L('片元 (3, 4)', 'Fragment (3, 4)'), 'c', 'target', [.95, .26]);
    add('raster-to-sm', 'gpu-die', ['raster', 'graphics SM'], [[gpc.x, y, gpc.z - .6], [gpc.x, y, gtpc[2]], [gtpc[0], y, gtpc[2]]], 'c', 'transfer');
  } else if (level === 'package' && stepIndex === 1) {
    r.xray = true;
    marker('vertex-buffer', 'hbm', [vb.x, .6, vb.z], L('顶点缓冲', 'Vertex buffer'), 'b', 'source', [1.22, .72]);
    marker('graphics-sm', 'gpu-die', gtpc, L('图形 SM', 'Graphics SM'), 'b', 'target', [.95, .26]);
    add('vb-to-edge', 'package', ['HBM', 'memory controller'], [[vb.x, .64, vb.z], [-2.9, .64, vb.z], [-2.9, y, vb.z], [-2.38, y, vb.z]], 'b', 'transfer');
    add('edge-to-sm', 'gpu-die', ['memory controller', 'L2', 'graphics SM'], [[-2.38, y, vb.z], [-2.38, y, .12], [corridor, y, .12], [corridor, y, gtpc[2]], [gtpc[0] - .235, y, gtpc[2]]], 'b', 'transfer', .2);
  } else if (level === 'package' && stepIndex === 6) {
    r.xray = true;
    marker('rop', 'gpu-die', g.l2Right, L('ROP（按功能标注）', 'ROP (by function)'), 'c', 'cache', [.9, .5]);
    marker('framebuffer', 'hbm', [fb.x, .6, fb.z], L('帧缓冲 fb[3,4]', 'Framebuffer fb[3,4]'), 'c', 'target', [1.22, .72]);
    add('sm-to-rop', 'gpu-die', ['graphics SM', 'L2 / ROP', 'memory controller'], [[gtpc[0] - .235, y, gtpc[2]], [corridor, y, gtpc[2]], [corridor, y, -.12], [2.38, y, -.12], [2.38, y, fb.z]], 'c', 'store');
    add('rop-to-hbm', 'package', ['memory controller', 'framebuffer'], [[2.38, y, fb.z], [2.9, y, fb.z], [2.9, .64, fb.z], [fb.x, .64, fb.z]], 'c', 'store', .25);
  } else if (level === 'sm') {
    if (stepIndex === 2 || stepIndex === 4) {
      add('reg-to-fp32', 'sm-detail', ['Register File', 'FP32'], [SM.reg, [-5.1, .56, -2.03], [-5.1, .56, -1.33], SM.fp32], 'b', 'compute');
      add('fp32-to-reg', 'sm-detail', ['FP32', 'Register File'], [SM.fp32, [-3.085, .56, -2.03], SM.reg], 'c', 'compute', .4);
      marker('fp32', 'sm-detail', SM.fp32, stepIndex === 2 ? 'p_screen = M · p' : 'c = (0.2, 0.5, 0.3)', 'c', 'target', [.8, .4]);
    } else if (stepIndex === 5) {
      add('lsu-to-tex', 'sm-detail', ['LD/ST', 'TEX'], [SM.lsu, [-5.1, .56, -.7], [-5.1, .56, 3.86], SM.texture], 'b', 'transfer');
      add('tex-to-l1', 'sm-detail', ['TEX', 'L1'], [SM.texture, [-3.84, .56, 3.2], [-2.6, .56, 3.2]], 'a', 'transfer', .35);
      marker('texture', 'sm-detail', SM.texture, L('TEX · uv (0.25, 0.75)', 'TEX · uv (0.25, 0.75)'), 'a', 'target', [.9, .3]);
    }
  } else if (level === 'board' && stepIndex === 7) {
    r.xray = false;
    marker('framebuffer', 'hbm', [fb.x, .6, fb.z], L('帧缓冲', 'Framebuffer'), 'c', 'source', [1.22, .72]);
    marker('host', 'pcb', [0, -.27, -7.2], L('PCIe / NVLink → 主机', 'PCIe / NVLink → host'), 'c', 'target', [1.6, .5]);
    add('fb-to-edge', 'package', ['framebuffer', 'host interface'], [[fb.x, .66, fb.z], [fb.x, .66, -3.95], [0, .66, -3.95], [0, .66, -4.9]], 'c', 'output');
    add('board-to-connector', 'pcb', ['package', 'SXM connector'], [[0, -.27, -5.6], [0, -.27, -7.2]], 'c', 'output', .3);
  }
  return finish(r);
}

const STACK_PHASES = [
  { kind: 'transfer', title: L('五组 HBM 贴着裸片', 'Five stacks beside the die'), note: L('每组只隔一毫米左右。', 'Each is about a millimetre away.') },
  { kind: 'structure', title: L('DRAM 叠在底部芯片上', 'DRAM on a base die'), note: L('八层是示意。', 'Eight layers are illustrative.') },
  { kind: 'vertical', title: L('TSV 与微凸点', 'TSVs and microbumps'), note: L('信号垂直穿过硅片。', 'Signals go straight through the silicon.') },
  { kind: 'transfer', title: L('1024 位接口', '1024-bit interface'), note: L('多个独立通道并行。', 'Independent channels in parallel.') },
  { kind: 'transfer', title: L('中介层走线', 'Interposer wiring'), note: L('拆开后显示的走线是示意。', 'The routing shown when taken apart is illustrative.') },
  { kind: 'vertical', title: L('从硅到 PCB', 'Silicon to PCB'), note: L('每往下一层，连接点更大。', 'Each layer down, the joints get bigger.') },
  { kind: 'heat', title: L('热量向上', 'Heat goes up'), note: L('冷板没有画出。', 'The cold plate isn’t drawn.') },
  { kind: 'yield', title: L('没启用的部分', 'Parts that are off'), note: L('位置是示意。', 'Positions are illustrative.') }
];
function stacking(level, stepIndex, model) {
  const r = builder(level, STACK_PHASES[stepIndex] || STACK_PHASES[0]);
  const { add, marker } = r, a100 = model === 'a100';
  const active = HBM_SITES.filter(site => site.active);
  if (stepIndex === 0 && level === 'board') {
    for (const [i, site] of active.entries()) add('hbm-' + i, 'package', ['HBM', 'GPU die'], [[site.x, .66, site.z], [Math.sign(site.x) * 2.75, .66, site.z]], 'a', 'transfer', i * .05);
    marker('bandwidth', 'gpu-die', [0, .62, 0], a100 ? '2.04 TB/s' : '3.35 TB/s', 'a', 'target', [1.4, .7]);
  } else if (level === 'hbm' && stepIndex === 1) {
    add('stack-height', 'hbm-stack', ['base die', 'top DRAM'], [[-4.0, .3, 2.4], [-4.0, 3.62, 2.4]], 'c', 'structure');
    marker('layers', 'hbm-stack', [-2.7, 3.76, -.70], L('8 层 DRAM（示意）', '8 DRAM layers (illustrative)'), 'c', 'target', [1.6, .55]);
    marker('base', 'hbm-stack', [-2.3, .3, 2.35], L('底部接口芯片', 'Base die'), 'c', 'source', [1.3, .3]);
  } else if (level === 'hbm' && stepIndex === 2) {
    const top = .48 + 7 * .43 + .55 * 8 * .22;
    add('tsv-up', 'hbm-stack', ['base die', 'TSV', 'microbump', 'DRAM'], [[-.34, .3, 2.3], [-.34, top, 2.3]], 'a', 'vertical');
    marker('tsv', 'hbm-stack', [-.34, top + .1, 1.3], 'TSV', 'a', 'target', [.7, .5]);
    marker('bump', 'hbm-stack', [-2.6, 1.0, 1.94], L('微凸点', 'Microbumps'), 'a', 'location', [.8, .3]);
  } else if (level === 'hbm' && stepIndex === 3) {
    add('channels', 'hbm-stack', ['channels', 'GPU PHY'], [[-3.6, .38, 2.3], [.9, .38, 2.3], [.9, .38, -.1], [2.76, .38, -.1]], 'a', 'transfer');
    marker('channels', 'hbm-stack', [-1.7, .38, 2.12], a100 ? '8 × 128 bit' : '16 × 64 bit', 'a', 'source', [2.0, .4]);
    marker('phy', 'hbm-stack', [3.88, .42, -.1], '1024 bit', 'a', 'target', [1.0, .5]);
  } else if (level === 'package' && stepIndex === 4) {
    r.ghost = ['gpu-die', 'hbm', 'hbm-inactive'];
    r.ghostBoxes = [{ host: 'gpu-die', center: [0, .42, 0], size: [5.3, .24, 7.65] },
      ...HBM_SITES.map(site => ({ host: site.active ? 'hbm' : 'hbm-inactive', center: [site.x, .4, site.z], size: [1.6, .3, 1.9] }))];
    for (const [i, site] of active.entries()) {
      const dir = Math.sign(site.x);
      add('rdl-' + i, 'interposer', ['HBM base', 'interposer wiring', 'HBM PHY'], [[site.x - dir * .55, .24, site.z], [dir * 2.3, .24, site.z]], 'a', 'transfer', i * .05, .3);
    }
    marker('rdl', 'interposer', [0, .24, 3.9], L('5 × 1024 条数据线', '5 × 1024 data lines'), 'a', 'target', [2.2, .4]);
  } else if (level === 'package' && stepIndex === 5) {
    const x = -5.9, z = -3.6;
    add('down', 'package', ['die', 'interposer', 'substrate'], [[x, 3.7, z], [x, .62, z]], 'c', 'vertical');
    marker('die-layer', 'package', [x, 3.7, z], L('裸片 / HBM', 'Die / HBM'), 'c', 'source', [.6, .4]);
    marker('interposer-layer', 'package', [x, 2.05, z], L('中介层', 'Interposer'), 'c', 'location', [.6, .4]);
    marker('substrate-layer', 'package', [x, .95, z], L('基板 → PCB', 'Substrate → PCB'), 'c', 'target', [.6, .4]);
  } else if (level === 'package' && stepIndex === 6) {
    add('heat-die', 'package', ['die', 'top surface', 'cold plate'], [[0, .6, 0], [0, 1.9, 0]], 'heat', 'heat', 0, .32);
    for (const [i, site] of active.entries()) add('heat-hbm-' + i, 'package', ['HBM', 'cold plate'], [[site.x, .56, site.z], [site.x, 1.5, site.z]], 'heat', 'heat', .1 + i * .04, .22);
    marker('power', 'package', [0, 1.95, 0], a100 ? '400 W' : '≤ 700 W', 'heat', 'target', [1.2, .5]);
  } else if (level === 'die' && stepIndex === 7) {
    const fp = dieFloorplan(model);
    let off = null;
    for (const gpc of fp.gpcs) for (const tpc of gpc.tpcs) if (!off && !tpc.active) off = [gpc.x, .6, tpc.z];
    marker('disabled-tpc', 'gpu-die', off, L('未启用的 TPC', 'Disabled TPC'), 'heat', 'target', [.96, .3]);
    const mc = fp.memoryControllers.find(m => !m.active);
    marker('inactive-mc', 'gpu-die', [mc.x, .6, mc.z], L('第 6 组 HBM 的控制器', 'Controller for HBM site 6'), 'heat', 'location', [.5, 2.3]);
  }
  return finish(r);
}

export function lessonPresentation(level, stepIndex, model = 'h100', journey = 'gemm') {
  const index = Math.max(0, Number(stepIndex) || 0);
  if (journey === 'pagetable') return pagetable(level, index, model);
  if (journey === 'pixel') return pixel(level, index, model);
  if (journey === 'stacking') return stacking(level, index, model);
  return gemm(level, index, model);
}

// Static data paths for the anatomy view. They show which blocks exchange
// data at each level. Positions are functional, not the metal routing.
export function anatomyPaths(level, model = 'h100') {
  const r = builder(level, { kind: 'path', title: L('数据通路', 'Data paths'), note: L('通路按功能画出，不是真实走线位置。', 'Paths show function, not where the metal wires run.') });
  const { add } = r, fp = dieFloorplan(model), y = .6;
  if (level === 'board') {
    add('package-to-sxm-a', 'pcb', ['GPU package', 'SXM connector'], [[0, -.27, -5.4], [0, -.27, -7.3]], 'c', 'path');
    add('package-to-sxm-b', 'pcb', ['GPU package', 'SXM connector'], [[0, -.27, 5.4], [0, -.27, 7.3]], 'c', 'path');
    for (const side of [-1, 1]) add('vrm-' + side, 'pcb', ['VRM', 'GPU package'], [[side * 6.0, -.27, 0], [side * 5.45, -.27, 0]], 'power', 'path');
  } else if (level === 'package') {
    for (const [i, site] of HBM_SITES.filter(s => s.active).entries()) add('hbm-' + i, 'package', ['HBM', 'HBM PHY'], [[site.x, .64, site.z], [Math.sign(site.x) * 2.7, .64, site.z]], 'a', 'path');
  } else if (level === 'die') {
    for (const [i, m] of fp.memoryControllers.filter(mc => mc.active).entries()) add('mc-' + i, 'gpu-die', ['memory controller', 'L2'], [[m.x, y, m.z], [m.x, y, Math.sign(m.z || 1) * .2], [Math.sign(m.x) * 1.9, y, Math.sign(m.z || 1) * .2]], 'a', 'path');
    for (const [i, gpc] of fp.gpcs.filter(g => g.active).entries()) add('gpc-' + i, 'gpu-die', ['L2', 'GPC'], [[gpc.x, y, Math.sign(gpc.z) * .42], [gpc.x, y, gpc.z]], 'c', 'path');
    add('host', 'gpu-die', ['PCIe / GigaThread', 'GPCs'], [[0, y, -3.45], [0, y, -.42]], 'control', 'path');
    add('nvlink', 'gpu-die', ['L2', 'NVLink'], [[0, y, .42], [0, y, 3.45]], 'b', 'path');
  } else if (level === 'sm') {
    add('shared-lsu', 'sm-detail', ['Shared Memory', 'LD/ST'], [SM.shared, [-5.1, .56, 3.2], [-5.1, .56, -.7], SM.lsu], 'a', 'path');
    add('lsu-reg', 'sm-detail', ['LD/ST', 'Register File'], [SM.lsu, [-5.1, .56, -.7], [-5.1, .56, -2.03], SM.reg], 'b', 'path');
    add('reg-units', 'sm-detail', ['Register File', 'FP32 / Tensor Core'], [SM.reg, [-5.1, .56, -2.03], [-5.1, .56, -1.33], SM.tensor], 'b', 'path');
    add('l2-shared', 'sm-detail', ['L2', 'Shared Memory'], [SM.incoming, [0, .56, 2.4], [0, .56, 3.2]], 'a', 'path');
    add('issue', 'sm-detail', ['L0 I-cache', 'Scheduler', 'Dispatch'], [[-2.65, .46, -2.82], [-2.65, .46, -2.36]], 'control', 'path');
  } else if (level === 'hbm') {
    add('channels', 'hbm-stack', ['channels', 'GPU PHY'], [[-3.6, .38, 2.3], [.9, .38, 2.3], [.9, .38, -.1], [2.76, .38, -.1]], 'a', 'path');
    add('tsv', 'hbm-stack', ['base die', 'DRAM'], [[-.34, .3, 2.3], [-.34, 3.5, 2.3]], 'c', 'path');
  } else if (level === 'power') {
    for (let i = 0; i < 6; i++) { const x = -4.75 + i * 1.9; add('phase-' + i, 'power-board', ['input', 'power stage', 'inductor', 'output rail'], [[x, 1.02, -3.0], [x, 1.02, 2.85]], 'power', 'path'); }
    add('feedback', 'power-board', ['output', 'controller'], [[5.95, .2, 2.85], [5.95, .2, -3.7], [-5.55, .2, -3.7]], 'control', 'path');
  }
  return finish(r);
}

export function routeState(route, progress) {
  const fraction = clamp((clamp(progress) - route.start) / Math.max(.3, 1 - route.start));
  return { fraction, complete: progress >= 1, visible: true, opacity: route.dashed ? .70 : .72 + .24 * fraction };
}

// The arithmetic and the repeating visual use separate clocks; a visual cycle
// never changes a result, completion flag or data location.
export function signalCycleState(route, visualPhase = 0) {
  const numericPhase = Number(visualPhase);
  const phase = Number.isFinite(numericPhase) ? Math.max(0, numericPhase) : 0;
  const elapsed = phase - clamp(route.start);
  const logical = route.dashed || ['dependency', 'placement', 'structure'].includes(route.kind);
  return {
    fraction: elapsed < 0 ? 0 : elapsed - Math.floor(elapsed),
    elapsed, started: elapsed >= 0, mode: 'emphasis', semantic: logical ? 'dependency' : 'transfer',
    emphasisWindow: Math.max(.06, Math.min(.18, .8 / Math.max(.01, pathLength(route.points))))
  };
}
const cycleDistance = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

export function createTeachingVisuals(T, hardware, presentation, options = {}) {
  const visuals = [], markerGroups = [], allGroups = [];
  const geometry = new Set(), materials = new Set();
  const unit = new T.BoxGeometry(1, 1, 1); geometry.add(unit);
  const arrowGeometry = new T.BufferGeometry();
  arrowGeometry.setAttribute('position', new T.Float32BufferAttribute([.13, 0, 0, -.09, 0, .09, -.09, 0, -.09], 3));
  arrowGeometry.computeVertexNormals(); geometry.add(arrowGeometry);
  const tmp = new T.Object3D();
  const still = !!options.static;
  function mesh(parent, x, y, z, w, h, d, material) {
    const m = new T.Mesh(unit, material); m.position.set(x, y, z); m.scale.set(w, h, d); m.userData.teachingSignal = true; parent.add(m); return m;
  }
  function material(color, opacity = 1, extra = {}) {
    const m = new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, side: T.DoubleSide, ...extra }); materials.add(m); return m;
  }
  for (const route of presentation.routes) {
    const host = hardware.components[route.host]?.group; if (!host) continue;
    const group = new T.Group(); group.userData.teachingSignal = true; host.add(group); allGroups.push(group);
    const color = FLOW_COLORS[route.color] || FLOW_COLORS.a;
    const railMaterial = material(color, route.dashed ? .65 : still ? .82 : 1, { depthWrite: !route.dashed && !still, toneMapped: false });
    const underMaterial = material(0x071418, 1, { depthWrite: true, toneMapped: false });
    const emphasisMaterial = material(new T.Color(color).lerp(new T.Color(0xffffff), .50), route.dashed ? .91 : 1, { depthWrite: !route.dashed, toneMapped: false });
    const segments = []; let traversed = 0; const length = pathLength(route.points);
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i], distance = Math.hypot(...b.map((v, k) => v - a[k])); if (distance < .001) continue;
      const count = Math.max(2, Math.ceil(distance / .44));
      for (let n = 0; n < count; n++) {
        const t0 = n / count, t1 = route.dashed ? Math.min(1, (n + .57) / count) : (n + 1) / count;
        const start = a.map((v, k) => v + (b[k] - v) * t0), end = a.map((v, k) => v + (b[k] - v) * t1), centre = start.map((v, k) => (v + end[k]) / 2);
        const delta = start.map((v, k) => Math.abs(v - end[k])), axis = delta.indexOf(Math.max(...delta));
        const dims = [route.width, .034, route.width]; dims[axis] = Math.max(.001, delta[axis]);
        if (axis === 1) { dims[0] = route.width; dims[2] = route.width; }
        const rail = mesh(group, ...centre, ...dims, railMaterial);
        rail.userData.signalSegment = true; segments.push({ mesh: rail, fraction: (traversed + (t0 + t1) * .5 * distance) / length });
        if (!route.dashed && axis !== 1 && !still) mesh(group, centre[0], centre[1] - .042, centre[2], dims[0] + .075, .016, dims[2] + .075, underMaterial);
      }
      traversed += distance;
    }
    const count = Math.max(2, Math.floor(length / .8));
    const arrowColor = new T.Color(color).lerp(new T.Color(0xffffff), .16);
    const arrowEmphasisColor = new T.Color(color).lerp(new T.Color(0xffffff), .78);
    const arrowMaterial = material(0xffffff, 1, { depthWrite: true, toneMapped: false }); const arrows = new T.InstancedMesh(arrowGeometry, arrowMaterial, count);
    arrows.userData.teachingSignal = true; arrows.userData.stationaryChevrons = true;
    for (let n = 0; n < count; n++) {
      const f = (n + .5) / count, p = samplePath(route.points, f), next = samplePath(route.points, Math.min(1, f + .002));
      const vertical = Math.abs(next[1] - p[1]) > Math.hypot(next[0] - p[0], next[2] - p[2]);
      tmp.position.set(p[0] + (vertical ? route.width * .62 : 0), p[1] + .035, p[2]);
      if (vertical) tmp.rotation.set(0, 0, next[1] > p[1] ? Math.PI / 2 : -Math.PI / 2);
      else tmp.rotation.set(0, -Math.atan2(next[2] - p[2], next[0] - p[0]), 0);
      tmp.scale.setScalar(Math.min(2, route.width / .105 * (route.dashed ? .90 : 1.08))); tmp.updateMatrix(); arrows.setMatrixAt(n, tmp.matrix); arrows.setColorAt(n, arrowColor);
    }
    group.add(arrows);
    visuals.push({ route, group, railMaterial, arrows, segments, dashMeshes: route.dashed ? segments : [], emphasisMaterial, arrowColor, arrowEmphasisColor });
  }
  for (const marker of presentation.markers) {
    const host = hardware.components[marker.host]?.group; if (!host || !marker.point) continue;
    const group = new T.Group(); group.userData.teachingSignal = true; host.add(group); allGroups.push(group);
    const color = FLOW_COLORS[marker.color] || FLOW_COLORS.a;
    const fill = material(color, .18), border = material(color, .95);
    const [x, y, z] = marker.point, [w, d] = marker.size;
    mesh(group, x, y, z, w, .025, d, fill);
    for (const side of [-1, 1]) {
      mesh(group, x + side * w / 2, y + .015, z, .035, .04, d + .035, border);
      mesh(group, x, y + .015, z + side * d / 2, w + .035, .04, .035, border);
    }
    markerGroups.push({ marker, host, group, fill, border });
  }
  return {
    visuals, markers: markerGroups,
    update(progress, visualPhase = progress) {
      for (const item of visuals) {
        if (still) continue;
        const state = routeState(item.route, progress), cycle = signalCycleState(item.route, visualPhase);
        item.cycleState = cycle; item.railMaterial.opacity = item.route.dashed ? state.opacity : 1;
        const nearest = Math.min(...item.segments.map(segment => cycleDistance(segment.fraction, cycle.fraction)));
        for (const segment of item.segments) {
          const distance = cycleDistance(segment.fraction, cycle.fraction);
          segment.mesh.material = cycle.started && (distance < cycle.emphasisWindow || distance <= nearest + 1e-8) ? item.emphasisMaterial : item.railMaterial;
        }
        for (let n = 0; n < item.arrows.count; n++) {
          const highlighted = cycle.started && (cycleDistance((n + .5) / item.arrows.count, cycle.fraction) < cycle.emphasisWindow || n === Math.floor(cycle.fraction * item.arrows.count));
          item.arrows.setColorAt(n, highlighted ? item.arrowEmphasisColor : item.arrowColor);
        }
        if (item.arrows.instanceColor) item.arrows.instanceColor.needsUpdate = true;
      }
      for (const item of markerGroups) item.fill.opacity = progress >= 1 && item.marker.role === 'target' ? .45 : .22;
    },
    dispose() { allGroups.forEach(g => g.removeFromParent()); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); }
  };
}
