# SM 功能布局与数据线路口径

## 为什么 scheduler 和 L1 看起来隔得远？

此前模型把四个子分区拉成四条长列，且省略了派发、LD/ST 和内部互连，夸大了两者之间的视觉空隙。本轮按官方图改为紧凑的 2×2 子分区，补出这些资源与连接。

NVIDIA 的 H100 Figure 4 和 A100 Figure 5 都把 scheduler 放在各子分区内部，把共用的 **L1 Data Cache / Shared Memory** 放在四个子分区下方。它们是功能框图，不能据此量出真实硅片上的距离。本模型沿用资源归属和连接关系，不声称掌握厂商的晶体管版图或金属布线。

## 已核实的组织关系

- 四个 SM 子分区各有 warp scheduler、dispatch、寄存器和执行管线；LD/ST 负责载入/存储，调度器属于指令控制路径。
- SM 共用 L1 数据缓存/共享内存；H100 合计 256KB，A100 合计 192KB。可配置的 Shared Memory 上限分别为 228KB、164KB。
- L1 **指令**缓存与 L1 **数据**缓存不同；每个子分区还有本地 L0 指令缓存。
- 32 banks 指 Shared Memory；不能把整个统一 L1/shared 区域标成“32 banks”。
- TMA 是 Hopper 的新增数据搬运资源；A100 不画作具备 TMA。

## 动画线路

黄色弧线与飞行圆点已替换为沿模型表面的直角互连走线和短线段亮起。封装层显示 HBM/中介层信号；Die 层显示含 L2 的内部路径；SM 层区分指令派发和操作数搬运。它们表示教学路径，不是真实线路网表。硅片盖住的内部路径不会透过实心硅片显示。

GEMM 的操作数路径为通用参考；Hopper GMMA 也可以直接从共享内存取得矩阵操作数，不应把本动画解释为所有 MMA 指令都必须采用同一寄存器布局或同一路径。

## 官方来源

- [NVIDIA Hopper Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/)，Figure 4：GH100 SM，L1/shared 容量、TMA。
- [NVIDIA Ampere Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-ampere-architecture-in-depth/)，Figure 5：GA100 SM，统一 L1/shared 和异步拷贝。
- [Nsight Compute Profiling Guide — Streaming Multiprocessor](https://docs.nvidia.com/nsight-compute/ProfilingGuide/#streaming-multiprocessor)，四个子分区的资源划分、共用存储与执行管线。
- [CUDA Programming Guide — Shared-memory access patterns](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html#shared-memory-access-patterns)，共享内存的 32 banks。
