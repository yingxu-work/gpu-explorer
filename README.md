# GPU Explorer

[在线体验](https://yingxu-work.github.io/gpu-explorer/) · [项目构想](docs/PROJECT_CONCEPT.md) · [本轮改版与验证](docs/REDESIGN_2026-11-02.md) · [交互回归记录](docs/INTERACTION_QA_2026-11-02.md) · [组件与教学路径细化](docs/HARDWARE_FLOW_REFINEMENT.md)

一颗能拆开、进入、运行和解释的 GPU。实物外形的解剖模型，与逐步的动画、数学和文字讲解放在同一现场。

## 可以做什么

- **解剖硬件**：在 SXM 模组、芯片封装、GPU Die、SM、HBM、供电和 PCB / SXM 七个视图探索。旋转、缩放、平移、点选、双击聚焦、隔离、复位、标签和连续拆解。
- **跟着算一次**：八步矩阵乘法旅程，追踪 A 的一行与 B 的一列；数值动画显示两轮 K-tile 累加到 `C[3,7] = 37`，并联动硬件、数学、伪代码与解释。
- **控制节奏**：逐步前进、回看、当前步骤重播与暂停、全程自动播放、速度，以及直接跳转的时间轴。旋转和 3D / TOP / SIDE 预设保留教学进度与播放。
- **对照架构**：选择 H100 或 A100，保留当前计算问题；规格对照面板比较所选 SXM 80GB 产品。
- **扩展实验**：通用 x86-64 四级页表、单像素图形管线、概念性逻辑堆叠。它们在独立教学面板中解释对应概念，**不表示 H100 内含 CPU 核、显示输出或上下堆叠逻辑层**。
- **分享现场**：URL 保存旅程、型号、步骤、选中对象、探索尺度与拆解程度。方向键和空格可控制步骤；画布或部件列表聚焦时使用各自的选择行为。

## 外形与事实的边界

| 当前标本 | 有源 SM | L2 | 显存 | 有源 HBM 堆栈 |
| --- | ---: | ---: | --- | ---: |
| H100 SXM 80GB | 132 | 50MB | 80GB HBM3 | 5 |
| A100 SXM 80GB | 108 | 40MB | 80GB HBM2e | 5 |

上述规格来自官方资料。H100 产品不能与完整 GH100 的 144 SM、60MB L2、六组 HBM 配置混为一谈。H100 每 SM 的 256KB 是 **L1/Shared 合计容量**，不是可由一个 block 全部申请的 Shared Memory。

外部为程序化近似重建，没有使用厂家 CAD；元件与走线不是逐件测量。内部彩色阵列说明资源组织，不是真实晶体管版图，禁用单元位置和各区域比例不代表制造配置。两代外形共用近似的 SXM 解剖展示，不能据此推断 PCB 布局、连接器或机械尺寸完全相同。

GEMM 使用可验证的小矩阵解释内积和分块。32 lane 图表示线程组织，不是某条 Tensor Core 指令的线程寄存器映射；逐项标量累加是参考数学。动画节奏不代表硬件延迟或性能测量。

### 官方来源

- [NVIDIA Hopper Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/)：H100 SXM、GH100、SM、TMA、HBM 与缓存。
- [NVIDIA Ampere Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-ampere-architecture-in-depth/)：A100/GA100 资源组织与原始 40GB 配置。
- [NVIDIA HGX A100 80GB](https://developer.nvidia.com/blog/supercharging-worlds-fastest-ai-supercomputing-platform-on-hgx-a100-80gb-gpus/)：80GB HBM2e 及 2,039GB/s 带宽。

- [Synopsys HBM3 PHY](https://www.synopsys.com/designware-ip/interface-ip/hbm/hbm3-phy.html)：HBM3 通道、伪通道与接口。
- [AMD HBM Topology](https://docs.amd.com/r/en-US/pg313-network-on-chip/HBM-Topology)：HBM2 / HBM2e 通道组织。
- [TI 多相电源](https://www.ti.com/document-viewer/lit/html/SSZTC61/GUID-0C11D72C-F6B3-479F-81D7-D5EFA802CA64)：交错、多相与纹波。
- [TI PCB 布线指南](https://www.ti.com/lit/an/sbaa405a/sbaa405a.pdf)：参考平面和回流路径的通用原理，不作为 SXM 专用布线资料。

交互方向参考 [PC Anatomy](https://pc-anatomy.com/) 与 [LLM Visualization](https://bbycroft.net/llm)。独立开源教学项目，与硬件厂商无隶属或认可关系。

## 开发与验证

测试环境需要 Node.js 18 或更新版本。

纯静态应用，无后端。Three.js 本地提供，无运行时 CDN 依赖。

```sh
python3 -m http.server 18910 --bind 127.0.0.1
# http://127.0.0.1:18910/
./run_tests.sh
```

`app.js` 管界面、交互与播放；`hardware-model.js` 构建程序化实物；`hbm-model.js`、`power-model.js`、`interconnect-model.js` 构建组件剖面；`scene3d.js` 管 WebGL、相机和选取；`teaching-flow.js` 管沿模型表面的教学路径；`lesson-story.js` 管路径说明；`journey-lab.js` 管教学图与可测试的数学；`state.js` 管共享状态。`scene-map.js` 保留旧概念图映射与兼容测试，当前实物渲染不依赖其几何。

测试覆盖状态往返、旅程控制、旧概念几何、数值计算、页表索引、三维相机投影、隔离恢复、静态资源与界面契约；它们不执行 WebGL。此前回归记录保留 114 项检查与 31 条 Chrome 操作序列；本次新增组件、路径语义和视角连续性验证，见组件与教学路径细化记录。

GitHub Pages 从 `main` 根目录发布。

### 探索与教学如何切换

硬件层级、选中、隔离和拆解进入自由探索，并暂停教学。旋转、平移、缩放与相机预设只改变观察方向，保留教学。顶部「跟着算一次」回到当前步骤：停止自动拆解、合拢装配、取消隔离与用户选中、恢复该步骤的标准镜头。再次点击也会重新演示该步。时间轴、前后步、旅程入口和完整播放共用这个入口，状态转换集中在 `interaction-state.js`。SM 为功能图，在该尺度拆解会进入封装。

HBM 八层切面、六相供电电路和 PCB 接点阵列是教学几何，不代表具体产品的层数、相数或引脚定义。HBM 通道数与叠层数是不同概念；PCB 普通通孔与硅通孔 TSV 分开展示。教学的第 1–3 步表示目标、依赖和工作分配，第 4 步开始搬运；封装搬运阶段使用标明的教学透视。

SM 布局与线路说明见 [官方来源核实](docs/SM_LAYOUT_SOURCES.md)。
