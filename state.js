// GPU Explorer — pure teaching-model state machine.
// No DOM, no network, no GPU. Shared by the browser app and the Node tests.
// All hardware numbers below are teaching simplifications, not datasheets
// and not measured performance.
//
// Diagram geometry: each node has x/y/w/h in a 1100x520 SVG canvas.
// kind: 'data' (green), 'compute' (blue), 'memory' (amber), 'control' (slate).
// flows: static arrows for a journey; a step's `flows` lists the flow keys
// (from + '>' + to) that are live in that step.
(function (root) {
  const MODELS = {
    h100: { name: 'H100 (Hopper)', kind: 'GPU · 计算', note: '计算主线示例：SM、warp、shared memory、矩阵单元分工。' },
    a100: { name: 'A100 (Ampere)', kind: 'GPU · 计算', note: '与 H100 对照：同一矩阵任务，组织方式有何不同（教学示意）。' },
    rtx5090: { name: 'RTX 5090', kind: 'GPU · 消费级', note: '消费级示例：图形与计算共用同一套“结构—工作—数据”视角。' },
    mi300x: { name: 'AMD MI300X', kind: 'GPU · 芯粒/堆叠', note: '比较示例：多芯粒与堆叠组织，同一问题换一种分工（教学示意）。' },
    a20pro: { name: 'Apple A20 Pro（示意）', kind: 'SoC · CPU/内存', note: 'CPU/SoC 示例：重点在 CPU、页表与内存层级，具体规格为教学示意，非官方数据。' },
    snapdragon: { name: 'Snapdragon 移动 SoC（示意）', kind: 'SoC · CPU/内存', note: '移动 SoC 示例：与 A20 Pro 对照 CPU 与内存组织，具体规格为教学示意。' },
  };

  const JOURNEYS = {
    gemm: {
      title: '一次矩阵乘法：C[3,7] 是怎么算出来的',
      verdict: '结论先说：C[3,7] 只是一个数，它来自 A 的一行和 B 的一列。剩下的全部工作，都是在为这一次乘加把数据搬到正确的位置。',
      nodes: [
        { id: 'a-tile', label: 'A 的一行', kind: 'data', x: 20, y: 70, w: 220, h: 80, detail: '输入：A[3][:]。只用第 3 行，其他行这一步与 C[3,7] 无关。' },
        { id: 'b-tile', label: 'B 的一列', kind: 'data', x: 20, y: 330, w: 220, h: 80, detail: '输入：B[:][7]。只用第 7 列，其他列这一步与 C[3,7] 无关。' },
        { id: 'smem', label: 'Shared Memory', kind: 'memory', x: 320, y: 200, w: 220, h: 120, detail: '片上共享存储：A、B 小块搬到这里后可被多次复用，不必每次都去大显存。' },
        { id: 'warp', label: 'Warp / 线程', kind: 'compute', x: 620, y: 70, w: 200, h: 80, detail: '分工：一个 warp 里的线程各算一部分，同一条指令、不同数据。' },
        { id: 'sm', label: 'SM / 计算单元', kind: 'compute', x: 620, y: 330, w: 200, h: 120, detail: '执行：乘加并累加。矩阵单元也是在这里接手规整的乘加，不是凭空变快。' },
        { id: 'c-out', label: '输出 C[3,7]', kind: 'data', x: 900, y: 200, w: 180, h: 80, detail: '结果：累加完成后写回的唯一输出。倒查时从这里往回走。' },
      ],
      flows: [
        { from: 'a-tile', to: 'smem' }, { from: 'b-tile', to: 'smem' },
        { from: 'smem', to: 'warp' }, { from: 'warp', to: 'sm' },
        { from: 'sm', to: 'c-out' }, { from: 'smem', to: 'sm' },
      ],
      views: {
        structure: '结构视角：看部件、归属和连接。当前高亮的部件就是这一步的主角。',
        work: '工作视角：看工作怎么分组、谁在算、谁在等。',
        data: '数据视角：看数据在哪里、怎么搬、被谁复用。',
        timeline: '时间视角：看这一步在整个过程中的位置，前后各一步是什么。',
      },
      steps: [
        { title: '选定输出 C[3,7]', body: '先不算整张矩阵，只盯一个输出。问：它依赖哪些输入？', active: ['c-out'], flows: [], trace: 'C[3,7] ← 待查：它的输入尚未定位。', modelNotes: { h100: 'H100 视角：先把问题定成“一个输出”，再看组织：更大的计算阵列只是分工的载体，步骤本身不变。', a100: 'A100 视角：同样先定一个输出；组织方式不同，但“只算一个数、只依赖一行一列”这个起点不变。' }, code: ['// 目标：只算一个输出', 'C[3][7] = sum_k A[3][k] * B[k][7]'] },
        { title: '找到相关的 A 行与 B 列', body: 'C[3,7] 只依赖 A 的第 3 行和 B 的第 7 列，其他行列这一步都不用。', active: ['a-tile', 'b-tile'], flows: [], trace: 'C[3,7] ← A[3][:] 与 B[:][7]。', modelNotes: { h100: 'H100 视角：依赖关系不变——A 第 3 行、B 第 7 列；换型号不会让无关行列突然变得相关。', a100: 'A100 视角：同上。对比的意义在后面几步（搬运、分工、累加），不在依赖本身。' }, code: ['// 依赖', 'row = A[3][:]', 'col = B[:][7]'] },
        { title: '划分 tile 与 block', body: '把大矩阵切成小块，一个 block 负责一块输出，块内再分给线程。', active: ['sm'], flows: [], trace: '一个输出 tile ← 一个 block；块内再分给线程。', modelNotes: { h100: 'H100 视角：tile 划分是组织选择：块越大，一次搬运能复用的数据越多，但同步与等待的代价也要一起看。', a100: 'A100 视角：同样的 tile 思路，块内分工的粒度不同；先理解“块负责一块输出”，再谈哪种组织更划算。' }, code: ['// 划分（教学示意）', 'tile = 16 x 16', 'block -> 一个输出 tile'] },
        { title: '把数据搬进 Shared Memory', body: '先把要反复用的 A、B 小块搬到片上共享存储，后面多次计算不用每次都去大显存。', active: ['smem', 'a-tile', 'b-tile'], flows: ['a-tile>smem', 'b-tile>smem'], trace: 'smem ← A tile + B tile；下一步复用，不再回大显存。', modelNotes: { h100: 'H100 视角：片上共享存储是复用的关键：A、B 小块搬进来一次，后续乘加反复读它，而不是每次回大显存。', a100: 'A100 视角：Shared Memory 的角色相同：搬进来、复用、同步；区别在容量与分工细节，不在“要不要搬”这一步。' }, code: ['// 搬运', 'smem_A = load(A tile)', 'smem_B = load(B tile)', '__syncthreads() // 等大家都搬完'] },
        { title: 'Warp 分工', body: '一个 warp 里的线程各算一部分，同一条指令、不同数据。注意：是分工，不是每个线程各算一张矩阵。', active: ['warp'], flows: ['smem>warp'], trace: 'warp 各 lane ← smem_A[lane] × smem_B[lane]。', modelNotes: { h100: 'H100 视角：warp 分工不变：同一条指令、不同数据，每个 lane 算自己的一份 partial。', a100: 'A100 视角：warp 同样按线程组分工（教学示意按 warp 讲）；每个 lane 只算一份，累加在后面。' }, code: ['// warp 内分工', 'lane = threadIdx.x % 32', 'partial = smem_A[lane] * smem_B[lane]'] },
        { title: '在 SM 上乘加', body: '计算单元做乘加并累加。矩阵专用单元（如果模型里有）也是在这个位置接手规整的乘加，而不是凭空变快。', active: ['sm', 'warp'], flows: ['warp>sm'], trace: 'acc ← acc + partial（在 SM 上累加）。', modelNotes: { h100: 'H100 视角：SM 上的乘加可以交给规整的矩阵单元接手——它仍是乘加，不是“跳过计算”。', a100: 'A100 视角：SM 同样做乘加累加；矩阵单元的存在与否改变的是这一步的组织，不是结果的定义。' }, code: ['// 累加', 'acc += partial'] },
        { title: '同步与下一块', body: '算完一块要同步，再搬下一块。等待不是空闲的借口：它在等数据就位。', active: ['smem', 'sm'], flows: ['smem>sm'], trace: '下一块 tile ← smem 同步后重新搬运。', modelNotes: { h100: 'H100 视角：同步仍是瓶颈意识的来源：算得快不等于等得少，下一块没搬完就得等。', a100: 'A100 视角：同上：同步后搬下一块，重复直到累加完成；等待是过程的一部分，不是故障。' }, code: ['// 同步后继续', '__syncthreads()', '// 搬下一块 tile，重复'] },
        { title: '写回 C[3,7]', body: '累加完成，把结果写回输出。倒查一遍：这个数来自哪一行、哪一列、哪几次搬运。', active: ['c-out'], flows: ['sm>c-out'], trace: 'C[3,7] ← acc；倒查：A 行、B 列、smem 搬运、warp 分工。', modelNotes: { h100: 'H100 视角：写回只写 C[3,7] 一个数；倒查时组织差异已不重要，重要的是行、列、搬运、分工这条链。', a100: 'A100 视角：同上：结果相同，路径的组织不同——这正是对比要教的东西：结果一样，代价与分工可以不一样。' }, code: ['// 写回', 'C[3][7] = acc'] },
      ],
    },
    pagetable: {
      title: 'CPU 取一个地址：页表是怎么查的',
      verdict: '结论先说：程序看到的虚拟地址不是真实位置。TLB 命中就一步到位，未命中才要一级一级查页表，本例故意走未命中，好把全过程走一遍。',
      nodes: [
        { id: 'cpu', label: 'CPU 核', kind: 'compute', x: 20, y: 80, w: 170, h: 80, detail: '发出虚拟地址 va，并等翻译结果。程序只认识虚拟地址。' },
        { id: 'tlb', label: 'TLB（快表）', kind: 'memory', x: 230, y: 80, w: 170, h: 80, detail: '翻译结果的缓存。命中：直接得物理地址；未命中：走完整页表。' },
        { id: 'pgd', label: 'PGD', kind: 'control', x: 440, y: 80, w: 170, h: 80, detail: '第 1 级页表：用虚拟地址高位索引，得到下一级地址。' },
        { id: 'pud', label: 'PUD', kind: 'control', x: 650, y: 80, w: 170, h: 80, detail: '第 2 级页表：上一级给出基址，再用下一段地址索引。' },
        { id: 'pmd', label: 'PMD', kind: 'control', x: 860, y: 80, w: 170, h: 80, detail: '第 3 级页表：继续缩小范围，不是一次跳到答案。' },
        { id: 'pte', label: 'PTE → 物理页', kind: 'control', x: 860, y: 260, w: 170, h: 80, detail: '第 4 级页表：给出物理页号，加上页内偏移就是物理地址，并可回填 TLB。' },
        { id: 'ram', label: '内存', kind: 'data', x: 650, y: 260, w: 170, h: 80, detail: '物理地址真正指向的存储。页表、缓存、内存是三件不同的事。' },
        { id: 'cache', label: '缓存', kind: 'memory', x: 440, y: 260, w: 170, h: 80, detail: '数据经过的缓存层级：命中就不用每次都去内存。' },
      ],
      flows: [
        { from: 'cpu', to: 'tlb' }, { from: 'tlb', to: 'pgd' },
        { from: 'pgd', to: 'pud' }, { from: 'pud', to: 'pmd' },
        { from: 'pmd', to: 'pte' }, { from: 'pte', to: 'ram' },
        { from: 'ram', to: 'cache' }, { from: 'cache', to: 'cpu', route: 'return' },
      ],
      views: {
        structure: '结构视角：CPU、TLB、页表各级、内存与缓存的位置关系。',
        work: '工作视角：一次地址翻译要经过哪几步、哪一步可能命中或 miss。',
        data: '数据视角：虚拟地址怎样一级一级翻译成物理地址。',
        timeline: '时间视角：这一步在翻译全过程中的位置。',
      },
      steps: [
        { title: 'CPU 发出虚拟地址', body: '程序看到的是虚拟地址，不是内存里的真实位置。先问：翻译从哪里开始？', active: ['cpu'], flows: [], trace: 'va = 0x0000_7f00_1234（教学示意）→ 待翻译。', code: ['// 虚拟地址（教学示意）', 'va = 0x0000_7f00_1234'] },
        { title: '先查 TLB', body: 'TLB 是翻译结果的缓存。命中就直接得到物理地址，不用一级一级查；这里故意走未命中，好把全过程走一遍。', active: ['tlb'], flows: ['cpu>tlb'], trace: 'TLB(va) → MISS；只能继续查页表。', code: ['// TLB', 'lookup(va) -> MISS  // 本例走全过程'] },
        { title: '查 PGD', body: '用虚拟地址的高位索引第一级页表，得到下一级的地址。', active: ['pgd'], flows: ['tlb>pgd'], trace: 'PGD[va >> 39] → 下一级页表地址。', code: ['// 第 1 级', 'pgd_entry = PGD[va >> 39]'] },
        { title: '查 PUD', body: '上一级给出下一级页表的基址，再用下一段地址索引。', active: ['pud'], flows: ['pgd>pud'], trace: 'PUD[va >> 30] → 下一级页表地址。', code: ['// 第 2 级', 'pud_entry = PUD[va >> 30]'] },
        { title: '查 PMD', body: '继续向下走。每一级都在缩小范围，而不是一次跳到答案。', active: ['pmd'], flows: ['pud>pmd'], trace: 'PMD[va >> 21] → 下一级页表地址。', code: ['// 第 3 级', 'pmd_entry = PMD[va >> 21]'] },
        { title: '查 PTE，得到物理页', body: '最后一级给出物理页号，加上页内偏移，就是物理地址。同时可以把这次翻译填回 TLB。', active: ['pte', 'tlb'], flows: ['pmd>pte'], trace: 'phys_addr = PTE[va >> 12] 的页号 + 页内偏移；同时回填 TLB。', code: ['// 第 4 级', 'phys_page = PTE[va >> 12]', 'phys_addr = phys_page + offset'] },
        { title: '访问内存 / 装入缓存', body: '拿到物理地址后访问内存，数据经过缓存层级回到 CPU。页表、缓存、内存是三件不同的事，别混成一个“内存”。', active: ['ram', 'cache', 'cpu'], flows: ['pte>ram', 'ram>cache', 'cache>cpu'], trace: 'data = memory[phys_addr] → 经缓存 → CPU。', code: ['// 访问', 'data = memory[phys_addr]', '// 并经过缓存'] },
      ],
    },
    pixel: {
      title: '一个像素是怎么画出来的',
      verdict: '结论先说：一个像素的颜色不是整张图算一次，而是三角形、插值、着色、纹理、深度测试一步步算出来，通过测试才写入帧缓冲。',
      nodes: [
        { id: 'tri', label: '三角形', kind: 'data', x: 20, y: 80, w: 170, h: 80, detail: '几何：哪一个三角形覆盖了这个像素的中心？没覆盖的与它无关。' },
        { id: 'raster', label: '光栅化', kind: 'compute', x: 230, y: 80, w: 170, h: 80, detail: '插值：用重心插值把顶点属性按比例分到这个像素。' },
        { id: 'shader', label: '片元着色', kind: 'compute', x: 440, y: 80, w: 170, h: 80, detail: '着色：对这个像素跑一次着色器，算出它自己的颜色。' },
        { id: 'tex', label: '纹理', kind: 'memory', x: 440, y: 260, w: 170, h: 80, detail: '查表：用插值出的纹理坐标采样，得到纹理颜色。' },
        { id: 'depth', label: '深度测试', kind: 'control', x: 650, y: 80, w: 170, h: 80, detail: '遮挡：更远就丢弃，更近才继续；遮挡在这里决定。' },
        { id: 'fb', label: '帧缓冲', kind: 'memory', x: 860, y: 80, w: 170, h: 80, detail: '暂存：通过测试的像素写入这里，它还不是屏幕本身。' },
        { id: 'pixel', label: '目标像素', kind: 'data', x: 860, y: 260, w: 170, h: 80, detail: '显示：帧缓冲送上屏幕，这个像素亮起来。' },
      ],
      flows: [
        { from: 'tri', to: 'raster' }, { from: 'raster', to: 'shader' },
        { from: 'shader', to: 'tex' }, { from: 'tex', to: 'shader' },
        { from: 'shader', to: 'depth' }, { from: 'depth', to: 'fb' },
        { from: 'fb', to: 'pixel' },
      ],
      views: {
        structure: '结构视角：屏幕像素、三角形、光栅化、着色、纹理、深度与帧缓冲的位置关系。',
        work: '工作视角：一个像素要经过哪几步、哪一步可能被丢弃。',
        data: '数据视角：顶点属性怎样插值成像素数据，颜色怎样一步步算出来。',
        timeline: '时间视角：这一步在画一个像素的全过程中的位置。',
      },
      steps: [
        { title: '盯住一个像素', body: '先不看整张图，只盯屏幕上一个像素。问：它最后的颜色来自哪里？', active: ['pixel'], flows: [], trace: 'pixel = screen[x][y]（目标，未算出）。', code: ['// 目标：只追一个像素', 'pixel = screen[x][y]'] },
        { title: '找到覆盖它的三角形', body: '几何阶段给出三角形，问：哪一个三角形覆盖了这个像素的中心？没被覆盖的三角形，这一步就和这个像素无关。', active: ['tri', 'pixel'], flows: ['tri>raster'], trace: '覆盖判断 → 命中一个三角形，才继续。', code: ['// 覆盖判断（教学示意）', 'covers = triangle_contains(tri, pixel)'] },
        { title: '光栅化：算出插值', body: '用重心插值把顶点属性（位置、颜色、纹理坐标）按比例分到这个像素。像素不是凭空来的，它是三角形内部插出来的一个点。', active: ['raster', 'tri'], flows: ['tri>raster', 'raster>shader'], trace: 'attr = w0·v0 + w1·v1 + w2·v2（插值）。', code: ['// 插值（教学示意）', 'attr = w0 * v0 + w1 * v1 + w2 * v2'] },
        { title: '片元着色：算颜色', body: '片元着色器对这个像素跑一次，算出它自己的颜色。注意：是每个像素各算一次，不是整张图算一次。', active: ['shader'], flows: ['raster>shader'], trace: 'color = shade(interpolated_attr)。', code: ['// 片元着色', 'color = shade(interpolated_attr)'] },
        { title: '纹理采样', body: '如果材质有纹理，用插值出的纹理坐标去采样，得到纹理颜色，再与光照结果结合。纹理是一张查表，不是凭空画上去的图案。', active: ['tex', 'shader'], flows: ['shader>tex', 'tex>shader'], trace: 'tex_color = texture(uv)；color *= tex_color。', code: ['// 采样', 'tex_color = texture(uv)', 'color *= tex_color'] },
        { title: '深度测试：被挡住就丢弃', body: '比较这个像素的深度和已写入的深度：更远就被挡住，直接丢弃，不写入；更近才继续。遮挡是在这里决定的，不是在着色之后“擦掉”。', active: ['depth', 'pixel'], flows: ['shader>depth'], trace: 'z < depth_buffer[x][y] ？继续 : 丢弃。', code: ['// 深度测试', 'if (z < depth_buffer[x][y]) keep(); else discard();'] },
        { title: '写入帧缓冲', body: '通过测试的像素才写入帧缓冲。帧缓冲就是“下一帧要显示的那张图”的暂存处，还不是屏幕本身。', active: ['fb'], flows: ['depth>fb'], trace: 'framebuffer[x][y] = color；depth_buffer[x][y] = z。', code: ['// 写入', 'framebuffer[x][y] = color', 'depth_buffer[x][y] = z'] },
        { title: '显示与倒查', body: '帧缓冲送上屏幕，这个像素亮起来。倒查一遍：它来自哪个三角形、哪次插值、哪次采样、哪次深度比较。', active: ['fb', 'pixel'], flows: ['fb>pixel'], trace: 'screen[x][y] ← framebuffer[x][y]；倒查三角形→插值→采样→深度。', code: ['// 显示', 'screen[x][y] = framebuffer[x][y]'] },
      ],
    },
    stacking: {
      title: '芯片怎么叠起来：逻辑折叠剖面',
      verdict: '结论先说：所谓“折叠”，不是把芯片对折，而是把两层逻辑上下叠起来，用很短的垂直连接代替很长的横向连线。省距离是收益，散热和制造难度是代价——两者都要画出来。',
      nodes: [
        { id: 'lid', label: '散热盖', kind: 'control', x: 250, y: 30, w: 600, h: 50, detail: '最上面：把热量导出去。叠得越密，热越难从中间出去。' },
        { id: 'logic-top', label: '上层逻辑 · 超大核', kind: 'compute', x: 250, y: 100, w: 600, h: 90, detail: '上层逻辑（教学示意）：超大核在上面，离散热盖最近，也离下层最近。' },
        { id: 'bond', label: '混合键合层', kind: 'control', x: 250, y: 210, w: 600, h: 40, detail: '上下层的垂直连接层：信号从这里上下走，而不是绕远路横向走。' },
        { id: 'logic-low', label: '下层逻辑 · 大核 + 小核', kind: 'compute', x: 250, y: 270, w: 600, h: 90, detail: '下层逻辑（教学示意）：大核与小核分工，靠近内存层。' },
        { id: 'mem-layer', label: '内存 / 缓存层', kind: 'memory', x: 250, y: 380, w: 600, h: 70, detail: '内存与缓存层：数据离计算越近，等待越少（教学示意，非实测）。' },
        { id: 'substrate', label: '基板', kind: 'data', x: 250, y: 470, w: 600, h: 40, detail: '最下面：承载整颗芯片，并把信号引到封装外面。' },
        { id: 'cut-core', label: '被划掉的核', kind: 'compute', x: 880, y: 100, w: 180, h: 90, disabled: true, detail: '分档示例：同一颗芯片的低档版本里，这个核存在但被关闭，不参与工作。' },
        { id: 'gpu-block', label: 'GPU 块', kind: 'compute', x: 880, y: 270, w: 180, h: 90, detail: '图形计算块：与 CPU 逻辑并排在同一颗芯片里，分工不同。' },
      ],
      flows: [
        { from: 'logic-top', to: 'bond' }, { from: 'bond', to: 'logic-low' },
        { from: 'logic-low', to: 'mem-layer' }, { from: 'mem-layer', to: 'substrate' },
        { from: 'gpu-block', to: 'logic-low' },
      ],
      views: {
        structure: '结构视角：从上到下看剖面：散热盖、两层逻辑、键合层、内存层、基板。',
        work: '工作视角：信号怎样垂直穿过各层，哪里可能排队、哪里发热。',
        data: '数据视角：数据离计算有多近，垂直距离为什么比横向短。',
        timeline: '时间视角：这一步在“切开—分层—连通—算代价”全过程中的位置。',
      },
      steps: [
        { title: '盯住一颗叠起来的芯片', body: '先不看参数表，只看剖面：这颗芯片不是平铺的一层，而是上下两层逻辑叠在一起。问：叠，到底省了什么？', active: ['lid', 'logic-top'], flows: [], trace: '问题：叠起来省了什么，又付了什么代价？', code: ['// 剖面（教学示意）', 'chip = [lid, logic_top, bond, logic_low, mem, substrate]'] },
        { title: '先看全家分档', body: '同一颗芯片可以分出高低档：低档不是重新设计，而是把一部分核或 GPU 块关闭。图中被划掉的核就是这个意思——存在，但不工作。', active: ['cut-core', 'logic-top'], flows: [], trace: '低档 ← 同一颗芯片 − 被关闭的单元。', code: ['// 分档（教学示意）', 'high_tier = all_units_on', 'low_tier = all_units_on - cut_core'] },
        { title: '切开看剖面', body: '从上往下数：散热盖、上层逻辑、键合层、下层逻辑、内存层、基板。每一层都有自己的职责，不能把它们说成一个“芯片”。', active: ['lid', 'bond', 'substrate'], flows: [], trace: '剖面（自上而下）：盖 → 上层 → 键合 → 下层 → 内存 → 基板。', code: ['// 自上而下', 'layers = [lid, logic_top, bond, logic_low, mem, substrate]'] },
        { title: '上层逻辑：超大核在上面', body: '上层放最重的超大核，离散热盖近，也离下层近。位置本身就是设计选择：放哪里，决定了它离谁近、离热多远。', active: ['logic-top'], flows: ['logic-top>bond'], trace: '超大核 → 键合层（垂直向下，下一步）。', code: ['// 上层', 'super_core -> bond_layer'] },
        { title: '混合键合：上下层怎么连', body: '键合层是上下层之间的垂直通道。信号从这里穿过去，距离很短；如果绕到芯片边缘再横向走，距离就长得多。这是堆叠的核心收益，仍是教学示意，不是实测距离。', active: ['bond'], flows: ['bond>logic-low'], trace: '信号：上层 → 键合层（垂直）→ 下层。', code: ['// 垂直连接', 'signal = top_logic -[bond]-> low_logic'] },
        { title: '下层逻辑与内存', body: '下层逻辑靠近内存层，数据不用跑远就能拿到。离计算越近的存储，等待通常越少——但这不等于“无限快”，带宽和容量仍是限制。', active: ['logic-low', 'mem-layer'], flows: ['logic-low>mem-layer'], trace: '下层逻辑 ↔ 内存层：近，但仍受带宽与容量限制。', code: ['// 就近取数', 'data = mem_layer[near(low_logic)]'] },
        { title: '信号走多远：垂直 vs 横向', body: '同样两个单元，平铺时信号要横向穿过整颗芯片；叠起来时只要垂直穿过一层键合。短，不是因为“新技术魔法”，而是几何上就是更近。', active: ['bond', 'mem-layer'], flows: ['mem-layer>substrate'], trace: '垂直路径 ≪ 横向绕行路径（几何示意，非实测数值）。', code: ['// 距离对比（教学示意）', 'vertical = one_bond_layer', 'horizontal = across_the_die'] },
        { title: '热与代价：叠起来不是免费的', body: '倒查一遍：收益是距离短、集成密；代价是中间层的热难散出去，制造与测试也更难。只讲收益不讲代价的堆叠讲解，是不完整的。', active: ['lid', 'logic-top'], flows: [], trace: '收益：短距离、高集成；代价：散热难、制造与测试难。', code: ['// 权衡', 'benefit = short_vertical_path', 'cost = heat + yield + test'] },
      ],
    },
  };

  // Predict-then-play: keyed by journey + step index. Each question asks about
  // the NEXT step (or, on the last step, the whole journey), so the current
  // step's explanation does not give the answer away. answer = option index.
  const PREDICTS = {
    'gemm:1': { q: '下一步：C[3,7] 的输入被搬到哪里，才会被反复复用？', options: ['直接留在大显存，每次现取', '搬进 Shared Memory', '写回输出 C'], answer: 1, explain: '对：搬进 Shared Memory 后，多次乘加都从片上读，不必每次回大显存。' },
    'gemm:3': { q: '下一步：warp 里每个线程（lane）算的是什么？', options: ['整张矩阵', '自己那一份的部分乘积', '最终的 C[3,7]'], answer: 1, explain: '对：每个 lane 只算自己的一份 partial，最后才累加成一个数。' },
    'gemm:5': { q: '下一步：算完一块之后会发生什么？', options: ['直接写回 C[3,7]，结束', '同步，然后搬下一块继续算', '重新划分整张矩阵'], answer: 1, explain: '对：同步保证大家都搬完/算完，再搬下一块，直到累加完成才写回。' },
    'pagetable:1': { q: 'TLB 未命中，下一步去哪里？', options: ['直接去内存取数据', '一级一级查页表', '换一个虚拟地址重试'], answer: 1, explain: '对：没有缓存的翻译结果，就只能从 PGD 开始一级一级查。' },
    'pagetable:5': { q: '查到 PTE 后，物理地址是怎么拼出来的？', options: ['PTE 直接就是物理地址', '物理页号 + 页内偏移', '虚拟地址 + TLB 大小'], answer: 1, explain: '对：PTE 给页号，页内偏移不变，两者拼成物理地址，并可回填 TLB。' },
    'pixel:2': { q: '下一步：光栅化给这个像素的属性是怎么来的？', options: ['查一张现成的像素表', '顶点属性按重心权重插值', '着色器随机生成'], answer: 1, explain: '对：attr = w0·v0 + w1·v1 + w2·v2，像素是三角形内部插出来的点。' },
    'pixel:5': { q: '一个更远的像素已经写在深度缓冲里，新像素更远时会被怎样？', options: ['覆盖旧像素', '被丢弃，不写入', '先着色再擦掉'], answer: 1, explain: '对：深度测试在写入前就丢弃被挡住的像素，不会先画再擦。' },
    'stacking:1': { q: '同一颗芯片的低档版本，图中被划掉的核会怎样？', options: ['物理上不存在', '存在但被关闭，不参与工作', '变成 GPU 继续工作'], answer: 1, explain: '对：分档常常是同一颗芯片关闭一部分单元，而不是重新设计一颗。' },
    'stacking:4': { q: '上下两层逻辑之间，混合键合层的作用是什么？', options: ['只是把两层粘在一起', '提供上下层之间的垂直信号连接', '给上层供电，与信号无关'], answer: 1, explain: '对：键合层是信号走垂直方向的通道，短，才是堆叠省距离的关键。' },
  };

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

  const api = { MODELS, JOURNEYS, VIEWS, PREDICTS, createState, currentJourney, currentStep, getStepNote, setCompare, isAtStart, isAtEnd, next, prev, goto, reset, setJourney, setModel, setView, select, playStep, encodeState, decodeState, getPredict, predict, predictionMade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerState = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
