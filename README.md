# GPU Explorer

[在线体验 / Live](https://yingxu-work.github.io/gpu-explorer/) · [项目构想](docs/PROJECT_CONCEPT.md) · [本轮改版 / This revision](docs/REVAMP_2026-11-09.md) · [流程箭头与示例面板 / Walkthrough arrows and panel](docs/WALKTHROUGHS_2026-11-10.md) · [SM 来源](docs/SM_LAYOUT_SOURCES.md) · [SM 资源](docs/SM_EXECUTION_UNITS.md)

**中文** · [English](#english)

一块可以拆开的 H100 / A100 SXM 模组。在“解剖硬件”里逐层进入电路板、封装、GPU 裸片、SM、HBM、供电和连接器；在“跟着算一次”里，四个流程都直接在同一个三维模型上播放：

- **一次矩阵乘法**：从 HBM 里的 A、B 一路算到 C[3,7] = 37。
- **一次地址翻译**：线程给出的虚拟地址经 L1 TLB、共享 TLB、GMMU 逐级查页表，找到 HBM 里的物理地址（Hopper GMMU 格式，57 位虚拟地址）。
- **一个像素的旅程**：在 H100 仅有的两个图形 TPC 上，从顶点、光栅化、着色、纹理、深度测试到帧缓冲，最后经 SXM 连接器拷出去（H100 没有显示接口）。
- **芯片为什么堆起来**：带宽需求、HBM 叠层与 TSV、1024 位接口、硅中介层、从硅到 PCB 的层次、散热，以及没启用的 SM 和 HBM 位置。

界面支持中文和英文，右上角切换，选择保存在链接（`lang=`）和浏览器本地存储里。

### 事实与示意的边界

| 产品 | 启用的 SM | L2 | 显存 | 带宽 | 启用的 HBM |
| --- | ---: | ---: | --- | ---: | ---: |
| H100 SXM 80GB | 132（66 TPC，8 GPC） | 50 MB | 80 GB HBM3 | 3.35 TB/s | 5 / 6 |
| A100 SXM 80GB | 108（54 TPC，7 GPC） | 40 MB | 80 GB HBM2e | 2.04 TB/s | 5 / 6 |

外形是按公开资料做的近似重建，不是厂商 CAD。裸片和 SM 的布局沿用 NVIDIA 架构文章里的功能框图；色块位置、被关掉的 TPC 位置、TLB / GMMU / 光栅 / ROP 的标注位置都是示意。HBM 八层剖面、六相供电、PCB 层叠和中介层走线是示意。数据通路按功能画出，不是金属走线。来源见页面里的“来源”和 [本轮记录](docs/REVAMP_2026-11-09.md)。

### 开发与测试

纯静态页面，没有后端，Three.js 在 `three/` 里本地提供，没有 CDN。

```sh
python3 -m http.server 18910 --bind 127.0.0.1   # http://127.0.0.1:18910/
./run_tests.sh                                  # 单元测试和 HTTP 契约，Node 18+，不需要浏览器
./run_e2e.sh                                    # 真实浏览器的整页点击测试，见下方 English 部分的变量说明
```

GitHub Pages 从 `main` 根目录发布。静态资源用统一的 `?v=` 版本号，发布新版本时一起更新（`tests/integration.js` 会检查版本是否一致）。

---

## English

A take-apart H100 / A100 SXM module. **Anatomy** lets you go level by level through the board, package, GPU die, SM, HBM, power delivery and connector. **Walkthroughs** play four step-by-step stories directly on the same 3D model:

- **One matrix multiply**: from A and B in HBM to C[3,7] = 37.
- **One address translation**: a thread's virtual address goes through the L1 TLB, the shared TLB and a GMMU page walk to a physical address in HBM (Hopper GMMU format, 57-bit virtual addresses).
- **One pixel's journey**: on H100's only two graphics-capable TPCs, from vertices through rasterization, shading, texturing and the depth test into the framebuffer, then out through the SXM connector (H100 has no display output).
- **Why the chips are stacked**: the bandwidth need, HBM layers and TSVs, the 1024-bit interface, the silicon interposer, the layers from silicon to PCB, heat, and the parts that ship disabled.

The interface is available in Chinese and English (switch at the top right). The choice is kept in the link (`lang=`) and in local storage.

### What is fact and what is illustration

Product numbers are in the table above. The geometry is an approximate rebuild from public material, not vendor CAD. Die and SM layouts follow the functional block diagrams in NVIDIA's architecture articles; block positions, which TPCs are disabled, and where the TLB, GMMU, raster and ROP markers sit are illustrative. The eight-layer HBM cutaway, the six-phase power stage, the PCB stack-up and the interposer wiring are illustrations. Data paths show function, not metal routing.

### Development and tests

```sh
python3 -m http.server 18910 --bind 127.0.0.1   # http://127.0.0.1:18910/
./run_tests.sh                                  # unit + HTTP contract tests, Node 18+, no browser
./run_e2e.sh                                    # whole-page click-through tests in a real Chromium
./run_e2e.sh --grep language                    # only tests whose name matches
```

`run_tests.sh` covers state and navigation, every walkthrough's step data, the worked-example arithmetic (GEMM, GMMU address fields, barycentric colour, HBM per-line rate), i18n completeness (every UI key and every data string exists in both languages, no hard-coded Chinese outside bilingual pairs, every key used by the page exists), the hardware geometry (shipping SM/TPC/GPC/HBM counts, SM resource counts, picking, camera fits, isolation, label language switching), lesson overlays for every step of every walkthrough, and the served assets.

`run_e2e.sh` starts its own static server on `127.0.0.1` and drives a real Chromium through every tab, walkthrough, step, timeline chip and control, the language switch, model switch, URL restore, keyboard, dialogs, a 375 px and a 768 px viewport and reduced motion, and fails on any console warning or error. Configuration:

| Variable | Meaning |
| --- | --- |
| `GX_CHROME` | Chromium / Chrome executable. Default: newest `~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome` |
| `GX_PLAYWRIGHT` | Directory containing `node_modules/playwright-core` (or the package itself). Default: this repo, then `~/devbrowser` |
| `GX_BASE_URL` | Test an already running site instead of the built-in server, e.g. the live Pages URL |
| `GX_SHOTS` | Save screenshots of key views into this directory |
| `GX_HEADFUL=1` | Show the browser window |

WebGL runs fine on CPU through SwiftShader (`--use-angle=swiftshader`), so no GPU is needed.

File map: `app.js` UI and playback; `i18n.js` the dictionary and language handling; `state.js` walkthrough content and domain state; `interaction-state.js` the anatomy/walkthrough state machine; `journey-lab.js` the worked-example panels; `scene3d.js` WebGL, camera and picking; `hardware-model.js` the board, package, die and SM; `hbm-model.js`, `power-model.js`, `interconnect-model.js` the component cutaways; `surface-label.js` bilingual printed lettering; `surface-textures.js` procedural surfaces; `teaching-flow.js` the lesson overlays and anatomy data paths; `selection-feedback.js` hover and selection emphasis.

GitHub Pages publishes from the root of `main`. Every local asset carries the same `?v=` version; bump it in one go on release.

Interaction ideas come from [PC Anatomy](https://pc-anatomy.com/) and [LLM Visualization](https://bbycroft.net/llm). An independent open-source teaching project, not affiliated with or endorsed by any hardware vendor.
