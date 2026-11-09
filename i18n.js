// Bilingual text for GPU Explorer. Every user-facing string exists in Chinese
// and English. Data modules store text as {zh, en}; UI chrome uses keys below.
// Loaded as a classic script in the page and with require() in Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerI18n = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const LANGS = ['zh', 'en'];
  const STORAGE_KEY = 'gpu-explorer-lang';
  let lang = 'zh';
  const listeners = new Set();

  const STRINGS = {
    'meta.title': { zh: 'GPU Explorer · 拆开一块 GPU，跟着它算一次', en: 'GPU Explorer · Take a GPU apart and follow one computation' },
    'meta.description': { zh: '可拆解的 H100 / A100 三维模型。看一次矩阵乘法、一次地址翻译、一个像素和一组 HBM 堆叠分别发生在芯片的哪里。', en: 'A 3D H100 / A100 you can take apart. See where a matrix multiply, an address translation, a pixel and an HBM stack live on the chip.' },
    'brand.home': { zh: 'GPU Explorer 首页', en: 'GPU Explorer home' },
    'mode.nav': { zh: '工作区', en: 'Workspace' },
    'mode.explore': { zh: '解剖硬件', en: 'Anatomy' },
    'mode.learn': { zh: '跟着算一次', en: 'Walkthroughs' },
    'mode.learnTitle': { zh: '回到第 {n} 步并重新演示', en: 'Back to step {n} and replay it' },
    'lang.nav': { zh: '界面语言', en: 'Language' },
    'lang.switchTo': { zh: '切换到{name}', en: 'Switch to {name}' },
    'lang.zhName': { zh: '中文', en: 'Chinese' },
    'lang.enName': { zh: '英文', en: 'English' },
    'top.github': { zh: 'GitHub', en: 'GitHub' },
    'top.help': { zh: '操作说明', en: 'Controls' },
    'side.nav': { zh: '导航', en: 'Navigation' },
    'side.model': { zh: '型号', en: 'Model' },
    'side.levels': { zh: '硬件层级', en: 'Hardware levels' },
    'side.journeys': { zh: '流程', en: 'Walkthroughs' },
    'side.parts': { zh: '部件列表', en: 'Parts list' },
    'side.compare': { zh: '规格对照', en: 'Compare specs' },
    'side.comparePick': { zh: '选择另一颗 GPU', en: 'Pick another GPU' },
    'side.sources': { zh: '来源', en: 'Sources' },
    'model.h100': { zh: 'H100 SXM 80GB', en: 'H100 SXM 80GB' },
    'model.a100': { zh: 'A100 SXM 80GB', en: 'A100 SXM 80GB' },
    'level.board': { zh: 'SXM 模组', en: 'SXM module' },
    'level.board.sub': { zh: '电路板、供电、连接器', en: 'Board, power, connector' },
    'level.package': { zh: '芯片封装', en: 'Package' },
    'level.package.sub': { zh: 'GPU 裸片、HBM、中介层', en: 'GPU die, HBM, interposer' },
    'level.die': { zh: 'GPU 裸片', en: 'GPU die' },
    'level.die.sub': { zh: 'GPC、SM、L2、接口', en: 'GPCs, SMs, L2, I/O' },
    'level.sm': { zh: 'SM', en: 'SM' },
    'level.sm.sub': { zh: '调度器、寄存器、Tensor Core', en: 'Schedulers, registers, Tensor Cores' },
    'level.hbm': { zh: 'HBM 显存', en: 'HBM memory' },
    'level.hbm.sub': { zh: 'DRAM 叠层、TSV、通道', en: 'DRAM layers, TSVs, channels' },
    'level.power': { zh: '供电', en: 'Power delivery' },
    'level.power.sub': { zh: '功率级、电感、电容', en: 'Power stages, inductors, capacitors' },
    'level.interconnect': { zh: 'PCB 与连接器', en: 'PCB and connector' },
    'level.interconnect.sub': { zh: '铜层、过孔、触点', en: 'Copper layers, vias, contacts' },
    'scene.label': { zh: '三维硬件模型。拖动旋转，Shift 加拖动平移，滚轮缩放，双击进入部件。F 聚焦，I 隔离，R 复位。', en: '3D hardware model. Drag to rotate, Shift-drag to pan, scroll to zoom, double-click to go inside a part. F focuses, I isolates, R resets.' },
    'scene.toolbar': { zh: '视图工具', en: 'View tools' },
    'tool.rotate': { zh: '旋转', en: 'Rotate' },
    'tool.pan': { zh: '平移', en: 'Pan' },
    'tool.labels': { zh: '标签', en: 'Labels' },
    'tool.labelsAria': { zh: '显示或隐藏标签', en: 'Show or hide labels' },
    'tool.paths': { zh: '通路', en: 'Paths' },
    'tool.pathsAria': { zh: '显示这一层的数据通路', en: 'Show data paths at this level' },
    'tool.focus': { zh: '聚焦', en: 'Focus' },
    'tool.focusAria': { zh: '把镜头对准选中的部件', en: 'Frame the selected part' },
    'tool.isolate': { zh: '隔离', en: 'Isolate' },
    'tool.isolateAria': { zh: '只显示选中的部件', en: 'Show only the selected part' },
    'tool.reset': { zh: '复位', en: 'Reset' },
    'tool.resetAria': { zh: '复位镜头并合拢', en: 'Reset camera and reassemble' },
    'cam.nav': { zh: '视角', en: 'Camera' },
    'cam.3d': { zh: '斜视', en: '3D' },
    'cam.top': { zh: '俯视', en: 'Top' },
    'cam.side': { zh: '侧视', en: 'Side' },
    'cam.fullscreen': { zh: '全屏', en: 'Full screen' },
    'scene.loading': { zh: '正在载入硬件模型', en: 'Loading the hardware model' },
    'scene.error': { zh: '3D 视图没能启动。请在浏览器里打开硬件加速后刷新，右侧的步骤说明仍可阅读。', en: 'The 3D view couldn’t start. Turn on hardware acceleration in your browser and reload. The step text on the right still works.' },
    'scene.errorShort': { zh: '3D 视图不可用', en: '3D view unavailable' },
    'paths.note': { zh: '通路按功能画出，不是芯片里真实的走线位置', en: 'Paths show function, not where the metal wires actually run' },
    'explode.section': { zh: '拆开', en: 'Take apart' },
    'explode.title': { zh: '拆开', en: 'Take apart' },
    'explode.min': { zh: '合拢', en: 'Assembled' },
    'explode.max': { zh: '拆开', en: 'Apart' },
    'explode.auto': { zh: '播放拆开再合拢', en: 'Play take-apart animation' },
    'explode.stop': { zh: '停止拆解动画', en: 'Stop take-apart animation' },
    'explode.slider': { zh: '拆开程度', en: 'How far apart' },
    'inspector.label': { zh: '详情', en: 'Details' },
    'step.replay': { zh: '重新演示', en: 'Replay' },
    'step.replayAria': { zh: '重新演示这一步', en: 'Replay this step' },
    'step.pause': { zh: '暂停', en: 'Pause' },
    'step.pauseAria': { zh: '暂停这一步的动画', en: 'Pause this step’s animation' },
    'step.resume': { zh: '继续', en: 'Resume' },
    'step.resumeAria': { zh: '继续这一步的动画', en: 'Resume this step’s animation' },
    'step.route': { zh: '这一步的路径', en: 'Path in this step' },
    'step.lab': { zh: '数值演示', en: 'Worked example' },
    'details.math': { zh: '公式', en: 'Formula' },
    'details.hardware': { zh: '发生在哪里', en: 'Where it happens' },
    'details.code': { zh: '伪代码', en: 'Pseudocode' },
    'details.predict': { zh: '想一想', en: 'Quick check' },
    'predict.retry': { zh: '再想想：', en: 'Not quite. ' },
    'explore.selected': { zh: '已选中', en: 'Selected' },
    'explore.enter': { zh: '进入内部', en: 'Look inside' },
    'explore.close': { zh: '关闭部件说明', en: 'Close part details' },
    'explore.notes': { zh: '这一层有什么', en: 'What’s at this level' },
    'legend.title': { zh: 'SM 里的资源', en: 'Inside one SM' },
    'legend.count': { zh: '每 SM', en: 'Per SM' },
    'legend.nav': { zh: 'SM 资源图例', en: 'SM resource legend' },
    'nav.prev': { zh: '上一步', en: 'Previous step' },
    'nav.next': { zh: '下一步', en: 'Next' },
    'nav.nextAria': { zh: '下一步', en: 'Next step' },
    'nav.done': { zh: '最后一步', en: 'Last step' },
    'play.all': { zh: '自动播放全部步骤', en: 'Play all steps' },
    'play.pause': { zh: '暂停自动播放', en: 'Pause playback' },
    'play.restart': { zh: '从第 1 步重新开始', en: 'Start over from step 1' },
    'play.speed': { zh: '速度', en: 'Speed' },
    'timeline.nav': { zh: '步骤', en: 'Steps' },
    'timeline.chip': { zh: '第 {n} 步：{label}', en: 'Step {n}: {label}' },
    'timeline.progress': { zh: '流程进度', en: 'Progress' },
    'toast.selectFirst': { zh: '先选中一个部件', en: 'Select a part first' },
    'toast.pickOther': { zh: '请选择另一颗 GPU', en: 'Pick a different GPU to compare' },
    'toast.noFullscreen': { zh: '这个浏览器不支持全屏', en: 'This browser can’t go full screen' },
    'compare.title': { zh: '同一道题，两颗 GPU', en: 'Same problem, two GPUs' },
    'compare.close': { zh: '关闭对照', en: 'Close comparison' },
    'compare.note': { zh: 'SXM 80GB 产品的公开规格', en: 'Published specs for the SXM 80GB products' },
    'compare.arch': { zh: '架构', en: 'Architecture' },
    'compare.sm': { zh: '启用的 SM', en: 'Enabled SMs' },
    'compare.l2': { zh: 'L2 缓存', en: 'L2 cache' },
    'compare.memory': { zh: '显存', en: 'Memory' },
    'compare.bandwidth': { zh: '显存带宽', en: 'Memory bandwidth' },
    'compare.shared': { zh: '每 SM 共享内存上限', en: 'Max shared memory per SM' },
    'compare.footer': { zh: '算出来的数相同，用到的资源和搬运方式不同。', en: 'The answer is the same; the resources and data movement differ.' },
    'help.title': { zh: '怎么操作', en: 'Controls' },
    'help.close': { zh: '关闭说明', en: 'Close controls' },
    'help.drag': { zh: '拖动', en: 'Drag' },
    'help.dragText': { zh: '旋转模型。选“平移”工具后拖动是平移；Shift 加拖动或右键拖动也能平移，触屏用双指。', en: 'Rotate the model. With the Pan tool, dragging pans; Shift-drag or right-drag also pans, and two fingers on a touch screen.' },
    'help.zoom': { zh: '滚轮或双指', en: 'Scroll or pinch' },
    'help.zoomText': { zh: '缩放', en: 'Zoom' },
    'help.click': { zh: '点击与双击', en: 'Click, double-click' },
    'help.clickText': { zh: '点击选中部件，再点一次或点空白处取消；双击进入部件内部。', en: 'Click selects a part; click it again or click empty space to clear. Double-click goes inside.' },
    'help.keys': { zh: 'F、I、R', en: 'F, I, R' },
    'help.keysText': { zh: '聚焦、隔离、复位', en: 'Focus, isolate, reset' },
    'help.steps': { zh: '← → 与空格', en: '← → and Space' },
    'help.space': { zh: '空格', en: 'Space' },
    'help.stepsText': { zh: '上一步、下一步，播放或暂停', en: 'Previous step, next step, play or pause' },
    'help.body': { zh: '“解剖硬件”里按层级拆开模组；“跟着算一次”里选一个流程逐步看。旋转、平移和切换视角不会打断当前步骤。', en: 'In Anatomy, take the module apart level by level. In Walkthroughs, pick one and go step by step. Rotating, panning and changing the camera don’t interrupt the current step.' },
    'help.sources': { zh: '来源与模型说明', en: 'Sources and model notes' },
    'sources.title': { zh: '来源与模型说明', en: 'Sources and model notes' },
    'sources.close': { zh: '关闭来源', en: 'Close sources' },
    'sources.h100': { zh: 'H100 SXM 80GB：8 个 GPC、66 个 TPC、132 个 SM，50 MB L2，5 组 HBM3 共 80 GB。每个 SM 有 4 个子分区，L1 数据缓存和共享内存合计 256 KB。', en: 'H100 SXM 80GB: 8 GPCs, 66 TPCs, 132 SMs, 50 MB of L2, five HBM3 stacks totalling 80 GB. Each SM has four partitions and 256 KB of combined L1 data cache and shared memory.' },
    'sources.a100': { zh: 'A100 SXM 80GB：7 个 GPC、108 个 SM，40 MB L2，5 组 HBM2e 共 80 GB。每个 SM 的 L1 数据缓存和共享内存合计 192 KB。', en: 'A100 SXM 80GB: 7 GPCs, 108 SMs, 40 MB of L2, five HBM2e stacks totalling 80 GB. Each SM has 192 KB of combined L1 data cache and shared memory.' },
    'sources.model': { zh: '模型是按公开资料重建的近似外形，不是厂商 CAD。裸片和 SM 的布局沿用 NVIDIA 架构文章里的功能框图，色块位置不代表晶体管版图。HBM 八层剖面、六相供电和 PCB 层叠是示意。', en: 'The model is an approximate rebuild from public material, not vendor CAD. Die and SM layouts follow the functional block diagrams in NVIDIA’s architecture articles; block positions are not the transistor layout. The eight-layer HBM cutaway, six-phase power stage and PCB stack-up are illustrations.' },
    'sources.journeys': { zh: '地址翻译使用 NVIDIA 开源驱动里公开的 Hopper GMMU 页表格式。像素流程只在 H100 的两个可跑图形的 TPC 上成立。', en: 'Address translation uses the Hopper GMMU page-table format published in NVIDIA’s open-source driver. The pixel walkthrough only applies to the two graphics-capable TPCs on H100.' },
    'sources.list': { zh: '核对规格、资源组织与原理用到的资料：', en: 'Material used to check specs, organization and principles:' },
    'sources.credit': { zh: '交互参考了 PC Anatomy 和 LLM Visualization。独立开源项目，与硬件厂商无关。', en: 'Interaction ideas come from PC Anatomy and LLM Visualization. An independent open-source project, not affiliated with any hardware vendor.' },
    'crumb.nav': { zh: '当前位置', en: 'You are here' },
    'route.nav': { zh: '这一步的路径', en: 'Path in this step' }
  };

  function format(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
  }
  function normalize(value) {
    const v = String(value || '').toLowerCase();
    if (v.startsWith('zh')) return 'zh';
    if (v.startsWith('en')) return 'en';
    return null;
  }
  function t(key, vars) {
    const entry = STRINGS[key];
    if (!entry) return key;
    return format(entry[lang] || entry.zh, vars);
  }
  function isText(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.zh === 'string' && typeof value.en === 'string';
  }
  function pick(value, language) {
    const l = language || lang;
    if (value == null) return '';
    if (isText(value)) return value[l];
    if (Array.isArray(value)) return value.map(v => pick(v, l));
    if (typeof value === 'object' && Array.isArray(value[l])) return value[l];
    return value;
  }
  const L = (zh, en) => ({ zh, en });
  function readStorage() {
    try { return normalize(globalThis.localStorage?.getItem(STORAGE_KEY)); } catch { return null; }
  }
  function writeStorage(value) {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, value); } catch { /* storage may be blocked */ }
  }
  // Priority: explicit URL parameter, then the saved choice, then the browser.
  function detect(options = {}) {
    const hash = options.hash ?? (typeof location !== 'undefined' ? location.hash : '');
    const fromHash = normalize(new URLSearchParams(String(hash).replace(/^#/, '')).get('lang'));
    if (fromHash) return fromHash;
    const stored = 'stored' in options ? normalize(options.stored) : readStorage();
    if (stored) return stored;
    const nav = options.navigator ?? (typeof navigator !== 'undefined' ? (navigator.languages?.[0] || navigator.language) : '');
    return normalize(nav) === 'en' ? 'en' : (normalize(nav) === 'zh' ? 'zh' : 'en');
  }
  function setLang(value, options = {}) {
    const next = normalize(value) || 'zh';
    const changed = next !== lang;
    lang = next;
    if (options.persist !== false) writeStorage(lang);
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    if (changed) for (const fn of listeners) fn(lang);
    return lang;
  }
  // Fill static markup: data-i18n (text), data-i18n-aria, data-i18n-title, data-i18n-content.
  function apply(rootNode) {
    const scope = rootNode || (typeof document !== 'undefined' ? document : null);
    if (!scope) return;
    scope.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
    scope.querySelectorAll('[data-i18n-title]').forEach(node => { node.setAttribute('title', t(node.dataset.i18nTitle)); });
    scope.querySelectorAll('[data-i18n-content]').forEach(node => { node.setAttribute('content', t(node.dataset.i18nContent)); });
  }
  return {
    LANGS, STORAGE_KEY, STRINGS, t, pick, L, isText, detect, setLang, apply, normalize,
    get lang() { return lang; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
});
