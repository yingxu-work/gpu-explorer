// Lesson overlays drawn on the hardware model. Each route is a round tube
// with a dot where it starts and an arrowhead where it ends. A solid tube is a
// simplified transfer along the memory hierarchy; a dashed one is a logical
// relation (a dependency, a work assignment, a dimension). None of them is a
// vendor netlist. Every colour and dash style used on a step has an entry in
// that step's `legend`, which the side panel prints next to the model.
import { dieFloorplan, HBM_SITES } from './hardware-model.js?v=20261110a';

const L = (zh, en) => ({ zh, en });
// teal: data read from memory · orange: the second input · blue: a result
// being written · purple: an address or request · grey: instructions and work
// assignment · red-orange: heat.
export const FLOW_COLORS = { a: 0x61ddc3, b: 0xefbe78, c: 0x94b9ff, control: 0xd0d4da, addr: 0xc9a7f2, heat: 0xf08a5d, power: 0xe6c36a, path: 0x9fb3ad };
export const FLOW_PHASES = [
  { kind: 'dependency', title: L('C[3,7] 用到哪些数', 'What C[3,7] depends on'), note: L('A、B、C 都在 HBM 里。虚线只表示依赖，这一步还没有搬运。', 'A, B and C are all in HBM. The dashed lines only show the dependency; nothing moves yet.') },
  { kind: 'dependency', title: L('A 的第 3 行在这一组 HBM 里', 'Row 3 of A sits in this stack'), note: L('这一组 HBM 放着 A；B 的那一列在旁边另一组，结构相同。输入还在 HBM，虚线是第 4 步才走的路。', 'This stack holds A; the column of B is in the stack next to it, built the same way. The inputs are still in HBM, and the dashed line is the way out used in step 4.') },
  { kind: 'placement', title: L('输出块交给 SM', 'Hand the tile to an SM'), note: L('CTA 3 被派到一个 SM。这是分配工作，不是搬数据。', 'CTA 3 is sent to one SM. This is assigning work, not moving data.') },
  { kind: 'transfer', title: L('HBM → L2 → SM', 'HBM → L2 → SM'), note: L('裸片盖面临时调成半透明，好看到 L2 和 SM。', 'The die’s top surface is made see-through for this step so L2 and the SM are visible.') },
  { kind: 'issue', title: L('共享内存 → 寄存器', 'Shared memory → registers'), note: L('指令和数据走两条不同的路。线画在功能框图上，不是真实走线。', 'Instructions and data take different paths. The lines are drawn on a block diagram, not on real wiring.') },
  { kind: 'compute', title: L('寄存器 → Tensor Core → 累加器', 'Registers → Tensor Core → accumulator'), note: L('这里展开成一个标量内积；真实的矩阵指令一次处理一整个片段。', 'Unrolled into one scalar dot product; the real matrix instruction handles a whole fragment at once.') },
  { kind: 'transfer', title: L('下一块进共享内存', 'Next tile into shared memory'), note: L('第二轮数据进来，累加器保留上一轮的 19。', 'Round two arrives; the accumulator keeps the 19 from round one.') },
  { kind: 'store', title: L('累加器 → L2 → HBM', 'Accumulator → L2 → HBM'), note: L('两轮都做完后才写回 C[3,7]。', 'C[3,7] is written back only after both rounds.') }
];

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const frac = value => value - Math.floor(value);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
export function samplePath(points, fraction) {
  if (!points.length) return [0, 0, 0];
  const lengths = points.slice(1).map((p, i) => distance(p, points[i]));
  let travelled = clamp(fraction) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (travelled <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? travelled / lengths[i] : 0;
      return mix(points[i], points[i + 1], t);
    }
    travelled -= lengths[i];
  }
  return points.at(-1).slice();
}
export function pathLength(points) {
  return points.slice(1).reduce((sum, p, i) => sum + distance(p, points[i]), 0);
}

// A dependency drawn through the air: a parabola lifted `height` above the
// straight line between two points.
function arcPoints(from, to, height, samples = 28) {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples, p = mix(from, to, t);
    p[1] += 4 * height * t * (1 - t);
    return p;
  });
}

const WIDTH = { sm: .20, die: .14, board: .24, package: .18, hbm: .16, power: .16, interconnect: .16 };
const TUBE = .32;          // tube radius as a share of route width
const BAND_SPEED = 2;      // whole band periods travelled per unit of visual phase
const LOGICAL = ['dependency', 'placement', 'structure'];
function builder(level, phase) {
  const result = { ...phase, routes: [], markers: [], legend: [], xray: false };
  // options: kind, start, width, dashed, arc (lift height, for two-point
  // routes), after (id of the route this one continues), head, tail.
  result.add = (id, host, stages, points, color = 'a', options = {}) => {
    const kind = options.kind || phase.kind, width = options.width ?? WIDTH[level] ?? .18;
    const previous = options.after ? result.routes.find(route => route.id === options.after) : null;
    const route = { id, host, stages, color, kind, start: options.start || 0, width,
      points: options.arc ? arcPoints(points[0], points.at(-1), options.arc) : points,
      smooth: !!options.arc,
      dashed: options.dashed ?? LOGICAL.includes(kind),
      head: options.head ?? kind !== 'structure', tail: options.tail ?? kind !== 'structure',
      period: Math.max(1.1, Math.min(3, width * TUBE * 36)), lead: 0 };
    if (previous) {
      previous.head = false; route.tail = false; route.after = previous.id;
      route.period = previous.period; route.lead = previous.lead + pathLength(previous.points);
    }
    result.routes.push(route);
  };
  // anchor: which side of the patch the label sits on (above, below, left,
  // right). The default is below a destination and above anything else.
  result.marker = (id, host, point, label, color, role = 'location', size = [.52, .40], anchor) => {
    result.markers.push({ id, host, point, label, color, role, size, anchor });
  };
  result.key = (color, label, dashed = false) => { result.legend.push({ color, dashed, label }); };
  return result;
}
function finish(result) { delete result.add; delete result.marker; delete result.key; return result; }

// Shared coordinates on the die (host gpu-die, y = 0.59 above the silicon).
function dieGeometry(model) {
  const fp = dieFloorplan(model), y = .59;
  const sm = [fp.lessonSM.x, y, fp.lessonSM.z], tpc = [fp.graphicsTPC.x, y, fp.graphicsTPC.z];
  // edge: where a route crosses from the die to the HBM beside it.
  return { fp, y, sm, tpc, gmmu: [0, y, -.47], l2Left: [-1.04, y, 0], l2Right: [1.04, y, 0], host: [0, y, -3.58], corridor: -1.04, edge: 2.65 };
}
// Points on the SM block diagram (host sm-detail), all in the first partition
// or on the blocks the four partitions share.
const SM = {
  y: .56,
  shared: [0, .56, 3.20], sharedIn: [1.8, .56, 3.20], lsu: [-2.6, .56, -.70], reg: [-4.36, .56, -2.07],
  tensor: [-.85, .56, -1.33], acc: [-.55, .56, -2.15], row: [-2.65, .56, -2.07], fp32: [-3.085, .56, -1.33], int32: [-4.69, .56, -1.33],
  scheduler: [-4.92, .56, -2.59], texture: [-1.28, .56, 3.86], incoming: [4.9, .56, 2.4]
};
const sm = (x, z) => [x, SM.y, z];
// Two lanes side by side, A then B, that never cross each other.
const SM_PATHS = {
  incomingA: [sm(4.9, 2.42), sm(1.5, 2.42), sm(1.5, 3.2)],
  incomingB: [sm(4.9, 2.86), sm(2.1, 2.86), sm(2.1, 3.2)],
  loadA: [sm(-.22, 3.2), sm(-.22, -.52), sm(-4.46, -.52), sm(-4.46, -2.07)],
  loadB: [sm(.22, 3.2), sm(.22, -.96), sm(-4.04, -.96), sm(-4.04, -2.07)],
  issue: [sm(-4.92, -2.59), sm(-4.92, -.82)],
  operandA: [sm(-1.15, -2.15), sm(-1.15, -1.2)],
  operandB: [sm(-.85, -2.15), sm(-.85, -1.2)],
  result: [sm(-.55, -1.2), sm(-.55, -2.15)]
};

function gemm(level, stepIndex, model) {
  const step = Math.max(0, Math.min(7, stepIndex));
  const r = builder(level, FLOW_PHASES[step]);
  r.xray = ['board', 'package'].includes(level) && [3, 6, 7].includes(step);
  const { add, marker, key } = r, a100 = model === 'a100';
  const memoryMarkers = (includeOutput = true) => {
    marker('input-a', 'hbm', [-3.75, .6, -2.60], 'A · HBM', 'a', 'source', [1.22, .72], 'left');
    marker('input-b', 'hbm', [-3.75, .6, 0], 'B · HBM', 'b', 'source', [1.22, .72], 'left');
    if (includeOutput) marker('output-c', 'hbm', [3.75, .6, 0], 'C[3,7] · HBM', 'c', 'target', [1.22, .72]);
  };
  if (level === 'hbm') {
    marker('input-a', 'hbm-stack', [-2.7, 3.76, -.70], L('A[3,:] · 8 个数', 'A[3,:] · 8 values'), 'a', 'source', [.80, .55]);
    marker('phy', 'hbm-stack', [3.88, .42, -.1], L('通往 GPU 的接口', 'Interface to the GPU'), 'a', 'location', [1.0, .5], 'below');
    add('depend-a', 'hbm-stack', ['A row', 'interface to the GPU'], [[-2.7, 3.86, -.70], [3.6, .62, -.1]], 'a', { kind: 'dependency', arc: 1.1 });
    key('a', L('A[3,:] 之后要走的路（现在还没动）', 'The way A[3,:] will leave (nothing has moved yet)'), true);
    return finish(r);
  }
  if (level === 'sm') {
    const second = step === 6;
    if ([3, 6].includes(step)) {
      marker('incoming', 'sm-detail', [4.8, .56, 2.67], a100 ? L('异步拷贝', 'Async copy') : 'TMA', 'a', 'source', [.6, .28]);
      const stages = ['L2/interconnect', a100 ? 'async copy' : 'TMA', 'Shared Memory'];
      add('global-to-shared', 'sm-detail', stages, SM_PATHS.incomingA, 'a', { kind: 'transfer' });
      add('global-to-shared-b', 'sm-detail', stages, SM_PATHS.incomingB, 'b', { kind: 'transfer', start: .04 });
      key('a', second ? L('A 的第二块：L2 → 共享内存', 'Second tile of A: L2 → shared memory') : L('A 的一块：L2 → 共享内存', 'Tile of A: L2 → shared memory'));
      key('b', second ? L('B 的第二块，同一条路', 'Second tile of B, same route') : L('B 的一块，同一条路', 'Tile of B, same route'));
    }
    if ([3, 4, 6].includes(step)) marker('shared', 'sm-detail', [.9, .56, 3.20], L('共享内存', 'Shared memory'), 'a', 'source', [2.6, .40]);
    if ([4, 5, 6].includes(step)) marker('operands', 'sm-detail', SM.row, L('寄存器', 'Registers'), 'b', step === 4 ? 'target' : 'operand', [4.4, .36], 'above');
    if ([5, 6].includes(step)) marker('mma', 'sm-detail', SM.tensor, 'Tensor Core', 'c', 'location', [.9, .86], 'below');
    if ([4, 6].includes(step)) {
      marker('lsu', 'sm-detail', SM.lsu, 'LD/ST', 'a', 'location', [3.7, .30], 'below');
      add('shared-to-register', 'sm-detail', ['Shared Memory', 'LD/ST', 'Register File'], SM_PATHS.loadA, 'a', { kind: 'transfer', start: second ? .16 : 0 });
      add('shared-to-register-b', 'sm-detail', ['Shared Memory', 'LD/ST', 'Register File'], SM_PATHS.loadB, 'b', { kind: 'transfer', start: second ? .20 : .04 });
      add('issue-control', 'sm-detail', ['Warp Scheduler', 'LD/ST'], SM_PATHS.issue, 'control', { kind: 'control', start: .05 });
      if (!second) {
        marker('scheduler', 'sm-detail', SM.scheduler, L('Warp 调度器', 'Warp scheduler'), 'control', 'source', [.36, .22], 'left');
        key('control', L('指令：调度器 → LD/ST', 'Instruction: scheduler → LD/ST'));
        key('a', L('A 的 4 个数：共享内存 → LD/ST → 寄存器', 'Four values of A: shared memory → LD/ST → registers'));
        key('b', L('B 的 4 个数，同一条路', 'Four values of B, same route'));
      }
    }
    if ([5, 6].includes(step)) {
      add('register-to-mma', 'sm-detail', ['Register File', 'Tensor Core'], SM_PATHS.operandA, 'a', { kind: 'compute', start: second ? .44 : 0, width: .13 });
      add('register-to-mma-b', 'sm-detail', ['Register File', 'Tensor Core'], SM_PATHS.operandB, 'b', { kind: 'compute', start: second ? .48 : .04, width: .13 });
      add('mma-to-accumulator', 'sm-detail', ['Tensor Core', 'Accumulator registers'], SM_PATHS.result, 'c', { kind: 'compute', start: .30, width: .13 });
      if (!second) r.focus = .34;
      marker('accumulator', 'sm-detail', SM.acc, second ? L('累加器 19 → 37', 'Accumulator 19 → 37') : L('累加器 0 → 19', 'Accumulator 0 → 19'), 'c', 'target', [.3, .3], 'right');
      if (!second) {
        key('a', L('A 的 4 个数：寄存器 → Tensor Core', 'Four values of A: registers → Tensor Core'));
        key('b', L('B 的 4 个数：寄存器 → Tensor Core', 'Four values of B: registers → Tensor Core'));
        key('c', L('乘加的结果：Tensor Core → 累加器', 'The sum of products: Tensor Core → accumulator'));
      }
    }
    if (second) {
      key('control', L('指令：调度器 → LD/ST', 'Instruction: scheduler → LD/ST'));
      key('c', L('乘加的结果进累加器，19 变成 37', 'The sum goes into the accumulator: 19 becomes 37'));
    }
    if (step === 7) {
      marker('accumulator', 'sm-detail', SM.reg, L('累加器 = 37', 'Accumulator = 37'), 'c', 'source', [.6, .36]);
      add('store', 'sm-detail', ['Accumulator registers', 'LD/ST', 'L2/interconnect'], [SM.reg, sm(-4.36, -.70), sm(0, -.70), sm(0, 2.4), SM.incoming], 'c', { kind: 'store' });
      key('c', L('37：寄存器 → LD/ST → 离开 SM', '37: registers → LD/ST → out of the SM'));
    }
    return finish(r);
  }
  if (!['board', 'package', 'die'].includes(level)) return finish(r);
  const g = dieGeometry(model), { y, corridor, edge } = g, target = g.sm;
  if (step <= 1) {
    memoryMarkers();
    add('depend-a', 'package', ['A row in HBM', 'C target in HBM'], [[-3.75, .7, -2.6], [3.75, .7, -.3]], 'a', { kind: 'dependency', arc: 2.5 });
    add('depend-b', 'package', ['B column in HBM', 'C target in HBM'], [[-3.75, .7, 0], [3.75, .7, .3]], 'b', { kind: 'dependency', arc: 1.6 });
    key('a', L('C[3,7] 要用 A 的第 3 行', 'C[3,7] needs row 3 of A'), true);
    key('b', L('C[3,7] 要用 B 的第 7 列', 'C[3,7] needs column 7 of B'), true);
  } else if (step === 2) {
    marker('work-tile', 'gpu-die', [g.host[0], .61, g.host[2]], 'GigaThread · CTA 3', 'control', 'work', [.9, .3]);
    marker('assigned-sm', 'gpu-die', target, L('分到的 SM', 'Assigned SM'), 'control', 'target', [.42, .26]);
    add('place-cta', 'gpu-die', ['CTA 3', 'selected SM'], [[0, .61, -3.45], [corridor, .61, -3.45], [corridor, .61, target[2]], [target[0], .61, target[2]]], 'control', { kind: 'placement' });
    key('control', L('CTA 3 派给这个 SM（分配工作）', 'CTA 3 assigned to this SM (work, not data)'), true);
  } else if ([3, 6].includes(step)) {
    memoryMarkers(false);
    marker('cache', 'gpu-die', g.l2Left, 'L2', 'a', 'cache', [.9, .5]);
    marker('assigned-sm', 'gpu-die', target, L('SM · 共享内存', 'SM · shared memory'), 'a', 'target', [.42, .26]);
    add('hbm-to-edge-0', 'hbm', ['HBM', 'memory controller'], [[-3.75, .64, -2.6], [-edge, y, -2.6]], 'a', { kind: 'transfer' });
    add('edge-to-cache-0', 'gpu-die', ['memory controller', 'L2', 'SM'], [[-edge, y, -2.6], [-2.38, y, -2.6], [-2.38, y, -.4], [corridor - .2, y, -.4], [corridor - .2, y, target[2] - .2], [target[0] - .06, y, target[2] - .2]], 'a', { kind: 'transfer', after: 'hbm-to-edge-0' });
    add('hbm-to-edge-1', 'hbm', ['HBM', 'memory controller'], [[-3.75, .64, 0], [-edge, y, 0]], 'b', { kind: 'transfer', start: .06 });
    add('edge-to-cache-1', 'gpu-die', ['memory controller', 'L2', 'SM'], [[-edge, y, 0], [corridor + .2, y, 0], [corridor + .2, y, target[2] + .2], [target[0] + .20, y, target[2] + .2]], 'b', { kind: 'transfer', start: .06, after: 'hbm-to-edge-1' });
    key('a', step === 6 ? L('A 的第二块：HBM → L2 → 共享内存', 'Second tile of A: HBM → L2 → shared memory') : L('A 的一块：HBM → L2 → 共享内存', 'Tile of A: HBM → L2 → shared memory'));
    key('b', step === 6 ? L('B 的第二块，同样的路', 'Second tile of B, same way') : L('B 的一块，同样的路', 'Tile of B, same way'));
  } else if (step === 7) {
    marker('assigned-sm', 'gpu-die', target, L('SM · 累加器 = 37', 'SM · accumulator = 37'), 'c', 'source', [.42, .26]);
    marker('cache', 'gpu-die', g.l2Right, 'L2', 'c', 'cache', [.9, .5]);
    marker('output-c', 'hbm', [3.75, .6, 0], 'C[3,7] = 37', 'c', 'target', [1.22, .72]);
    add('store-to-cache', 'gpu-die', ['SM', 'L2', 'memory controller'], [target, [corridor, y, target[2]], [corridor, y, 0], [edge, y, 0]], 'c', { kind: 'store' });
    add('store-to-hbm', 'hbm', ['memory controller', 'HBM output'], [[edge, y, 0], [3.75, .64, 0]], 'c', { kind: 'store', after: 'store-to-cache' });
    key('c', L('37：SM → L2 → HBM 里 C[3,7] 的位置', '37: SM → L2 → the slot for C[3,7] in HBM'));
  } else {
    marker('assigned-sm', 'gpu-die', target, L('这一步在这个 SM 里', 'This step happens in this SM'), 'c', 'target', [.42, .26]);
  }
  return finish(r);
}

const PAGE_PHASES = [
  { kind: 'issue', title: L('LD/ST 拿到虚拟地址', 'LD/ST gets a virtual address'), note: L('整数单元（INT32）算出地址，交给 LD/ST。', 'The integer units (INT32) compute the address and hand it to LD/ST.') },
  { kind: 'lookup', title: L('L1 TLB 未命中', 'L1 TLB miss'), note: L('TLB 的位置没有公开，这里按功能画在访存通路上。', 'The TLB location isn’t published; it is drawn on the memory path by function.') },
  { kind: 'lookup', title: L('共享 TLB 未命中，GMMU 接手', 'Shared TLB miss; the GMMU takes over'), note: L('GMMU 的位置没有公开，这里标在 L2 两半之间。', 'The GMMU location isn’t published; it is marked between the L2 halves.') },
  { kind: 'walk', title: L('读上三层页目录', 'Read the top three directories'), note: L('页表在 HBM 里。这一步来回三趟，每趟读一层。', 'The page table is in HBM. This step makes three round trips, one per level.') },
  { kind: 'walk', title: L('再读两层，查到 2 MiB 页', 'Two more reads find the 2 MiB page'), note: L('路和上一步相同，再来回两趟。大页让遍历在 PD0 结束。', 'Same route as the last step, two more round trips. The big page ends the walk at PD0.') },
  { kind: 'compose', title: L('拼出物理地址，填回 TLB', 'Form the physical address and fill the TLBs'), note: L('页基址加 21 位偏移，结果送回 SM 一侧的 TLB。', 'Page base plus the 21-bit offset; the result goes back to the TLBs on the SM side.') },
  { kind: 'transfer', title: L('物理地址找到 DRAM', 'The physical address reaches DRAM'), note: L('地址怎样对应到通道没有公开，这里只标出一个通道。', 'How addresses map to channels isn’t published; one channel is marked.') },
  { kind: 'return', title: L('数据回到寄存器', 'Data back to the registers'), note: L('经 L2、L1 回到发起请求的线程。', 'Back through L2 and L1 to the thread that asked.') }
];
function pagetable(level, stepIndex, model) {
  const r = builder(level, PAGE_PHASES[stepIndex] || PAGE_PHASES[0]);
  const { add, marker, key } = r, g = dieGeometry(model), { y, corridor, edge } = g, target = g.sm;
  const table = HBM_SITES[0];
  if (level === 'sm') {
    r.focus = .36;   // the SM-level routes here are short, so frame them closely
    if (stepIndex === 0) {
      marker('int32', 'sm-detail', SM.int32, 'INT32', 'addr', 'source', [.36, .62]);
      marker('va', 'sm-detail', sm(-3.1, -.70), 'LD/ST · VA 0x7f3ac2d64a40', 'addr', 'target', [.9, .3], 'below');
      add('int-to-lsu', 'sm-detail', ['INT32', 'LD/ST'], [sm(-4.69, -1.40), sm(-4.69, -1.06), sm(-3.1, -1.06), sm(-3.1, -.74)], 'addr', { kind: 'transfer' });
      key('addr', L('虚拟地址：INT32 → LD/ST', 'Virtual address: INT32 → LD/ST'));
    } else if (stepIndex === 1) {
      marker('lsu', 'sm-detail', SM.lsu, 'LD/ST', 'addr', 'source', [3.7, .30]);
      marker('l1-tlb', 'sm-detail', sm(0, 2.4), L('L1 TLB · 未命中', 'L1 TLB · miss'), 'addr', 'target', [.8, .3]);
      add('lsu-to-tlb', 'sm-detail', ['LD/ST', 'L1 TLB'], [SM.lsu, sm(0, -.70), sm(0, 2.22)], 'addr', { kind: 'transfer' });
      key('addr', L('拿页号去查：LD/ST → L1 TLB', 'Look up the page number: LD/ST → L1 TLB'));
    } else {
      marker('l1', 'sm-detail', [.45, .56, 3.2], 'L1', 'a', 'cache', [1.5, .4]);
      marker('register', 'sm-detail', SM.reg, L('A[3,0] = 2 进寄存器', 'A[3,0] = 2 in a register'), 'a', 'target', [.6, .36]);
      add('l2-to-l1', 'sm-detail', ['L2/interconnect', 'L1'], [SM.incoming, sm(.9, 2.4), sm(.9, 3.2)], 'a', { kind: 'transfer' });
      add('l1-to-register', 'sm-detail', ['L1', 'LD/ST', 'Register File'], [sm(0, 3.2), sm(0, -.70), sm(-4.36, -.70), SM.reg], 'a', { kind: 'transfer', start: .2 });
      key('a', L('读回的数：L2 → L1 → LD/ST → 寄存器', 'The value read: L2 → L1 → LD/ST → register'));
    }
    return finish(r);
  }
  if (level === 'die') {
    if (stepIndex === 2) {
      marker('sm', 'gpu-die', target, 'SM', 'addr', 'source', [.42, .26]);
      marker('gmmu', 'gpu-die', g.gmmu, L('共享 TLB 未命中 → GMMU', 'Shared TLB miss → GMMU'), 'addr', 'target', [.5, .14]);
      add('sm-to-gmmu', 'gpu-die', ['SM', 'shared TLB', 'GMMU'], [target, [corridor, y, target[2]], [corridor, y, -.47], [-.12, y, -.47]], 'addr', { kind: 'transfer' });
      key('addr', L('翻译请求：SM → 共享 TLB → GMMU', 'Translation request: SM → shared TLB → GMMU'));
    } else {
      marker('gmmu', 'gpu-die', g.gmmu, 'GMMU · PA 0x24e164a40', 'addr', 'source', [.5, .14]);
      marker('sm', 'gpu-die', target, L('两级 TLB 已填入', 'Both TLBs filled'), 'addr', 'target', [.42, .26]);
      add('fill-tlb', 'gpu-die', ['GMMU', 'shared TLB', 'L1 TLB'], [[-.12, y, -.47], [corridor, y, -.47], [corridor, y, target[2]], target], 'addr', { kind: 'transfer' });
      key('addr', L('翻译结果：GMMU → 共享 TLB → L1 TLB', 'The translation: GMMU → shared TLB → L1 TLB'));
    }
    return finish(r);
  }
  if (level === 'package') {
    r.xray = true;
    const upper = stepIndex === 3;
    marker('gmmu', 'gpu-die', g.gmmu, 'GMMU', 'addr', 'source', [.5, .14]);
    marker('page-table', 'hbm', [table.x, .6, table.z], upper ? L('页表 · PD4、PD3、PD2', 'Page table · PD4, PD3, PD2') : L('页表 · PD1、PD0', 'Page table · PD1, PD0'), 'addr', 'target', [1.22, .72]);
    // Out and back are two separate lanes with a clear gap between them, the
    // request on the inside and the returning entry on the outside, so they
    // never read as one band.
    const zOut = table.z + .36, zBack = table.z - .30;
    add('walk-die', 'gpu-die', ['GMMU', 'L2', 'memory controller'], [[0, y, -.47], [-2.5, y, -.47], [-2.5, y, zOut], [-edge, y, zOut]], 'addr', { kind: 'transfer' });
    add('walk-hbm', 'hbm', ['memory controller', 'page table in HBM'], [[-edge, y, zOut], [table.x + .2, .64, zOut]], 'addr', { kind: 'transfer', after: 'walk-die' });
    add('entry-return-hbm', 'hbm', ['page-table entry', 'memory controller'], [[table.x + .2, .64, zBack], [-edge, y, zBack]], 'a', { kind: 'return', start: .45 });
    add('entry-return', 'gpu-die', ['memory controller', 'L2', 'GMMU'], [[-edge, y, zBack], [-1.9, y, zBack], [-1.9, y, -.98], [-.12, y, -.98], [-.12, y, -.58]], 'a', { kind: 'return', start: .45, after: 'entry-return-hbm' });
    key('addr', upper ? L('去读一层目录：GMMU → L2 → HBM', 'Read request for one level: GMMU → L2 → HBM') : L('再去读一层：GMMU → L2 → HBM', 'Another read request: GMMU → L2 → HBM'));
    key('a', L('读到的目录项：HBM → GMMU', 'The entry read: HBM → GMMU'));
    return finish(r);
  }
  if (level === 'hbm') {
    marker('pa', 'hbm-stack', [3.88, .42, -.1], 'PA 0x24e164a40', 'addr', 'source', [1.0, .5]);
    marker('bank', 'hbm-stack', [-1.9, 2.8, 2.3], L('DRAM bank（示意）', 'DRAM bank (illustrative)'), 'a', 'target', [.8, .3]);
    add('controller-to-bank', 'hbm-stack', ['memory controller', 'channel', 'DRAM layer'], [[2.76, .36, -.1], [.9, .36, -.1], [.9, .36, 2.3], [-1.2, .36, 2.3], [-1.2, 2.72, 2.3]], 'addr', { kind: 'transfer' });
    add('bank-to-controller', 'hbm-stack', ['DRAM layer', 'channel', 'memory controller'], [[-.8, 2.72, 2.3], [-.8, .66, 2.3], [-.8, .66, 1.85], [1.3, .66, 1.85], [1.3, .66, -.5], [2.76, .66, -.5]], 'a', { kind: 'transfer', start: .3 });
    key('addr', L('物理地址：接口 → 通道 → DRAM 层', 'Physical address: interface → channel → DRAM layer'));
    key('a', L('读出的数据原路返回', 'The data read comes back the same way'));
    return finish(r);
  }
  return finish(r);
}

const PIXEL_PHASES = [
  { kind: 'placement', title: L('图形 TPC', 'Graphics TPC'), note: L('H100 只有两个 TPC 能跑图形，具体是哪两个没有公开，位置是示意。', 'Only two TPCs on H100 run graphics. Which two isn’t published; the position is illustrative.') },
  { kind: 'transfer', title: L('读顶点', 'Fetch vertices'), note: L('顶点数据走和矩阵一样的访存通路。', 'Vertex data takes the same memory path as matrix data.') },
  { kind: 'compute', title: L('顶点着色', 'Vertex shading'), note: L('FP32 单元做坐标变换。', 'The FP32 units do the transform.') },
  { kind: 'raster', title: L('光栅化', 'Rasterize'), note: L('H100 的文章没有描述光栅硬件，这里按功能标在 GPC 上。', 'The H100 article doesn’t describe raster hardware; it is marked on the GPC by function.') },
  { kind: 'compute', title: L('片元着色', 'Fragment shading'), note: L('还是那些 FP32 单元，这次按权重混合颜色。', 'The same FP32 units, this time blending the colors by weight.') },
  { kind: 'transfer', title: L('纹理采样', 'Texture sample'), note: L('TEX 单元经 L1 取纹素。', 'TEX units fetch the texel through L1.') },
  { kind: 'store', title: L('深度测试并写入', 'Depth test and write'), note: L('H100 的文章没有描述 ROP，这里按功能标在 L2 一侧。', 'The H100 article doesn’t describe ROPs; they are marked on the L2 side by function.') },
  { kind: 'output', title: L('拷出去', 'Copy it out'), note: L('连接器在模组背面，从这个角度看不到，所以最后一段画成虚线。', 'The connector is on the back of the module and can’t be seen from here, so the last stretch is dashed.') }
];
function pixel(level, stepIndex, model) {
  const r = builder(level, PIXEL_PHASES[stepIndex] || PIXEL_PHASES[0]);
  const { add, marker, key } = r, g = dieGeometry(model), { tpc, y, corridor, edge } = g;
  const vb = HBM_SITES[2], fb = HBM_SITES[3], entry = [tpc[0] + .235, y, tpc[2]];
  if (level === 'die' && stepIndex === 0) {
    marker('graphics-tpc', 'gpu-die', tpc, L('图形 TPC（示意）', 'Graphics TPC (illustrative)'), 'control', 'target', [.95, .26]);
    marker('host', 'gpu-die', [0, .61, -3.58], 'GigaThread', 'control', 'source', [.9, .3]);
    add('dispatch', 'gpu-die', ['GigaThread', 'graphics TPC'], [[0, .61, -3.45], [corridor, .61, -3.45], [corridor, .61, tpc[2]], [entry[0], .61, tpc[2]]], 'control', { kind: 'placement' });
    key('control', L('图形任务派给这个 TPC（分配工作）', 'Graphics work assigned to this TPC (work, not data)'), true);
  } else if (level === 'die' && stepIndex === 3) {
    r.focus = .36;
    marker('raster', 'gpu-die', [tpc[0], y, tpc[2] - .92], L('光栅（按功能标注）', 'Raster (by function)'), 'control', 'source', [.9, .3]);
    marker('fragment', 'gpu-die', tpc, L('片元 (3, 4)', 'Fragment (3, 4)'), 'control', 'target', [.95, .26]);
    add('raster-to-sm', 'gpu-die', ['raster', 'graphics SM'], [[tpc[0], y, tpc[2] - .92], [tpc[0], y, tpc[2] - .14]], 'control', { kind: 'transfer' });
    key('control', L('片元 (3, 4)：光栅 → 图形 SM', 'Fragment (3, 4): raster → graphics SM'));
  } else if (level === 'package' && stepIndex === 1) {
    r.xray = true;
    marker('vertex-buffer', 'hbm', [vb.x, .6, vb.z], L('顶点缓冲', 'Vertex buffer'), 'a', 'source', [1.22, .72]);
    marker('graphics-sm', 'gpu-die', tpc, L('图形 SM', 'Graphics SM'), 'a', 'target', [.95, .26]);
    add('vb-to-edge', 'hbm', ['HBM', 'memory controller'], [[vb.x, .64, vb.z], [-edge, y, vb.z]], 'a', { kind: 'transfer' });
    add('edge-to-sm', 'gpu-die', ['memory controller', 'L2', 'graphics SM'], [[-edge, y, vb.z], [-2.38, y, vb.z], [-2.38, y, .12], [corridor, y, .12], [corridor, y, tpc[2]], [entry[0], y, tpc[2]]], 'a', { kind: 'transfer', after: 'vb-to-edge' });
    key('a', L('三个顶点：HBM → L2 → 图形 SM', 'Three vertices: HBM → L2 → graphics SM'));
  } else if (level === 'package' && stepIndex === 6) {
    r.xray = true;
    marker('graphics-sm', 'gpu-die', tpc, L('图形 SM', 'Graphics SM'), 'c', 'source', [.95, .26]);
    marker('rop', 'gpu-die', g.l2Right, L('ROP（按功能标注）', 'ROP (by function)'), 'c', 'cache', [.9, .5]);
    marker('framebuffer', 'hbm', [fb.x, .6, fb.z], L('帧缓冲 fb[3,4]', 'Framebuffer fb[3,4]'), 'c', 'target', [1.22, .72]);
    add('sm-to-rop', 'gpu-die', ['graphics SM', 'L2 / ROP', 'memory controller'], [[entry[0], y, tpc[2]], [corridor, y, tpc[2]], [corridor, y, -.12], [2.38, y, -.12], [2.38, y, fb.z], [edge, y, fb.z]], 'c', { kind: 'store' });
    add('rop-to-hbm', 'hbm', ['memory controller', 'framebuffer'], [[edge, y, fb.z], [fb.x, .64, fb.z]], 'c', { kind: 'store', after: 'sm-to-rop' });
    key('c', L('颜色和深度：图形 SM → ROP → HBM', 'Color and depth: graphics SM → ROP → HBM'));
  } else if (level === 'sm') {
    r.focus = .34;
    if (stepIndex === 2 || stepIndex === 4) {
      const vertex = stepIndex === 2;
      marker('registers', 'sm-detail', [-3.1, .56, -2.07], L('寄存器', 'Registers'), 'a', 'source', [1.2, .36]);
      marker('fp32', 'sm-detail', SM.fp32, vertex ? L('FP32 · 屏幕坐标', 'FP32 · screen position') : L('FP32 · 颜色 (0.2, 0.5, 0.3)', 'FP32 · color (0.2, 0.5, 0.3)'), 'c', 'target', [2.2, .6]);
      add('reg-to-fp32', 'sm-detail', ['Register File', 'FP32'], [sm(-3.4, -2.07), sm(-3.4, -1.38)], 'a', { kind: 'compute' });
      add('fp32-to-reg', 'sm-detail', ['FP32', 'Register File'], [sm(-2.8, -1.38), sm(-2.8, -2.07)], 'c', { kind: 'compute', start: .4 });
      key('a', vertex ? L('顶点和变换矩阵：寄存器 → FP32', 'Vertex and transform matrix: registers → FP32') : L('三个颜色和权重：寄存器 → FP32', 'Three colors and weights: registers → FP32'));
      key('c', vertex ? L('算出的屏幕坐标：FP32 → 寄存器', 'The screen position: FP32 → registers') : L('混合出的颜色：FP32 → 寄存器', 'The blended color: FP32 → registers'));
    } else if (stepIndex === 5) {
      marker('lsu', 'sm-detail', SM.lsu, 'LD/ST', 'addr', 'source', [3.7, .30]);
      marker('texture', 'sm-detail', SM.texture, L('TEX · 坐标 (0.25, 0.75)', 'TEX · coordinate (0.25, 0.75)'), 'a', 'target', [2.3, .3]);
      add('lsu-to-tex', 'sm-detail', ['LD/ST', 'TEX'], [SM.lsu, sm(-.2, -.70), sm(-.2, 3.86), sm(-.85, 3.86)], 'addr', { kind: 'transfer' });
      add('l1-to-tex', 'sm-detail', ['L1', 'TEX'], [sm(-1.7, 3.2), sm(-1.7, 3.80)], 'a', { kind: 'transfer', start: .35 });
      key('addr', L('采样请求：纹理坐标 → TEX', 'Sample request: texture coordinate → TEX'));
      key('a', L('纹素：L1 → TEX', 'Texel: L1 → TEX'));
    }
  } else if (level === 'board' && stepIndex === 7) {
    marker('framebuffer', 'hbm', [fb.x, .6, fb.z], L('帧缓冲', 'Framebuffer'), 'c', 'source', [1.22, .72]);
    marker('host', 'pcb', [0, -.27, -7.2], L('背面的 SXM 连接器 → 主机', 'SXM connector underneath → host'), 'c', 'target', [1.6, .5]);
    add('fb-to-die', 'package', ['framebuffer', 'host interface'], [[fb.x, .7, fb.z], [2.2, .7, fb.z], [2.2, .7, -3.4], [.5, .7, -3.4]], 'c', { kind: 'output' });
    add('die-to-connector', 'package', ['host interface', 'SXM connector'], [[0, .7, -3.5], [0, -.1, -7.1]], 'c', { kind: 'output', dashed: true, arc: 1.3, start: .3 });
    key('c', L('一帧画面：HBM → GPU 的主机接口', 'The frame: HBM → the GPU’s host interface'));
    key('c', L('穿过封装和电路板，到背面的连接器', 'Down through the package and board to the connector underneath'), true);
  }
  return finish(r);
}

const STACK_PHASES = [
  { kind: 'transfer', title: L('五组 HBM 贴着裸片', 'Five stacks beside the die'), note: L('每组和裸片只隔一毫米左右。', 'Each stack is about a millimeter from the die.') },
  { kind: 'structure', title: L('DRAM 叠在底部芯片上', 'DRAM on a base die'), note: L('画了八层，只是为了说明结构。', 'Eight layers are drawn only to show the structure.') },
  { kind: 'vertical', title: L('TSV 与微凸点', 'TSVs and microbumps'), note: L('层与层被拉开了，好看到中间的微凸点。', 'The layers are pulled apart so the microbumps between them show.') },
  { kind: 'transfer', title: L('1024 位接口', '1024-bit interface'), note: L('多个独立通道并行，图里只画了一条线代表它们。', 'Independent channels run in parallel; one line stands for all of them.') },
  { kind: 'transfer', title: L('中介层走线', 'Interposer wiring'), note: L('裸片和 HBM 被抬起来了。拆开后显示的走线是示意。', 'The die and the HBM stacks are lifted. The routing shown when taken apart is illustrative.') },
  { kind: 'vertical', title: L('从硅到 PCB', 'Silicon to PCB'), note: L('每往下一层，连接点更大、更稀。', 'Each layer down, the joints get bigger and sparser.') },
  { kind: 'heat', title: L('热量向上', 'Heat goes up'), note: L('冷板没有画出，它压在这些顶面上。', 'The cold plate isn’t drawn; it presses on these top surfaces.') },
  { kind: 'yield', title: L('没启用的部分', 'Parts that are off'), note: L('哪些单元被关掉每颗芯片都不同，位置是示意。', 'Which units are off differs from chip to chip; positions are illustrative.') }
];
function stacking(level, stepIndex, model) {
  const r = builder(level, STACK_PHASES[stepIndex] || STACK_PHASES[0]);
  const { add, marker, key } = r, a100 = model === 'a100';
  const active = HBM_SITES.filter(site => site.active);
  if (stepIndex === 0 && level === 'board') {
    for (const [i, site] of active.entries()) add('hbm-' + i, 'package', ['HBM', 'GPU die'], [[site.x, .7, site.z], [Math.sign(site.x) * 2.3, .7, site.z]], 'a', { kind: 'transfer', start: i * .05, width: .18 });
    marker('bandwidth', 'gpu-die', [0, .62, 0], a100 ? '2.04 TB/s' : '3.35 TB/s', 'a', 'target', [1.4, .7]);
    key('a', L('五组 HBM 同时把数据送进裸片', 'Five HBM stacks feed the die at once'));
  } else if (level === 'hbm' && stepIndex === 1) {
    add('stack-height', 'hbm-stack', ['base die', 'top DRAM'], [[-4.0, .3, 2.4], [-4.0, 3.62, 2.4]], 'control', { kind: 'structure' });
    marker('layers', 'hbm-stack', [-2.7, 3.76, -.70], L('8 层 DRAM（示意）', '8 DRAM layers (illustrative)'), 'control', 'target', [1.6, .55]);
    marker('base', 'hbm-stack', [-2.3, .3, 2.35], L('底部接口芯片', 'Base die'), 'control', 'source', [1.3, .3]);
    key('control', L('一摞的高度：底部芯片加几层 DRAM', 'Height of one stack: a base die plus DRAM layers'), true);
  } else if (level === 'hbm' && stepIndex === 2) {
    const top = .48 + 7 * .43 + .55 * 8 * .22;
    add('tsv-up', 'hbm-stack', ['base die', 'TSV', 'microbump', 'DRAM'], [[-.34, .3, 2.3], [-.34, top, 2.3]], 'a', { kind: 'vertical' });
    marker('tsv', 'hbm-stack', [-.34, top + .1, 1.3], 'TSV', 'a', 'target', [.7, .5]);
    marker('bump', 'hbm-stack', [-2.6, 1.0, 1.94], L('微凸点', 'Microbumps'), 'a', 'location', [.8, .3]);
    key('a', L('信号沿 TSV 垂直穿过每一层', 'A signal goes straight up through every layer on TSVs'));
  } else if (level === 'hbm' && stepIndex === 3) {
    add('channels', 'hbm-stack', ['channels', 'GPU PHY'], [[-3.6, .38, 2.3], [.9, .38, 2.3], [.9, .38, -.1], [2.76, .38, -.1]], 'a', { kind: 'transfer' });
    marker('channels', 'hbm-stack', [-1.7, .38, 2.12], a100 ? L('8 个通道 × 128 位', '8 channels × 128 bits') : L('16 个通道 × 64 位', '16 channels × 64 bits'), 'a', 'source', [2.0, .4]);
    marker('phy', 'hbm-stack', [3.88, .42, -.1], L('通往 GPU · 1024 位', 'To the GPU · 1024 bits'), 'a', 'target', [1.0, .5]);
    key('a', L('1024 根数据线：底部芯片 → GPU', '1024 data lines: base die → GPU'));
  } else if (level === 'package' && stepIndex === 4) {
    r.ghost = ['gpu-die', 'hbm', 'hbm-inactive'];
    r.ghostBoxes = [{ host: 'gpu-die', center: [0, .42, 0], size: [5.3, .24, 7.65] },
      ...HBM_SITES.map(site => ({ host: site.active ? 'hbm' : 'hbm-inactive', center: [site.x, .4, site.z], size: [1.6, .3, 1.9] }))];
    for (const [i, site] of active.entries()) {
      const dir = Math.sign(site.x);
      add('rdl-' + i, 'interposer', ['HBM base', 'interposer wiring', 'HBM PHY'], [[site.x, .26, site.z], [dir * 2.1, .26, site.z]], 'a', { kind: 'transfer', start: i * .05, width: .2 });
    }
    marker('rdl', 'interposer', [0, .24, 3.9], L('5 × 1024 条数据线', '5 × 1024 data lines'), 'a', 'target', [2.2, .4]);
    key('a', L('中介层里的走线：每组 HBM → GPU 的 HBM 接口', 'Wiring in the interposer: each stack → the GPU’s HBM interface'));
  } else if (level === 'package' && stepIndex === 5) {
    // In front of the left end of the front face, as the side camera sees it,
    // so the exploded layers do not hide the arrow.
    const x = -4.8, z = 5.7;
    r.focus = 1;   // the side view needs every layer in frame
    add('down', 'package', ['die', 'interposer', 'substrate'], [[x, 3.7, z], [x, .62, z]], 'control', { kind: 'vertical', width: .26 });
    marker('die-layer', 'package', [x, 3.7, z], L('裸片 / HBM', 'Die / HBM'), 'control', 'source', [.6, .4], 'right');
    marker('interposer-layer', 'package', [x, 2.05, z], L('中介层', 'Interposer'), 'control', 'location', [.6, .4], 'right');
    marker('substrate-layer', 'package', [x, .95, z], L('基板 → PCB', 'Substrate → PCB'), 'control', 'target', [.6, .4], 'right');
    key('control', L('信号和供电逐层往下接到电路板', 'Signals and power step down layer by layer to the board'));
  } else if (level === 'package' && stepIndex === 6) {
    add('heat-die', 'package', ['die', 'top surface', 'cold plate'], [[0, .6, 0], [0, 2.1, 0]], 'heat', { kind: 'heat', width: .32 });
    for (const [i, site] of active.entries()) add('heat-hbm-' + i, 'package', ['HBM', 'cold plate'], [[site.x, .56, site.z], [site.x, 1.6, site.z]], 'heat', { kind: 'heat', start: .1 + i * .04, width: .22 });
    marker('power', 'package', [0, 2.15, 0], a100 ? '400 W' : '≤ 700 W', 'heat', 'target', [1.2, .5]);
    key('heat', L('热量从裸片和 HBM 的顶面往上走', 'Heat leaves upward from the tops of the die and the HBM stacks'));
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
  const fp = dieFloorplan(model), y = .6, path = { kind: 'path', head: false, tail: false };
  const add = (id, host, stages, points, color) => r.add(id, host, stages, points, color, path);
  if (level === 'board') {
    add('package-to-sxm-a', 'pcb', ['GPU package', 'SXM connector'], [[0, -.27, -5.4], [0, -.27, -7.3]], 'c');
    add('package-to-sxm-b', 'pcb', ['GPU package', 'SXM connector'], [[0, -.27, 5.4], [0, -.27, 7.3]], 'c');
    for (const side of [-1, 1]) add('vrm-' + side, 'pcb', ['VRM', 'GPU package'], [[side * 6.0, -.27, 0], [side * 5.45, -.27, 0]], 'power');
  } else if (level === 'package') {
    for (const [i, site] of HBM_SITES.filter(s => s.active).entries()) add('hbm-' + i, 'package', ['HBM', 'HBM PHY'], [[site.x, .64, site.z], [Math.sign(site.x) * 2.7, .64, site.z]], 'a');
  } else if (level === 'die') {
    for (const [i, m] of fp.memoryControllers.filter(mc => mc.active).entries()) add('mc-' + i, 'gpu-die', ['memory controller', 'L2'], [[m.x, y, m.z], [m.x, y, Math.sign(m.z || 1) * .2], [Math.sign(m.x) * 1.9, y, Math.sign(m.z || 1) * .2]], 'a');
    for (const [i, gpc] of fp.gpcs.filter(g => g.active).entries()) add('gpc-' + i, 'gpu-die', ['L2', 'GPC'], [[gpc.x, y, Math.sign(gpc.z) * .42], [gpc.x, y, gpc.z]], 'c');
    add('host', 'gpu-die', ['PCIe / GigaThread', 'GPCs'], [[0, y, -3.45], [0, y, -.42]], 'control');
    add('nvlink', 'gpu-die', ['L2', 'NVLink'], [[0, y, .42], [0, y, 3.45]], 'b');
  } else if (level === 'sm') {
    add('shared-lsu', 'sm-detail', ['Shared Memory', 'LD/ST'], [SM.shared, sm(0, -.70), sm(-4.36, -.70)], 'a');
    add('lsu-reg', 'sm-detail', ['LD/ST', 'Register File'], [sm(-4.36, -.70), SM.reg], 'b');
    add('reg-units', 'sm-detail', ['Register File', 'FP32 / Tensor Core'], [sm(-2.3, -2.07), sm(-1.15, -2.07), sm(-1.15, -1.5)], 'b');
    add('l2-shared', 'sm-detail', ['L2', 'Shared Memory'], [SM.incoming, sm(1.6, 2.4), sm(1.6, 3.2)], 'a');
    add('issue', 'sm-detail', ['L0 I-cache', 'Scheduler', 'Dispatch'], [[-2.65, .46, -2.82], [-2.65, .46, -2.36]], 'control');
  } else if (level === 'hbm') {
    add('channels', 'hbm-stack', ['channels', 'GPU PHY'], [[-3.6, .38, 2.3], [.9, .38, 2.3], [.9, .38, -.1], [2.76, .38, -.1]], 'a');
    add('tsv', 'hbm-stack', ['base die', 'DRAM'], [[-.34, .3, 2.3], [-.34, 3.5, 2.3]], 'c');
  } else if (level === 'power') {
    for (let i = 0; i < 6; i++) { const x = -4.75 + i * 1.9; add('phase-' + i, 'power-board', ['input', 'power stage', 'inductor', 'output rail'], [[x, 1.02, -3.0], [x, 1.02, 2.85]], 'power'); }
    add('feedback', 'power-board', ['output', 'controller'], [[5.95, .2, 2.85], [5.95, .2, -3.7], [-5.55, .2, -3.7]], 'control');
  }
  return finish(r);
}

export function routeState(route, progress) {
  const fraction = clamp((clamp(progress) - route.start) / Math.max(.3, 1 - route.start));
  return { fraction, complete: progress >= 1, visible: true, opacity: 1 };
}

// The arithmetic and the repeating visual use separate clocks; a visual cycle
// never changes a result, completion flag or data location.
export function signalCycleState(route, visualPhase = 0) {
  const numericPhase = Number(visualPhase);
  const phase = Number.isFinite(numericPhase) ? Math.max(0, numericPhase) : 0;
  const logical = route.dashed || LOGICAL.includes(route.kind);
  return { fraction: frac(phase), phase, mode: 'band', semantic: logical ? 'dependency' : 'transfer', offset: bandOffset(route, phase) };
}
// Where the travelling bright band sits, as a texture offset in [0, 1). The
// band moves towards the arrowhead as the phase grows and repeats exactly at
// whole phases. A route that continues another one (`after`) starts where the
// first left off, so a band crosses the join without a jump.
export function bandOffset(route, visualPhase = 0) {
  const numericPhase = Number(visualPhase);
  const phase = Number.isFinite(numericPhase) ? Math.max(0, numericPhase) : 0;
  const value = frac((route.lead || 0) / (route.period || 1) + (route.start || 0) - BAND_SPEED * phase);
  return value > 1 - 1e-9 ? 0 : value;
}
// Dependencies and dimension lines stand still; everything else carries a band.
export const routeMoves = route => !['dependency', 'structure', 'path'].includes(route.kind);

// Corners become short arcs so a route reads as one line, not as boxes.
function roundCorners(points, radius, lastLimit) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1], corner = points[i], after = points[i + 1];
    const d0 = distance(before, corner), d1 = distance(corner, after);
    let cut = Math.min(radius, d0 / 2, d1 / 2);
    if (i === points.length - 2) cut = Math.min(cut, Math.max(0, lastLimit));
    if (cut < 1e-3) { out.push(corner); continue; }
    const from = mix(corner, before, cut / d0), to = mix(corner, after, cut / d1);
    for (let n = 0; n <= 8; n++) {
      const t = n / 8, u = 1 - t;
      out.push(from.map((v, k) => u * u * v + 2 * u * t * corner[k] + t * t * to[k]));
    }
  }
  out.push(points.at(-1));
  return out;
}
function trimEnd(points, amount) {
  let remaining = amount; const out = points.slice();
  while (out.length > 1 && remaining > 0) {
    const last = out.at(-1), previous = out.at(-2), d = distance(last, previous);
    if (d > remaining) { out[out.length - 1] = mix(last, previous, remaining / d); break; }
    out.pop(); remaining -= d;
  }
  return out;
}

export function createTeachingVisuals(T, hardware, presentation, options = {}) {
  const visuals = [], markerGroups = [], allGroups = [];
  const geometry = new Set(), materials = new Set(), textures = new Set();
  const unit = new T.BoxGeometry(1, 1, 1); geometry.add(unit);
  const still = !!options.static;
  const OUTLINE = 0x071418, up = new T.Vector3(0, 1, 0);
  function track(mesh, parent) { mesh.userData.teachingSignal = true; parent.add(mesh); return mesh; }
  function box(parent, x, y, z, w, h, d, material) {
    const m = new T.Mesh(unit, material); m.position.set(x, y, z); m.scale.set(w, h, d); return track(m, parent);
  }
  function basic(parameters) { const m = new T.MeshBasicMaterial({ toneMapped: false, ...parameters }); materials.add(m); return m; }
  function strip(pixels) {
    const texture = new T.DataTexture(pixels, pixels.length / 4, 1, T.RGBAFormat);
    texture.wrapS = T.RepeatWrapping; texture.wrapT = T.ClampToEdgeWrapping; texture.needsUpdate = true; textures.add(texture); return texture;
  }
  // One period of the travelling band: the base colour with a brighter comet
  // whose head points along the route, so direction reads in a still frame too.
  function bandTexture(hex) {
    const size = 64, pixels = new Uint8Array(size * 4), base = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    for (let i = 0; i < size; i++) {
      const u = (i + .5) / size, glow = u > .58 ? Math.pow((u - .58) / .42, 1.6) : 0;
      for (let k = 0; k < 3; k++) pixels[i * 4 + k] = Math.round(base[k] + (255 - base[k]) * .72 * glow);
      pixels[i * 4 + 3] = 255;
    }
    const texture = strip(pixels); texture.colorSpace = T.SRGBColorSpace; texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearFilter; return texture;
  }
  function dashTexture() {
    const size = 16, pixels = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) pixels.set(i < 10 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
    const texture = strip(pixels); texture.magFilter = T.NearestFilter; texture.minFilter = T.NearestFilter; return texture;
  }
  class Polyline extends T.Curve {
    constructor(points) {
      super(); this.points = points.map(p => new T.Vector3(...p)); this.lengths = [0];
      for (let i = 1; i < this.points.length; i++) this.lengths.push(this.lengths[i - 1] + this.points[i].distanceTo(this.points[i - 1]));
      this.total = this.lengths.at(-1);
    }
    getPoint(t, target = new T.Vector3()) {
      const d = clamp(t) * this.total; let i = 1;
      while (i < this.lengths.length - 1 && this.lengths[i] < d) i++;
      const span = this.lengths[i] - this.lengths[i - 1];
      return target.lerpVectors(this.points[i - 1], this.points[i], span ? (d - this.lengths[i - 1]) / span : 0);
    }
    getPointAt(u, target) { return this.getPoint(u, target); }
    getTangent(t, target = new T.Vector3()) {
      const d = clamp(t) * this.total; let i = 1;
      while (i < this.lengths.length - 1 && this.lengths[i] <= d) i++;
      return target.subVectors(this.points[i], this.points[i - 1]).normalize();
    }
    getTangentAt(u, target) { return this.getTangent(u, target); }
    getLength() { return this.total; }
  }
  const outlineMaterial = basic({ color: OUTLINE, side: T.BackSide });
  for (const route of presentation.routes) {
    const host = hardware.components[route.host]?.group; if (!host) continue;
    const group = new T.Group(); group.userData.teachingSignal = true; host.add(group); allGroups.push(group);
    const hex = FLOW_COLORS[route.color] || FLOW_COLORS.a;
    // A short route gets a thinner tube, so it still reads as an arrow and not a blob.
    const length = pathLength(route.points), full = route.width * TUBE * (still ? .62 : 1);
    const radius = Math.min(full, Math.max(full * .6, length * .06)), rim = Math.max(.012, radius * .3);
    const lastLeg = distance(route.points.at(-1), route.points.at(-2));
    // On a short route the start dot and the arrowhead shrink with it, so the
    // tube between them stays visible and the whole thing reads as an arrow.
    const headLength = route.head ? Math.min(radius * 6, length * .3, route.smooth ? length : lastLeg * .72) : 0;
    const headRadius = Math.min(radius * 2.7, headLength * .62), dotRadius = Math.min(radius * 1.9, Math.max(radius * 1.25, length * .06));
    const rounded = route.smooth ? route.points : roundCorners(route.points, route.width * 1.1, lastLeg - headLength);
    const end = new T.Vector3(...route.points.at(-1));
    const direction = end.clone().sub(new T.Vector3(...trimEnd(rounded, Math.max(headLength, length * .02)).at(-1))).normalize();
    const curve = new Polyline(headLength ? trimEnd(rounded, headLength * .86) : rounded);
    const moving = !still && routeMoves(route);
    const band = moving ? bandTexture(hex) : null;
    const dash = route.dashed ? dashTexture() : null;
    if (band) { band.repeat.set(curve.total / route.period, 1); band.offset.x = bandOffset(route, 0); }
    if (dash) dash.repeat.set(Math.max(1, Math.round(curve.total / (radius * 9))), 1);
    const dashParameters = dash ? { alphaMap: dash, alphaTest: .5, side: T.DoubleSide } : {};
    const railMaterial = basic({ color: band ? 0xffffff : hex, map: band, ...dashParameters });
    const rimMaterial = dash ? basic({ color: OUTLINE, side: T.BackSide, alphaMap: dash, alphaTest: .5 }) : outlineMaterial;
    const solidMaterial = basic({ color: hex });
    const segments = Math.max(8, Math.min(480, Math.ceil(curve.total / (radius * 1.1))));
    const tubeGeometry = new T.TubeGeometry(curve, segments, radius, 10, false); geometry.add(tubeGeometry);
    const rimGeometry = new T.TubeGeometry(curve, segments, radius + rim, 10, false); geometry.add(rimGeometry);
    const tube = track(new T.Mesh(tubeGeometry, railMaterial), group); tube.userData.signalTube = true;
    if (!still) track(new T.Mesh(rimGeometry, rimMaterial), group);
    let head = null, tail = null;
    if (headLength) {
      const headGeometry = new T.ConeGeometry(headRadius, headLength, 18); geometry.add(headGeometry);
      const headRim = new T.ConeGeometry(headRadius + rim * 1.5, headLength + rim * 4, 18); geometry.add(headRim);
      head = track(new T.Mesh(headGeometry, solidMaterial), group);
      head.quaternion.setFromUnitVectors(up, direction); head.position.copy(end).addScaledVector(direction, -headLength / 2);
      const headOutline = track(new T.Mesh(headRim, outlineMaterial), group);
      headOutline.quaternion.copy(head.quaternion); headOutline.position.copy(head.position).addScaledVector(direction, rim * .5);
    }
    const origin = new T.Vector3(...route.points[0]);
    if (route.tail && !still) {
      const dot = new T.SphereGeometry(dotRadius, 18, 12), dotRim = new T.SphereGeometry(dotRadius + rim, 18, 12); geometry.add(dot); geometry.add(dotRim);
      tail = track(new T.Mesh(dot, solidMaterial), group); tail.position.copy(origin);
      track(new T.Mesh(dotRim, outlineMaterial), group).position.copy(origin);
    } else if (route.after) {
      const joint = new T.SphereGeometry(radius, 12, 8); geometry.add(joint);
      track(new T.Mesh(joint, solidMaterial), group).position.copy(origin);
    }
    visuals.push({ route, group, tube, head, tail, band, dash, railMaterial, radius, headLength, headRadius, dotRadius: tail ? dotRadius : 0, length, direction });
  }
  for (const marker of presentation.markers) {
    const host = hardware.components[marker.host]?.group; if (!host || !marker.point) continue;
    const group = new T.Group(); group.userData.teachingSignal = true; host.add(group); allGroups.push(group);
    const color = FLOW_COLORS[marker.color] || FLOW_COLORS.a;
    const fill = basic({ color, transparent: true, opacity: .18, depthWrite: false, side: T.DoubleSide, toneMapped: true });
    const border = basic({ color, transparent: true, opacity: .95, depthWrite: false, side: T.DoubleSide, toneMapped: true });
    const [x, y, z] = marker.point, [w, d] = marker.size;
    box(group, x, y, z, w, .025, d, fill);
    for (const side of [-1, 1]) {
      box(group, x + side * w / 2, y + .015, z, .035, .04, d + .035, border);
      box(group, x, y + .015, z + side * d / 2, w + .035, .04, .035, border);
    }
    markerGroups.push({ marker, host, group, fill, border });
  }
  return {
    visuals, markers: markerGroups,
    // Only texture offsets change here: geometry, colours and arrowheads are
    // fixed for the life of a step, and nothing depends on lesson progress
    // except the fill of a target that has been reached.
    update(progress, visualPhase = progress) {
      for (const item of visuals) {
        if (still) continue;
        item.cycleState = signalCycleState(item.route, visualPhase);
        if (item.band) item.band.offset.x = item.cycleState.offset;
      }
      for (const item of markerGroups) item.fill.opacity = progress >= 1 && item.marker.role === 'target' ? .45 : .22;
    },
    dispose() { allGroups.forEach(g => g.removeFromParent()); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); }
  };
}
