// Controller. Domain state (state.js), presentation state (interaction-state.js)
// and the 3D scene (scene3d.js) each have one owner; this file wires them up.
(function () {
  'use strict';
  const S = window.GpuExplorerState;
  const I = window.GpuExplorerInteraction;
  const T = window.GpuExplorerI18n;
  const $ = id => document.getElementById(id);
  const t = (key, vars) => T.t(key, vars);
  const tr = value => T.pick(value);
  const L = (zh, en) => ({ zh, en });
  const LEVELS = I.LEVELS;
  const VIEW_INFO = {
    board: { title: L('SXM 模组', 'SXM module'), body: L('中间是 GPU 封装，两侧是多相供电，背面是连接服务器的连接器。点一个部件看它做什么，双击进入。', 'The GPU package sits in the middle, multiphase power runs down both sides, and the server connector is underneath. Click a part to see what it does; double-click to go inside.'),
      features: [[L('计算和显存', 'Compute and memory'), L('进入封装，看 GPU 裸片和旁边的 HBM。', 'Go into the package to see the GPU die and the HBM beside it.')], [L('供电与连接', 'Power and connections'), L('电感和功率级把电压降到 1 伏左右；背面的连接器走供电、PCIe 和 NVLink。', 'Inductors and power stages bring the voltage down to about one volt; the connector underneath carries power, PCIe and NVLink.')]] },
    package: { title: L('芯片封装', 'GPU package'), body: L('GPU 裸片和六个 HBM 位置并排放在一块硅中介层上，下面是有机基板。拆开能看到中介层上的凸点和走线。', 'The GPU die and six HBM sites sit side by side on a silicon interposer, over an organic substrate. Take it apart to see the bumps and wiring on the interposer.'),
      features: [[L('硅中介层', 'Silicon interposer'), L('用芯片工艺布线，几千根数据线只走一毫米左右。', 'Wired with chip lithography, so thousands of data lines run only about a millimeter.')], [L('第六个 HBM 位置', 'The sixth HBM site'), L('这款产品只启用五组 HBM。', 'This product enables five of the six HBM sites.')]] },
    die: { title: L('GPU 裸片', 'GPU die'), body: L('按 NVIDIA 架构文章里的框图排布：两排 GPC 夹着分成两半的 L2，长边是存储控制器，两端是 PCIe 和 NVLink。', 'Laid out after the block diagram in NVIDIA’s architecture article: two rows of GPCs around a two-part L2, memory controllers on the long edges, PCIe and NVLink at the ends.'),
      features: [[L('GPC、TPC、SM', 'GPCs, TPCs, SMs'), L('两个 SM 组成一个 TPC。暗色格子是没启用的 TPC。', 'Two SMs form a TPC. Dark cells are disabled TPCs.')], [L('L2 缓存', 'L2 cache'), L('所有 SM 共用，读写先查 L2，没命中再去 HBM。', 'Shared by every SM; reads and writes check L2 before going to HBM.')]] },
    sm: { title: L('一个 SM', 'One SM'), body: L('四个子分区各有调度器、寄存器和运算单元，共用下方的 L1 / 共享内存。颜色对应下面的图例。', 'Four partitions, each with a scheduler, registers and execution units, share the L1 / shared memory below. Colours match the legend.'),
      features: [[L('绿色是 FP32 通道', 'Green is FP32'), L('蓝色是 FP64，青色是 INT32，金色是 Tensor Core。', 'Blue is FP64, teal is INT32, gold is the Tensor Cores.')], [L('紫色是寄存器', 'Purple is registers'), L('存线程的操作数和累加器，不是运算单元。', 'They hold thread operands and accumulators; they don’t compute.')]] },
    hbm: { title: L('HBM 堆叠剖面', 'HBM stack cutaway'), body: L('几层 DRAM 叠在底部接口芯片上，TSV 和微凸点把它们连成一摞，再经中介层接到 GPU。', 'DRAM dies stacked on a base die, joined by TSVs and microbumps, then connected to the GPU through the interposer.'),
      features: [[L('垂直和横向', 'Vertical and sideways'), L('TSV 竖着穿过硅片，中介层横着把数据送到 GPU。', 'TSVs run up through the silicon; the interposer carries data sideways to the GPU.')], [L('独立通道', 'Independent channels'), L('每组 1024 位，分成多个通道各自读写。', '1024 bits per stack, split into channels that read and write independently.')]] },
    power: { title: L('供电', 'Power delivery'), body: L('六相降压电路的示意：开关级、电感、输出电容和反馈。', 'An illustrative six-phase buck converter: switching stages, inductors, output capacitors and feedback.'),
      features: [[L('多相并联', 'Phases in parallel'), L('几相错开时间开关，一起分担电流。', 'The phases switch out of step and share the current.')], [L('控制与去耦', 'Control and decoupling'), L('控制器根据反馈调整，电容稳住电压。', 'The controller adjusts from feedback; capacitors hold the voltage.')]] },
    interconnect: { title: L('PCB 与连接器', 'PCB and connector'), body: L('切开电路板，看铜层、过孔、差分对和 SXM 触点。', 'A cut through the board showing copper layers, vias, differential pairs and the SXM contacts.'),
      features: [[L('过孔和 TSV 不同', 'Vias are not TSVs'), L('过孔连接电路板的铜层；TSV 穿过 HBM 里的硅片。', 'Vias join the board’s copper layers; TSVs go through the silicon in HBM.')], [L('接到服务器', 'Into the server'), L('触点阵列走供电和高速信号。', 'The contact array carries power and high-speed signals.')]] }
  };
  const SPECS = {
    h100: { name: 'H100', arch: 'Hopper', sm: 132, l2: '50 MB', hbm: '80 GB HBM3', bandwidth: '3.35 TB/s', shared: '228 KB' },
    a100: { name: 'A100', arch: 'Ampere', sm: 108, l2: '40 MB', hbm: '80 GB HBM2e', bandwidth: '2.04 TB/s', shared: '164 KB' }
  };
  const ENTER_LEVEL = { 'gpu-die': 'die', sm: 'sm', hbm: 'hbm', 'hbm-stack': 'hbm', power: 'power', sxm: 'interconnect', package: 'package', interposer: 'package' };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  T.setLang(T.detect(), { persist: false });
  let state = S.decodeState(location.hash);
  let ui;
  // Walkthroughs start with labels on, because the arrows are named by them. Anatomy starts with them off.
  const labelsByMode = { learn: true, explore: false };
  const labelsOn = () => labelsByMode[ui.mode];
  let paths = false;
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
  const context = () => {
    const guide = S.guideFor(state.journey, state.stepIndex);
    return { journey: state.journey, stepIndex: state.stepIndex, atEnd: S.isAtEnd(state), reducedMotion,
      speed: Number($('speed-select').value) || 1, guideLevel: guide.level, guideExplode: guide.explode, guideCamera: guide.camera };
  };

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
    q.set('lang', T.lang);
    const next = '#' + q.toString();
    if (location.hash !== next) history.replaceState(null, '', next);
  }
  function transition(event) {
    const wasLearning = ui.mode === 'learn';
    ui = I.transition(ui, event, context());
    if (wasLearning && ui.mode === 'explore') {
      state.selected = null;
      state.compareModel = null;
      applied.selection = undefined;
      applied.level = undefined;
    }
  }
  function enterGuide(options = {}) {
    if (options.journey) S.setJourney(state, options.journey);
    if (options.index !== undefined) S.goto(state, options.index);
    state.selected = null;
    state.compareModel = null;
    transition({ type: 'ENTER_GUIDE', playback: options.playback });
    render();
    const scroll = document.querySelector('.inspector-scroll'); if (scroll) scroll.scrollTop = 0;
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
          sc.prepareGuide({ level: ui.level, explode: ui.explode, animate: !reducedMotion });
          // Rebind the lesson after scene preparation clears transient overlays.
          sc.update(S.currentJourney(state), S.currentStep(state), state);
          applied = { model: state.model, guideRevision: ui.guideRevision,
            level: ui.level, explode: ui.explode, selection: null, isolated: false, camera: 'three-quarter' };
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
      sc.setLabels(labelsOn());
      sc.setPaths?.(paths && ui.mode === 'explore');
      sc.setNavigationMode?.(navigationMode);
      sc.setProgress?.(ui.progress);
      $('scene-loading').hidden = true;
    } finally { applyingScene = false; }
  }
  function renderCrumb() {
    document.body.dataset.level = ui.level;
    const crumb = $('crumb');
    crumb.replaceChildren();
    I.breadcrumbs(ui.level).forEach((level, i) => {
      if (i) { const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '›'; sep.setAttribute('aria-hidden', 'true'); crumb.append(sep); }
      const node = document.createElement(ui.mode === 'learn' ? 'span' : 'button');
      node.textContent = t('level.' + level);
      if (ui.mode === 'explore') node.onclick = () => exploreAction({ type: 'LEVEL', level });
      crumb.append(node);
    });
    document.querySelectorAll('.scale-nav [data-level]').forEach(button => {
      const active = button.dataset.level === ui.level;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function renderSelection() {
    const component = scene()?.getComponents?.().find(item => item.id === ui.selection);
    const node = S.currentJourney(state).nodes.find(item => item.id === ui.selection);
    const info = component || node;
    $('selection-card').hidden = !info || ui.mode !== 'explore';
    const detailLevel = ENTER_LEVEL[ui.selection];
    $('selection-enter').hidden = !info || !detailLevel || detailLevel === ui.level;
    $('selection-enter').dataset.level = detailLevel || '';
    if (info) {
      $('component-name').textContent = tr(info.label);
      $('component-detail').textContent = tr(info.description || info.detail || '') + (info.precisionNote ? '\n' + tr(info.precisionNote) : '');
    }
    document.querySelectorAll('[data-component]').forEach(button => button.classList.toggle('active', button.dataset.component === ui.selection));
  }
  function renderTree() {
    const components = scene()?.getComponents?.() || [];
    const key = state.model + ui.level + T.lang + components.map(item => item.id).join();
    if (lastTreeKey === key) return;
    lastTreeKey = key;
    $('component-tree').replaceChildren();
    const major = ['pcb', 'gpu-die', 'hbm', 'power', 'interposer', 'sxm'];
    components.filter(item => item.level === ui.level || (ui.level === 'board' && major.includes(item.id))).forEach(item => {
      const button = document.createElement('button');
      button.textContent = tr(item.label);
      button.dataset.component = item.id;
      button.onclick = () => exploreAction({ type: 'SELECT', id: item.id });
      $('component-tree').append(button);
    });
  }
  function renderResourceLegend() {
    const legend = $('sm-resource-legend'), visible = ui.level === 'sm'; legend.hidden = !visible;
    if (!visible) return;
    const ids = ['fp32', 'fp64', 'int32', 'sfu', 'tensor', 'registers', 'lsu', 'smem'];
    const components = scene()?.getComponents?.() || [];
    const entries = ids.map(id => components.find(item => item.id === id)).filter(Boolean);
    const key = ui.mode + state.model + T.lang + entries.map(item => item.id + item.countPerSM + item.color).join();
    if (key === lastLegendKey) return; lastLegendKey = key;
    const list = $('sm-resource-items'); list.replaceChildren();
    entries.forEach(item => {
      const button = document.createElement(ui.mode === 'learn' ? 'span' : 'button'); button.className = 'resource-item'; if (ui.mode === 'explore') button.dataset.component = item.id;
      const swatch = document.createElement('i'); swatch.style.background = item.color || '#8ba6a0';
      const name = document.createElement('span'); name.textContent = tr(item.shortLabel) || tr(item.label);
      button.append(swatch, name);
      if (item.countPerSM || item.capacityKB) { const count = document.createElement('b'); count.textContent = item.id === 'registers' ? '256 KiB' : item.capacityKB ? item.capacityKB + ' KB' : item.countPerSM; button.append(count); }
      button.title = tr(item.description) + (item.precisionNote ? ' ' + tr(item.precisionNote) : '');
      if (ui.mode === 'explore') button.onclick = () => exploreAction({ type: 'SELECT', id: item.id });
      list.append(button);
    });
  }
  function renderCompare() {
    $('compare-select').value = state.compareModel || '';
    $('compare-diagram').hidden = !state.compareModel || ui.mode !== 'explore';
    if (!state.compareModel) return;
    const a = SPECS[state.model], b = SPECS[state.compareModel];
    const table = document.createElement('table');
    [['', a.name, b.name], [t('compare.arch'), a.arch, b.arch], [t('compare.sm'), a.sm, b.sm], [t('compare.l2'), a.l2, b.l2], [t('compare.memory'), a.hbm, b.hbm], [t('compare.bandwidth'), a.bandwidth, b.bandwidth], [t('compare.shared'), a.shared, b.shared]].forEach((row, i) => {
      const tr0 = table.insertRow();
      row.forEach(value => { const cell = document.createElement(i ? 'td' : 'th'); cell.textContent = value; tr0.append(cell); });
    });
    $('compare-facts').replaceChildren(table);
  }
  function renderPrediction() {
    const p = S.getPredict(state.journey, state.stepIndex);
    $('predict-details').hidden = !p;
    $('predict').replaceChildren();
    if (!p) return;
    const h = document.createElement('h4'); h.textContent = tr(p.q); $('predict').append(h);
    const made = S.predictionMade(state);
    p.options.forEach((option, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = tr(option);
      b.className = 'pred-opt' + (made === i ? i === p.answer ? ' correct' : ' wrong' : '');
      b.disabled = made === p.answer;
      b.onclick = () => { S.predict(state, i); renderPrediction(); };
      $('predict').append(b);
    });
    if (made !== undefined) { const p2 = document.createElement('p'); p2.className = 'pred-feedback'; p2.textContent = made === p.answer ? tr(p.explain) : t('predict.retry') + tr(p.explain); $('predict').append(p2); }
  }
  function renderTimeline() {
    const focused = document.activeElement?.dataset?.step;
    $('overview').replaceChildren();
    (S.STEP_CHIPS[state.journey] || []).forEach((chip, i) => {
      const b = document.createElement('button');
      b.className = 'ov-step' + (i === state.stepIndex ? ' active' : '') + (i < state.stepIndex ? ' done' : '');
      b.dataset.step = i; b.setAttribute('aria-label', t('timeline.chip', { n: i + 1, label: tr(chip.label) }));
      b.title = tr(chip.gloss);
      if (i === state.stepIndex) b.setAttribute('aria-current', 'step');
      const number = document.createElement('span'); number.textContent = String(i + 1).padStart(2, '0');
      b.append(number, document.createTextNode(tr(chip.label))); b.onclick = () => enterGuide({ index: i });
      $('overview').append(b);
    });
    if (focused !== undefined) $('overview').querySelector('[data-step="' + focused + '"]')?.focus({ preventScroll: true });
    $('overview').querySelector('.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function setIcon(button, name) { const use = button.querySelector('use'); if (use && use.getAttribute('href') !== '#i-' + name) use.setAttribute('href', '#i-' + name); }
  function renderPlayback() {
    state.playing = ui.playback === 'sequence';
    document.body.dataset.playback = ui.playback;
    setIcon($('play-btn'), state.playing ? 'pause' : 'play');
    $('play-btn').setAttribute('aria-label', t(state.playing ? 'play.pause' : 'play.all'));
    $('play-btn').setAttribute('aria-pressed', String(state.playing));
    const moving = ui.motionPlaying;
    setIcon($('motion-btn'), moving ? 'pause' : 'play');
    $('motion-btn').querySelector('span').textContent = t(moving ? 'step.pause' : 'step.resume');
    $('motion-btn').setAttribute('aria-label', t(moving ? 'step.pauseAria' : 'step.resumeAria'));
    setIcon($('explode-auto-btn'), ui.explodeAuto ? 'pause' : 'play');
    $('explode-auto-btn').setAttribute('aria-pressed', String(ui.explodeAuto));
    $('explode-auto-btn').setAttribute('aria-label', t(ui.explodeAuto ? 'explode.stop' : 'explode.auto'));
    $('explode-slider').value = Math.round(ui.explode * 100);
    $('explode-value').textContent = Math.round(ui.explode * 100) + '%';
    $('isolate-btn').classList.toggle('active', ui.isolated);
    $('isolate-btn').setAttribute('aria-pressed', String(ui.isolated));
    $('isolate-btn').disabled = !ui.selection;
    $('focus-btn').disabled = !ui.selection;
    document.querySelectorAll('[data-cam]').forEach(b => { const active = b.dataset.cam === ui.cameraPreset; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    $('diagram').dataset.isolated = String(ui.isolated);
    $('diagram').dataset.explode = ui.explode.toFixed(3);
    $('diagram').dataset.guideRevision = ui.guideRevision;
    document.body.dataset.motion = moving && ui.mode === 'learn' ? 'running' : 'paused';
  }
  // The key to the arrows sits on the model, next to the arrows it explains.
  let lastFlowKey = '';
  function renderFlowLegend() {
    const box = $('flow-legend');
    if (ui.mode !== 'learn') { box.hidden = true; lastFlowKey = ''; return; }
    const sc = scene();
    const level = S.currentStep(state).level;
    const key = [state.journey, state.stepIndex, state.model, T.lang, level, Boolean(sc?.lessonLegend)].join(':');
    if (key === lastFlowKey) return; lastFlowKey = key;
    const info = sc?.lessonLegend?.(level, state.stepIndex, state.model, state.journey);
    const rows = info?.legend || [];
    const list = $('flow-legend-items'); list.replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li'), label = document.createElement('span');
      // A small arrow in the route's own colour, dashed when the route is dashed.
      item.innerHTML = '<svg viewBox="0 0 24 8" aria-hidden="true"><path d="M1.5 4H17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"' + (row.dashed ? ' stroke-dasharray="3 4"' : '') + '/><path d="M16 .5 23 4 16 7.5z" fill="currentColor"/></svg>';
      item.firstChild.style.color = row.hex; item.dataset.color = row.color; if (row.dashed) item.dataset.dashed = 'true';
      label.textContent = tr(row.label); item.append(label); list.append(item);
    }
    list.hidden = !rows.length;
    $('flow-legend-note').textContent = info?.note ? tr(info.note) : '';
    $('flow-legend-note').hidden = !info?.note;
    box.hidden = !rows.length && !info?.note;
  }
  function termList(list, terms) {
    list.replaceChildren();
    for (const term of terms) {
      const name = document.createElement('dt'), gloss = document.createElement('dd');
      name.textContent = tr(term.name); gloss.textContent = tr(term.gloss); name.dataset.term = term.id; list.append(name, gloss);
    }
  }
  function renderTerms() {
    const terms = S.termsFor(state.journey, state.stepIndex);
    termList($('step-terms'), terms); $('step-terms-box').hidden = !terms.length;
    termList($('glossary'), S.glossaryFor(state.journey));
  }
  function renderLabelsButton() {
    $('labels-btn').classList.toggle('active', labelsOn()); $('labels-btn').setAttribute('aria-pressed', String(labelsOn()));
  }
  function renderStatic() {
    T.apply(document);
    document.title = t('meta.title');
    document.querySelectorAll('.nav-item[data-journey]').forEach(b => {
      const journey = S.JOURNEYS[b.dataset.journey];
      b.querySelector('[data-journey-title]').textContent = tr(journey.title);
      b.querySelector('[data-journey-subtitle]').textContent = tr(journey.subtitle);
    });
    document.querySelectorAll('.lang-switch [data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === T.lang)));
    document.querySelectorAll('.lang-switch [data-lang]').forEach(b => b.setAttribute('title', t('lang.switchTo', { name: t(b.dataset.lang === 'zh' ? 'lang.zhName' : 'lang.enName') })));
  }
  function render() {
    updateScene();
    const journey = S.currentJourney(state), step = S.currentStep(state);
    const learn = ui.mode === 'learn';
    document.body.dataset.mode = ui.mode;
    document.body.dataset.currentJourney = state.journey;
    document.querySelector('.dissection-controls').hidden = learn;
    document.querySelector('.hierarchy-section').hidden = learn;
    document.querySelector('.components-section').hidden = learn;
    document.querySelector('.journey-section').hidden = !learn;
    $('compare-controls').hidden = learn;
    document.querySelector('.bottombar').hidden = !learn;
    $('focus-btn').hidden = learn;
    $('isolate-btn').hidden = learn;
    $('paths-btn').hidden = learn;
    $('paths-btn').disabled = ui.level === 'interconnect';
    $('paths-btn').setAttribute('aria-pressed', String(paths && !learn));
    $('paths-note').hidden = !(paths && !learn && ui.level !== 'interconnect');
    $('learn-content').hidden = !learn;
    $('explore-content').hidden = learn;
    $('inspector-label').textContent = learn ? tr(journey.title) : t('mode.explore');
    document.querySelectorAll('.mode-switch [data-mode]').forEach(b => { const active = b.dataset.mode === ui.mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    document.querySelectorAll('.nav-item[data-journey]').forEach(b => { const active = b.dataset.journey === state.journey; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    document.querySelector('.mode-switch [data-mode=learn]').title = t('mode.learnTitle', { n: state.stepIndex + 1 });
    $('model-select').value = state.model;
    $('step-counter').textContent = learn ? String(state.stepIndex + 1).padStart(2, '0') + ' / ' + String(journey.steps.length).padStart(2, '0') : '';
    $('step-title').textContent = tr(step.title);
    $('step-body').textContent = tr(step.body);
    $('fact').textContent = step.trace || '';
    $('hardware-note').textContent = tr(step.hardware);
    $('journey-scope').textContent = tr(journey.scope);
    $('prev-btn').disabled = S.isAtStart(state); $('next-btn').disabled = S.isAtEnd(state);
    $('next-label').textContent = t(S.isAtEnd(state) ? 'nav.done' : 'nav.next');
    $('timeline-title').textContent = tr(journey.title);
    $('progress-fill').style.width = (state.stepIndex + 1) / journey.steps.length * 100 + '%';
    document.querySelector('.progress').setAttribute('aria-valuemax', String(journey.steps.length));
    document.querySelector('.progress').setAttribute('aria-valuenow', String(state.stepIndex + 1));
    const info = VIEW_INFO[ui.level];
    $('explore-title').textContent = (ui.level === 'board' ? SPECS[state.model].name + ' ' : '') + tr(info.title);
    $('explore-description').textContent = tr(info.body);
    document.querySelectorAll('#explore-content .explore-feature').forEach((feature, i) => {
      feature.querySelector('h3').textContent = tr(info.features[i][0]);
      feature.querySelector('p').textContent = tr(info.features[i][1]);
    });
    const key = state.journey + ':' + state.stepIndex + ':' + state.model + ':' + T.lang;
    window.GpuExplorerLab?.render($('journey-lab'), state, step, ui.progress);
    if (key !== lastContentKey) { $('code-panel').textContent = tr(step.code).join('\n'); renderPrediction(); renderTerms(); lastContentKey = key; }
    renderCrumb(); renderTree(); renderResourceLegend(); renderSelection(); renderCompare(); renderTimeline(); renderFlowLegend(); renderLabelsButton(); renderPlayback(); syncHash();
  }
  function setLanguage(lang) {
    if (!T.LANGS.includes(lang)) return;
    T.setLang(lang);
    lastTreeKey = ''; lastLegendKey = ''; lastContentKey = '';
    scene()?.setLanguage?.(lang);
    renderStatic(); render();
  }

  function focusSelected() {
    if (!ui.selection) { toast(t('toast.selectFirst')); return; }
    transition({ type: 'ENTER_EXPLORE' }); render(); scene()?.focusSelected(); applied.camera = 'free';
    ui = I.transition(ui, { type: 'CAMERA', preset: 'free' }, context()); renderPlayback(); syncHash();
  }
  function resetCamera() {
    if (ui.mode === 'learn') { enterGuide(); return; }
    state.selected = null; transition({ type: 'EXPLORE_RESET' }); applied = {}; render();
  }
  function changeModel(model) {
    S.setModel(state, model); normalizeDomain(); state.selected = null; state.compareModel = null;
    applied = {}; lastTreeKey = ''; lastLegendKey = '';
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
  function step(dir) {
    const target = state.stepIndex + dir;
    if (target < 0 || target >= S.currentJourney(state).steps.length) return;
    enterGuide({ index: target });
  }
  window.__gpuExplorerRender = render;
  window.__gpuExplorerOnSelect = id => {
    S.select(state, id);
    if (!applyingScene && ui.selection !== id) { transition({ type: 'SELECT', id, level: scene()?.getLevel?.() }); render(); }
  };
  window.__gpuExplorerMoveSelection = dir => {
    if (ui.mode === 'learn') { step(dir); return; }
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
    $('scene-loading').hidden = false; $('scene-loading').querySelector('span').textContent = t('scene.errorShort'); $('diagram').dataset.error = event.detail.message;
  });
  window.addEventListener('gpu-scene-ready', () => { applied = {}; lastTreeKey = ''; lastFlowKey = ''; render(); });
  document.querySelectorAll('.scale-nav [data-level]').forEach(b => b.onclick = () => { applied.level = undefined; state.selected = null; exploreAction({ type: 'LEVEL', level: b.dataset.level }); });
  document.querySelectorAll('.mode-switch [data-mode]').forEach(b => b.onclick = () => b.dataset.mode === 'learn' ? enterGuide() : exploreAction({ type: 'ENTER_EXPLORE' }));
  document.querySelectorAll('.nav-item[data-journey]').forEach(b => b.onclick = () => enterGuide({ journey: b.dataset.journey, index: 0 }));
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { applied.camera = undefined; transition({ type: 'CAMERA', preset: b.dataset.cam }); render(); });
  document.querySelectorAll('.lang-switch [data-lang]').forEach(b => b.onclick = () => setLanguage(b.dataset.lang));
  $('model-select').onchange = e => changeModel(e.target.value);
  $('compare-select').onchange = e => {
    if (e.target.value === state.model) { toast(t('toast.pickOther')); e.target.value = state.compareModel || ''; return; }
    transition({ type: 'ENTER_EXPLORE' }); S.setCompare(state, e.target.value || null); render();
  };
  $('compare-close').onclick = () => { state.compareModel = null; render(); };
  $('prev-btn').onclick = () => step(-1);
  $('next-btn').onclick = () => step(1);
  $('reset-btn').onclick = () => { S.reset(state); lastContentKey = ''; enterGuide({ index: 0 }); };
  $('play-btn').onclick = toggleSequence;
  $('replay-btn').onclick = () => enterGuide();
  $('motion-btn').onclick = () => { transition({ type: 'MOTION_TOGGLE' }); render(); };
  $('explode-slider').oninput = e => exploreAction({ type: 'EXPLODE_SET', value: Number(e.target.value) / 100 });
  $('explode-auto-btn').onclick = () => exploreAction({ type: 'EXPLODE_TOGGLE' });
  $('labels-btn').onclick = () => { labelsByMode[ui.mode] = !labelsOn(); scene()?.setLabels(labelsOn()); renderLabelsButton(); };
  $('paths-btn').onclick = () => { paths = !paths; render(); };
  for (const mode of ['rotate', 'pan']) $(mode + '-btn').onclick = () => {
    navigationMode = mode; scene()?.setNavigationMode?.(mode);
    for (const key of ['rotate', 'pan']) { $(key + '-btn').classList.toggle('active', key === mode); $(key + '-btn').setAttribute('aria-pressed', String(key === mode)); }
  };
  $('focus-btn').onclick = focusSelected;
  $('isolate-btn').onclick = () => { if (!ui.selection) { toast(t('toast.selectFirst')); return; } exploreAction({ type: 'ISOLATE' }); };
  $('home-btn').onclick = resetCamera;
  $('selection-enter').onclick = () => { const level = $('selection-enter').dataset.level; if (LEVELS.includes(level)) exploreAction({ type: 'LEVEL', level }); };
  $('selection-close').onclick = () => { state.selected = null; exploreAction({ type: 'SELECT', id: null }); };
  $('fullscreen-btn').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.canvas-panel').requestFullscreen(); }
    catch { toast(t('toast.noFullscreen')); }
  };
  function openDialog(id) { if (ui.playback === 'sequence' || ui.motionPlaying) { transition({ type: 'PAUSE' }); render(); } $(id).showModal(); }
  $('help-btn').onclick = () => openDialog('help-dialog');
  $('sources-btn').onclick = () => openDialog('sources-dialog');
  $('help-sources').onclick = () => { $('help-dialog').close(); openDialog('sources-dialog'); };
  document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', event => {
    if (event.target !== d) return; const r = d.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) d.close();
  }));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]') || event.target.closest('input,select,textarea,[contenteditable=true]')) return;
    if (event.key === 'Escape' && ui.mode === 'explore') { event.preventDefault(); state.selected = null; exploreAction({ type: 'SELECT', id: null }); return; }
    if (event.key.startsWith('Arrow') && event.target.closest('.scene3d')) return;
    if (ui.mode === 'learn' && event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    else if (ui.mode === 'learn' && event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (ui.mode === 'learn' && event.key === ' ' && !event.target.closest('button,summary,a')) { event.preventDefault(); toggleSequence(); }
    else if (ui.mode === 'explore' && !event.target.closest('.scene3d,button,summary,a')) {
      if (event.key.toLowerCase() === 'f') focusSelected();
      if (event.key.toLowerCase() === 'i') $('isolate-btn').click();
      if (event.key.toLowerCase() === 'r') resetCamera();
    }
  });
  window.addEventListener('hashchange', () => {
    const lang = T.normalize(new URLSearchParams(location.hash.slice(1)).get('lang'));
    if (lang && lang !== T.lang) { T.setLang(lang); lastTreeKey = ''; lastLegendKey = ''; scene()?.setLanguage?.(lang); renderStatic(); }
    state = S.decodeState(location.hash); hydrate(); render();
  });
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
    if (ui.explode !== previous.explode && ui.mode === 'explore') {
      window.__gpuExplorerExplode = ui.explode; scene()?.setExplode(ui.explode); applied.explode = ui.explode;
      $('explode-slider').value = Math.round(ui.explode * 100);
      $('explode-value').textContent = Math.round(ui.explode * 100) + '%';
      $('diagram').dataset.explode = ui.explode.toFixed(3);
      if (now - lastHashFrame > 200) { syncHash(); lastHashFrame = now; }
    }
    if (ui.advanceRequested) { S.next(state); enterGuide({ playback: 'sequence' }); }
    else if (ui.playback !== previous.playback || ui.motionPlaying !== previous.motionPlaying || ui.explodeAuto !== previous.explodeAuto || (previous.progress < 1 && ui.progress >= 1)) {
      renderPlayback(); window.GpuExplorerLab?.render($('journey-lab'), state, S.currentStep(state), ui.progress); syncHash();
    }
    requestAnimationFrame(frame);
  }
  renderStatic(); render(); requestAnimationFrame(frame);
})();
