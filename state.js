// GPU Explorer: walkthrough content and the pure domain state machine.
// No DOM, no WebGL. Shared by the browser app and the Node tests.
// Every user-facing string is {zh, en}. Numbers and formulas are shared.
// Each step names the hardware level it happens on (`level`) and how far the
// package is taken apart (`explode`), so every walkthrough plays on the same
// 3D model as the anatomy view.
(function (root) {
  const L = (zh, en) => ({ zh, en });
  const code = (zh, en) => ({ zh, en });

  const MODELS = {
    h100: { name: 'H100 SXM 80GB', arch: 'Hopper', note: L('H100 SXM 80GB（GH100）：8 个 GPC、132 SM、50MB L2、80GB HBM3，5 组 HBM 启用。', 'H100 SXM 80GB (GH100): 8 GPCs, 132 SMs, 50MB L2, 80GB HBM3 across five active stacks.') },
    a100: { name: 'A100 SXM 80GB', arch: 'Ampere', note: L('A100 SXM 80GB（GA100）：7 个 GPC、108 SM、40MB L2、80GB HBM2e，5 组 HBM 启用。', 'A100 SXM 80GB (GA100): 7 GPCs, 108 SMs, 40MB L2, 80GB HBM2e across five active stacks.') }
  };

  // The GPU virtual address used by the address-translation walkthrough.
  // Index widths follow the Hopper GMMU format (57-bit VA) published in
  // NVIDIA's open-gpu-kernel-modules, kern_gmmu_fmt_gh10x.c.
  const ADDRESS = { va: '0x7f3ac2d64a40', fields: [
    { id: 'pd4', bits: '56', width: 1, index: 0 },
    { id: 'pd3', bits: '55:47', width: 9, index: 0 },
    { id: 'pd2', bits: '46:38', width: 9, index: 508 },
    { id: 'pd1', bits: '37:29', width: 9, index: 470 },
    { id: 'pd0', bits: '28:21', width: 8, index: 22 },
    { id: 'offset', bits: '20:0', width: 21, index: 0x164a40 }
  ], pageBase: '0x24e000000', physical: '0x24e164a40', pageSize: '2 MiB' };

  const JOURNEYS = {
    gemm: {
      title: L('一次矩阵乘法', 'One matrix multiply'),
      subtitle: L('从 A、B 算出 C[3,7]', 'From A and B to C[3,7]'),
      scope: L('数值例子用 8×8 的小矩阵，好让每一步都能数清楚。', 'The worked example uses small 8×8 matrices so every step can be counted.'),
      nodes: [
        { id: 'a-tile', label: L('A 的一行', 'Row of A'), detail: L('A[3,:]，C[3,7] 只用到这一行。', 'A[3,:], the only row C[3,7] needs.') },
        { id: 'b-tile', label: L('B 的一列', 'Column of B'), detail: L('B[:,7]，C[3,7] 只用到这一列。', 'B[:,7], the only column C[3,7] needs.') },
        { id: 'smem', label: L('共享内存', 'Shared memory'), detail: L('SM 里的片上存储。A、B 小块搬进来后可以反复读取。', 'On-chip storage in the SM. Tiles of A and B are read from here many times.') },
        { id: 'warp', label: L('Warp', 'Warp'), detail: L('32 个线程一组，执行同一条指令，处理不同数据。', 'A group of 32 threads that run the same instruction on different data.') },
        { id: 'sm', label: L('SM', 'SM'), detail: L('执行乘加的地方，有 4 个子分区。', 'Where the multiply-adds run. It has four partitions.') },
        { id: 'c-out', label: L('C[3,7]', 'C[3,7]'), detail: L('要算的那个输出。', 'The one output being computed.') }
      ],
      steps: [
        { id: 'target', level: 'board', kind: 'target', chip: { label: L('选定', 'Target'), gloss: L('只看一个输出', 'Follow one output') },
          title: L('先盯住一个结果：C[3,7]', 'Pick one result: C[3,7]'),
          body: L('整个矩阵乘法太大，先只看一个输出。C[3,7] 等于 A 的第 3 行和 B 的第 7 列逐项相乘再相加，下标从 0 开始。', 'The whole multiply is too big to follow, so watch one output. C[3,7] is row 3 of A times column 7 of B, multiplied term by term and summed. Indices start at 0.'),
          hardware: L('A、B、C 都存在 HBM 里，也就是 GPU 的显存。模组上标出的三处就是它们。', 'A, B and C are all stored in HBM, the GPU’s memory. The three marked spots on the module are where they sit.'),
          terms: ['hbm'],
          trace: 'C[3,7] = Σ A[3,k] · B[k,7]',
          code: code(['// 目标：只算一个输出', 'C[3][7] = sum_k A[3][k] * B[k][7]'], ['// Goal: compute one output', 'C[3][7] = sum_k A[3][k] * B[k][7]']) },
        { id: 'dependency', level: 'hbm', kind: 'dependency', chip: { label: L('依赖', 'Inputs'), gloss: L('一行和一列', 'One row, one column') },
          title: L('一行乘一列', 'One row times one column'),
          body: L('把 A 的第 3 行和 B 的第 7 列按 k 对齐，每对相乘，8 个乘积加起来就是 C[3,7]。', 'Line up row 3 of A with column 7 of B by k, multiply each pair, and add the eight products. That sum is C[3,7].'),
          hardware: L('这一步还没有搬任何数据，两个输入都在 HBM 里。虚线只表示依赖。', 'No data has moved yet; both inputs are still in HBM. Dashed lines only show the dependency.'),
          terms: [],
          trace: 'C[3,7] ← A[3,:] · B[:,7]',
          code: code(['// 只依赖一行和一列', 'row = A[3][:]', 'col = B[:][7]'], ['// Depends on one row and one column', 'row = A[3][:]', 'col = B[:][7]']) },
        { id: 'tiles', level: 'die', kind: 'placement', chip: { label: L('分块', 'Tiles'), gloss: L('输出块交给 SM', 'Tiles go to SMs') },
          title: L('把输出切成块，分给 SM', 'Cut the output into tiles for the SMs'),
          body: L('输出按 2 行 × 4 列切成块，每块交给一个线程块（CTA）去算。8 对数也分两轮，每轮 4 对。C[3,7] 在 CTA 3 这一块里。', 'The output is cut into tiles of 2 rows × 4 columns, and each tile goes to one thread block (CTA). The eight pairs are split into two rounds of four. C[3,7] is in CTA 3’s tile.'),
          hardware: L('一个 CTA 只在一个 SM 上运行。真实程序里的块大得多，这里缩小是为了数得清。', 'A CTA runs on exactly one SM. Real kernels use much larger tiles; these are shrunk so you can count them.'),
          terms: ['sm', 'cta'],
          trace: 'tile C[2:4, 4:8] → CTA 3 → SM',
          code: code(['// 一个 CTA 负责一个输出块', 'cta = (row / 2, col / 4)   // C[3,7] → CTA 3', 'for k0 in (0, 4):          // 分两轮'], ['// One CTA owns one output tile', 'cta = (row / 2, col / 4)   // C[3,7] → CTA 3', 'for k0 in (0, 4):          // two rounds']) },
        { id: 'load', level: 'package', kind: 'transfer', chip: { label: L('载入', 'Load'), gloss: L('搬进共享内存', 'Into shared memory') },
          title: L('第 1 轮的数据搬进共享内存', 'Round 1’s data moves into shared memory'),
          body: L('第 1 轮要用的那一小块 A 和 B（这 4 对数就在里面）从 HBM 出发，经中介层进 GPU，穿过 L2 缓存，落到 SM 的共享内存。', 'The small blocks of A and B that round 1 needs, which contain these four pairs, leave HBM, cross the interposer into the GPU, pass through the L2 cache and land in the SM’s shared memory.'),
          hardware: L('共享内存就在 SM 里，后面的乘法从这里读，不用每次回 HBM。L2 在裸片上，由所有 SM 共用。H100 用 TMA 做这次搬运，A100 用异步拷贝。', 'Shared memory is inside the SM, so the multiplies read from there instead of going back to HBM each time. L2 is on the die and shared by every SM. H100 uses its TMA for this copy; A100 uses asynchronous copy.'),
          terms: ['smem', 'l2', 'interposer'],
          trace: 'smem ← A[2:4, 0:4], B[0:4, 4:8]',
          code: code(['// 第 1 轮：k = 0..3', 'smem_A = A[2:4, 0:4]', 'smem_B = B[0:4, 4:8]', '__syncthreads()   // 等搬运完成'], ['// Round 1: k = 0..3', 'smem_A = A[2:4, 0:4]', 'smem_B = B[0:4, 4:8]', '__syncthreads()   // wait for the copy']) },
        { id: 'warp', level: 'sm', kind: 'control', chip: { label: L('分工', 'Warp'), gloss: L('32 个线程一起', '32 threads together') },
          title: L('32 个线程一起干活', '32 threads work as one warp'),
          body: L('一个 warp 是 32 个线程，执行同一条指令。调度器挑出就绪的 warp 发出指令，线程把第 1 轮的数据从共享内存读进寄存器。', 'A warp is 32 threads that run the same instruction. The scheduler picks a ready warp and issues its instruction, and the threads read round 1’s data from shared memory into registers.'),
          hardware: L('灰色是指令，从调度器到派发单元。青色和橙色是数据，从共享内存经 LD/ST 单元进寄存器。两条路不重合。', 'Grey is the instruction, from the scheduler to dispatch. Teal and orange are data, from shared memory through the LD/ST unit into registers. The two paths are separate.'),
          terms: ['warp', 'ldst', 'register'],
          trace: 'warp = 32 threads; Cfrag += Afrag · Bfrag',
          code: code(['// 一个 warp 一起执行矩阵指令', 'lane = threadIdx.x % 32', 'a_frag, b_frag = load(smem)', 'c_frag = mma(a_frag, b_frag, c_frag)'], ['// The warp runs the matrix instruction together', 'lane = threadIdx.x % 32', 'a_frag, b_frag = load(smem)', 'c_frag = mma(a_frag, b_frag, c_frag)']) },
        { id: 'mma', level: 'sm', kind: 'compute', chip: { label: L('乘加', 'Multiply'), gloss: L('0 变成 19', '0 becomes 19') },
          title: L('乘起来，加进累加器', 'Multiply and accumulate'),
          body: L('第 1 轮的 4 个乘积是 2、3、6、8，累加器从 0 变成 19。', 'Round 1’s four products are 2, 3, 6 and 8. The accumulator goes from 0 to 19.'),
          hardware: L('Tensor Core 对矩阵片段做乘加，结果留在寄存器里。这里把它展开成逐项相加，方便核对。', 'The Tensor Core multiplies and adds matrix fragments and keeps the result in registers. Here it is unrolled into scalar additions so you can check it.'),
          terms: ['tensorcore'],
          trace: 'acc = 2 + 3 + 6 + 8 = 19',
          code: code(['// 逐项核对（真实硬件一次算一个矩阵片段）', 'acc = 0', 'for k in range(0, 4):', '    acc += A[3][k] * B[k][7]', '# acc = 19'], ['// Scalar check (hardware does a whole fragment)', 'acc = 0', 'for k in range(0, 4):', '    acc += A[3][k] * B[k][7]', '# acc = 19']) },
        { id: 'next-tile', level: 'sm', kind: 'reuse', chip: { label: L('第 2 轮', 'Round 2'), gloss: L('19 加到 37', '19 grows to 37') },
          title: L('第 2 轮：换一批数据，接着加', 'Round 2: load new data and keep adding'),
          body: L('19 留在累加器里。第 2 轮的 4 对数走一遍同样的路，乘积是 4、2、6、6，加完是 37。', '19 stays in the accumulator. Round 2’s four pairs take the same route. Their products are 4, 2, 6 and 6, which brings the sum to 37.'),
          hardware: L('共享内存里的旧数据要等所有线程都用完才能覆盖。调优过的程序会准备两块缓冲，让搬运和计算同时进行。', 'Shared memory can’t be overwritten until every thread is done with the old data. Tuned kernels keep two buffers so loading and compute overlap.'),
          terms: [],
          trace: 'acc = 19 + (4 + 2 + 6 + 6) = 37',
          code: code(['__syncthreads()      // 第 1 轮用完了', 'smem_A = A[2:4, 4:8]', 'smem_B = B[4:8, 4:8]', 'for k in range(4, 8):', '    acc += A[3][k] * B[k][7]', '# acc = 37'], ['__syncthreads()      // round 1 is done', 'smem_A = A[2:4, 4:8]', 'smem_B = B[4:8, 4:8]', 'for k in range(4, 8):', '    acc += A[3][k] * B[k][7]', '# acc = 37']) },
        { id: 'store', level: 'package', kind: 'writeback', chip: { label: L('写回', 'Store'), gloss: L('37 回到 HBM', '37 goes to HBM') },
          title: L('37 写回 HBM', 'Write 37 back to HBM'),
          body: L('两轮都做完后，37 经 L2 写回 HBM 里 C[3,7] 的位置。', 'Once both rounds are done, 37 goes back through L2 to C[3,7]’s place in HBM.'),
          hardware: L('其余输出用同样的方法，在各自的 SM 上同时算出来。', 'Every other output is computed the same way, at the same time, on its own SM.'),
          terms: [],
          trace: 'C[3,7] ← acc = 37',
          code: code(['// 写回', 'C[3][7] = acc   // 37'], ['// Store', 'C[3][7] = acc   // 37']) }
      ]
    },

    pagetable: {
      title: L('一次地址翻译', 'One address translation'),
      subtitle: L('线程给出的地址怎么找到 HBM', 'How a thread’s address reaches HBM'),
      scope: L('页表格式取自 NVIDIA 开源驱动里的 Hopper GMMU（57 位虚拟地址）。A100 用更早的格式，翻译过程相同。TLB 的大小和位置 NVIDIA 没有公开，图里按功能标出。', 'The page-table format is Hopper’s GMMU layout (57-bit virtual addresses) from NVIDIA’s open-source driver. A100 uses an older format; the walk works the same way. NVIDIA doesn’t publish TLB sizes or locations, so they are marked by function.'),
      nodes: [],
      steps: [
        { id: 'issue', level: 'sm', kind: 'issue', chip: { label: L('发出', 'Issue'), gloss: L('LD/ST 算出地址', 'LD/ST makes an address') },
          title: L('线程要读 A[3,0]', 'A thread wants to read A[3,0]'),
          body: L('矩阵乘法里读数据的那条指令，先由 LD/ST 单元算出一个虚拟地址。程序只认识虚拟地址，不知道数据在 HBM 的哪个位置。', 'The load instruction from the matrix multiply starts in the LD/ST unit, which works out a virtual address. Programs only see virtual addresses; they don’t know where in HBM the data sits.'),
          hardware: L('地址来自 SM 里的 LD/ST 单元。H100 的 TMA 发出的批量搬运也要走同样的翻译。', 'The address comes from the SM’s LD/ST unit. Bulk copies from H100’s TMA go through the same translation.'),
          terms: ['ldst', 'va'],
          trace: 'VA = 0x7f3ac2d64a40',
          code: code(['// 线程算出 A[3,0] 的地址', 'va = A_base + (3 * lda + 0) * sizeof(float)', '// va = 0x7f3ac2d64a40'], ['// The thread computes the address of A[3,0]', 'va = A_base + (3 * lda + 0) * sizeof(float)', '// va = 0x7f3ac2d64a40']) },
        { id: 'l1-tlb', level: 'sm', kind: 'lookup', chip: { label: L('L1 TLB', 'L1 TLB'), gloss: L('近处的缓存没命中', 'Nearby cache misses') },
          title: L('先查 SM 旁边的 TLB', 'Check the TLB next to the SM'),
          body: L('TLB 记着最近翻译过的地址。查的时候用页号，也就是地址去掉最后 21 位。这个页第一次被访问，L1 TLB 里没有，未命中。', 'A TLB remembers recent translations. It is looked up by page number, which is the address without its last 21 bits. This page hasn’t been touched before, so the L1 TLB misses.'),
          hardware: L('GPU 有多级 TLB，NVIDIA 没有公开它们的大小和位置。这里把 L1 TLB 画在 SM 的访存通路上。', 'GPUs have several levels of TLB. NVIDIA doesn’t publish their sizes or locations, so the L1 TLB is drawn on the SM’s memory path.'),
          terms: ['tlb', 'page'],
          trace: 'L1 TLB[VPN] → miss',
          code: code(['vpn = va >> 21        // 2 MiB 页的页号', 'hit = l1_tlb.lookup(vpn)   // miss'], ['vpn = va >> 21        // 2 MiB page number', 'hit = l1_tlb.lookup(vpn)   // miss']) },
        { id: 'l2-tlb', level: 'die', kind: 'lookup', chip: { label: L('共享 TLB', 'Shared TLB'), gloss: L('共享的也没有', 'Shared TLB misses') },
          title: L('共享 TLB 也没有，交给 GMMU', 'The shared TLB misses too; the GMMU takes over'),
          body: L('请求离开 SM，查更大的共享 TLB，仍然未命中。GPU 的内存管理单元（GMMU）开始逐级查页表。', 'The request leaves the SM and checks a larger shared TLB. It misses again, so the GPU memory management unit (GMMU) starts walking the page table.'),
          hardware: L('GMMU 是裸片上的硬件，不需要 CPU 参与。它的具体位置没有公开，图里标在 L2 旁边。', 'The GMMU is hardware on the die; the CPU isn’t involved. Its exact location isn’t published, so it is marked next to L2.'),
          terms: ['gmmu', 'pagetable'],
          trace: 'shared TLB[VPN] → miss → page walk',
          code: code(['hit = shared_tlb.lookup(vpn)   // miss', 'pte = gmmu.walk(page_table_root, va)'], ['hit = shared_tlb.lookup(vpn)   // miss', 'pte = gmmu.walk(page_table_root, va)']) },
        { id: 'walk-upper', level: 'package', kind: 'walk', chip: { label: L('上层', 'Upper'), gloss: L('PD4、PD3、PD2', 'PD4, PD3, PD2') },
          title: L('页表也在 HBM 里', 'The page table lives in HBM too'),
          body: L('GMMU 用地址的前三段当下标，一层一层读页目录：PD4[0]、PD3[0]、PD2[508]。每读一层，都要经 L2 去一趟 HBM。', 'The GMMU uses the first three fields of the address as indexes and reads one page directory after another: PD4[0], PD3[0], PD2[508]. Each read goes through L2 to HBM.'),
          hardware: L('页表放在 HBM 里，所以查一遍页表要一个接一个地读好几次。L2 能缓存页表项，命中时快很多。', 'Page tables sit in HBM, so a full walk is several reads, one after another. L2 can cache page-table entries, which helps a lot when they hit.'),
          terms: ['pd', 'l2'],
          trace: 'PD4[0] → PD3[0] → PD2[508]',
          code: code(['pd3 = read(pd4_base + 0 * 8)', 'pd2 = read(pd3      + 0 * 8)', 'pd1 = read(pd2      + 508 * 8)   // 每次读都可能去 HBM'], ['pd3 = read(pd4_base + 0 * 8)', 'pd2 = read(pd3      + 0 * 8)', 'pd1 = read(pd2      + 508 * 8)   // each read may go to HBM']) },
        { id: 'walk-lower', level: 'package', kind: 'walk', chip: { label: L('下层', 'Lower'), gloss: L('PD1、PD0 到页', 'PD1, PD0 to the page') },
          title: L('PD0 直接指向一个 2 MiB 大页', 'PD0 points straight at a 2 MiB page'),
          body: L('再读 PD1[470] 和 PD0[22]。大块显存通常用 2 MiB 的大页，这时 PD0[22] 里存的就是页基址 0x24e000000，不用再往下查。', 'Next come PD1[470] and PD0[22]. Large allocations usually use 2 MiB pages, in which case PD0[22] holds the page base itself, 0x24e000000, and the walk stops here.'),
          hardware: L('换成 64 KiB 或 4 KiB 小页，还要再多查一层页表。页越大，同样多的 TLB 项能覆盖的显存越多。', 'With 64 KiB or 4 KiB pages there is one more table to read. Bigger pages let the same number of TLB entries cover more memory.'),
          terms: ['pagebase'],
          trace: 'PD1[470] → PD0[22] = 2 MiB page',
          code: code(['pd0 = read(pd1 + 470 * 8)', 'pte = read(pd0 + 22 * 16)   // 大页：这一项就是 PTE', 'page_base = pte.address   // 0x24e000000'], ['pd0 = read(pd1 + 470 * 8)', 'pte = read(pd0 + 22 * 16)   // big page: this entry is the PTE', 'page_base = pte.address   // 0x24e000000']) },
        { id: 'physical', level: 'die', kind: 'compose', chip: { label: L('拼地址', 'Combine'), gloss: L('页基址加偏移', 'Base plus offset') },
          title: L('页基址加页内偏移', 'Page base plus offset'),
          body: L('地址的最后 21 位是页内偏移，不用翻译。页基址加上它：0x24e000000 + 0x164a40 = 0x24e164a40。这个结果会记进两级 TLB。', 'The last 21 bits of the address are the offset inside the page and need no translation. Add them to the page base: 0x24e000000 + 0x164a40 = 0x24e164a40. The result is stored in both TLBs.'),
          hardware: L('下一次访问同一个 2 MiB 页时，TLB 直接命中，不用再查页表。', 'The next access to the same 2 MiB page hits in the TLB and skips the walk.'),
          terms: ['pa'],
          trace: 'PA = 0x24e000000 + 0x164a40 = 0x24e164a40',
          code: code(['offset = va & ((1 << 21) - 1)   // 0x164a40', 'pa = page_base + offset         // 0x24e164a40', 'l1_tlb.fill(vpn, pte); shared_tlb.fill(vpn, pte)'], ['offset = va & ((1 << 21) - 1)   // 0x164a40', 'pa = page_base + offset         // 0x24e164a40', 'l1_tlb.fill(vpn, pte); shared_tlb.fill(vpn, pte)']) },
        { id: 'access', level: 'hbm', kind: 'transfer', chip: { label: L('取数', 'Fetch'), gloss: L('物理地址找到 HBM', 'PA finds an HBM channel') },
          title: L('物理地址落到一组 HBM 的一个通道', 'The physical address lands on one HBM channel'),
          body: L('L2 缓存里没有这份数据，于是存储控制器把物理地址换算成哪一组 HBM、哪个通道、哪一行，从 DRAM 里读出来。', 'The L2 cache doesn’t hold this data, so the memory controller turns the physical address into a stack, a channel and a row, and reads it from DRAM.'),
          hardware: L('地址怎样分散到各组 HBM 和各个通道，NVIDIA 没有公开。图里只标出其中一个通道。', 'NVIDIA doesn’t publish how addresses are spread across stacks and channels. One channel is marked here.'),
          terms: ['dram', 'channel'],
          trace: 'read(0x24e164a40) → HBM',
          code: code(['line = l2.lookup(pa)          // miss', 'stack, channel, bank, row = hash(pa)   // 未公开', 'data = hbm[stack][channel].read(bank, row)'], ['line = l2.lookup(pa)          // miss', 'stack, channel, bank, row = hash(pa)   // unpublished', 'data = hbm[stack][channel].read(bank, row)']) },
        { id: 'return', level: 'sm', kind: 'return', chip: { label: L('返回', 'Return'), gloss: L('数据进寄存器', 'Data reaches registers') },
          title: L('数据回到寄存器', 'The data reaches the registers'),
          body: L('数据经 L2 回到 SM，A[3,0] = 2 进入发起请求的线程的寄存器。之后读同一页里的数据，TLB 直接命中。', 'The data returns through L2 to the SM, and A[3,0] = 2 lands in the requesting thread’s register. Later reads in the same page hit the TLB directly.'),
          hardware: L('查一遍页表要连着读好几次 HBM，所以用大页、让 TLB 多命中，对吃带宽的程序很重要。', 'A full walk costs several memory reads in a row, which is why big pages and TLB hits matter for bandwidth-heavy kernels.'),
          terms: ['register'],
          trace: 'reg ← load(0x7f3ac2d64a40)',
          code: code(['r = data          // A[3,0] = 2 进入寄存器', '// 同一 2 MiB 页里的下一次读：TLB 命中'], ['r = data          // A[3,0] = 2 is in a register', '// next read in the same 2 MiB page: TLB hit']) }
      ]
    },

    pixel: {
      title: L('一个像素的旅程', 'One pixel’s journey'),
      subtitle: L('H100 上能跑图形的那两个 TPC', 'On H100’s two graphics TPCs'),
      scope: L('H100 只有两个 TPC 能跑顶点、几何和像素着色器，也没有显示接口。NVIDIA 的 H100 文章没有描述光栅和 ROP 硬件，图里只按功能标出它们所在的 GPC 和 L2 一侧。', 'Only two TPCs on H100 can run vertex, geometry and pixel shaders, and the card has no display output. NVIDIA’s H100 article doesn’t describe the raster or ROP hardware, so they are marked by function at the GPC and the L2 side.'),
      nodes: [],
      steps: [
        { id: 'where', level: 'die', kind: 'target', chip: { label: L('位置', 'Where'), gloss: L('两个图形 TPC', 'Two graphics TPCs') },
          title: L('这颗芯片在哪里画图', 'Where this chip can draw'),
          body: L('H100 主要用来做计算。132 个 SM 两个一组叫 TPC，其中只有两个 TPC（4 个 SM）能跑图形着色器。下面跟着画面上 (3, 4) 这一个像素。', 'H100 is built for compute. Its 132 SMs come in pairs called TPCs, and only two TPCs (four SMs) can run graphics shaders. We follow the single pixel at (3, 4).'),
          hardware: L('哪两个 TPC 能跑图形，NVIDIA 没说。图里标的位置只是示意。', 'NVIDIA doesn’t say which two TPCs these are. The marked position is illustrative.'),
          terms: ['sm', 'tpc', 'shader'],
          trace: 'target = framebuffer[3, 4]',
          code: code(['// 只追踪一个像素', 'target = (x = 3, y = 4)'], ['// Follow one pixel', 'target = (x = 3, y = 4)']) },
        { id: 'vertices', level: 'package', kind: 'transfer', chip: { label: L('顶点', 'Vertices'), gloss: L('从 HBM 读三角形', 'Read the triangle') },
          title: L('三角形的顶点从 HBM 读进来', 'The triangle’s vertices come in from HBM'),
          body: L('三角形的三个顶点 v₀、v₁、v₂ 存在 HBM 里，各带一个位置和一种颜色：红、绿、蓝。它们经 L2 送到图形 TPC 里的 SM。', 'The triangle’s three vertices v₀, v₁ and v₂ are stored in HBM, each with a position and a color: red, green and blue. They travel through L2 to an SM in a graphics TPC.'),
          hardware: L('读顶点和读矩阵走的是同一条访存通路：HBM、中介层、L2、SM。', 'Vertices take the same memory path as matrix data: HBM, interposer, L2, SM.'),
          terms: ['vertex', 'hbm', 'l2'],
          trace: 'v₀, v₁, v₂ ← vertex_buffer',
          code: code(['v = vertex_buffer[i]   // 位置 + 颜色', '// 三个顶点：v0 红, v1 绿, v2 蓝'], ['v = vertex_buffer[i]   // position + color', '// three vertices: v0 red, v1 green, v2 blue']) },
        { id: 'vertex-shader', level: 'sm', kind: 'compute', chip: { label: L('顶点着色', 'Transform'), gloss: L('算出屏幕坐标', 'To screen space') },
          title: L('顶点着色器算出屏幕坐标', 'The vertex shader finds screen positions'),
          body: L('每个顶点的位置乘上一个变换矩阵，得到它在画面上的坐标：(4.5, 0)、(1, 6)、(7, 5)。这是普通的小数运算，在 SM 的 FP32 单元上算。', 'Each vertex position is multiplied by a transform matrix to get where it lands on screen: (4.5, 0), (1, 6) and (7, 5). This is ordinary floating-point math on the SM’s FP32 units.'),
          hardware: L('着色器和计算程序用的是同一批 FP32 单元和寄存器，只是程序不同。', 'Shaders use the same FP32 units and registers as compute kernels; only the program differs.'),
          terms: ['fp32'],
          trace: 'p_screen = M · p',
          code: code(['for v in (v0, v1, v2):', '    v.screen = viewport(M * v.position)'], ['for v in (v0, v1, v2):', '    v.screen = viewport(M * v.position)']) },
        { id: 'raster', level: 'die', kind: 'raster', chip: { label: L('光栅化', 'Raster'), gloss: L('覆盖与权重', 'Coverage, weights') },
          title: L('光栅化：这个像素在三角形里吗', 'Rasterization: is the pixel inside the triangle?'),
          body: L('光栅硬件逐个像素检查它在不在三角形里。办法是算像素中心离三个顶点各有多近，得到三个权重。像素 (3, 4) 的权重是 0.2、0.5、0.3，都不小于 0，说明在三角形里，于是生成一个片元。', 'The raster hardware tests each pixel against the triangle by working out three weights, one per vertex, that say how close the pixel center is to each. Pixel (3, 4) gets 0.2, 0.5 and 0.3. None is negative, so the pixel is inside and becomes a fragment.'),
          hardware: L('在 NVIDIA 的图形 GPU 里，每个 GPC 有一个光栅引擎。H100 的文章没有描述它，这里只标在 GPC 上。', 'In NVIDIA’s graphics GPUs each GPC has a raster engine. The H100 article doesn’t describe one, so it is only marked on the GPC.'),
          terms: ['raster', 'weights', 'fragment'],
          trace: 'w = (0.2, 0.5, 0.3), all ≥ 0 → inside',
          code: code(['w0, w1, w2 = barycentric(tri, (3, 4))', 'if min(w0, w1, w2) >= 0:', '    emit_fragment(3, 4, w0, w1, w2)'], ['w0, w1, w2 = barycentric(tri, (3, 4))', 'if min(w0, w1, w2) >= 0:', '    emit_fragment(3, 4, w0, w1, w2)']) },
        { id: 'fragment', level: 'sm', kind: 'compute', chip: { label: L('片元着色', 'Shade'), gloss: L('插值出颜色', 'Blend the colors') },
          title: L('片元着色器算颜色', 'The fragment shader computes the color'),
          body: L('按权重混合三个顶点的颜色：0.2 份红、0.5 份绿、0.3 份蓝，得到 (0.2, 0.5, 0.3)，三个数依次是红、绿、蓝的分量。', 'Blend the vertex colors by weight: 0.2 red, 0.5 green, 0.3 blue. That gives (0.2, 0.5, 0.3) as red, green and blue.'),
          hardware: L('又回到 SM 的 FP32 单元。一个 warp 一次给 32 个片元着色。', 'Back on the SM’s FP32 units. One warp shades 32 fragments at once.'),
          terms: ['warp'],
          trace: 'c = 0.2·v₀ + 0.5·v₁ + 0.3·v₂ = (0.2, 0.5, 0.3)',
          code: code(['c = w0 * v0.color + w1 * v1.color + w2 * v2.color', '# c = (0.2, 0.5, 0.3)'], ['c = w0 * v0.color + w1 * v1.color + w2 * v2.color', '# c = (0.2, 0.5, 0.3)']) },
        { id: 'texture', level: 'sm', kind: 'sample', chip: { label: L('纹理', 'Texture'), gloss: L('TEX 单元采样', 'TEX unit samples') },
          title: L('纹理单元取一个纹素', 'A texture unit fetches a texel'),
          body: L('纹理是一张贴在三角形上的图。这个像素对应图上 (0.25, 0.75) 的位置，从那里取到的值叫纹素。这里取到的是白色 (1, 1, 1)，颜色乘上它不变。', 'A texture is an image laid over the triangle. The pixel maps to the point (0.25, 0.75) on it, and the value read there is called a texel. Here it is white, (1, 1, 1), so multiplying by it leaves the color unchanged.'),
          hardware: L('纹理采样由 SM 里的 TEX 单元完成，数据经 L1 缓存读取。', 'Sampling is done by the TEX units in the SM, reading through the L1 cache.'),
          terms: ['tex', 'l1'],
          trace: 'c × texture(0.25, 0.75) = c × (1, 1, 1)',
          code: code(['t = texture.sample(0.25, 0.75)   // (1, 1, 1)', 'c = c * t'], ['t = texture.sample(0.25, 0.75)   // (1, 1, 1)', 'c = c * t']) },
        { id: 'depth', level: 'package', kind: 'writeback', chip: { label: L('深度', 'Depth'), gloss: L('更近才写入', 'Nearer wins') },
          title: L('比深度，再写进帧缓冲', 'Depth test, then write the framebuffer'),
          body: L('这个片元的深度是 0.4，比帧缓冲里已有的 0.7 更近，所以保留。颜色每个分量乘 255 取整，得到 (51, 128, 77)，和新深度一起经 L2 写进 HBM 里的帧缓冲。', 'The fragment’s depth is 0.4, nearer than the 0.7 already stored, so it is kept. Each color component is multiplied by 255 and rounded, giving (51, 128, 77), which goes through L2 into the framebuffer in HBM along with the new depth.'),
          hardware: L('深度测试和混合由 ROP 硬件完成。H100 的文章没有描述 ROP，这里标在 L2 一侧。', 'Depth test and blending are done by ROP hardware. The H100 article doesn’t describe ROPs, so they are marked on the L2 side.'),
          terms: ['framebuffer', 'rop'],
          trace: 'z 0.4 < 0.7 → fb[3,4] = (51, 128, 77)',
          code: code(['if z < depth[3][4]:          // 0.4 < 0.7', '    fb[3][4] = round(255 * c)  // (51, 128, 77)', '    depth[3][4] = z'], ['if z < depth[3][4]:          // 0.4 < 0.7', '    fb[3][4] = round(255 * c)  // (51, 128, 77)', '    depth[3][4] = z']) },
        { id: 'output', level: 'board', kind: 'output', chip: { label: L('送出', 'Out'), gloss: L('没有显示接口', 'No display port') },
          title: L('帧画好了，但它没有显示接口', 'The frame is done, but there is no display port'),
          body: L('H100 SXM 没有显示输出。画好的帧留在 HBM 里，要看到它，得经 PCIe 或 NVLink 从模组底部的连接器拷出去。', 'H100 SXM has no display output. The finished frame stays in HBM; to see it, it has to be copied out over PCIe or NVLink through the connector under the module.'),
          hardware: L('这也是 H100 适合做远程渲染和仿真、不适合直接接显示器的原因。', 'This is why H100 suits remote rendering and simulation rather than driving a monitor.'),
          terms: [],
          trace: 'host ← copy(framebuffer)',
          code: code(['// 没有扫描输出，只能拷走', 'cudaMemcpy(host_frame, framebuffer, size, DeviceToHost)'], ['// No scanout; copy it out instead', 'cudaMemcpy(host_frame, framebuffer, size, DeviceToHost)']) }
      ]
    },

    stacking: {
      title: L('芯片为什么堆起来', 'Why the chips are stacked'),
      subtitle: L('HBM、中介层和封装', 'HBM, interposer and package'),
      scope: L('八层 DRAM 剖面是示意，不代表某家供应商的层数。带宽来自 NVIDIA 产品规格。', 'The eight-layer DRAM cutaway is an illustration, not a particular vendor’s layer count. Bandwidth figures are NVIDIA product specs.'),
      nodes: [],
      steps: [
        { id: 'need', level: 'board', kind: 'target', chip: { label: L('需求', 'Need'), gloss: L('每秒几 TB', 'Terabytes per second') },
          title: L('SM 每秒要吃掉几 TB 数据', 'The SMs need terabytes per second'),
          body: L('H100 SXM 的显存带宽是 3.35 TB/s，A100 80GB 是 2.04 TB/s。显存芯片如果像显卡那样焊在 PCB 上，引不出这么多又这么短的连线。', 'H100 SXM has 3.35 TB/s of memory bandwidth; A100 80GB has 2.04 TB/s. Memory chips soldered onto the PCB, as on a graphics card, can’t get that many short wires to the GPU.'),
          hardware: L('所以 HBM 和 GPU 裸片挨着放在同一个封装里，中间只隔一毫米左右。', 'So the HBM stacks sit right next to the GPU die inside one package, about a millimeter apart.'),
          terms: ['hbm', 'sm'],
          trace: 'H100: 3.35 TB/s · A100: 2.04 TB/s',
          code: code(['// 每颗 SM 都在等数据', 'need = sms * bytes_per_cycle * clock'], ['// every SM is waiting on data', 'need = sms * bytes_per_cycle * clock']) },
        { id: 'stack', level: 'hbm', explode: 0, kind: 'structure', chip: { label: L('叠层', 'Layers'), gloss: L('DRAM 叠在底座上', 'DRAM on a base die') },
          title: L('一组 HBM 是一摞 DRAM 芯片', 'An HBM stack is a pile of DRAM dies'),
          body: L('几层 DRAM 芯片叠在一块底部接口芯片上。叠起来占地小，每组只占 GPU 旁边的一小块地方。', 'Several DRAM dies sit on top of a base interface die. Stacking keeps the footprint small, so each stack takes only a small patch next to the GPU.'),
          hardware: L('图里画了 8 层，用来说明结构；真实产品的层数取决于容量和供应商。', 'Eight layers are drawn to show the structure; real products vary by capacity and vendor.'),
          terms: ['dram', 'basedie'],
          trace: '16 GB per stack × 5 = 80 GB',
          code: code(['stack = [base_die] + [dram_die] * 8   // 示意', 'capacity = 16 GB   // 每组'], ['stack = [base_die] + [dram_die] * 8   // illustrative', 'capacity = 16 GB   // per stack']) },
        { id: 'tsv', level: 'hbm', explode: .55, kind: 'vertical', chip: { label: L('TSV', 'TSV'), gloss: L('垂直穿过硅片', 'Straight through silicon') },
          title: L('信号直接穿过硅片', 'Signals go straight through the silicon'),
          body: L('每层 DRAM 上打了上千个硅通孔（TSV），层与层之间用微凸点焊在一起。信号垂直走几十微米，而不是绕到边上。', 'Each DRAM die has thousands of through-silicon vias (TSVs), and the dies are joined by microbumps. Signals travel a few tens of microns vertically instead of routing around the edge.'),
          hardware: L('TSV 是硅片里的竖直铜柱，和 PCB 上的普通过孔不是一回事。', 'A TSV is a vertical copper column inside the silicon. It is a different thing from an ordinary via in a PCB.'),
          terms: ['tsv', 'microbump'],
          trace: 'path = TSV + microbump, ~tens of µm per layer',
          code: code(['// 读第 6 层的 bank', 'signal: base -> tsv -> bump -> ... -> dram[5]'], ['// read a bank on layer 6', 'signal: base -> tsv -> bump -> ... -> dram[5]']) },
        { id: 'width', level: 'hbm', explode: .15, kind: 'interface', chip: { label: L('位宽', 'Width'), gloss: L('每组 1024 位', '1024 bits per stack') },
          title: L('每组 1024 根数据线', '1024 data lines per stack'),
          body: L('一组 HBM 的接口有 1024 位宽，分成多个独立通道：HBM3 是 16 × 64 位，HBM2e 是 8 × 128 位。宽而慢，比窄而快更省电。', 'Each stack has a 1024-bit interface split into independent channels: 16 × 64 bits on HBM3, 8 × 128 bits on HBM2e. Wide and slow uses less power than narrow and fast.'),
          hardware: L('5 组启用的 HBM 一共 5120 位。H100 每根线约 5.2 Gb/s，A100 约 3.2 Gb/s。', 'The five active stacks add up to 5120 bits. That is about 5.2 Gb/s per line on H100 and 3.2 Gb/s on A100.'),
          terms: ['channel'],
          trace: '3.35 TB/s × 8 ÷ 5120 ≈ 5.2 Gb/s per line',
          code: code(['bits = 5 * 1024             // 5120', 'per_line = 3.35e12 * 8 / bits   // ≈ 5.2e9 b/s'], ['bits = 5 * 1024             // 5120', 'per_line = 3.35e12 * 8 / bits   // ≈ 5.2e9 b/s']) },
        { id: 'interposer', level: 'package', explode: .6, kind: 'lateral', chip: { label: L('中介层', 'Interposer'), gloss: L('硅上走细线', 'Fine wires in silicon') },
          title: L('中介层：在硅上布几千根线', 'The interposer: thousands of wires in silicon'),
          body: L('把裸片和 HBM 抬起来，下面是硅中介层。它用做芯片的工艺在表层布线，线距细到 PCB 做不到，几千根数据线从 HBM 底部一路连到 GPU 的 HBM PHY。', 'Lift the die and the HBM stacks and you see the silicon interposer. It is wired with chip-making lithography, at a pitch no PCB can reach, carrying thousands of data lines from each stack to the GPU’s HBM PHY.'),
          hardware: L('这些线埋在中介层的金属层里，装配好以后从外面看不见。拆开时显示的走线是示意，不是真实版图。', 'The wires are buried in the interposer’s metal layers and can’t be seen once assembled. The routing shown when it is taken apart is illustrative, not the real layout.'),
          terms: ['interposer', 'phy'],
          trace: '5 × 1024 lines over ~1 mm',
          code: code(['// 2.5D：芯片并排放在同一块硅上', 'for stack in hbm:', '    wire(stack.phy, gpu.phy[stack], width=1024)'], ['// 2.5D: dies side by side on one piece of silicon', 'for stack in hbm:', '    wire(stack.phy, gpu.phy[stack], width=1024)']) },
        { id: 'layers', level: 'package', explode: 1, camera: 'side', kind: 'vertical', chip: { label: L('层次', 'Layers'), gloss: L('从硅到 PCB', 'Silicon down to PCB') },
          title: L('从硅片一路往下到电路板', 'From silicon down to the circuit board'),
          body: L('最上面是 GPU 裸片和 HBM，用微凸点焊在中介层上；中介层再用更大的凸点焊在有机基板上；基板底部的焊球接到 SXM 模组的 PCB。', 'At the top are the GPU die and HBM, attached to the interposer by microbumps. The interposer sits on an organic substrate on larger bumps, and the substrate’s solder balls connect to the SXM board.'),
          hardware: L('每往下一层，连接点更大、更稀，最后才是 PCB 能处理的尺寸。NVIDIA 用的是台积电 CoWoS 这类封装。', 'Each layer down, the connections get bigger and sparser, until they reach a size a PCB can handle. This style of package is TSMC’s CoWoS.'),
          terms: ['substrate', 'cowos'],
          trace: 'microbump → interposer → bump → substrate → ball → PCB',
          code: code(['layers = ["die + HBM", "microbumps", "interposer",', '          "bumps", "substrate", "solder balls", "PCB"]'], ['layers = ["die + HBM", "microbumps", "interposer",', '          "bumps", "substrate", "solder balls", "PCB"]']) },
        { id: 'heat', level: 'package', explode: 0, kind: 'heat', chip: { label: L('散热', 'Heat'), gloss: L('热量往上走', 'Heat goes up') },
          title: L('热从顶面导出去', 'Heat leaves through the top'),
          body: L('H100 SXM 最高可配置到 700 W，A100 SXM 是 400 W。GPU 裸片和 HBM 的顶面做到差不多一样高，同一块冷板压在上面把热带走。', 'H100 SXM can be configured up to 700 W; A100 SXM runs at 400 W. The GPU die and the HBM tops are made nearly level so one cold plate can press on all of them.'),
          hardware: L('HBM 是一摞芯片，最下面几层的热要穿过上面几层才能出去，所以叠得越高，散热越难。冷板在模型里没有画出来。', 'An HBM stack is a pile of dies; heat from the bottom layers has to pass through the ones above, so taller stacks are harder to cool. The cold plate isn’t drawn in the model.'),
          terms: ['coldplate'],
          trace: 'H100 SXM ≤ 700 W · A100 SXM 400 W',
          code: code(['// 热流方向', 'heat: die/hbm -> top surface -> cold plate'], ['// heat flow', 'heat: die/hbm -> top surface -> cold plate']) },
        { id: 'yield', level: 'die', explode: 0, kind: 'yield', chip: { label: L('良率', 'Yield'), gloss: L('关掉一部分', 'Some parts are off') },
          title: L('同一块硅，不是每部分都启用', 'Not every part of the silicon is switched on'),
          body: L('完整的 GH100 有 144 个 SM 和 6 个 HBM 位置，H100 SXM 只启用 132 个 SM 和 5 组 HBM。一颗大芯片很难没有缺陷，关掉一部分就能把更多芯片卖出去。', 'A full GH100 has 144 SMs and six HBM sites; H100 SXM enables 132 SMs and five stacks. A huge die rarely comes out flawless, and switching some parts off lets more of them ship.'),
          hardware: L('暗色的 SM 和第六个 HBM 位置就是没启用的部分。哪些单元被关掉每颗芯片都不一样，图里的位置是示意。', 'The dark SMs and the sixth HBM site are the parts that are off. Which units are disabled differs from chip to chip; the positions shown are illustrative.'),
          terms: [],
          trace: 'GH100: 144 SM, 6 sites → H100 SXM: 132 SM, 5 stacks',
          code: code(['full    = {"sm": 144, "hbm_sites": 6}', 'shipped = {"sm": 132, "hbm_stacks": 5}   // H100 SXM'], ['full    = {"sm": 144, "hbm_sites": 6}', 'shipped = {"sm": 132, "hbm_stacks": 5}   // H100 SXM']) }
      ]
    }
  };

  // Terms the walkthroughs use, each explained in one line. A step lists the terms
  // it introduces (`terms`); the panel shows those under the text and the whole
  // list for the walkthrough in the glossary.
  const GLOSSARY = {
    hbm: { name: L('HBM', 'HBM'), gloss: L('GPU 的显存。几摞 DRAM 芯片，紧挨着 GPU 裸片放在同一个封装里。', 'The GPU’s memory: stacks of DRAM dies right beside the GPU die in the same package.') },
    sm: { name: L('SM', 'SM'), gloss: L('流式多处理器，GPU 里做计算的单元。H100 有 132 个，A100 有 108 个。', 'Streaming multiprocessor, the unit that does the computing. H100 has 132 of them, A100 has 108.') },
    cta: { name: L('线程块（CTA）', 'Thread block (CTA)'), gloss: L('一组一起干活的线程，负责输出里的一块。一个 CTA 只在一个 SM 上运行。', 'A group of threads that work on one tile of the output. A CTA runs on a single SM.') },
    warp: { name: L('Warp', 'Warp'), gloss: L('32 个线程一组，同时执行同一条指令，各自处理不同的数据。', 'A group of 32 threads that run the same instruction at the same time, each on its own data.') },
    scheduler: { name: L('Warp 调度器', 'Warp scheduler'), gloss: L('每个周期挑一个就绪的 warp，发出它的下一条指令。', 'Picks a ready warp each cycle and issues its next instruction.') },
    smem: { name: L('共享内存', 'Shared memory'), gloss: L('SM 里的一小块存储，同一个 CTA 的线程都能读写，比去 HBM 快得多。', 'A small store inside the SM that every thread in a CTA can read and write. It is far quicker to reach than HBM.') },
    l2: { name: L('L2 缓存', 'L2 cache'), gloss: L('裸片中间的缓存，所有 SM 共用。进出 HBM 的数据都经过它。', 'A cache in the middle of the die, shared by every SM. All data going to or from HBM passes through it.') },
    l1: { name: L('L1 缓存', 'L1 cache'), gloss: L('每个 SM 自己的小缓存。', 'A small cache that belongs to one SM.') },
    interposer: { name: L('中介层', 'Interposer'), gloss: L('垫在 GPU 裸片和 HBM 下面的一片硅，里面的细线把它们连起来。', 'A slab of silicon under the GPU die and the HBM stacks, with fine wires that connect them.') },
    tma: { name: L('TMA', 'TMA'), gloss: L('H100 的张量内存加速器，一条指令就能把一大块数据搬进共享内存。', 'H100’s Tensor Memory Accelerator, which copies a whole block of data into shared memory with one instruction.') },
    ldst: { name: L('LD/ST 单元', 'LD/ST unit'), gloss: L('SM 里负责读写内存的单元（load / store）。', 'The unit in the SM that reads and writes memory (load / store).') },
    register: { name: L('寄存器', 'Registers'), gloss: L('每个线程自己的存储，离计算单元最近，运算直接从这里取数。', 'Each thread’s own storage, right next to the compute units. Arithmetic takes its operands from here.') },
    tensorcore: { name: L('Tensor Core', 'Tensor Core'), gloss: L('SM 里专门做矩阵乘加的单元。', 'The unit in the SM built for matrix multiply-add.') },
    va: { name: L('虚拟地址', 'Virtual address'), gloss: L('程序用的地址。要翻译成物理地址，才知道数据在 HBM 的哪里。', 'The address a program uses. It has to be translated to a physical address to find the data in HBM.') },
    pa: { name: L('物理地址', 'Physical address'), gloss: L('数据在 HBM 里的真实位置。', 'Where the data really is in HBM.') },
    page: { name: L('页', 'Page'), gloss: L('内存按固定大小分成的块，这里每页 2 MiB。地址以页为单位翻译。', 'Memory is divided into fixed-size blocks called pages, 2 MiB each here. Addresses are translated a page at a time.') },
    tlb: { name: L('TLB', 'TLB'), gloss: L('记着最近翻译过的页，命中就不用查页表。', 'Remembers recently translated pages. On a hit, the page table isn’t needed.') },
    gmmu: { name: L('GMMU', 'GMMU'), gloss: L('GPU 的内存管理单元，TLB 未命中时由它去查页表。', 'The GPU’s memory management unit. It walks the page table when the TLBs miss.') },
    pagetable: { name: L('页表', 'Page table'), gloss: L('记录每个虚拟页对应哪个物理页的表，分成几层，存在 HBM 里。', 'The table that maps each virtual page to a physical page. It has several levels and is stored in HBM.') },
    pd: { name: L('页目录（PD）', 'Page directory (PD)'), gloss: L('页表的一层。PD4 在最上面，PD0 在最下面，每层的一项指向下一层。', 'One level of the page table. PD4 is the top, PD0 the bottom, and each entry points to the next level down.') },
    pagebase: { name: L('页基址', 'Page base'), gloss: L('一个页在 HBM 里的起始物理地址。', 'The physical address where a page starts in HBM.') },
    dram: { name: L('DRAM', 'DRAM'), gloss: L('存数据的内存芯片。', 'The memory chips that hold the data.') },
    channel: { name: L('通道', 'Channel'), gloss: L('一组 HBM 里能独立读写的一部分。HBM3 每组 16 个，HBM2e 每组 8 个。', 'A part of an HBM stack that can be read and written on its own. HBM3 has 16 per stack, HBM2e has 8.') },
    gpc: { name: L('GPC', 'GPC'), gloss: L('裸片上的一大块，由若干个 TPC 组成。', 'A large block of the die made up of several TPCs.') },
    tpc: { name: L('TPC', 'TPC'), gloss: L('两个 SM 一组。', 'A pair of SMs.') },
    shader: { name: L('着色器', 'Shader'), gloss: L('画图时在 SM 上跑的小程序。顶点着色器算位置，片元着色器算颜色。', 'A small program that runs on SMs when drawing. A vertex shader computes positions and a fragment shader computes colors.') },
    vertex: { name: L('顶点', 'Vertex'), gloss: L('三角形的一个角，带着位置和颜色。', 'One corner of a triangle, carrying a position and a color.') },
    fp32: { name: L('FP32 单元', 'FP32 units'), gloss: L('SM 里做 32 位浮点（小数）运算的单元。', 'The units in the SM that do 32-bit floating-point arithmetic.') },
    raster: { name: L('光栅化', 'Rasterization'), gloss: L('找出一个三角形盖住了哪些像素。', 'Finding which pixels a triangle covers.') },
    weights: { name: L('重心权重', 'Barycentric weights'), gloss: L('三个加起来等于 1 的数，表示一个点离三角形三个顶点各有多近。', 'Three numbers that add up to 1 and say how close a point is to each corner of the triangle.') },
    fragment: { name: L('片元', 'Fragment'), gloss: L('三角形盖住的一个像素，还要算颜色、比深度，才能写进画面。', 'One pixel covered by a triangle. It still needs a color and a depth test before it is written.') },
    tex: { name: L('TEX 单元', 'TEX units'), gloss: L('SM 里负责从纹理取值的单元。', 'The units in the SM that read values from textures.') },
    framebuffer: { name: L('帧缓冲', 'Framebuffer'), gloss: L('HBM 里存整幅画面的地方，每个像素有一个颜色和一个深度。', 'The place in HBM that holds the whole image: a color and a depth for every pixel.') },
    rop: { name: L('ROP', 'ROP'), gloss: L('做深度测试和混合、把像素写进帧缓冲的硬件。', 'The hardware that runs the depth test and blending and writes pixels to the framebuffer.') },
    basedie: { name: L('底部接口芯片', 'Base die'), gloss: L('一摞 DRAM 最下面的那片芯片，负责和 GPU 通信。', 'The die at the bottom of a DRAM stack, which talks to the GPU.') },
    tsv: { name: L('TSV（硅通孔）', 'TSV (through-silicon via)'), gloss: L('竖直穿过硅片的铜柱，把上下几层芯片连起来。', 'A copper column that runs straight through a die and connects the dies above and below.') },
    microbump: { name: L('微凸点', 'Microbump'), gloss: L('几十微米大小的焊点，把芯片焊在另一片芯片或中介层上。', 'A solder joint tens of microns across that attaches a die to another die or to the interposer.') },
    phy: { name: L('HBM PHY', 'HBM PHY'), gloss: L('GPU 裸片边上负责收发 HBM 信号的电路。', 'The circuits at the edge of the GPU die that send and receive HBM signals.') },
    substrate: { name: L('有机基板', 'Organic substrate'), gloss: L('中介层下面的多层小电路板，把细密的连接点过渡到 PCB 能接的大小。', 'A small multilayer board under the interposer that spreads the connections out to a size a PCB can take.') },
    cowos: { name: L('CoWoS', 'CoWoS'), gloss: L('台积电的封装工艺：芯片并排放在硅中介层上，再装到基板上。', 'TSMC’s packaging process: dies side by side on a silicon interposer, which is then mounted on a substrate.') },
    coldplate: { name: L('冷板', 'Cold plate'), gloss: L('压在芯片顶面的金属板，把热传给散热器或冷却液。', 'A metal plate pressed onto the top of the chips that passes heat on to a heatsink or liquid coolant.') }
  };
  // Terms a walkthrough explains beyond the ones its steps introduce.
  const EXTRA_TERMS = { gemm: ['scheduler', 'tma'], pagetable: ['hbm', 'sm'], pixel: ['gpc'], stacking: [] };
  // Each question asks about the next step, so the current text doesn't give it away.
  const PREDICTS = {
    'gemm:1': { q: L('C[3,7] 的输入要放到哪里，才能被反复读取？', 'Where should C[3,7]’s inputs go so they can be read many times?'), options: [L('留在 HBM，每次去取', 'Leave them in HBM and fetch each time'), L('搬进 SM 的共享内存', 'Copy them into the SM’s shared memory'), L('先写进输出 C', 'Write them into C first')], answer: 1, explain: L('搬进共享内存后，后面的乘加都从片上读，不用每次去 HBM。', 'Once in shared memory, the multiply-adds read them on chip instead of going back to HBM.') },
    'gemm:3': { q: L('一个 warp 怎样参与矩阵乘法？', 'How does a warp take part in the multiply?'), options: [L('每个线程算完整个矩阵', 'Each thread computes the whole matrix'), L('32 个线程一起提供和处理矩阵片段', 'The 32 threads supply and process matrix fragments together'), L('只有一个线程在算', 'Only one thread does the work')], answer: 1, explain: L('32 个线程各拿一部分操作数和累加器，一起执行矩阵指令。', 'Each of the 32 threads holds part of the operands and accumulators, and they run the matrix instruction together.') },
    'gemm:5': { q: L('第 1 轮算完以后呢？', 'What happens after round 1?'), options: [L('直接把 19 写回 C', 'Write 19 to C right away'), L('同步，换下一批数据继续加', 'Synchronize, load the next data, keep adding'), L('重新切分整个矩阵', 'Re-tile the whole matrix')], answer: 1, explain: L('19 只是一半。同步后换下一批数据，加完才是 37。', '19 is only half the sum. After syncing, round 2 brings it to 37.') },
    'pagetable:1': { q: L('两级 TLB 都没命中，接下来谁来找物理地址？', 'Both TLBs miss. Who finds the physical address?'), options: [L('CPU 的操作系统', 'The CPU’s operating system'), L('GPU 自己的 GMMU 逐级查页表', 'The GPU’s own GMMU walks the page table'), L('直接报错', 'The load fails')], answer: 1, explain: L('GMMU 是 GPU 上的硬件，自己读页表，不用 CPU 插手。', 'The GMMU is hardware on the GPU and reads the page table itself, without the CPU.') },
    'pagetable:4': { q: L('PD0 这一项指向 2 MiB 大页，物理地址怎么得出？', 'The PD0 entry maps a 2 MiB page. How do you get the physical address?'), options: [L('页表项本身就是物理地址', 'The entry is the physical address'), L('页基址加上虚拟地址低 21 位', 'Page base plus the low 21 bits of the virtual address'), L('虚拟地址加上 TLB 大小', 'Virtual address plus the TLB size')], answer: 1, explain: L('页内偏移原样保留：0x24e000000 + 0x164a40。', 'The offset into the page carries over: 0x24e000000 + 0x164a40.') },
    'pixel:3': { q: L('像素 (3, 4) 的颜色从哪里来？', 'Where does pixel (3, 4) get its color?'), options: [L('查一张现成的像素表', 'From a ready-made pixel table'), L('三个顶点的颜色按重心权重混合', 'The vertex colors blended by barycentric weights'), L('着色器随机生成', 'The shader picks one at random')], answer: 1, explain: L('c = 0.2·v₀ + 0.5·v₁ + 0.3·v₂。', 'c = 0.2·v₀ + 0.5·v₁ + 0.3·v₂.') },
    'pixel:5': { q: L('如果帧缓冲里已经有一个更近的像素，会怎样？', 'What if the framebuffer already holds a nearer pixel?'), options: [L('新的覆盖旧的', 'The new one overwrites it'), L('新片元被丢掉，不写入', 'The new fragment is discarded'), L('两个颜色平均', 'The colors are averaged')], answer: 1, explain: L('深度测试在写入前把被挡住的片元丢掉。', 'The depth test drops hidden fragments before they are written.') },
    'stacking:2': { q: L('一组 HBM 一次能并行传多少位？', 'How many bits does one HBM stack move in parallel?'), options: [L('64 位', '64 bits'), L('1024 位', '1024 bits'), L('8 位', '8 bits')], answer: 1, explain: L('每组 1024 位，分成多个独立通道。', '1024 bits per stack, split into independent channels.') },
    'stacking:4': { q: L('为什么不把这几千根线布在 PCB 上？', 'Why not route these thousands of wires on the PCB?'), options: [L('PCB 线太短', 'PCB wires are too short'), L('PCB 做不到这么细的线距', 'A PCB can’t reach that wiring pitch'), L('PCB 不导电', 'PCBs don’t conduct')], answer: 1, explain: L('中介层用芯片工艺布线，线距比 PCB 细得多。', 'The interposer uses chip lithography, with a far finer pitch than any PCB.') }
  };

  const STEP_CHIPS = {};
  Object.keys(JOURNEYS).forEach(key => { STEP_CHIPS[key] = JOURNEYS[key].steps.map(step => step.chip); });

  function createState(o) {
    o = o || {};
    const model = MODELS[o.model] ? o.model : 'h100';
    return {
      journey: JOURNEYS[o.journey] ? o.journey : 'gemm',
      model,
      stepIndex: 0,
      selected: null,
      playing: false,
      predictions: {},
      compareModel: (o.compareModel && MODELS[o.compareModel] && o.compareModel !== model) ? o.compareModel : null
    };
  }
  function currentJourney(state) { return JOURNEYS[state.journey]; }
  function currentStep(state) { return currentJourney(state).steps[state.stepIndex]; }
  function currentStepChip(state) { return (STEP_CHIPS[state.journey] || [])[state.stepIndex] || null; }
  function term(id) { return GLOSSARY[id] ? { id, name: GLOSSARY[id].name, gloss: GLOSSARY[id].gloss } : null; }
  // Terms first used at this step of this walkthrough.
  function termsFor(journey, stepIndex) {
    const j = JOURNEYS[journey];
    const step = j && j.steps[stepIndex];
    return step ? (step.terms || []).map(term).filter(Boolean) : [];
  }
  // Every term a walkthrough uses, in the order the steps introduce them.
  function glossaryFor(journey) {
    const j = JOURNEYS[journey];
    if (!j) return [];
    const ids = [];
    j.steps.forEach(step => (step.terms || []).forEach(id => { if (!ids.includes(id)) ids.push(id); }));
    (EXTRA_TERMS[journey] || []).forEach(id => { if (!ids.includes(id)) ids.push(id); });
    return ids.map(term).filter(Boolean);
  }
  function getPredict(journey, stepIndex) { return PREDICTS[journey + ':' + stepIndex] || null; }
  function predict(state, choice) {
    const p = getPredict(state.journey, state.stepIndex);
    if (!p || choice < 0 || choice >= p.options.length) return null;
    state.predictions[state.journey + ':' + state.stepIndex] = choice;
    return { correct: choice === p.answer, explain: p.explain };
  }
  function predictionMade(state) { return state.predictions[state.journey + ':' + state.stepIndex]; }
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
    const n = currentJourney(state).steps.length;
    const index = Number.isFinite(Number(i)) ? Math.trunc(Number(i)) : 0;
    state.stepIndex = Math.max(0, Math.min(n - 1, index));
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
  function select(state, nodeId) {
    if (currentJourney(state).nodes.some(n => n.id === nodeId)) state.selected = nodeId;
    return state;
  }
  function selectNext(state, dir) {
    const nodes = currentJourney(state).nodes;
    if (!nodes.length) return state;
    const cur = nodes.findIndex(n => n.id === state.selected);
    const nextIdx = cur < 0 ? (dir < 0 ? nodes.length - 1 : 0) : (cur + dir + nodes.length) % nodes.length;
    state.selected = nodes[nextIdx].id;
    return state;
  }
  function playStep(state) {
    if (!state.playing) return state;
    if (isAtEnd(state)) { state.playing = false; return state; }
    return next(state);
  }
  function encodeState(state) {
    const parts = ['j=' + encodeURIComponent(state.journey), 'm=' + encodeURIComponent(state.model), 's=' + state.stepIndex];
    if (state.selected) parts.push('sel=' + encodeURIComponent(state.selected));
    if (state.compareModel) parts.push('cmp=' + encodeURIComponent(state.compareModel));
    return parts.join('&');
  }
  function decodeState(hash) {
    const out = createState({});
    if (!hash) return out;
    const params = new URLSearchParams(String(hash).replace(/^#/, ''));
    if (JOURNEYS[params.get('j')]) out.journey = params.get('j');
    if (MODELS[params.get('m')]) out.model = params.get('m');
    const s = parseInt(params.get('s'), 10);
    if (!isNaN(s)) out.stepIndex = Math.max(0, Math.min(currentJourney(out).steps.length - 1, s));
    const sel = params.get('sel');
    if (sel) select(out, sel);
    const cmp = params.get('cmp');
    if (cmp) setCompare(out, cmp);
    return out;
  }
  // Where a step happens in the 3D scene: hardware level, explosion and camera.
  function guideFor(journey, stepIndex) {
    const j = JOURNEYS[journey] || JOURNEYS.gemm;
    const step = j.steps[Math.max(0, Math.min(j.steps.length - 1, Number(stepIndex) || 0))];
    return { level: step.level || 'board', explode: Number(step.explode) || 0, camera: step.camera || 'three-quarter' };
  }

  const api = { MODELS, JOURNEYS, PREDICTS, STEP_CHIPS, ADDRESS, GLOSSARY, termsFor, glossaryFor, currentStepChip, createState, currentJourney, currentStep,
    setCompare, isAtStart, isAtEnd, next, prev, goto, reset, setJourney, setModel, select, selectNext, playStep,
    encodeState, decodeState, getPredict, predict, predictionMade, guideFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerState = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
