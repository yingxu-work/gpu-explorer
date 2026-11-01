// Shared language for the visible guide status; physical motion begins at step 04.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerStory = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const STEPS = [
    { kind: 'target', phase: '定位结果', caption: '先在显存里找到 C[3,7]，此时还没有计算。', nodes: ['A 在 HBM','B 在 HBM','目标 C[3,7]'], complete: '目标已定位' },
    { kind: 'dependency', phase: '追踪依赖', caption: '虚线表示输入依赖；数据仍留在 HBM，尚未搬运。', nodes: ['A[3,:]','B[:,7]','C[3,7]'], complete: '依赖已展开' },
    { kind: 'placement', phase: '分配工作', caption: '将输出 tile 分给 CTA，再落到 SM；输入仍在显存。', nodes: ['输出 tile','CTA 3','选中的 SM'], complete: '分工已显示' },
    { kind: 'transfer', phase: '搬入第一块', caption: '教学透视：看清 HBM 经中介层、L2 到 SM 的路径。', nodes: ['HBM','中介层','L2','SM / Shared'], complete: '数据已到达' },
    { kind: 'control', phase: '线程协作', caption: '蓝色显示指令派发，青色显示操作数路径。', nodes: ['Warp 调度','指令派发','32 个线程'], complete: '分工已显示' },
    { kind: 'compute', phase: '第一轮乘加', caption: '沿片上互连跟随操作数，累加器从 0 走到 19。', nodes: ['Shared','矩阵片段','Tensor Core','acc = 19'], complete: '第一轮完成' },
    { kind: 'reuse', phase: '换块并累加', caption: '保留 19，再处理下一块，最终得到 37。', nodes: ['下个 K-tile','Shared','继续乘加','acc = 37'], complete: '累加完成' },
    { kind: 'writeback', phase: '写回结果', caption: '教学透视：结果经过缓存层级回到 HBM 中的 C。', nodes: ['acc = 37','L2','HBM · C[3,7]'], complete: '结果已写回' }
  ];
  return { STEPS, forStep: index => STEPS[Math.max(0, Math.min(7, Number(index) || 0))] };
});
