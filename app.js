// Domain state, presentation transitions, and scene effects have separate owners.
(function () {
  'use strict';
  const S = window.GpuExplorerState;
  const I = window.GpuExplorerInteraction;
  const $ = id => document.getElementById(id);
  const LEVELS = I.LEVELS;
  const LEVEL_NAMES = { board: 'SXM 模组', package: '芯片封装', die: 'GPU Die', sm: 'SM',
    hbm: 'HBM 内存', power: '供电模块', interconnect: 'PCB / SXM' };
  const VIEW_INFO = {
    board: { title: '一块模组，各司其职。', body: '从计算、存储到供电与互连，沿着部件走进机器内部。', features: [['计算与存储','进入封装、裸片、SM 或 HBM。'],['支撑计算的部件','查看多相供电、PCB 层叠与 SXM 连接器。']] },
    package: { title: '连接计算与存储。', body: '裸片、HBM、中介层与基板，共同组成 GPU 封装。', features: [['硅中介层','近距离连接 GPU 和 HBM，承载大量并行信号。'],['封装基板','将封装内的连接引到模组 PCB。']] },
    die: { title: '从 L2，走到 SM。', body: '查看计算阵列、共享 L2 与片上互连的功能组织。', features: [['一组组计算资源','线程块被分发到 SM，在各自的计算资源上并行执行。'],['数据共享层级','L2 在多个 SM 之间共享；L1 与 Shared 位于各个 SM 内。']] },
    sm: { title: '一个 SM，四个子分区。', body: '按颜色辨认运算与存储资源，点下方图例查看作用。', features: [['绿色是 FP32 运算通道','蓝色为 FP64，青色为 INT32，金色为 Tensor Core；图例标明每 SM 的数量。'],['紫色是寄存器存储','保存线程操作数与累加器。']] },
    hbm: { title: '把存储，纵向堆起来。', body: '展开 DRAM 叠层、垂直互连和底部接口，理解 HBM 如何连接 GPU。', features: [['垂直与横向','TSV 穿过硅片，微凸点连接层间，中介层把数据横向送往 GPU。'],['并行通道','通道为存取提供并行性；各通道独立处理存取请求。']] },
    power: { title: '电压变低，电流变大。', body: '沿多相 Buck 的开关级、电感和电容，看电源如何被转换与稳定。', features: [['多相协作','多组功率级与电感交错工作，分担输出电流。'],['控制与去耦','控制回路调节输出；输入与输出电容抑制电压波动。']] },
    interconnect: { title: '信号要有去路，也有回路。', body: '切开 PCB，看铜层、通孔、差分对和 SXM 接触阵列。', features: [['跨越 PCB 层','普通通孔连接铜层；它与 HBM 内的硅通孔 TSV 是不同结构。'],['连接到系统','SXM 接触阵列承担模组的供电与高速连接。']] }
  };
  const TITLES = { gemm: '一次矩阵乘法', pagetable: '一次地址翻译', pixel: '一个像素的旅程', stacking: '芯片为什么堆起来' };
  const SPECS = {
    h100: { name: 'H100', arch: 'HOPPER', year: 2022, sm: 132, l2: '50MB', hbm: 'HBM3', shared: '228KB' },
    a100: { name: 'A100', arch: 'AMPERE', year: 2020, sm: 108, l2: '40MB', hbm: 'HBM2e', shared: '164KB' }
  };
  const LESSONS = [
    { title: '先选一个结果。', body: '先盯住 C[3,7]：它由哪两个输入得到？所有下标从 0 开始。', hardware: 'A、B 和输出 C 都存放在 HBM 显存中。' },
    { title: '一行，乘上一列。', body: '取 A 的第 3 行与 B 的第 7 列。沿 k 相乘，再把 8 个乘积相加。', hardware: '点击任意乘积，可追踪这一项对应的两个输入。矩阵此时仍存放在 HBM。' },
    { title: '把大问题，切成小块。', body: '输出按 tile 分工；K=8 分成两轮，每轮处理 4 项。', hardware: '一个 thread block 在一个 SM 上执行。示例输出 tile 为 2×4，实际内核通常使用更大的 tile。' },
    { title: '先搬近，再反复用。', body: '将第一轮数据经缓存层级搬入 SM 的共享内存，供线程反复复用。', hardware: 'HBM 在裸片外，L2 在片上由 SM 共享，L1 / Shared 在 SM 内。亮起的线路表示这条层级路径。' },
    { title: '32 个线程，一起协作。', body: '一个 warp 有 32 个线程，协作搬运数据、执行指令。', hardware: '调度器发射就绪 warp 的指令，寄存器保存线程操作数与累加结果。' },
    { title: '乘起来，累加进去。', body: '第一轮的乘积是 2、3、6、8，累加器从 0 变为 19。', hardware: 'Tensor Core 执行矩阵片段的乘加，结果片段保存在寄存器中。' },
    { title: '换一块，接着算。', body: '保留 19，再加上 4、2、6、6。第二轮结束，结果为 37。', hardware: '同步后才能安全复用共享内存。优化内核还可使用异步搬运和双缓冲重叠搬运与计算。' },
    { title: '37，回到显存。', body: '所有 K-tile 都已完成，将 37 写回 C[3,7]。', hardware: '存储指令经缓存层级写回输出地址。其余输出使用相同的内积定义，并行分块计算。' }
  ];
  const SCOPE = {
    pagetable: 'CPU 发出的虚拟地址通过 TLB 与四级页表翻译为物理地址。',
    pixel: '三角形经过光栅化、片元着色与深度测试，结果写入帧缓冲。',
    stacking: '逻辑与存储层通过垂直互连交换数据，散热盖将热量向外传导。'
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = S.decodeState(location.hash);
  let ui;
  let labels = false;
  let navigationMode = 'rotate';
  let lastLegendKey = '';
  let applyingScene = false;
  let applied = {};
  let lastTreeKey = '';
  let lastContentKey = '';
  let lastFrame = 0;
  let lastHashFrame = 0;
  let toastTimer;
  const scene = () => window.GpuExplorer3D;
  const conceptActive = () => ui.mode === 'learn' && state.journey !== 'gemm';
  const context = () => ({ journey: state.journey, stepIndex: state.stepIndex,
    atEnd: S.isAtEnd(state), reducedMotion, speed: Number($('speed-select').value) || 1 });

  function normalizeDomain() {
    if (!SPECS[state.model]) state.model = 'h100';
    if (!SPECS[state.compareModel] || state.compareModel === state.model) state.compareModel = null;
  }
  function hydrate() {
    normalizeDomain();
    const q = new URLSearchParams(location.hash.slice(1));
    ui = I.create({ mode: q.get('mode'), level: q.get('level'),
      explode: Number(q.get('x')) / 100, selection: q.get('part') || state.selected }, context());
    if (ui.mode === 'learn') { state.selected = null; state.compareModel = null; }
    applied = {};
    lastContentKey = '';
  }
  hydrate();

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2400);
  }
  function syncHash() {
    const q = new URLSearchParams(S.encodeState(state));
    q.set('level', ui.level);
    q.set('mode', ui.mode);
    if (ui.mode === 'explore' && ui.explode) q.set('x', Math.round(ui.explode * 100));
    if (ui.mode === 'explore' && ui.selection) q.set('part', ui.selection);
    history.replaceState(null, '', '#' + q.toString());
  }
  function transition(event) {
    const wasLearning = ui.mode === 'learn';
    ui = I.transition(ui, event, context());
    if (wasLearning && ui.mode === 'explore') {
      state.selected = null;
      state.compareModel = null;
      applied.selection = undefined;
    }
  }
  function enterGuide(options = {}) {
    if (options.journey) S.setJourney(state, options.journey);
    if (options.index !== undefined) S.goto(state, options.index);
    state.selected = null;
    state.compareModel = null;
    transition({ type: 'ENTER_GUIDE', playback: options.playback });
    $('follow-camera').checked = true;
    render();
    document.querySelector('.inspector-scroll').scrollTop = 0;
  }
  function exploreAction(event) {
    transition(event);
    render();
  }

  function updateScene() {
    state.presentationMode = ui.mode;
    state.playing = ui.playback === 'sequence';
    state.stepProgress = ui.progress;
    state.visualPhase = ui.visualPhase;
    state.motionPlaying = ui.motionPlaying;
    window.__gpuExplorerStepProgress = ui.progress;
    window.__gpuExplorerVisualPhase = ui.visualPhase;
    window.__gpuExplorerMotionPlaying = ui.motionPlaying;
    window.__gpuExplorerExplode = ui.explode;
    const sc = scene();
    if (!sc) return;
    const physicalIds = new Set((sc.getComponents?.() || []).map(item => item.id));
    if (state.journey === 'gemm') S.currentJourney(state).nodes.forEach(item => physicalIds.add(item.id));
    if (ui.selection && !physicalIds.has(ui.selection)) {
      ui = I.transition(ui, { type: 'SELECT', id: null }, context());
      applied.selection = undefined;
    }
    state.selected = ui.mode === 'explore' && S.currentJourney(state).nodes.some(item => item.id === ui.selection) ? ui.selection : null;
    applyingScene = true;
    try {
      if (applied.model !== state.model) { applied = { model: state.model }; lastTreeKey = ''; }
      sc.update(S.currentJourney(state), S.currentStep(state), state);
      if (ui.mode === 'learn') {
        if (applied.guideRevision !== ui.guideRevision) {
          if (sc.prepareGuide) sc.prepareGuide({ level: ui.level, animate: !reducedMotion });
          else { sc.isolateSelected(false); sc.clearSelection?.(); sc.setExplode(0); sc.setLevel(ui.level); }
          // Rebind the lesson after scene preparation clears transient overlays.
          sc.update(S.currentJourney(state), S.currentStep(state), state);
          applied = { model: state.model, guideRevision: ui.guideRevision,
            level: ui.level, explode: 0, selection: null, isolated: false, camera: 'three-quarter' };
        }
        if (ui.cameraPreset !== 'free' && applied.camera !== ui.cameraPreset) sc.setCamera(ui.cameraPreset);
        applied.camera = ui.cameraPreset;
      } else {
        let changedLevel = applied.level !== ui.level;
        if (changedLevel) { sc.setLevel(ui.level); applied.level = ui.level; applied.isolated = false; }
        if (applied.explode !== ui.explode) { sc.setExplode(ui.explode); applied.explode = ui.explode; }
        if (applied.selection !== ui.selection) {
          if (ui.selection) sc.selectComponent(ui.selection);
          else sc.clearSelection?.();
          applied.selection = ui.selection;
        }
        if (applied.isolated !== ui.isolated) { sc.isolateSelected(ui.isolated); applied.isolated = ui.isolated; }
        const actualLevel = sc.getLevel?.();
        if (actualLevel && actualLevel !== ui.level) {
          ui = I.transition(ui, { type: 'SCENE_LEVEL', level: actualLevel }, context());
          applied.level = actualLevel;
          changedLevel = true;
          if (applied.explode !== ui.explode) { sc.setExplode(ui.explode); applied.explode = ui.explode; }
        }
        if (ui.cameraPreset !== 'free' && (changedLevel || applied.camera !== ui.cameraPreset)) sc.setCamera(ui.cameraPreset);
        applied.camera = ui.cameraPreset;
      }
      sc.setLabels(labels);
      sc.setNavigationMode?.(navigationMode);
      sc.setProgress?.(ui.progress);
      $('scene-loading').hidden = true;
    } finally { applyingScene = false; }
  }
  function renderCrumb() {
    document.body.dataset.level = ui.level;
    const crumb = $('crumb');
    crumb.replaceChildren();
    if(conceptActive()){
      const title=document.createElement('span');title.textContent={pagetable:'x86-64 地址翻译',pixel:'通用图形管线',stacking:'3D 芯片堆叠'}[state.journey];crumb.append(title);
    }else I.breadcrumbs(ui.level).forEach((level, i) => {
      if (i) { const sep = document.createElement('span'); sep.textContent = '›'; crumb.append(sep); }
      const button = document.createElement(ui.mode === 'learn' ? 'span' : 'button');
      button.textContent = LEVEL_NAMES[level];
      if (ui.mode === 'explore') button.onclick = () => exploreAction({ type: 'LEVEL', level });
      crumb.append(button);
    });
    document.querySelectorAll('.scale-nav [data-level]').forEach(button => {
      const active = !conceptActive() && button.dataset.level === ui.level;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function renderSelection() {
    const component = scene()?.getComponents?.().find(item => item.id === ui.selection);
    const node = S.currentJourney(state).nodes.find(item => item.id === ui.selection);
    const info = component || node;
    $('selection-card').hidden = !info || ui.mode !== 'explore';
    const detailLevel={'gpu-die':'die',sm:'sm',hbm:'hbm','hbm-stack':'hbm',power:'power',sxm:'interconnect',package:'package',interposer:'package'}[ui.selection];
    $('selection-enter').hidden=!info||!detailLevel||detailLevel===ui.level;
    $('selection-enter').dataset.level=detailLevel||'';
    if (info) {
      $('component-name').textContent = info.label;
      $('component-detail').textContent = (info.description || info.detail || '')+(info.precisionNote?'\n'+info.precisionNote:'');
    }
    document.querySelectorAll('[data-component]').forEach(button => button.classList.toggle('active', button.dataset.component === ui.selection));
  }
  function renderTree() {
    const components = scene()?.getComponents?.() || [];
    const key = state.model + ui.level + components.map(item => item.id).join();
    if (lastTreeKey === key) return;
    lastTreeKey = key;
    $('component-tree').replaceChildren();
    const major = ['pcb','gpu-die','hbm','power','interposer','sxm'];
    components.filter(item => item.level === ui.level || (ui.level === 'board' && major.includes(item.id))).forEach(item => {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.dataset.component = item.id;
      button.onclick = () => exploreAction({ type: 'SELECT', id: item.id });
      $('component-tree').append(button);
    });
  }
  function renderResourceLegend() {
    const legend=$('sm-resource-legend'),visible=ui.level==='sm'&&!conceptActive();legend.hidden=!visible;
    if(!visible)return;
    const ids=['fp32','fp64','int32','sfu','tensor','registers','lsu','smem'];
    const components=scene()?.getComponents?.()||[];
    const entries=ids.map(id=>components.find(item=>item.id===id)).filter(Boolean);
    const key=ui.mode+state.model+entries.map(item=>item.id+item.countPerSM+item.color).join();
    if(key===lastLegendKey)return;lastLegendKey=key;
    const list=$('sm-resource-items');list.replaceChildren();
    entries.forEach(item=>{
      const button=document.createElement(ui.mode==='learn'?'span':'button');button.className='resource-item';if(ui.mode==='explore')button.dataset.component=item.id;
      const swatch=document.createElement('i');swatch.style.background=item.color||'#8ba6a0';
      const name=document.createElement('span');name.textContent=item.shortLabel||item.label;
      button.append(swatch,name);
      if(item.countPerSM||item.capacityKB){const count=document.createElement('b');count.textContent=item.id==='registers'?'256 KiB':item.capacityKB?item.capacityKB+' KB':item.countPerSM;button.append(count);}
      button.title=(item.description||'')+(item.precisionNote?' '+item.precisionNote:'');
      if(ui.mode==='explore')button.onclick=()=>exploreAction({type:'SELECT',id:item.id});list.append(button);
    });
  }
  function renderCompare() {
    $('compare-select').value = state.compareModel || '';
    $('compare-diagram').hidden = !state.compareModel;
    if (!state.compareModel) return;
    const a = SPECS[state.model], b = SPECS[state.compareModel];
    $('compare-model-name').textContent = a.name + ' × ' + b.name;
    $('compare-model-note').textContent = 'SXM 80GB · 公开规格对照';
    const table = document.createElement('table');
    [['',a.name,b.name],['架构',a.arch,b.arch],['可用 SM',a.sm,b.sm],['L2 缓存',a.l2,b.l2],['显存',a.hbm,b.hbm],['共享内存上限 / SM',a.shared,b.shared]].forEach((row, i) => {
      const tr = table.insertRow();
      row.forEach(value => { const cell = document.createElement(i ? 'td' : 'th'); cell.textContent = value; tr.append(cell); });
    });
    $('compare-facts').replaceChildren(table);
    $('compare-step-note').textContent = '数学结果不变；资源组织、指令与搬运机制不同。';
  }
  function renderPrediction() {
    const p = S.getPredict(state.journey, state.stepIndex);
    $('predict-details').hidden = !p;
    $('predict').replaceChildren();
    if (!p) return;
    const h = document.createElement('h4'); h.textContent = p.q; $('predict').append(h);
    const made = S.predictionMade(state);
    p.options.forEach((option, i) => {
      const b = document.createElement('button'); b.textContent = option;
      b.className = 'pred-opt' + (made === i ? i === p.answer ? ' correct' : ' wrong' : '');
      b.disabled = made === p.answer;
      b.onclick = () => { S.predict(state, i); renderPrediction(); };
      $('predict').append(b);
    });
    if (made !== undefined) { const p2 = document.createElement('p'); p2.className = 'pred-feedback'; p2.textContent = made === p.answer ? p.explain : '再想一下：' + p.explain; $('predict').append(p2); }
  }
  function renderTimeline() {
    const focused = document.activeElement?.dataset?.step;
    $('overview').replaceChildren();
    (S.STEP_CHIPS[state.journey] || []).forEach((chip, i) => {
      const b = document.createElement('button');
      b.className = 'ov-step' + (i === state.stepIndex ? ' active' : '') + (i < state.stepIndex ? ' done' : '');
      b.dataset.step = i; b.setAttribute('aria-label', '第' + (i + 1) + '步：' + chip.label);
      if (i === state.stepIndex) b.setAttribute('aria-current', 'step');
      const number = document.createElement('span'); number.textContent = String(i + 1).padStart(2, '0');
      b.append(number, document.createTextNode(chip.label)); b.onclick = () => enterGuide({ index: i });
      $('overview').append(b);
    });
    if (focused !== undefined) $('overview').querySelector('[data-step="' + focused + '"]')?.focus({ preventScroll: true });
  }
  function renderPlayback() {
    state.playing = ui.playback === 'sequence';
    document.body.dataset.playback = ui.playback;
    $('play-btn').textContent = state.playing ? 'Ⅱ' : '▷';
    $('play-btn').setAttribute('aria-label', state.playing ? '暂停自动播放' : '自动播放全部步骤');

    const moving = ui.motionPlaying;
    $('motion-btn').textContent = moving ? 'Ⅱ 暂停动画' : '▷ 继续动画';
    $('motion-btn').setAttribute('aria-label', moving ? '暂停当前步骤动画' : '继续当前步骤动画');
    $('explode-auto-btn').textContent = ui.explodeAuto ? 'Ⅱ' : '▷';
    $('explode-auto-btn').setAttribute('aria-pressed', String(ui.explodeAuto));
    $('explode-slider').value = Math.round(ui.explode * 100);
    $('explode-value').innerHTML = Math.round(ui.explode * 100) + '<span>%</span>';
    $('isolate-btn').classList.toggle('active', ui.isolated);
    $('isolate-btn').setAttribute('aria-pressed', String(ui.isolated));
    $('isolate-btn').disabled = !ui.selection;
    $('focus-btn').disabled = !ui.selection;
    document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === ui.cameraPreset));
    $('diagram').dataset.isolated = String(ui.isolated);
    $('diagram').dataset.explode = ui.explode.toFixed(3);
    $('diagram').dataset.guideRevision = ui.guideRevision;
    document.body.dataset.motion = moving && ui.mode === 'learn' ? 'running' : 'paused';
    $('teaching-status').dataset.state = ui.progress >= 1 ? 'complete' : ui.playback === 'paused' ? 'paused' : 'running';
    $('teaching-status').dataset.motion = moving ? 'running' : 'paused';
  }
  function renderGuideStatus() {
    const visible = ui.mode === 'learn';
    $('teaching-status').hidden = !visible;
    if (!visible) return;
    const step=S.currentStep(state);
    const story = state.journey==='gemm'?window.GpuExplorerStory.forStep(state.stepIndex):{
      kind:state.journey,phase:S.currentStepChip(state)?.label||step.title,
      caption:{pagetable:'TLB 缓存地址翻译，四级页表逐层定位物理页。',pixel:'片元经过着色与深度测试，写入帧缓冲。',stacking:'沿垂直互连观察逻辑层、存储层和热流。'}[state.journey],
      nodes:step.active.map(id=>S.currentJourney(state).nodes.find(node=>node.id===id)?.label||id)
    };
    $('teaching-status').dataset.kind = story.kind;
    const path = $('route-nodes'); path.replaceChildren();
    story.nodes.forEach((label, index) => {
      if (index) { const arrow = document.createElement('i'); arrow.textContent = story.kind === 'target' ? '·' : story.kind === 'dependency' && index === 1 ? '×' : '→'; path.append(arrow); }
      const node = document.createElement('span'); node.textContent = label; node.dataset.index = index; path.append(node);
    });
  }
  function render() {
    updateScene();
    const journey = S.currentJourney(state), step = S.currentStep(state);
    const lesson = state.journey === 'gemm' ? LESSONS[state.stepIndex] : null;
    document.body.dataset.mode = ui.mode;
    document.body.dataset.concept = String(conceptActive());
    document.querySelector('.dissection-controls').hidden=ui.mode==='learn';
    document.querySelector('.hierarchy-section').hidden=ui.mode==='learn';
    document.querySelector('.components-section').hidden=ui.mode==='learn';
    document.querySelector('.journey-section').hidden=ui.mode==='explore';
    $('compare-controls').hidden=ui.mode==='learn';
    document.querySelector('.bottombar').hidden=ui.mode==='explore';
    document.querySelector('.specimen-section').hidden=conceptActive();
    $('focus-btn').hidden=ui.mode==='learn';
    $('isolate-btn').hidden=ui.mode==='learn';
    $('model-select').disabled=conceptActive();
    $('learn-content').hidden = ui.mode !== 'learn';
    $('explore-content').hidden = ui.mode !== 'explore';
    $('inspector-label').textContent = ui.mode === 'learn' ? TITLES[state.journey] : '自由探索';
    document.querySelectorAll('.mode-switch [data-mode]').forEach(b => { const active = b.dataset.mode === ui.mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    document.querySelectorAll('[data-journey]').forEach(b => { const active = b.dataset.journey === state.journey; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    document.querySelector('.mode-switch [data-mode=learn]').title = '回到第 ' + (state.stepIndex + 1) + ' 步，复原装配与镜头';
    $('model-select').value = state.model;
    $('step-counter').textContent = ui.mode === 'explore' ? String(LEVELS.indexOf(ui.level) + 1).padStart(2, '0') + ' / ' + String(LEVELS.length).padStart(2, '0') : String(state.stepIndex + 1).padStart(2, '0') + ' / ' + String(journey.steps.length).padStart(2, '0');
    $('chapter-kicker').textContent = String(state.stepIndex + 1).padStart(2, '0');
    $('step-title').textContent = lesson ? lesson.title : step.title;
    $('step-body').textContent = lesson ? lesson.body : step.body;
    $('fact').textContent = state.journey === 'gemm' && state.stepIndex === 7 ? 'C[3,7] = 19 + 18 = 37' : step.trace || '';
    $('hardware-note').textContent = lesson ? lesson.hardware : SCOPE[state.journey];
    $('journey-gloss').textContent = journey.gloss || '';
    $('prev-btn').disabled = S.isAtStart(state); $('next-btn').disabled = S.isAtEnd(state);
    $('next-btn').innerHTML = S.isAtEnd(state) ? '本次计算完成 <span>✓</span>' : '继续 <span>→</span>';
    $('timeline-title').textContent = TITLES[state.journey];
    $('progress-fill').style.width = (state.stepIndex + 1) / journey.steps.length * 100 + '%';

    const info = VIEW_INFO[ui.level];
    $('explore-title').textContent = info.title;
    $('explore-description').textContent = info.body;
    document.querySelectorAll('#explore-content .explore-feature').forEach((feature, i) => {
      feature.querySelector('h3').textContent = info.features[i][0];
      feature.querySelector('p').textContent = info.features[i][1];
    });
    const key = state.journey + ':' + state.stepIndex + ':' + state.model;
    window.GpuExplorerLab?.render($('journey-lab'), state, step, ui.progress);
    if (key !== lastContentKey) { $('code-panel').textContent = step.code.join('\n'); renderPrediction(); lastContentKey = key; }
    renderCrumb(); renderTree(); renderResourceLegend(); renderSelection(); renderCompare(); renderTimeline(); renderGuideStatus(); renderPlayback(); syncHash();
  }

  function focusSelected() {
    if (!ui.selection) { toast('先选中一个部件，再聚焦或隔离。'); return; }
    transition({ type: 'ENTER_EXPLORE' }); render(); scene()?.focusSelected(); applied.camera = 'free';
    ui = I.transition(ui, { type: 'CAMERA', preset: 'free' }, context()); renderPlayback(); syncHash();
  }
  function resetCamera() {
    if (ui.mode === 'learn') { enterGuide(); return; }
    state.selected = null; transition({ type: 'EXPLORE_RESET' }); applied = {}; render();
  }
  function changeModel(model) {
    S.setModel(state, model); normalizeDomain(); state.selected = null; state.compareModel = null;
    applied = {}; lastTreeKey = '';
    if (ui.mode === 'learn') enterGuide();
    else { transition({ type: 'EXPLORE_RESET' }); render(); }
  }
  function toggleSequence() {
    const intent = I.sequenceIntent(ui, context());
    if (intent === 'pause') { transition({ type: 'PAUSE' }); render(); return; }
    if (intent === 'resume') { transition({ type: 'RESUME_SEQUENCE' }); render(); return; }
    if (intent === 'restart') S.goto(state, 0);
    enterGuide({ playback: 'sequence' });
  }
  window.__gpuExplorerRender = render;
  window.__gpuExplorerOnSelect = id => {
    S.select(state, id);
    if (!applyingScene && ui.selection !== id) { transition({ type: 'SELECT', id, level: scene()?.getLevel?.() }); render(); }
  };
  window.__gpuExplorerMoveSelection = dir => {
    if(ui.mode==='learn'){enterGuide({index:state.stepIndex+dir});return;}
    const components = (scene()?.getComponents?.() || []).filter(item => item.level === ui.level);
    if (!components.length) return;
    const current = components.findIndex(item => item.id === ui.selection);
    const index = current < 0 ? (dir > 0 ? 0 : components.length - 1) : (current + dir + components.length) % components.length;
    exploreAction({ type: 'SELECT', id: components[index].id });
  };
  window.addEventListener('gpu-user-navigate', event => {
    if (applyingScene) return;
    transition({ type: event.detail?.action === 'orbit' ? 'NAVIGATE' : 'ENTER_EXPLORE' });
    applied.camera = 'free'; render();
  });
  window.addEventListener('gpu-component-select', event => {
    if (applyingScene) return;
    const level = scene()?.getLevel?.() || ui.level;
    transition({ type: 'SELECT', id: event.detail.id, level });
    applied.selection = event.detail.id; applied.level = level;
    render();
  });
  window.addEventListener('gpu-level-change', event => {
    if (applyingScene || !LEVELS.includes(event.detail.level)) return;
    if (ui.mode !== 'explore') transition({ type: 'ENTER_EXPLORE' });
    transition({ type: 'SCENE_LEVEL', level: event.detail.level });
    applied.level = ui.level; render();
  });
  window.addEventListener('gpu-isolation-change', event => {
    if (applyingScene) return;
    transition({ type: 'SCENE_ISOLATION', value: event.detail.isolated, clear: event.detail.selected === null });
    if (event.detail.selected === null) state.selected = null;
    applied.isolated = ui.isolated; applied.selection = ui.selection; render();
  });
  window.addEventListener('gpu-scene-error', event => {
    $('scene-loading').hidden = false; $('scene-loading').textContent = '3D 暂不可用'; $('diagram').dataset.error = event.detail.message;
  });
  window.addEventListener('gpu-scene-ready', () => { applied = {}; lastTreeKey = ''; render(); });
  document.querySelectorAll('.scale-nav [data-level]').forEach(b => b.onclick = () => { applied.level = undefined; state.selected = null; exploreAction({ type: 'LEVEL', level: b.dataset.level }); });
  document.querySelectorAll('.mode-switch [data-mode]').forEach(b => b.onclick = () => b.dataset.mode === 'learn' ? enterGuide() : exploreAction({ type: 'ENTER_EXPLORE' }));
  document.querySelectorAll('[data-journey]').forEach(b => b.onclick = () => enterGuide({ journey: b.dataset.journey, index: 0 }));
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { applied.camera = undefined; transition({ type: 'CAMERA', preset: b.dataset.cam }); render(); });
  $('model-select').onchange = e => changeModel(e.target.value);
  $('compare-select').onchange = e => {
    if (e.target.value === state.model) { toast('请选择另一颗 GPU 进行对照。'); e.target.value = state.compareModel || ''; return; }
    transition({ type: 'ENTER_EXPLORE' }); S.setCompare(state, e.target.value || null); render();
  };
  $('compare-close').onclick = () => { state.compareModel = null; render(); };
  $('prev-btn').onclick = () => enterGuide({ index: state.stepIndex - 1 });
  $('next-btn').onclick = () => enterGuide({ index: state.stepIndex + 1 });
  $('reset-btn').onclick = () => { S.reset(state); lastContentKey = ''; enterGuide({ index: 0 }); };
  $('play-btn').onclick = toggleSequence;
  $('replay-btn').onclick = () => enterGuide();
  $('motion-btn').onclick = () => { transition({ type: 'MOTION_TOGGLE' }); render(); };
  $('explode-slider').oninput = e => exploreAction({ type: 'EXPLODE_SET', value: Number(e.target.value) / 100 });
  $('explode-auto-btn').onclick = () => exploreAction({ type: 'EXPLODE_TOGGLE' });
  $('labels-btn').onclick = () => { labels = !labels; scene()?.setLabels(labels); $('labels-btn').classList.toggle('active', labels); $('labels-btn').setAttribute('aria-pressed', String(labels)); };
  for(const mode of ['rotate','pan'])$(mode+'-btn').onclick=()=>{
    navigationMode=mode;scene()?.setNavigationMode?.(mode);
    for(const key of ['rotate','pan']){$(key+'-btn').classList.toggle('active',key===mode);$(key+'-btn').setAttribute('aria-pressed',String(key===mode));}
  };
  $('focus-btn').onclick = focusSelected;
  $('isolate-btn').onclick = () => { if (!ui.selection) { toast('先选中一个部件，再聚焦或隔离。'); return; } exploreAction({ type: 'ISOLATE' }); };
  $('home-btn').onclick = resetCamera;
  $('selection-enter').onclick = () => { const level=$('selection-enter').dataset.level;if(LEVELS.includes(level))exploreAction({type:'LEVEL',level}); };
  $('selection-close').onclick = () => { state.selected = null; exploreAction({ type: 'SELECT', id: null }); };
  $('fullscreen-btn').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.canvas-panel').requestFullscreen(); }
    catch { toast('此浏览器暂不支持全屏。'); }
  };
  function openDialog(id) { transition({ type: 'PAUSE' }); render(); $(id).showModal(); }
  $('help-btn').onclick = () => openDialog('help-dialog');
  $('sources-btn').onclick = () => openDialog('sources-dialog');
  $('help-sources').onclick = () => { $('help-dialog').close(); openDialog('sources-dialog'); };
  document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', event => {
    if (event.target !== d) return; const r = d.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) d.close();
  }));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || document.querySelector('dialog[open]') || event.target.closest('input,select,textarea,[contenteditable=true]')) return;
    if (event.key.startsWith('Arrow') && event.target.closest('.scene3d')) return;
    if (ui.mode === 'learn' && event.key === 'ArrowRight') { event.preventDefault(); enterGuide({ index: state.stepIndex + 1 }); }
    else if (ui.mode === 'learn' && event.key === 'ArrowLeft') { event.preventDefault(); enterGuide({ index: state.stepIndex - 1 }); }
    else if (ui.mode === 'learn' && event.key === ' ' && !event.target.closest('button,summary')) { event.preventDefault(); toggleSequence(); }
    else if (!event.target.closest('.scene3d,button,summary')) {
      if (event.key.toLowerCase() === 'f') focusSelected();
      if (event.key.toLowerCase() === 'i') $('isolate-btn').click();
      if (event.key.toLowerCase() === 'r') resetCamera();
    }
  });
  window.addEventListener('hashchange', () => { state = S.decodeState(location.hash); hydrate(); render(); });
  function frame(now) {
    const previous = ui;
    const dt = lastFrame ? Math.min(now - lastFrame, 100) : 0; lastFrame = now;
    ui = I.transition(ui, { type: 'TICK', dt }, context());
    state.stepProgress = ui.progress;
    state.visualPhase = ui.visualPhase;
    state.motionPlaying = ui.motionPlaying;
    window.__gpuExplorerStepProgress = ui.progress;
    window.__gpuExplorerVisualPhase = ui.visualPhase;
    window.__gpuExplorerMotionPlaying = ui.motionPlaying;
    if (ui.progress !== previous.progress) {
      window.GpuExplorerLab?.setProgress($('journey-lab'), ui.progress); scene()?.setProgress?.(ui.progress);
    }
    $('journey-lab').dataset.progress = ui.progress.toFixed(3);
    window.GpuExplorerLab?.setVisualPhase?.($('journey-lab'),ui.visualPhase,ui.progress);
    if (ui.mode === 'learn') {
      const nodes = $('route-nodes').querySelectorAll('span');
      const active = Math.min(nodes.length - 1, Math.floor((ui.visualPhase % 1) * nodes.length));
      nodes.forEach((node, i) => node.classList.toggle('route-active', i === active));
    }
    if (ui.explode !== previous.explode) {
      window.__gpuExplorerExplode = ui.explode; scene()?.setExplode(ui.explode); applied.explode = ui.explode;
      $('explode-slider').value = Math.round(ui.explode * 100);
      $('explode-value').innerHTML = Math.round(ui.explode * 100) + '<span>%</span>';
      $('diagram').dataset.explode = ui.explode.toFixed(3);
      if (now - lastHashFrame > 200) { syncHash(); lastHashFrame = now; }
    }
    if (ui.advanceRequested) { S.next(state); enterGuide({ playback: 'sequence' }); }
    else if (ui.playback !== previous.playback || ui.motionPlaying !== previous.motionPlaying || ui.explodeAuto !== previous.explodeAuto || (previous.progress < 1 && ui.progress >= 1)) {
      renderPlayback(); window.GpuExplorerLab?.render($('journey-lab'), state, S.currentStep(state), ui.progress); syncHash();
    }
    requestAnimationFrame(frame);
  }
  render(); requestAnimationFrame(frame);
})();
