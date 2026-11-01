// GPU Explorer — pure teaching-model state machine.
// No DOM, no network, no GPU. Shared by the browser app and the Node tests.
// All hardware numbers below are teaching simplifications, not datasheets
// and not measured performance.
//
// Diagram geometry: each node has x/y/w/h in a 1100x520 SVG canvas.
// kind: 'data' (sand), 'compute' (blue), 'memory' (teal), 'control' (grey).
// flows: static arrows for a journey; a step's `flows` lists the flow keys
// (from + '>' + to) that are live in that step.
(function (root) {
  const MODELS = {
    h100: { name: 'H100 (Hopper)', kind: 'GPU · 计算', note: 'H100（GH100/Hopper，教学变体）：与 A100 模型区分；具体规格以 NVIDIA Hopper 官方文章为准，本图为教学示意。' },
    a100: { name: 'A100 (Ampere)', kind: 'GPU · 计算', note: 'A100（GA100/Ampere，官方）：7 GPC、108 SM、L2 40MB 分 2 区、HBM2 5 叠；本图为教学示意。' },
    rtx5090: { name: 'RTX 5090', kind: 'GPU · 消费级', note: '消费级示例：图形与计算共享同一组结构、工作与数据视角（教学示意，与 Ampere/Hopper 模型区分）。' },
    mi300x: { name: 'AMD MI300X', kind: 'GPU · 芯粒/堆叠', note: '比较示例：多芯粒与堆叠组织下同一问题的另一种分工（教学示意）。' },
    a20pro: { name: 'Apple A20 Pro（示意）', kind: 'SoC · CPU/内存', note: 'CPU/SoC 示例：重点为 CPU、页表与内存层级，具体规格为教学示意，非官方数据。' },
    snapdragon: { name: 'Snapdragon 移动 SoC（示意）', kind: 'SoC · CPU/内存', note: '移动 SoC 示例：与 A20 Pro 对照的 CPU 与内存组织，具体规格为教学示意。' },
  };

  const JOURNEYS = {
    gemm: {
      title: '矩阵乘法：C[3,7] 的计算路径',
      gloss: 'C[3,7] 为 A 行与 B 列的内积。',
      nodes: [
        { id: 'a-tile', label: 'A 的一行', kind: 'data', x: 20, y: 70, w: 220, h: 80, detail: '输入：A[3][:]。本步骤仅使用第 3 行，其余行与 C[3,7] 无关。' },
        { id: 'b-tile', label: 'B 的一列', kind: 'data', x: 20, y: 330, w: 220, h: 80, detail: '输入：B[:][7]。本步骤仅使用第 7 列，其余列与 C[3,7] 无关。' },
        { id: 'smem', label: 'Shared Memory', kind: 'memory', x: 320, y: 200, w: 220, h: 120, detail: '片上共享存储：A、B 小块载入后可被多次复用，无需每次访问片外显存。' },
        { id: 'warp', label: 'Warp / 线程', kind: 'compute', x: 620, y: 70, w: 200, h: 80, detail: '分工：一个 warp 内的线程各承担一部分计算，执行同一条指令，处理不同数据。' },
        { id: 'sm', label: 'SM / 计算单元', kind: 'compute', x: 620, y: 330, w: 200, h: 120, detail: '执行：乘加与累加。SM 由 4 个子分区组成，每子分区含 warp 调度条、张量单元与寄存器条，底部为 L1/共享存储条；矩阵单元在此位置承担规整的乘加运算。' },
        { id: 'c-out', label: '输出 C[3,7]', kind: 'data', x: 900, y: 200, w: 180, h: 80, detail: '结果：累加完成后的唯一输出。反向追溯自此开始。' },
      ],
      flows: [
        { from: 'a-tile', to: 'smem' }, { from: 'b-tile', to: 'smem' },
        { from: 'smem', to: 'warp' }, { from: 'warp', to: 'sm' },
        { from: 'sm', to: 'c-out' }, { from: 'smem', to: 'sm' },
      ],
      views: {
        structure: '结构视角：部件、归属与连接。当前高亮部件为本步骤的活动部件。',
        work: '工作视角：工作的分组、执行部件与等待关系。',
        data: '数据视角：数据的位置、搬运路径与复用关系。',
        timeline: '时间视角：本步骤在完整过程中的位置及其前后步骤。',
      },
      steps: [
        { title: '选定输出 C[3,7]', body: '计算范围限定为单个输出，确定其输入依赖。', active: ['c-out'], flows: [], trace: 'C[3,7] = Σ A[3][k] · B[k][7]', modelNotes: { h100: 'H100 视角：输出限定后，阵列规模仅决定分工。', a100: 'A100 视角：起点相同，组织方式存在差异。' }, code: ['// 目标：只算一个输出', 'C[3][7] = sum_k A[3][k] * B[k][7]'] },
        { title: 'A 行与 B 列的依赖关系', body: 'C[3,7] 仅依赖 A 第 3 行与 B 第 7 列。', active: ['a-tile', 'b-tile'], flows: [], trace: 'C[3,7] ← A[3][:] · B[:][7]', modelNotes: { h100: 'H100 视角：依赖关系不变，与型号无关。', a100: 'A100 视角：依赖关系相同，差异在后续步骤。' }, code: ['// 依赖', 'row = A[3][:]', 'col = B[:][7]'] },
        { title: 'Tile 与 Block 的划分', body: '大矩阵划分为小块，块负责一个输出 tile。', active: ['sm'], flows: [], trace: '输出 tile ← 一个 block', modelNotes: { h100: 'H100 视角：块尺寸影响复用率与同步代价。', a100: 'A100 视角：划分思路相同，分工粒度有差异。' }, code: ['// 划分（教学示意）', 'tile = 16 x 16', 'block -> 一个输出 tile'] },
        { title: '数据载入 Shared Memory', body: '待复用的 A、B 小块载入片上共享存储。', active: ['smem', 'a-tile', 'b-tile'], flows: ['a-tile>smem', 'b-tile>smem'], trace: 'smem ← A tile + B tile', modelNotes: { h100: 'H100 视角：载入一次，后续乘加反复读取。', a100: 'A100 视角：角色相同，容量与分工有差异。' }, code: ['// 搬运', 'smem_A = load(A tile)', 'smem_B = load(B tile)', '__syncthreads() // 同步：等待全部搬运完成'] },
        { title: 'Warp 分工', body: 'warp 内线程分工：同一指令，不同数据。', active: ['warp'], flows: ['smem>warp'], trace: 'lane ← smem_A[lane] × smem_B[lane]', modelNotes: { h100: 'H100 视角：每 lane 计算各自的部分乘积。', a100: 'A100 视角：每 lane 仅计算一份部分乘积。' }, code: ['// warp 内分工', 'lane = threadIdx.x % 32', 'partial = smem_A[lane] * smem_B[lane]'] },
        { title: 'SM 上的乘加运算', body: '计算单元执行乘加并累加，矩阵单元亦然。', active: ['sm', 'warp'], flows: ['warp>sm'], trace: 'acc ← acc + partial', modelNotes: { h100: 'H100 视角：矩阵单元承担规整的乘加。', a100: 'A100 视角：矩阵单元改变组织，不改变定义。' }, code: ['// 累加', 'acc += partial'] },
        { title: '同步与下一块', body: '当前块完成后同步，随后载入下一块。', active: ['smem', 'sm'], flows: ['smem>sm'], trace: '下一 tile ← 同步后重新载入', modelNotes: { h100: 'H100 视角：等待源于下一块未载入完成。', a100: 'A100 视角：等待为过程的组成部分。' }, code: ['// 同步后继续计算', '__syncthreads()', '// 载入下一块 tile，重复'] },
        { title: '写回 C[3,7]', body: '累加完成，结果写回输出。', active: ['c-out'], flows: ['sm>c-out'], trace: 'C[3,7] ← acc', modelNotes: { h100: 'H100 视角：仅写入一个数值。', a100: 'A100 视角：结果相同，代价与分工可不同。' }, code: ['// 写回', 'C[3][7] = acc'] },
      ],
    },
    pagetable: {
      title: '页表遍历：虚拟地址到物理地址',
      gloss: '虚拟地址逐级翻译为物理地址。',
      nodes: [
        { id: 'cpu', label: 'CPU 核', kind: 'compute', x: 20, y: 80, w: 170, h: 80, detail: '发出虚拟地址 va，并等待翻译结果。程序仅可见虚拟地址。' },
        { id: 'tlb', label: 'TLB（快表）', kind: 'memory', x: 230, y: 80, w: 170, h: 80, detail: '翻译结果的缓存。命中：直接获得物理地址；未命中：进入完整页表遍历。' },
        { id: 'pgd', label: 'PGD', kind: 'control', x: 440, y: 80, w: 170, h: 80, detail: '第 1 级页表：以虚拟地址高位索引，获得下一级地址。' },
        { id: 'pud', label: 'PUD', kind: 'control', x: 650, y: 80, w: 170, h: 80, detail: '第 2 级页表：上一级给出基址，再以下一段地址索引。' },
        { id: 'pmd', label: 'PMD', kind: 'control', x: 860, y: 80, w: 170, h: 80, detail: '第 3 级页表：继续缩小范围，非一次到达结果。' },
        { id: 'pte', label: 'PTE → 物理页', kind: 'control', x: 860, y: 260, w: 170, h: 80, detail: '第 4 级页表：给出物理页号，与页内偏移组合为物理地址，并可回填 TLB。' },
        { id: 'ram', label: '内存', kind: 'data', x: 650, y: 260, w: 170, h: 80, detail: '物理地址指向的存储。页表、缓存与内存为三个不同的概念。' },
        { id: 'cache', label: '缓存', kind: 'memory', x: 440, y: 260, w: 170, h: 80, detail: '数据经过的缓存层级：命中时无需每次访问内存。' },
      ],
      flows: [
        { from: 'cpu', to: 'tlb' }, { from: 'tlb', to: 'pgd' },
        { from: 'pgd', to: 'pud' }, { from: 'pud', to: 'pmd' },
        { from: 'pmd', to: 'pte' }, { from: 'pte', to: 'ram' },
        { from: 'ram', to: 'cache' }, { from: 'cache', to: 'cpu', route: 'return' },
      ],
      views: {
        structure: '结构视角：CPU、TLB、页表各级、内存与缓存的位置关系。',
        work: '工作视角：一次地址翻译的步骤序列，以及各步骤的命中与未命中分支。',
        data: '数据视角：虚拟地址逐级翻译为物理地址的过程。',
        timeline: '时间视角：这一步在翻译全过程中的位置。',
      },
      steps: [
        { title: 'CPU 发出虚拟地址', body: '程序可见虚拟地址，翻译自此开始。', active: ['cpu'], flows: [], trace: 'va = 0x0000_7f00_1234', code: ['// 虚拟地址（教学示意）', 'va = 0x0000_7f00_1234'] },
        { title: 'TLB 查询', body: 'TLB 为翻译缓存；本例采用未命中路径。', active: ['tlb'], flows: ['cpu>tlb'], trace: 'TLB(va) → MISS', code: ['// TLB', 'lookup(va) -> MISS  // 本例采用未命中路径'] },
        { title: 'PGD 查询', body: '以虚拟地址高位索引第一级页表。', active: ['pgd'], flows: ['tlb>pgd'], trace: 'PGD[va >> 39]', code: ['// 第 1 级', 'pgd_entry = PGD[va >> 39]'] },
        { title: 'PUD 查询', body: '上一级给出基址，再以下一段索引。', active: ['pud'], flows: ['pgd>pud'], trace: 'PUD[va >> 30]', code: ['// 第 2 级', 'pud_entry = PUD[va >> 30]'] },
        { title: 'PMD 查询', body: '逐级向下遍历，每级缩小范围。', active: ['pmd'], flows: ['pud>pmd'], trace: 'PMD[va >> 21]', code: ['// 第 3 级', 'pmd_entry = PMD[va >> 21]'] },
        { title: 'PTE 查询与物理页', body: '末级给出物理页号，与页内偏移组合。', active: ['pte', 'tlb'], flows: ['pmd>pte'], trace: 'phys_addr = 页号 + 页内偏移', code: ['// 第 4 级', 'phys_page = PTE[va >> 12]', 'phys_addr = phys_page + offset'] },
        { title: '内存访问与缓存装入', body: '经缓存层级，数据返回 CPU。', active: ['ram', 'cache', 'cpu'], flows: ['pte>ram', 'ram>cache', 'cache>cpu'], trace: 'data = memory[phys_addr]', code: ['// 访问', 'data = memory[phys_addr]', '// 并经过缓存'] },
      ],
    },
    pixel: {
      title: '像素着色：单个像素的计算路径',
      gloss: '单个像素的颜色由管线逐步确定。',
      nodes: [
        { id: 'tri', label: '三角形', kind: 'data', x: 20, y: 80, w: 170, h: 80, detail: '几何：覆盖该像素中心的三角形判定。未覆盖的三角形与该像素无关。' },
        { id: 'raster', label: '光栅化', kind: 'compute', x: 230, y: 80, w: 170, h: 80, detail: '插值：以重心插值将顶点属性按比例分配至该像素。' },
        { id: 'shader', label: '片元着色', kind: 'compute', x: 440, y: 80, w: 170, h: 80, detail: '着色：对该像素执行一次着色器，计算其颜色。' },
        { id: 'tex', label: '纹理', kind: 'memory', x: 440, y: 260, w: 170, h: 80, detail: '查表：以插值所得纹理坐标采样，获得纹理颜色。' },
        { id: 'depth', label: '深度测试', kind: 'control', x: 650, y: 80, w: 170, h: 80, detail: '遮挡判定：距离更远则丢弃，更近则继续；遮挡关系在此确定。' },
        { id: 'fb', label: '帧缓冲', kind: 'memory', x: 860, y: 80, w: 170, h: 80, detail: '暂存：通过测试的像素写入此处；帧缓冲本身并非屏幕。' },
        { id: 'pixel', label: '目标像素', kind: 'data', x: 860, y: 260, w: 170, h: 80, detail: '显示：帧缓冲送至屏幕，该像素点亮。' },
      ],
      flows: [
        { from: 'tri', to: 'raster' }, { from: 'raster', to: 'shader' },
        { from: 'shader', to: 'tex' }, { from: 'tex', to: 'shader' },
        { from: 'shader', to: 'depth' }, { from: 'depth', to: 'fb' },
        { from: 'fb', to: 'pixel' },
      ],
      views: {
        structure: '结构视角：屏幕像素、三角形、光栅化、着色、纹理、深度与帧缓冲的位置关系。',
        work: '工作视角：单个像素的步骤序列，以及各步骤的丢弃分支。',
        data: '数据视角：顶点属性插值为像素数据，颜色逐步计算的过程。',
        timeline: '时间视角：本步骤在单个像素完整过程中的位置。',
      },
      steps: [
        { title: '选定目标像素', body: '计算范围限定为单个像素，确定颜色来源。', active: ['pixel'], flows: [], trace: 'pixel = screen[x][y]', code: ['// 目标：单个像素', 'pixel = screen[x][y]'] },
        { title: '覆盖该像素的三角形', body: '覆盖该像素中心的三角形进入下一阶段。', active: ['tri', 'pixel'], flows: ['tri>raster'], trace: 'covers(tri, pixel) = true', code: ['// 覆盖判断（教学示意）', 'covers = triangle_contains(tri, pixel)'] },
        { title: '光栅化：插值计算', body: '重心插值将顶点属性分配至该像素。', active: ['raster', 'tri'], flows: ['tri>raster', 'raster>shader'], trace: 'attr = w0·v0 + w1·v1 + w2·v2', code: ['// 插值（教学示意）', 'attr = w0 * v0 + w1 * v1 + w2 * v2'] },
        { title: '片元着色：颜色计算', body: '片元着色器对该像素执行一次。', active: ['shader'], flows: ['raster>shader'], trace: 'color = shade(attr)', code: ['// 片元着色', 'color = shade(interpolated_attr)'] },
        { title: '纹理采样', body: '以插值纹理坐标采样，与光照结果结合。', active: ['tex', 'shader'], flows: ['shader>tex', 'tex>shader'], trace: 'color *= texture(uv)', code: ['// 采样', 'tex_color = texture(uv)', 'color *= tex_color'] },
        { title: '深度测试：遮挡丢弃', body: '更远则丢弃，更近则继续；遮挡在此确定。', active: ['depth', 'pixel'], flows: ['shader>depth'], trace: 'z < depth_buffer ? 继续 : 丢弃', code: ['// 深度测试', 'if (z < depth_buffer[x][y]) keep(); else discard();'] },
        { title: '写入帧缓冲', body: '通过测试的像素写入帧缓冲。', active: ['fb'], flows: ['depth>fb'], trace: 'framebuffer[x][y] = color', code: ['// 写入', 'framebuffer[x][y] = color', 'depth_buffer[x][y] = z'] },
        { title: '显示与反向追溯', body: '帧缓冲送至屏幕，该像素点亮。', active: ['fb', 'pixel'], flows: ['fb>pixel'], trace: 'screen[x][y] ← framebuffer[x][y]', code: ['// 显示', 'screen[x][y] = framebuffer[x][y]'] },
      ],
    },
    stacking: {
      title: '芯片堆叠：逻辑折叠剖面',
      gloss: '两层逻辑堆叠，垂直连接替代横向连线。',
      nodes: [
        { id: 'lid', label: '散热盖', kind: 'control', x: 250, y: 30, w: 600, h: 50, detail: '最上层：热量导出层。堆叠密度提高时，中间层的热量导出难度增大。' },
        { id: 'logic-top', label: '上层逻辑 · 超大核', kind: 'compute', x: 250, y: 100, w: 600, h: 90, detail: '上层逻辑（教学示意）：超大核位于上层，距散热盖最近，亦距下层最近。' },
        { id: 'bond', label: '混合键合层', kind: 'control', x: 250, y: 210, w: 600, h: 40, detail: '上下层的垂直连接层：信号经此上下传输，而非绕行横向路径。' },
        { id: 'logic-low', label: '下层逻辑 · 大核 + 小核', kind: 'compute', x: 250, y: 270, w: 600, h: 90, detail: '下层逻辑（教学示意）：大核与小核分工，靠近内存层。' },
        { id: 'mem-layer', label: '内存 / 缓存层', kind: 'memory', x: 250, y: 380, w: 600, h: 70, detail: '内存与缓存层：数据离计算越近，等待越少（教学示意，非实测）。' },
        { id: 'substrate', label: '基板', kind: 'data', x: 250, y: 470, w: 600, h: 40, detail: '最下层：承载整颗芯片，并将信号引至封装外部。' },
        { id: 'cut-core', label: '被划掉的核', kind: 'compute', x: 880, y: 100, w: 180, h: 90, disabled: true, detail: '分档示例：同一颗芯片的低档版本中，该核存在但被关闭，不参与工作。' },
        { id: 'gpu-block', label: 'GPU 块', kind: 'compute', x: 880, y: 270, w: 180, h: 90, detail: '图形计算块：与 CPU 逻辑并列于同一颗芯片，分工不同。' },
      ],
      flows: [
        { from: 'logic-top', to: 'bond' }, { from: 'bond', to: 'logic-low' },
        { from: 'logic-low', to: 'mem-layer' }, { from: 'mem-layer', to: 'substrate' },
        { from: 'gpu-block', to: 'logic-low' },
      ],
      views: {
        structure: '结构视角：自上而下的剖面：散热盖、两层逻辑、键合层、内存层、基板。',
        work: '工作视角：信号垂直穿过各层，以及各层可能的排队与发热位置。',
        data: '数据视角：数据距计算的距离，以及垂直距离短于横向距离的原因。',
        timeline: '时间视角：本步骤在“切开—分层—连通—代价评估”全过程中的位置。',
      },
      steps: [
        { title: '堆叠芯片的剖面结构', body: '剖面结构为分析起点：两层逻辑堆叠。', active: ['lid', 'logic-top'], flows: [], trace: 'chip = 盖·上层·键合·下层·内存·基板', code: ['// 剖面（教学示意）', 'chip = [lid, logic_top, bond, logic_low, mem, substrate]'] },
        { title: '同一芯片的分档', body: '低档关闭部分单元，而非重新设计。', active: ['cut-core', 'logic-top'], flows: [], trace: '低档 = 全单元 − 被关闭单元', code: ['// 分档（教学示意）', 'high_tier = all_units_on', 'low_tier = all_units_on - cut_core'] },
        { title: '剖面分层', body: '自上而下：盖、上层、键合、下层、内存、基板。', active: ['lid', 'bond', 'substrate'], flows: [], trace: '6 层（自上而下）', code: ['// 自上而下', 'layers = [lid, logic_top, bond, logic_low, mem, substrate]'] },
        { title: '上层逻辑：超大核的位置', body: '上层超大核距散热盖近，亦距下层近。', active: ['logic-top'], flows: ['logic-top>bond'], trace: '超大核 → 键合层', code: ['// 上层', 'super_core -> bond_layer'] },
        { title: '混合键合：上下层的连接', body: '键合层为垂直通道，距离较短。', active: ['bond'], flows: ['bond>logic-low'], trace: '上层 → 键合层 → 下层', code: ['// 垂直连接', 'signal = top_logic -[bond]-> low_logic'] },
        { title: '下层逻辑与内存', body: '下层靠近内存层，但带宽与容量仍有限制。', active: ['logic-low', 'mem-layer'], flows: ['logic-low>mem-layer'], trace: '下层 ↔ 内存层', code: ['// 近处取数', 'data = mem_layer[near(low_logic)]'] },
        { title: '信号距离：垂直路径与横向路径', body: '垂直路径短于横向绕行路径，源于几何。', active: ['bond', 'mem-layer'], flows: ['mem-layer>substrate'], trace: '垂直 ≪ 横向（几何示意）', code: ['// 距离对比（教学示意）', 'vertical = one_bond_layer', 'horizontal = across_the_die'] },
        { title: '热与代价：堆叠的约束条件', body: '收益为短距离与高集成；代价为散热与制造难度。', active: ['lid', 'logic-top'], flows: [], trace: '收益：短距离；代价：散热、制造', code: ['// 权衡', 'benefit = short_vertical_path', 'cost = heat + yield + test'] },
      ],
    },
  };

  // Predict-then-play: keyed by journey + step index. Each question asks about
  // the NEXT step (or, on the last step, the whole journey), so the current
  // step's explanation does not give the answer away. answer = option index.
  const PREDICTS = {
    'gemm:1': { q: 'C[3,7] 的输入载入何处，方可被反复复用？', options: ['保留于片外显存，每次现取', '载入 Shared Memory', '写回输出 C'], answer: 1, explain: '正确：载入 Shared Memory 后，多次乘加均自片上读取，无需每次访问片外显存。' },
    'gemm:3': { q: 'warp 内每个线程（lane）计算的对象为何？', options: ['整张矩阵', '各自的部分乘积', '最终的 C[3,7]'], answer: 1, explain: '正确：每个 lane 仅计算各自的部分乘积，累加后形成一个数值。' },
    'gemm:5': { q: '当前块计算完成后的后续步骤为何？', options: ['直接写回 C[3,7]，结束计算', '同步后载入下一块继续计算', '重新划分整张矩阵'], answer: 1, explain: '正确：同步确认全部搬运与计算完成后，载入下一块，直至累加完成方可写回。' },
    'pagetable:1': { q: 'TLB 未命中后的遍历起点为何？', options: ['直接访问内存取数据', '逐级查询页表', '更换虚拟地址重试'], answer: 1, explain: '正确：无缓存的翻译结果时，遍历自 PGD 开始逐级查询。' },
    'pagetable:5': { q: 'PTE 查询完成后，物理地址的构成方式为何？', options: ['PTE 本身即为物理地址', '物理页号 + 页内偏移', '虚拟地址 + TLB 大小'], answer: 1, explain: '正确：PTE 给出页号，页内偏移不变，两者组合为物理地址，并可回填 TLB。' },
    'pixel:2': { q: '光栅化阶段该像素属性的来源为何？', options: ['查阅现成的像素表', '顶点属性按重心权重插值', '着色器随机生成'], answer: 1, explain: '正确：attr = w0·v0 + w1·v1 + w2·v2；该像素为三角形内部插值所得的点。' },
    'pixel:5': { q: '深度缓冲中已写入更近像素时，更远的新像素如何处理？', options: ['覆盖旧像素', '被丢弃，不写入', '着色后擦除'], answer: 1, explain: '正确：深度测试在写入前丢弃被遮挡的像素，不存在先绘制后擦除的步骤。' },
    'stacking:1': { q: '同一颗芯片的低档版本中，图中被划掉的核处于何种状态？', options: ['物理上不存在', '存在但被关闭，不参与工作', '转为 GPU 继续工作'], answer: 1, explain: '正确：分档通常为同一颗芯片关闭一部分单元，而非重新设计一颗芯片。' },
    'stacking:4': { q: '混合键合层在上下两层逻辑之间的功能为何？', options: ['仅将两层粘合', '提供上下层之间的垂直信号连接', '仅为上层供电，与信号无关'], answer: 1, explain: '正确：键合层为信号沿垂直方向传输的通道；距离缩短为堆叠省距离的关键。' },
  };

  // Bottom timeline phases (text-economy rule: <=6 nodes, 1-2 words
  // each, gloss <=6 words on the selected node only). Each phase maps
  // to the first step of its span; clicking a phase jumps there. The
  // timeline IS the trace: no separate trace/log panel exists.
  const PHASES = {
    gemm: [
      { label: '选定', step: 0, gloss: '确定单个输出目标。' },
      { label: '依赖', step: 1, gloss: '仅依赖一行一列。' },
      { label: '分块', step: 2, gloss: '块负责输出 tile。' },
      { label: '载入', step: 3, gloss: '小块载入共享存储。' },
      { label: '计算', step: 4, gloss: '分工乘加并累加。' },
      { label: '写回', step: 7, gloss: '结果写回输出。' },
    ],
    pagetable: [
      { label: '发出', step: 0, gloss: 'CPU 发出虚拟地址。' },
      { label: 'TLB', step: 1, gloss: '翻译缓存未命中。' },
      { label: '查表', step: 2, gloss: '逐级查询至 PTE。' },
      { label: '访问', step: 6, gloss: '经缓存返回 CPU。' },
    ],
    pixel: [
      { label: '选定', step: 0, gloss: '确定目标像素。' },
      { label: '覆盖', step: 1, gloss: '命中覆盖三角形。' },
      { label: '插值', step: 2, gloss: '顶点属性重心插值。' },
      { label: '着色', step: 3, gloss: '着色与纹理采样。' },
      { label: '深度', step: 5, gloss: '遮挡丢弃判定。' },
      { label: '显示', step: 6, gloss: '写入帧缓冲并显示。' },
    ],
    stacking: [
      { label: '剖面', step: 0, gloss: '两层逻辑堆叠。' },
      { label: '分档', step: 1, gloss: '关闭单元即低档。' },
      { label: '分层', step: 2, gloss: '自上而下六层。' },
      { label: '连接', step: 3, gloss: '键合层垂直连接。' },
      { label: '内存', step: 5, gloss: '下层靠近内存层。' },
      { label: '代价', step: 6, gloss: '短距离与散热代价。' },
    ],
  };
  function currentPhase(state) {
    var phases = PHASES[state.journey] || [];
    var cur = phases[0] || null;
    phases.forEach(function (p) { if (p.step <= state.stepIndex) cur = p; });
    return cur;
  }

  const VIEWS = ['structure', 'work', 'data', 'timeline'];

  function createState(overrides) {
    const o = overrides || {};
    return {
      journey: JOURNEYS[o.journey] ? o.journey : 'gemm',
      model: MODELS[o.model] ? o.model : 'h100',
      view: VIEWS.indexOf(o.view) >= 0 ? o.view : 'structure',
      stepIndex: 0,
      selected: null,
      playing: false,
      predictions: {},
      compareModel: (o.compareModel && MODELS[o.compareModel] && o.compareModel !== (MODELS[o.model] ? o.model : 'h100')) ? o.compareModel : null,
    };
  }
  function getPredict(journey, stepIndex) { return PREDICTS[journey + ':' + stepIndex] || null; }
  function predict(state, choice) {
    const p = getPredict(state.journey, state.stepIndex);
    if (!p || choice < 0 || choice >= p.options.length) return null;
    const key = state.journey + ':' + state.stepIndex;
    state.predictions[key] = choice;
    return { correct: choice === p.answer, explain: p.explain };
  }
  function predictionMade(state) {
    return state.predictions[state.journey + ':' + state.stepIndex];
  }
  function currentJourney(state) { return JOURNEYS[state.journey]; }
  function currentStep(state) { return currentJourney(state).steps[state.stepIndex]; }
  function getStepNote(step, model) {
    // Per-model annotation; defaults to the shared step body.
    if (step.modelNotes && step.modelNotes[model]) return step.modelNotes[model];
    return step.body;
  }
  function setCompare(state, model) {
    if (!model) { state.compareModel = null; return state; }
    if (!MODELS[model] || model === state.model) return state;
    state.compareModel = model;
    return state;
  }
  function isAtStart(state) { return state.stepIndex === 0; }
  function isAtEnd(state) { return state.stepIndex === currentJourney(state).steps.length - 1; }
  function next(state) {
    if (!isAtEnd(state)) state.stepIndex += 1;
    else state.playing = false;
    return state;
  }
  function prev(state) { if (!isAtStart(state)) state.stepIndex -= 1; return state; }
  function goto(state, i) {
    var n = currentJourney(state).steps.length;
    state.stepIndex = Math.max(0, Math.min(n - 1, i));
    state.playing = false;
    return state;
  }
  function reset(state) { state.stepIndex = 0; state.playing = false; state.selected = null; state.predictions = {}; return state; }
  function setJourney(state, journey) {
    if (!JOURNEYS[journey]) return state;
    state.journey = journey; state.stepIndex = 0; state.playing = false; state.selected = null;
    return state;
  }
  function setModel(state, model) {
    if (MODELS[model]) {
      state.model = model;
      if (state.compareModel === model) state.compareModel = null;
    }
    return state;
  }
  function setView(state, view) {
    // View switch must preserve journey, model, step and selection.
    if (VIEWS.indexOf(view) >= 0) state.view = view;
    return state;
  }
  function select(state, nodeId) {
    const ok = currentJourney(state).nodes.some(function (n) { return n.id === nodeId; });
    if (ok) state.selected = nodeId;
    return state;
  }
  function playStep(state) {
    if (!state.playing) return state;
    if (isAtEnd(state)) { state.playing = false; return state; }
    return next(state);
  }
  function encodeState(state) {
    var parts = ['j=' + encodeURIComponent(state.journey), 'm=' + encodeURIComponent(state.model),
      'v=' + encodeURIComponent(state.view), 's=' + state.stepIndex,
      'sel=' + encodeURIComponent(state.selected || '')];
    if (state.compareModel) parts.push('cmp=' + encodeURIComponent(state.compareModel));
    return parts.join('&');
  }
  function decodeState(hash) {
    const out = createState({});
    if (!hash) return out;
    const q = hash.replace(/^#/, '');
    const params = new URLSearchParams(q);
    if (JOURNEYS[params.get('j')]) out.journey = params.get('j');
    if (MODELS[params.get('m')]) out.model = params.get('m');
    if (VIEWS.indexOf(params.get('v')) >= 0) out.view = params.get('v');
    const s = parseInt(params.get('s'), 10);
    if (!isNaN(s)) out.stepIndex = Math.max(0, Math.min(currentJourney(out).steps.length - 1, s));
    const sel = params.get('sel');
    if (sel) select(out, sel);
    const cmp = params.get('cmp');
    if (cmp) setCompare(out, cmp);
    return out;
  }

  const api = { MODELS, JOURNEYS, VIEWS, PREDICTS, PHASES, currentPhase, createState, currentJourney, currentStep, getStepNote, setCompare, isAtStart, isAtEnd, next, prev, goto, reset, setJourney, setModel, setView, select, playStep, encodeState, decodeState, getPredict, predict, predictionMade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerState = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
