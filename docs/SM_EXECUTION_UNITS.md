# SM 中每种颜色表示什么

适用型号：H100 的 GH100 / compute capability 9.0，以及 A100 的 GA100 / compute capability 8.0。颜色是 GPU Explorer 的教学图例，不是芯片真实颜色，也不能按颜色推断数值精度。SM 视图保留 NVIDIA 公开功能框图的四个子分区（SMSP）与资源归属，尺寸、间距和浮雕高度不是物理版图。

## 可点击资源与数量

下表写的是功能单元数量或存储容量，不是每周期吞吐量。一个 FMA 的 FLOP 计数、指令发射率与执行单元数量也不是一回事。

| 资源 / 组件 ID | 颜色 | H100 每 SM / 每 SMSP | A100 每 SM / 每 SMSP |
| --- | --- | ---: | ---: |
| FP32 CUDA 运算通道 `fp32` | 绿色 | 128 / 32 | 64 / 16 |
| 非 Tensor FP64 通道 `fp64` | 蓝色 | 64 / 16 | 32 / 8 |
| INT32 整数通道 `int32` | 青绿色 | 64 / 16 | 64 / 16 |
| 特殊函数单元 `sfu` | 珊瑚色 | 16 / 4 | 16 / 4 |
| Tensor Core `tensor` | 金色 | 4 / 1，第四代 | 4 / 1，第三代 |
| Load / Store `lsu` | 铜色 | 32 / 8 | 32 / 8 |
| Warp 调度器 `warp` | 棕色 | 4 / 1 | 4 / 1 |
| 指令派发 `dispatch` | 灰褐色 | 4 / 1 | 4 / 1 |
| 寄存器文件 `registers` | 紫色 | 65,536 / 16,384 个 32-bit 寄存器 | 相同 |
| 本地 L0 指令缓存 `l0-instruction-cache` | 蓝灰色 | 四个 SMSP 各有一个 | 相同 |
| L1 指令缓存 `instruction-cache` | 蓝灰色 | 一项 SM 级共享功能资源 | 相同 |
| 纹理单元 `texture` | 灰蓝色 | SM 图底部 4 个 Tex | 相同 |

紫色块是**存储**，不是另一种浮点核心。寄存器容量合计 256 KiB / SM，每 SMSP 64 KiB。图中的紫色小格是压缩的 bank 符号，不是一格对应一个寄存器。寄存器与下方 L1 数据缓存 / Shared Memory 是不同资源，不能因容量数字相近就把它们合并。

绿色、蓝色和青绿色执行区采用一格对应一个相应算术通道的表示；SFU 和 LD/ST 也按上表数量绘制。Tensor Core 的一整个金色外框才是一个 Tensor Core，其内部的小格是阵列纹理，不应逐格计数。所有这些区域均可单独选中、聚焦和隔离。

## FP16 在哪里

绿色标为 **FP32 CUDA 执行通道**，不能称为“FP16 专用核心”。NVIDIA 的官方 SM 功能图没有这里另画的一组独立 FP16 方块，所以本模型不虚构一组。

这也不表示 FP16 只能在 Tensor Core 上执行。普通 16-bit 算术指令与矩阵指令都存在。Tensor Core 的特点是执行矩阵乘加（MMA），支持包括 FP16、BF16、TF32、FP64 在内的模式；Hopper 增加 FP8。常见混合精度模式使用 FP16/BF16 矩阵输入和 FP32 累加，但具体模式由指令规定。普通半精度逐线程算术不能直接等同于 Tensor Core 矩阵运算。

A100 在这里指 **GA100**，不是 GeForce 的 GA10x。不要把其他 Ampere 芯片的共享 FP32/INT32 路径示意套到 GA100 上。

## 其他存储与搬运资源

H100 SM 的统一 L1 数据缓存 / Shared Memory 资源为 256 KB，其中共享内存最多 228 KB；A100 相应为 192 KB / 164 KB。模型中的 32 banks 指共享内存，而不是整个 L1 数据缓存。指令缓存保存指令，寄存器保存线程操作数与累加器。

Hopper 的 TMA 是异步张量搬运功能硬件，不是 FP32 或 FP16 算术通道。模型以灰色长条表示这项共享功能，不根据一条框图长条推断其内部物理引擎数量。A100 不显示 Hopper TMA。

## 实现接口

`getSMResourceLegend(model)` 与 `hardware.smResourceLegend` 提供组件 ID、名称、`color`、`category`、`countPerSM`、`countPerPartition`、`countUnit`、解释和原始资料链接。相同字段合并到 `hardware.components[id]`；没有可靠数量的共享功能资源不填伪造的 core 数。

已有矩阵教学动画的寄存器、Tensor Core、LD/ST 与 Shared Memory 路线坐标保持不变；新增标记补足每个色块的具体含义。

## NVIDIA 原始资料

- [CUDA C++ Programming Guide 12.4.1，§16.7.1：8.x 架构](https://docs.nvidia.com/cuda/archive/12.4.1/cuda-c-programming-guide/index.html#compute-capability-8-x)：区分 GA100 的 cc 8.0 与其他 8.x 变体；包含算术、SFU 与调度器数量。
- [同一指南，§16.8.1：Hopper cc 9.0](https://docs.nvidia.com/cuda/archive/12.4.1/cuda-c-programming-guide/index.html#compute-capability-9-0)：H100 算术单元、SFU 与调度器数量。
- [NVIDIA Hopper Architecture In-Depth，Figure 4 与 Table 3](https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/)：GH100 SM 功能图、寄存器分区与不同精度的运算资源；该文章部分性能表为发布时的预估，本文只使用架构组织和数量。
- [NVIDIA Ampere Architecture In-Depth，Figure 5](https://developer.nvidia.com/blog/nvidia-ampere-architecture-in-depth/)：GA100 SM 的资源与局部组织。
- [NVIDIA A100 whitepaper，印刷页 22、34](https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf)：功能框图和相互独立的 FP32 / INT32 路径。
- [NVIDIA CUDA Programming and Optimization，Hopper architecture 页](https://developer-blogs.nvidia.com/wp-content/uploads/2024/08/CUDA-Programming-and-Optimization.pdf)：补充 32 个 LD/ST、16 个 SFU、四个调度器与寄存器总量。
- [CUDA Binary Utilities，Hopper instruction set](https://docs.nvidia.com/cuda/cuda-binary-utilities/index.html#hopper-instruction-set)：普通 FP16 的 HADD2 / HMUL2 / HFMA2 指令与矩阵指令分别列出。
