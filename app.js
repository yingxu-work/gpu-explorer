// GPU Explorer — browser rendering only. Logic lives in state.js;
// 3D geometry mapping lives in scene-map.js; the WebGL scene itself
// lives in scene3d.js (Three.js, local bundle). This file owns the shell:
// journey/model/view controls, step playback, predict cards, inspector
// text, URL state, and the explode slider. It never draws flat SVG.
(function () {
  const S = window.GpuExplorerState;
  const state = S.decodeState(window.location.hash || '');
  let timer = null;
  let explodeAuto = null;
  const $ = function (id) { return document.getElementById(id); };

  const JOURNEY_SHORT = { gemm: '矩阵乘法', pagetable: '页表遍历', pixel: '像素着色', stacking: '芯片堆叠' };
  const MODEL_SHORT = { h100: 'H100', a100: 'A100', rtx5090: 'RTX 5090', mi300x: 'MI300X', a20pro: 'A20 Pro', snapdragon: 'Snapdragon' };
  function render() {
    $('tooltip').style.display = 'none';
    const journey = S.currentJourney(state);
    const step = S.currentStep(state);
    // Breadcrumb, <=6 tokens: 探索 › 旅程 › 型号 › 第 N 步.
    $('crumb').textContent = '探索 › ' + (JOURNEY_SHORT[state.journey] || state.journey) + ' › ' + (MODEL_SHORT[state.model] || state.model) + ' › 第' + (state.stepIndex + 1) + '步';
    // Gloss only for the active journey (text-economy rule).
    $('journey-gloss').textContent = journey.gloss || '';
    $('step-counter').textContent = '第 ' + (state.stepIndex + 1) + ' / ' + journey.steps.length + ' 步';
    $('step-title').textContent = step.title;
    $('step-body').textContent = S.getStepNote(step, state.model);
    // Fact row: the step's formula trace. No separate trace panel.
    $('fact').textContent = step.trace || '';
    $('play-btn').textContent = state.playing ? '暂停' : '播放';
    $('prev-btn').disabled = S.isAtStart(state);
    $('next-btn').disabled = S.isAtEnd(state);
    $('progress-fill').style.width = Math.round((state.stepIndex + 1) / journey.steps.length * 100) + '%';

    document.querySelectorAll('[data-cam]').forEach(function (b) {
    b.onclick = function () { if (window.GpuExplorer3D) window.GpuExplorer3D.setCamera(b.dataset.cam); };
  });
  document.querySelectorAll('[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === state.view);
    });
    document.querySelectorAll('[data-journey]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.journey === state.journey);
    });
    document.querySelectorAll('[data-model]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.model === state.model);
    });
    $('model-select').value = state.model;
    $('compare-select').value = state.compareModel || '';

    // Timeline = one chip per step (Piece 3), 1-2 words each. The
    // timeline IS the trace; only the selected step's gloss is printed
    // (the #phase-gloss element id is retained for compatibility).
    // Clicking a chip jumps directly to that step; prev/next/play are
    // unchanged and still reach every step.
    const ov = $('overview');
    ov.innerHTML = '';
    const chips = S.STEP_CHIPS[state.journey] || [];
    const curChip = S.currentStepChip(state);
    chips.forEach(function (c, i) {
      const b = document.createElement('button');
      b.className = 'ov-step' + (i === state.stepIndex ? ' active' : '') + (i < state.stepIndex ? ' done' : '');
      b.textContent = c.label;
      b.setAttribute('aria-label', '第' + (i + 1) + '步：' + c.label + '：' + c.gloss);
      b.onclick = function () { state.playing = false; stopTimer(); S.goto(state, i); render(); };
      ov.appendChild(b);
    });
    $('phase-gloss').textContent = curChip ? curChip.gloss : '';

    const predBox = $('predict');
    predBox.innerHTML = '';
    const pred = S.getPredict(state.journey, state.stepIndex);
    if (pred) {
      const h = document.createElement('h4');
      h.textContent = '预测：' + pred.q;
      predBox.appendChild(h);
      const made = S.predictionMade(state);
      pred.options.forEach(function (opt, i) {
        const b = document.createElement('button');
        b.className = 'pred-opt' + (made === i ? (i === pred.answer ? ' correct' : ' wrong') : '');
        b.textContent = opt;
        b.disabled = made === pred.answer;
        b.onclick = function () {
          const r = S.predict(state, i);
          render();
          if (r && !r.correct) {
            $('predict-feedback').textContent = '未命中：' + r.explain.replace(/^正确：/, '');
          }
        };
        predBox.appendChild(b);
      });
      const fb = document.createElement('p');
      fb.id = 'predict-feedback';
      fb.className = 'pred-feedback';
      if (made === pred.answer) fb.textContent = pred.explain;
      else if (made !== undefined && made !== null) fb.textContent = '已选择一项，尚未命中正确答案，可再次选择。';
      predBox.appendChild(fb);
    }

    // Compare panel visibility first — the 3D manager reads it.
    const cmpBox = $('compare-diagram');
    if (state.compareModel) {
      cmpBox.style.display = '';
      $('compare-model-name').textContent = S.MODELS[state.compareModel].name + ' · ' + S.MODELS[state.compareModel].kind;
      $('compare-model-note').textContent = S.MODELS[state.compareModel].note;
      $('compare-step-note').textContent = S.getStepNote(step, state.compareModel);
      $('main-model-name').textContent = S.MODELS[state.model].name + ' · 对比主型号';
    } else {
      cmpBox.style.display = 'none';
      $('main-model-name').textContent = '';
    }

    // Real 3D scene (if its module has loaded yet; it re-calls render()
    // on init, so a first paint before that is harmless).
    if (window.GpuExplorer3D) window.GpuExplorer3D.update(journey, step, state);

    // Keyboard-accessible block list: same selection as clicking a 3D
    // block, so selection is not mouse-only.
    const bl = $('block-list');
    bl.innerHTML = '';
    journey.nodes.forEach(function (node) {
      const b = document.createElement('button');
      b.className = state.selected === node.id ? 'active' : '';
      b.textContent = node.label + (node.disabled ? ' ×' : '');
      b.setAttribute('aria-label', node.label + '：' + (node.detail || ''));
      b.onclick = function () { S.select(state, node.id); syncHash(); render(); };
      bl.appendChild(b);
    });

    const code = $('code-panel');
    code.innerHTML = '';
    step.code.forEach(function (line) {
      const l = document.createElement('div');
      l.textContent = line;
      code.appendChild(l);
    });
    if (window.location.hash !== '#' + S.encodeState(state)) {
      history.replaceState(null, '', '#' + S.encodeState(state));
    }
  }
  window.__gpuExplorerRender = render;
  window.__gpuExplorerOnSelect = function (id) { S.select(state, id); syncHash(); render(); };

  function syncHash() { history.replaceState(null, '', '#' + S.encodeState(state)); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function startTimer() {
    stopTimer();
    const speed = parseFloat($('speed-select').value || '1');
    timer = setInterval(function () {
      if (!state.playing) { stopTimer(); return; }
      S.playStep(state);
      if (!state.playing) stopTimer();
      render();
    }, Math.round(1600 / speed));
  }
  function setExplodeFromSlider() {
    const v = parseFloat($('explode-slider').value || '0') / 100;
    window.__gpuExplorerExplode = v;
    $('explode-value').textContent = Math.round(v * 100) + '%';
    if (window.GpuExplorer3D) window.GpuExplorer3D.setExplode(v);
    else render();
  }
  function stopExplodeAuto() {
    if (explodeAuto) { clearInterval(explodeAuto); explodeAuto = null; }
    $('explode-auto-btn').textContent = '拆开 AUTO';
  }

  $('prev-btn').onclick = function () { state.playing = false; stopTimer(); S.prev(state); render(); };
  $('next-btn').onclick = function () { state.playing = false; stopTimer(); S.next(state); render(); };
  $('reset-btn').onclick = function () { state.playing = false; stopTimer(); S.reset(state); render(); };
  $('play-btn').onclick = function () {
    state.playing = !state.playing;
    if (state.playing) { if (S.isAtEnd(state)) state.stepIndex = 0; startTimer(); } else stopTimer();
    render();
  };
  document.querySelectorAll('[data-journey]').forEach(function (b) {
    b.onclick = function () { state.playing = false; stopTimer(); S.setJourney(state, b.dataset.journey); render(); };
  });
  $('model-select').onchange = function (e) { S.setModel(state, e.target.value); render(); };
  document.querySelectorAll('[data-model]').forEach(function (b) {
    b.onclick = function () { $('model-select').value = b.dataset.model; $('model-select').dispatchEvent(new Event('change', { bubbles: true })); };
  });
  $('compare-select').onchange = function (e) { S.setCompare(state, e.target.value || null); render(); };
  $('speed-select').onchange = function () { if (state.playing) startTimer(); };
  $('explode-slider').addEventListener('input', function () { stopExplodeAuto(); setExplodeFromSlider(); });
  $('explode-auto-btn').onclick = function () {
    if (explodeAuto) { stopExplodeAuto(); return; }
    $('explode-auto-btn').textContent = '停止 AUTO';
    const start = Date.now();
    explodeAuto = setInterval(function () {
      const t = (Date.now() - start) / 1000;
      let v;
      if (t < 3.5) v = t / 3.5;
      else if (t < 4.5) v = 1;
      else if (t < 8) v = 1 - (t - 4.5) / 3.5;
      else { v = 0; stopExplodeAuto(); }
      $('explode-slider').value = String(Math.round(v * 100));
      setExplodeFromSlider();
    }, 50);
  };
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.onclick = function () { S.setView(state, b.dataset.view); render(); };
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight') { state.playing = false; stopTimer(); S.next(state); render(); }
    if (e.key === 'ArrowLeft') { state.playing = false; stopTimer(); S.prev(state); render(); }
    if (e.key === ' ') { e.preventDefault(); $('play-btn').click(); }
  });
  render();
})();
