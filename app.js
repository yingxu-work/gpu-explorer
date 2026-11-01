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

  function render() {
    $('tooltip').style.display = 'none';
    const journey = S.currentJourney(state);
    const step = S.currentStep(state);
    $('journey-title').textContent = journey.title;
    $('verdict').textContent = journey.verdict || '';
    $('model-note').textContent = S.MODELS[state.model].name + ' · ' + S.MODELS[state.model].kind + ' — ' + S.MODELS[state.model].note;
    $('step-counter').textContent = '第 ' + (state.stepIndex + 1) + ' / ' + journey.steps.length + ' 步';
    $('step-title').textContent = step.title;
    $('step-body').textContent = S.getStepNote(step, state.model);
    $('trace').textContent = '追踪：' + (step.trace || '');
    $('view-note').textContent = journey.views[state.view];
    $('play-btn').textContent = state.playing ? '暂停' : '播放';
    $('prev-btn').disabled = S.isAtStart(state);
    $('next-btn').disabled = S.isAtEnd(state);
    $('progress-fill').style.width = Math.round((state.stepIndex + 1) / journey.steps.length * 100) + '%';

    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === state.view);
    });
    document.querySelectorAll('[data-journey]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.journey === state.journey);
    });
    document.querySelectorAll('[data-model]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.model === state.model);
    });
    $('journey-select').value = state.journey;
    $('model-select').value = state.model;
    $('compare-select').value = state.compareModel || '';

    const ov = $('overview');
    ov.innerHTML = '';
    journey.steps.forEach(function (s, i) {
      const b = document.createElement('button');
      b.className = 'ov-step' + (i === state.stepIndex ? ' active' : '') + (i < state.stepIndex ? ' done' : '');
      b.textContent = (i + 1) + ' ' + s.title;
      b.setAttribute('aria-label', '跳到第 ' + (i + 1) + ' 步：' + s.title);
      b.onclick = function () { state.playing = false; stopTimer(); S.goto(state, i); render(); };
      ov.appendChild(b);
    });

    const predBox = $('predict');
    predBox.innerHTML = '';
    const pred = S.getPredict(state.journey, state.stepIndex);
    if (pred) {
      const h = document.createElement('h4');
      h.textContent = '先预测：' + pred.q;
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
            $('predict-feedback').textContent = '不对，再想想：' + r.explain.replace(/^对：/, '');
          }
        };
        predBox.appendChild(b);
      });
      const fb = document.createElement('p');
      fb.id = 'predict-feedback';
      fb.className = 'pred-feedback';
      if (made === pred.answer) fb.textContent = pred.explain;
      else if (made !== undefined && made !== null) fb.textContent = '已选一项，还没答对——可以再选一次。';
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
    $('selected-note').textContent = state.selected
      ? '已选：' + (journey.nodes.find(function (n) { return n.id === state.selected; }) || {}).label + '（切换视图时保留；拖动可旋转场景，点击 3D 方块或下方部件列表可改选）'
      : '拖动可旋转 3D 场景，滚轮缩放；点一下 3D 方块或下方部件列表，选中一个部件；切换视图时选中状态保留。';
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
  $('journey-select').onchange = function (e) { state.playing = false; stopTimer(); S.setJourney(state, e.target.value); render(); };
  document.querySelectorAll('[data-journey]').forEach(function (b) {
    b.onclick = function () { $('journey-select').value = b.dataset.journey; $('journey-select').dispatchEvent(new Event('change', { bubbles: true })); };
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
