// GPU Explorer — browser rendering only. Logic lives in state.js.
(function () {
  const S = window.GpuExplorerState;
  const state = S.decodeState(window.location.hash || '');
  let timer = null;
  const $ = function (id) { return document.getElementById(id); };
  const NS = 'http://www.w3.org/2000/svg';
  const KIND_FILL = { data: '#dcfce7', compute: '#dbeafe', memory: '#fef3c7', control: '#e2e8f0' };
  const KIND_STROKE = { data: '#15803d', compute: '#1d4ed8', memory: '#b45309', control: '#475569' };

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function center(node) { return { x: node.x + node.w / 2, y: node.y + node.h / 2 }; }
  function edgePoint(from, to) {
    // Point on `from`'s border facing `to`'s centre (axis-dominant).
    const a = center(from), b = center(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: a.x + (dx > 0 ? from.w / 2 : -from.w / 2), y: a.y };
    }
    return { x: a.x, y: a.y + (dy > 0 ? from.h / 2 : -from.h / 2) };
  }
  function wrapLabel(label) {
    // Split long labels into at most two lines for SVG text.
    if (label.length <= 12) return [label];
    const parts = label.split(' ');
    if (parts.length > 1) return [parts.slice(0, -1).join(' '), parts.slice(-1)[0]];
    return [label.slice(0, 10), label.slice(10)];
  }

  function renderDiagram(journey, step) {
    const svg = $('diagram-svg');
    svg.innerHTML = '';
    const defs = el('defs');
    const marker = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#64748b' }));
    defs.appendChild(marker);
    const markerHot = el('marker', { id: 'arr-hot', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse' });
    markerHot.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#b45309' }));
    defs.appendChild(markerHot);
    svg.appendChild(defs);
    const live = {};
    (step.flows || []).forEach(function (f) { live[f] = true; });
    const byId = {};
    journey.nodes.forEach(function (n) { byId[n.id] = n; });
    (journey.flows || []).forEach(function (f) {
      const a = byId[f.from], b = byId[f.to];
      if (!a || !b) return;
      const p1 = edgePoint(a, b), p2 = edgePoint(b, a);
      const hot = live[f.from + '>' + f.to];
      const line = el('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: hot ? '#b45309' : '#94a3b8', 'stroke-width': hot ? '3.5' : '2',
        'marker-end': hot ? 'url(#arr-hot)' : 'url(#arr)',
        'stroke-dasharray': (f.from === 'smem' && f.to === 'sm') || (f.from === 'tex') ? '7 5' : '',
      });
      svg.appendChild(line);
    });
    journey.nodes.forEach(function (node) {
      const g = el('g', { class: 'svg-node', tabindex: '0' });
      const isActive = step.active.indexOf(node.id) >= 0;
      const isSel = state.selected === node.id;
      const rect = el('rect', {
        x: node.x, y: node.y, width: node.w, height: node.h, rx: '12',
        fill: isActive ? '#fde68a' : (KIND_FILL[node.kind] || '#f1f5f9'),
        stroke: isSel ? '#1a56db' : (KIND_STROKE[node.kind] || '#64748b'),
        'stroke-width': isSel ? '4' : '2',
        opacity: node.disabled ? '0.45' : '1',
      });
      g.appendChild(rect);
      const lines = wrapLabel(node.label + (node.disabled ? ' ×' : ''));
      lines.forEach(function (ln, i) {
        g.appendChild(el('text', {
          x: center(node).x, y: center(node).y + (lines.length > 1 ? (i === 0 ? -6 : 14) : 5),
          'text-anchor': 'middle', 'font-size': '17', 'font-weight': isActive ? '700' : '600',
          fill: '#111827', 'text-decoration': node.disabled ? 'line-through' : 'none',
        }, ln));
      });
      const kind = el('text', { x: node.x + 10, y: node.y + 20, 'font-size': '12', fill: '#475569' },
        node.kind === 'data' ? '数据' : node.kind === 'compute' ? '计算' : node.kind === 'memory' ? '存储' : '控制');
      g.appendChild(kind);
      g.addEventListener('click', function () { S.select(state, node.id); syncHash(); render(); });
      g.addEventListener('mouseenter', function (ev) {
        const tip = $('tooltip');
        tip.textContent = node.label + '：' + (node.detail || '');
        tip.style.display = 'block';
        tip.style.left = (ev.clientX + 12) + 'px';
        tip.style.top = (ev.clientY + 12) + 'px';
      });
      g.addEventListener('mouseleave', function () { $('tooltip').style.display = 'none'; });
      svg.appendChild(g);
    });
  }

  function render() {
    const journey = S.currentJourney(state);
    const step = S.currentStep(state);
    $('journey-title').textContent = journey.title;
    $('verdict').textContent = journey.verdict || '';
    $('model-note').textContent = S.MODELS[state.model].name + ' · ' + S.MODELS[state.model].kind + ' — ' + S.MODELS[state.model].note;
    $('step-counter').textContent = '第 ' + (state.stepIndex + 1) + ' / ' + journey.steps.length + ' 步';
    $('step-title').textContent = step.title;
    $('step-body').textContent = step.body;
    $('trace').textContent = '追踪：' + (step.trace || '');
    $('view-note').textContent = journey.views[state.view];
    $('play-btn').textContent = state.playing ? '暂停' : '播放';
    $('prev-btn').disabled = S.isAtStart(state);
    $('next-btn').disabled = S.isAtEnd(state);
    $('progress-fill').style.width = Math.round((state.stepIndex + 1) / journey.steps.length * 100) + '%';

    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === state.view);
    });
    $('journey-select').value = state.journey;
    $('model-select').value = state.model;

    // Persistent overview strip: every step, current highlighted, click to jump.
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

    // Predict-then-play card: question about the next step, answered in place.
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

    renderDiagram(journey, step);
    const code = $('code-panel');
    code.innerHTML = '';
    step.code.forEach(function (line) {
      const l = document.createElement('div');
      l.textContent = line;
      code.appendChild(l);
    });
    $('selected-note').textContent = state.selected
      ? '已选：' + (journey.nodes.find(function (n) { return n.id === state.selected; }) || {}).label + '（切换视图时保留；悬停任意方块可看它的输入与输出）'
      : '点一下图里的方块，选中一个部件；切换视图时选中状态保留。悬停方块可看它的输入与输出。';
    if (window.location.hash !== '#' + S.encodeState(state)) {
      history.replaceState(null, '', '#' + S.encodeState(state));
    }
  }
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

  $('prev-btn').onclick = function () { state.playing = false; stopTimer(); S.prev(state); render(); };
  $('next-btn').onclick = function () { state.playing = false; stopTimer(); S.next(state); render(); };
  $('reset-btn').onclick = function () { state.playing = false; stopTimer(); S.reset(state); render(); };
  $('play-btn').onclick = function () {
    state.playing = !state.playing;
    if (state.playing) { if (S.isAtEnd(state)) state.stepIndex = 0; startTimer(); } else stopTimer();
    render();
  };
  $('journey-select').onchange = function (e) { state.playing = false; stopTimer(); S.setJourney(state, e.target.value); render(); };
  $('model-select').onchange = function (e) { S.setModel(state, e.target.value); render(); };
  $('speed-select').onchange = function () { if (state.playing) startTimer(); };
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.onclick = function () { S.setView(state, b.dataset.view); render(); };
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { state.playing = false; stopTimer(); S.next(state); render(); }
    if (e.key === 'ArrowLeft') { state.playing = false; stopTimer(); S.prev(state); render(); }
    if (e.key === ' ') { e.preventDefault(); $('play-btn').click(); }
  });
  render();
})();
