/* Worked examples shown beside the 3D model. Each walkthrough has one figure
 * that keeps its shape from the first step to the last; a step only fills in
 * more of it. Colours match the arrows on the model (teaching-flow.js). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GpuExplorerLab = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';
  var I18N = (root && root.GpuExplorerI18n) || (typeof require === 'function' ? require('./i18n.js') : null);
  var forced = null;
  function L(zh, en) { return { zh: zh, en: en }; }
  function lang() { return forced || (I18N && I18N.lang) || 'zh'; }
  function tr(v) { return v && typeof v === 'object' && 'zh' in v ? v[lang()] : v; }

  // ---------- Matrix multiply ----------
  var ROW = 3, COL = 7, K = 8, TILE_K = 4;
  var A = Array.from({ length: 4 }, function (_, i) {
    return Array.from({ length: K }, function (_, k) { return 1 + (i * 3 + k * 2) % 4; });
  });
  var B = Array.from({ length: K }, function (_, k) {
    return Array.from({ length: 8 }, function (_, j) { return 1 + (k + j * 2) % 4; });
  });
  A[ROW] = [2, 1, 3, 2, 4, 1, 2, 3];
  [1, 3, 2, 4, 1, 2, 3, 2].forEach(function (v, k) { B[k][COL] = v; });
  function multiply(a, b) {
    if (!a.length || !b.length || a[0].length !== b.length) throw new Error('Incompatible matrix dimensions');
    return a.map(function (row) { return b[0].map(function (_, j) {
      return row.reduce(function (acc, value, k) { return acc + value * b[k][j]; }, 0);
    }); });
  }
  function dotTrace(row, col) {
    row = row === undefined ? ROW : row;
    col = col === undefined ? COL : col;
    var acc = 0;
    return A[row].map(function (value, k) {
      var before = acc, product = value * B[k][col];
      acc += product;
      return { k: k, a: value, b: B[k][col], product: product, before: before, acc: acc };
    });
  }
  var C = multiply(A, B), TRACE = dotTrace();
  function clamp(p) { p = Number(p); return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0; }
  // How many of the eight products have been added at a step and a progress.
  function accumulation(step, progress) {
    var p = clamp(progress), count;
    if (step < 5) return { count: 0, value: 0, currentK: null, complete: false };
    if (step === 5) count = Math.min(4, Math.floor(p * 4.999));
    else if (step === 6) count = Math.min(8, 4 + Math.floor(p * 4.999));
    else count = K;
    return { count: count, value: count ? TRACE[count - 1].acc : 0, currentK: count < K ? count : K - 1, complete: count === K };
  }
  // Where each round's four pairs of numbers are at each step.
  var AT = {
    hbm: L('还在 HBM', 'still in HBM'),
    load: L('HBM → 共享内存', 'HBM → shared memory'),
    read: L('共享内存 → 寄存器', 'shared memory → registers'),
    mma: L('寄存器 → Tensor Core', 'registers → Tensor Core'),
    all: L('HBM 一路到 Tensor Core', 'HBM all the way to the Tensor Core'),
    done: L('已加进累加器', 'added to the accumulator')
  };
  var ROUNDS = [
    ['hbm', 'hbm'], ['hbm', 'hbm'], ['hbm', 'hbm'], ['load', 'hbm'],
    ['read', 'hbm'], ['mma', 'hbm'], ['done', 'all'], ['done', 'done']
  ];
  // The round of four pairs a step works on (0 or 1), or -1 when it works on neither.
  var ACTIVE_ROUND = [-1, -1, -1, 0, 0, 0, 1, -1];
  function roundStatus(step) { return ROUNDS[Math.max(0, Math.min(7, step))].map(function (key) { return AT[key]; }); }
  function activeRound(step) { return ACTIVE_ROUND[Math.max(0, Math.min(7, step))]; }

  // ---------- Address translation ----------
  // GPU virtual address split by the Hopper GMMU layout (57-bit VA):
  // PD4[56] PD3[55:47] PD2[46:38] PD1[37:29] PD0[28:21], 2 MiB page offset [20:0].
  var GPU_FIELDS = [
    { id: 'pd4', hi: 56, lo: 56 }, { id: 'pd3', hi: 55, lo: 47 }, { id: 'pd2', hi: 46, lo: 38 },
    { id: 'pd1', hi: 37, lo: 29 }, { id: 'pd0', hi: 28, lo: 21 }, { id: 'offset', hi: 20, lo: 0 }
  ];
  function gpuAddressFields(address) {
    var va = typeof address === 'bigint' ? address : BigInt(address);
    if (va < 0n || va >= (1n << 57n)) throw new Error('Expected an unsigned 57-bit address');
    var out = {};
    GPU_FIELDS.forEach(function (f) { out[f.id] = Number((va >> BigInt(f.lo)) & ((1n << BigInt(f.hi - f.lo + 1)) - 1n)); });
    return out;
  }
  var PAGE = { va: '0x7f3ac2d64a40', pageBase: '0x24e000000', physical: '0x24e164a40', pageBits: 21 };
  PAGE.fields = gpuAddressFields(BigInt(PAGE.va));
  function physicalAddress(pageBase, va, pageBits) {
    var mask = (1n << BigInt(pageBits)) - 1n;
    return BigInt(pageBase) + (BigInt(va) & mask);
  }
  // Which address fields a step uses (indices into GPU_FIELDS).
  var PAGE_BITS = [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2], [3, 4], [5], [], []];

  // ---------- Pixel ----------
  function barycentricColor(weights, colors) {
    if (weights.length !== colors.length) throw new Error('One weight per vertex is required');
    return colors[0].map(function (_, channel) {
      return weights.reduce(function (sum, weight, i) { return sum + weight * colors[i][channel]; }, 0);
    });
  }
  function barycentricWeights(tri, p) {
    var d = (tri[1][1] - tri[2][1]) * (tri[0][0] - tri[2][0]) + (tri[2][0] - tri[1][0]) * (tri[0][1] - tri[2][1]);
    var w0 = ((tri[1][1] - tri[2][1]) * (p[0] - tri[2][0]) + (tri[2][0] - tri[1][0]) * (p[1] - tri[2][1])) / d;
    var w1 = ((tri[2][1] - tri[0][1]) * (p[0] - tri[2][0]) + (tri[0][0] - tri[2][0]) * (p[1] - tri[2][1])) / d;
    return [w0, w1, 1 - w0 - w1];
  }
  // Screen positions are in pixels on an 8 × 8 target; pixel (3, 4) has its centre at (3.5, 4.5).
  var PIXEL = { target: [3, 4], center: [3.5, 4.5], vertices: [[4.5, 0], [1, 6], [7, 5]], colors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    weights: [.2, .5, .3], uv: [.25, .75], texel: [1, 1, 1], depth: .4, stored: .7 };
  PIXEL.color = barycentricColor(PIXEL.weights, PIXEL.colors);
  PIXEL.rgb = PIXEL.color.map(function (x, i) { return Math.round(x * PIXEL.texel[i] * 255); });

  // ---------- Stacking ----------
  // HBM bandwidth per data line, from the published product bandwidth.
  function perLineRate(bytesPerSecond, stacks, bitsPerStack) { return bytesPerSecond * 8 / (stacks * bitsPerStack); }
  var PRODUCT = {
    h100: { bandwidth: '3.35 TB/s', bytes: 3.35e12, line: '5.2 Gb/s', channels: L('16 个通道 × 64 位', '16 channels × 64 bits'), power: L('最高 700 W', 'up to 700 W'), sm: '132 / 144', memory: 'HBM3' },
    a100: { bandwidth: '2.04 TB/s', bytes: 2.039e12, line: '3.2 Gb/s', channels: L('8 个通道 × 128 位', '8 channels × 128 bits'), power: L('400 W', '400 W'), sm: '108 / 128', memory: 'HBM2e' }
  };
  function product(model) { return PRODUCT[model] || PRODUCT.h100; }

  // ---------- The running record: one line per step, kept as the walkthrough goes on ----------
  var LOGS = {
    pagetable: [
      { k: L('LD/ST 算出虚拟地址', 'LD/ST works out the virtual address'), v: PAGE.va },
      { k: L('查 SM 旁边的 L1 TLB', 'Look in the L1 TLB by the SM'), v: L('没有，未命中', 'not there, a miss') },
      { k: L('查共享 TLB', 'Look in the shared TLB'), v: L('也没有，交给 GMMU', 'not there either, over to the GMMU') },
      { k: L('读 PD4[0]、PD3[0]、PD2[508]', 'Read PD4[0], PD3[0], PD2[508]'), v: L('得到 PD1 在哪', 'gives where PD1 is') },
      { k: L('读 PD1[470]、PD0[22]', 'Read PD1[470], PD0[22]'), v: L('页基址 ' + PAGE.pageBase, 'page base ' + PAGE.pageBase) },
      { k: L('页基址 + 偏移 0x164a40', 'Page base + offset 0x164a40'), v: L('物理地址 ' + PAGE.physical, 'physical address ' + PAGE.physical) },
      { k: L('去 HBM 读 ' + PAGE.physical, 'Read ' + PAGE.physical + ' from HBM'), v: L('读出 A[3,0]', 'returns A[3,0]') },
      { k: L('数据回到寄存器', 'The data reaches the register'), v: 'A[3,0] = ' + A[ROW][0] }
    ],
    pixel: [
      { k: L('在哪算', 'Where it runs'), v: L('图形 TPC 里的一个 SM', 'an SM in a graphics TPC') },
      { k: L('读入三个顶点', 'Read three vertices'), v: L('v₀ 红，v₁ 绿，v₂ 蓝', 'v₀ red, v₁ green, v₂ blue') },
      { k: L('屏幕坐标', 'Screen positions'), v: '(4.5, 0)  (1, 6)  (7, 5)' },
      { k: L('像素 (3, 4) 的权重', 'Weights at pixel (3, 4)'), v: L('0.2、0.5、0.3，在三角形里', '0.2, 0.5, 0.3, so it is inside') },
      { k: L('按权重混合颜色', 'Blend colors by weight'), v: '(0.2, 0.5, 0.3)' },
      { k: L('乘上白色纹素 (1, 1, 1)', 'Times the white texel (1, 1, 1)'), v: L('颜色不变', 'color unchanged') },
      { k: L('深度 0.4 比已有的 0.7 近', 'Depth 0.4 is nearer than the stored 0.7'), v: L('× 255 后写入 (51, 128, 77)', '× 255, write (51, 128, 77)') },
      { k: L('整帧拷给主机', 'Copy the frame to the host'), v: 'PCIe / NVLink' }
    ],
    stacking: [
      { k: L('要喂饱 SM 的带宽', 'Bandwidth the SMs need'), v: function (m) { return product(m).bandwidth; } },
      { k: L('一组 HBM', 'One HBM stack'), v: L('多层 DRAM 叠在底部接口芯片上', 'DRAM dies on a base interface die') },
      { k: L('层与层之间', 'Between the layers'), v: L('TSV 和微凸点，每层几十微米', 'TSVs and microbumps, tens of microns per layer') },
      { k: L('数据线', 'Data lines'), v: function (m) { return L('5 × 1024 = 5120 根，每根约 ' + product(m).line, '5 × 1024 = 5120, about ' + product(m).line + ' each'); } },
      { k: L('HBM 到 GPU', 'HBM to GPU'), v: L('约 1 mm，走在硅中介层里', 'about 1 mm, inside the silicon interposer') },
      { k: L('往下到电路板', 'Down to the board'), v: L('微凸点 → C4 凸点 → 焊球，一层比一层大', 'microbumps → C4 bumps → solder balls, larger each time') },
      { k: L('热量', 'Heat'), v: function (m) { return L(product(m).power.zh + '，从顶面进冷板', product(m).power.en + ', out through the top into the cold plate'); } },
      { k: L('启用的部分', 'Switched on'), v: function (m) { return L(product(m).sm + ' 个 SM，5 / 6 组 HBM', product(m).sm + ' SMs, 5 / 6 HBM stacks'); } }
    ]
  };
  function logRows(journey, step, model) {
    var rows = LOGS[journey] || [];
    return rows.slice(0, Math.max(0, Math.min(rows.length - 1, step)) + 1).map(function (row, i) {
      return { n: i + 1, k: row.k, v: typeof row.v === 'function' ? row.v(model || 'h100') : row.v, now: i === step };
    });
  }

  // ---------- Markup ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function t(v) { return esc(tr(v)); }
  var MONO = 'ui-monospace,SFMono-Regular,"JetBrains Mono",Consolas,monospace';
  var STYLE = [
    '.lab-root{--lab-a:#61ddc3;--lab-b:#efbe78;--lab-c:#94b9ff;--lab-addr:#c9a7f2;--lab-heat:#f08a5d;--lab-accent:#bddaa7;--lab-line:rgba(237,237,237,.08);--lab-line-strong:rgba(237,237,237,.16);--lab-text:#ededed;--lab-text-2:#a1a1a6;--lab-dim:#85858b;color:var(--lab-text);font-size:13px;line-height:1.5;min-width:0}',
    '.lab-root *{box-sizing:border-box}',
    '.lab-fig{padding:12px;border:1px solid var(--lab-line);border-radius:12px;background:#19191b}',
    '.lab-note{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--lab-text-2)}',
    // matrix map
    '.lab-map{display:grid;grid-template-columns:auto 16px auto 16px auto;justify-content:space-between;align-items:end}',
    '.lab-mat{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0}',
    '.lab-grid{display:grid;grid-template-columns:repeat(8,9px);gap:2px}',
    '.lab-cell{width:9px;height:9px;border-radius:2px;background:rgba(237,237,237,.08)}',
    '.lab-cell.lab-a{background:var(--lab-a)}.lab-cell.lab-b{background:var(--lab-b)}.lab-cell.lab-tile{background:rgba(148,185,255,.3)}.lab-cell.lab-c{background:var(--lab-c)}',
    '.lab-cap{font-size:12px;line-height:1.35;color:var(--lab-text-2);white-space:nowrap;text-align:center}',
    '.lab-cap b{font:500 12px ' + MONO + '}.lab-cap .lab-ta{color:var(--lab-a)}.lab-cap .lab-tb{color:var(--lab-b)}.lab-cap .lab-tc{color:var(--lab-c)}',
    '.lab-op{color:var(--lab-dim);text-align:center;padding-bottom:22px}',
    // the eight pairs
    '.lab-ktable{display:grid;grid-template-columns:minmax(52px,auto) repeat(4,minmax(0,1fr)) 12px repeat(4,minmax(0,1fr));gap:2px;align-items:center;margin-top:16px;font:13px ' + MONO + ';font-variant-numeric:tabular-nums}',
    '.lab-rowlabel{font-size:12px;color:var(--lab-text-2);white-space:nowrap;padding-right:8px}',
    '.lab-round{grid-column:span 4;font:12px/1.5 system-ui,sans-serif;color:var(--lab-dim);text-align:center}',
    '.lab-kc{height:24px;display:flex;align-items:center;justify-content:center;border-radius:4px}',
    '.lab-kc.lab-khead{height:20px;font-size:12px;color:var(--lab-dim)}',
    '.lab-kc.lab-a{background:rgba(97,221,195,.14);color:var(--lab-a)}.lab-kc.lab-b{background:rgba(239,190,120,.14);color:var(--lab-b)}',
    '.lab-kc.lab-p{background:rgba(237,237,237,.05);color:var(--lab-dim)}.lab-kc.lab-p.lab-done{background:rgba(148,185,255,.18);color:var(--lab-c)}.lab-kc.lab-p.lab-next{outline:1px solid var(--lab-c);outline-offset:-1px}',
    '.lab-at{grid-column:span 4;margin-top:4px;padding:4px 8px;border-radius:6px;border:1px solid var(--lab-line-strong);font:12px/1.4 system-ui,sans-serif;color:var(--lab-text);text-align:center}',
    '.lab-at.lab-at-all{grid-column:span 9}',
    '.lab-at.lab-active{border-color:var(--lab-accent);background:rgba(189,218,167,.1)}',
    '.lab-round.lab-active{color:var(--lab-accent)}',
    '.lab-ktable .lab-dim{opacity:.4}',
    '.lab-acc{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--lab-line);font-size:12px;color:var(--lab-text-2)}',
    '.lab-acc strong{font:500 24px/1 ' + MONO + ';color:var(--lab-c);font-variant-numeric:tabular-nums}',
    '.lab-acc span[data-lab-expression]{font:12px ' + MONO + ';color:var(--lab-text-2)}',
    // address fields
    '.lab-va{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;color:var(--lab-text-2)}',
    '.lab-va code{font:13px ' + MONO + ';color:var(--lab-text)}',
    '.lab-bits{display:grid;gap:2px;margin-top:8px}',
    '.lab-bit{min-width:0;padding:4px 2px;text-align:center;border-radius:4px;border-top:2px solid var(--lab-line-strong);background:rgba(237,237,237,.04)}',
    '.lab-bit span{display:block;font-size:11px;line-height:1.45;color:var(--lab-dim);white-space:nowrap}',
    '.lab-bit b{display:block;font:500 13px/1.5 ' + MONO + ';color:var(--lab-text-2);font-variant-numeric:tabular-nums}',
    '.lab-bit.lab-on{border-top-color:var(--lab-addr);background:rgba(201,167,242,.12)}.lab-bit.lab-on b{color:var(--lab-addr)}.lab-bit.lab-on span{color:var(--lab-text-2)}',
    // the record
    '.lab-log{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:2px}',
    '.lab-log li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px;padding:4px 8px;border-radius:8px;font-size:12px;line-height:1.5;color:var(--lab-dim)}',
    '.lab-log .lab-n{font:12px/1.5 ' + MONO + ';color:var(--lab-dim)}',
    '.lab-log b{margin-left:4px;font-weight:400;color:var(--lab-text-2);overflow-wrap:anywhere}',
    '.lab-log li.lab-now{background:rgba(237,237,237,.06);color:var(--lab-text-2)}.lab-log li.lab-now b{color:var(--lab-text);font-weight:500}.lab-log li.lab-now .lab-n{color:var(--lab-accent)}',
    // pixel
    '.lab-px{display:grid;grid-template-columns:152px minmax(0,1fr);gap:16px;align-items:center}',
    '.lab-svg{display:block;width:100%;height:auto}',
    '.lab-px .lab-svg{width:152px;height:152px}',
    '.lab-svg text{font:11px ' + MONO + ';fill:#a1a1a6}',
    '.lab-key{display:grid;gap:8px;margin:0;font-size:12px;line-height:1.4;color:var(--lab-text-2)}',
    '.lab-key div{display:flex;align-items:center;gap:8px;min-width:0}.lab-key i{flex:none;width:10px;height:10px;border-radius:50%}',
    '.lab-key b{margin-left:auto;font:400 12px ' + MONO + ';color:var(--lab-text)}',
    '.lab-key .lab-result{padding-top:8px;border-top:1px solid var(--lab-line)}.lab-key .lab-result i{width:20px;height:20px;border-radius:4px;border:1px solid var(--lab-line-strong)}',
    // cross-section
    '.lab-part{fill:#2b2d30;stroke:rgba(237,237,237,.14);stroke-width:1}.lab-part.lab-on{fill:#39403a;stroke:var(--lab-accent)}',
    '.lab-ball{fill:#6f7377}.lab-ball.lab-on{fill:var(--lab-accent)}',
    '.lab-tsv{stroke:#b98a5e;stroke-width:1.5}.lab-tsv.lab-on{stroke:var(--lab-accent);stroke-width:2}',
    '.lab-cold{fill:none;stroke:rgba(237,237,237,.3);stroke-width:1;stroke-dasharray:4 3}.lab-cold.lab-on{stroke:var(--lab-accent)}',
    '.lab-lead{stroke:rgba(237,237,237,.18);stroke-width:1}',
    '.lab-svg text.lab-on{fill:#ededed}',
    '.lab-link{fill:none;stroke:var(--lab-a);stroke-width:2}.lab-heatline{fill:none;stroke:var(--lab-heat);stroke-width:2}.lab-heathead{fill:var(--lab-heat)}'
  ].join('\n');
  function installStyle(doc) {
    if (doc.getElementById('gpu-explorer-lab-style')) return;
    var style = doc.createElement('style'); style.id = 'gpu-explorer-lab-style'; style.textContent = STYLE;
    doc.head.appendChild(style);
  }

  // Matrix multiply: which cells matter, the eight pairs, where they are, the running sum.
  function matrix(which, rows, step) {
    var out = '<div class="lab-grid" role="img" aria-label="' + t(L('矩阵 ' + which + '，' + rows + ' 行 8 列', 'Matrix ' + which + ', ' + rows + ' rows by 8 columns')) + '">';
    for (var i = 0; i < rows; i++) for (var j = 0; j < 8; j++) {
      var cls = 'lab-cell';
      if (which === 'A' && i === ROW) cls += ' lab-a';
      if (which === 'B' && j === COL) cls += ' lab-b';
      if (which === 'C') { if (i === ROW && j === COL) cls += ' lab-c'; else if (step >= 2 && i >= 2 && j >= 4) cls += ' lab-tile'; }
      out += '<span class="' + cls + '"></span>';
    }
    return out + '</div>';
  }
  function gemm(step) {
    var done = step >= 7, acc = accumulation(step, step === 5 || step === 6 ? 0 : 1), status = roundStatus(step);
    var cCap = '<b class="lab-tc">C[3,7] = ' + (done ? C[ROW][COL] : '?') + '</b>' + (step >= 2 ? '<br>' + t(L('在 CTA 3 这一块', 'in the CTA 3 tile')) : '');
    var html = '<div class="lab-map">' +
      '<div class="lab-mat">' + matrix('A', 4, step) + '<div class="lab-cap">' + t(L('A 的第 3 行', 'row 3 of A')) + '<br><b class="lab-ta">A[3,k]</b></div></div><div class="lab-op">×</div>' +
      '<div class="lab-mat">' + matrix('B', 8, step) + '<div class="lab-cap">' + t(L('B 的第 7 列', 'column 7 of B')) + '<br><b class="lab-tb">B[k,7]</b></div></div><div class="lab-op">=</div>' +
      '<div class="lab-mat">' + matrix('C', 4, step) + '<div class="lab-cap">' + cCap + '</div></div></div>';
    // Each round's four columns carry where those numbers are now; the round
    // this step works on is outlined and the other one is dimmed.
    var active = activeRound(step);
    function roundOf(k) { return k < TILE_K ? 0 : 1; }
    function dim(k) { return active >= 0 && roundOf(k) !== active ? ' lab-dim' : ''; }
    var table = '';
    if (step >= 2) table += '<span></span><span class="lab-round' + (active === 0 ? ' lab-active' : '') + '">' + t(L('第 1 轮', 'Round 1')) + '</span><span></span><span class="lab-round' + (active === 1 ? ' lab-active' : '') + '">' + t(L('第 2 轮', 'Round 2')) + '</span>';
    function row(label, cls, cell) {
      var out = '<span class="lab-rowlabel">' + label + '</span>';
      TRACE.forEach(function (tk) { if (tk.k === TILE_K) out += '<span></span>'; out += '<span class="lab-kc ' + cls + dim(tk.k) + '"' + (cls === 'lab-p' ? ' data-lab-p="' + tk.k + '"' : '') + '>' + cell(tk) + '</span>'; });
      return out;
    }
    table += row('k', 'lab-khead', function (tk) { return tk.k; }) +
      row('A[3,k]', 'lab-a', function (tk) { return tk.a; }) +
      row('B[k,7]', 'lab-b', function (tk) { return tk.b; }) +
      row(t(L('乘积', 'product')), 'lab-p', function () { return '·'; });
    table += '<span class="lab-rowlabel">' + t(L('在哪', 'Where')) + '</span>';
    if (step < 2) table += '<span class="lab-at lab-at-all" data-lab-round="all">' + t(L('16 个数都还在 HBM', 'All 16 numbers are still in HBM')) + '</span>';
    else [0, 1].forEach(function (n) {
      if (n) table += '<span></span>';
      table += '<span class="lab-at' + (active === n ? ' lab-active' : active >= 0 ? ' lab-dim' : '') + '" data-lab-round="' + n + '">' + t(status[n]) + '</span>';
    });
    html += '<div class="lab-ktable" role="img" aria-label="' + t(L('C[3,7] 用到的 8 对数、它们的乘积和现在在哪', 'The eight pairs C[3,7] uses, their products, and where they are now')) + '">' + table + '</div>';
    if (step >= 5) html += '<div class="lab-acc"><span>' + t(L('累加器', 'Accumulator')) + '</span><strong data-lab-acc role="status" aria-label="' + t(L('累加器当前的值', 'Current accumulator value')) + '">' + acc.value + '</strong><span data-lab-expression></span>' + (done ? '<span>' + t(L('写回 HBM 里的 C[3,7]', 'written to C[3,7] in HBM')) + '</span>' : '') + '</div>';
    else if (step === 1) html += '<p class="lab-note">' + t(L('每一列上下两个数相乘，比如 k = 0 是 2 × 1 = 2。8 个乘积加起来就是 C[3,7]。', 'Multiply the two numbers in each column: for k = 0 that is 2 × 1 = 2. The eight products add up to C[3,7].')) + '</p>';
    return '<div class="lab-fig">' + html + '</div>';
  }
  function expression(step, count) {
    var from = step === 6 ? TILE_K : 0, terms = TRACE.slice(from, count).map(function (tk) { return tk.product; });
    if (step >= 7) return '= 19 + 18';
    if (step === 6) return '= 19' + terms.map(function (p) { return ' + ' + p; }).join('');
    return terms.length ? '= ' + terms.join(' + ') : '';
  }

  function log(journey, step, model) {
    return '<ol class="lab-log">' + logRows(journey, step, model).map(function (row) {
      return '<li' + (row.now ? ' class="lab-now" aria-current="step"' : '') + '><span class="lab-n">' + row.n + '</span><span>' + t(row.k) + ' <b>' + t(row.v) + '</b></span></li>';
    }).join('') + '</ol>';
  }

  // Address translation: the address, its six fields, and the record of the lookup.
  function pagetable(step, model) {
    var names = ['PD4', 'PD3', 'PD2', 'PD1', 'PD0', tr(L('页内偏移', 'offset'))], weights = [1.1, 1.4, 1.4, 1.4, 1.4, 2.6];
    var values = [PAGE.fields.pd4, PAGE.fields.pd3, PAGE.fields.pd2, PAGE.fields.pd1, PAGE.fields.pd0, '0x' + PAGE.fields.offset.toString(16)];
    var on = PAGE_BITS[step] || [];
    var strip = '<div class="lab-bits" style="grid-template-columns:' + weights.map(function (w) { return 'minmax(0,' + w + 'fr)'; }).join(' ') + '" role="img" aria-label="' + t(L('虚拟地址 ' + PAGE.va + ' 切成的六段', 'The six fields of virtual address ' + PAGE.va)) + '">' + GPU_FIELDS.map(function (f, i) {
      var width = f.hi - f.lo + 1;
      return '<div class="lab-bit' + (on.indexOf(i) >= 0 ? ' lab-on' : '') + '" data-field="' + f.id + '"><span>' + esc(names[i]) + '</span><b>' + values[i] + '</b><span>' + t(L(width + ' 位', width + (width === 1 ? ' bit' : ' bits'))) + '</span></div>';
    }).join('') + '</div>';
    return '<div class="lab-fig"><div class="lab-va"><span>' + t(L('A[3,0] 的虚拟地址', 'Virtual address of A[3,0]')) + '</span><code>' + PAGE.va + '</code></div>' + strip +
      (step === 0 ? '<p class="lab-note">' + t(L('57 位地址切成 6 段。前 5 段各是一层页目录（PD）里的下标，最后 21 位是 2 MiB 页里的偏移。', 'The 57-bit address is cut into six fields. Each of the first five is an index into one level of page directory (PD); the last 21 bits are the offset inside a 2 MiB page.')) + '</p>' : '') +
      log('pagetable', step, model) + '</div>';
  }

  // Pixel: the 8 × 8 target with the triangle, the three vertices, and the record.
  function pixel(step, model) {
    var size = 16, pad = 12, P = PIXEL, hexes = ['#e06c6c', '#6cbc7c', '#7b92d4'], names = [L('红', 'red'), L('绿', 'green'), L('蓝', 'blue')];
    function sx(v) { return pad + v * size; }
    var filled = step >= 6, rgb = 'rgb(' + P.rgb.join(',') + ')', inner = '';
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) inner += '<rect x="' + (sx(c) + 1) + '" y="' + (sx(r) + 1) + '" width="' + (size - 2) + '" height="' + (size - 2) + '" rx="2" fill="rgba(237,237,237,.07)"/>';
    var pts = P.vertices.map(function (v) { return sx(v[0]) + ',' + sx(v[1]); }).join(' ');
    if (step >= 2) inner += '<polygon points="' + pts + '" fill="' + (step >= 3 ? 'rgba(237,237,237,.1)' : 'none') + '" stroke="rgba(237,237,237,.55)" stroke-width="1.2" stroke-linejoin="round"/>';
    if (filled) inner += '<rect x="' + (sx(P.target[0]) + 1) + '" y="' + (sx(P.target[1]) + 1) + '" width="' + (size - 2) + '" height="' + (size - 2) + '" rx="2" fill="' + rgb + '"/>';
    if (step >= 3 && step <= 5) P.vertices.forEach(function (v) { inner += '<line x1="' + sx(v[0]) + '" y1="' + sx(v[1]) + '" x2="' + sx(P.center[0]) + '" y2="' + sx(P.center[1]) + '" stroke="rgba(237,237,237,.4)" stroke-width="1" stroke-dasharray="3 3"/>'; });
    inner += '<rect x="' + sx(P.target[0]) + '" y="' + sx(P.target[1]) + '" width="' + size + '" height="' + size + '" rx="3" fill="none" stroke="#94b9ff" stroke-width="1.5"/>';
    if (step >= 2) P.vertices.forEach(function (v, i) {
      var x = sx(v[0]), y = sx(v[1]), lx = [x + 9, x - 4, x + 4][i], ly = [y + 4, y + 16, y + 16][i];
      inner += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + hexes[i] + '" stroke="#19191b" stroke-width="1"/><text x="' + lx + '" y="' + ly + '">v' + '₀₁₂'[i] + '</text>';
    });
    var svg = '<svg class="lab-svg" viewBox="0 0 152 152" role="img" aria-label="' + t(L('8 × 8 的画面，三角形和像素 (3, 4)', 'The 8 × 8 target with the triangle and pixel (3, 4)')) + '">' + inner + '</svg>';
    var key = '';
    if (step >= 1) P.vertices.forEach(function (v, i) {
      key += '<div><i style="background:' + hexes[i] + '"></i><span>v' + '₀₁₂'[i] + ' ' + t(names[i]) + '</span>' + (step >= 3 ? '<b>' + t(L('权重 ', 'weight ')) + P.weights[i] + '</b>' : '') + '</div>';
    });
    key += '<div class="lab-result"><i style="background:' + (step >= 4 ? rgb : 'transparent') + '"></i><span>' + t(L('像素 (3, 4)', 'Pixel (3, 4)')) + '</span><b>' + (step >= 6 ? '(' + P.rgb.join(', ') + ')' : step >= 4 ? '(' + P.color.join(', ') + ')' : '?') + '</b></div>';
    var note = model === 'a100' ? '<p class="lab-note">' + t(L('NVIDIA 没有说明 A100 的图形能力，这里按 H100 来讲。', 'NVIDIA doesn’t describe A100’s graphics capability, so this follows H100.')) + '</p>' : '';
    return '<div class="lab-fig"><div class="lab-px">' + svg + '<div class="lab-key">' + key + '</div></div>' + note + log('pixel', step, model) + '</div>';
  }

  // Stacking: one cross-section of the package, with this step's parts picked out.
  var STACK_ON = [['dram', 'base', 'die'], ['dram', 'base'], ['tsv'], ['base', 'link'], ['interposer', 'link'], ['ubump', 'interposer', 'c4', 'substrate', 'balls', 'pcb'], ['cold', 'heat'], ['die', 'dram']];
  var STACK_LABELS = [
    ['cold', L('冷板（模型里没画）', 'Cold plate (not drawn)'), 12], ['dram', L('DRAM 叠层（画了 8 层）', 'DRAM dies (8 shown)'), 40], ['tsv', L('TSV 硅通孔', 'TSVs'), 55],
    ['base', L('底部接口芯片', 'Base die'), 73], ['ubump', L('微凸点', 'Microbumps'), 80], ['interposer', L('硅中介层', 'Silicon interposer'), 90],
    ['c4', L('C4 凸点', 'C4 bumps'), 101], ['substrate', L('有机基板', 'Organic substrate'), 114], ['balls', L('焊球', 'Solder balls'), 129], ['pcb', L('PCB（SXM 模组）', 'PCB (SXM board)'), 142]
  ];
  function stacking(step, model) {
    var on = STACK_ON[step] || [], inner = '', i, x;
    function cls(base, id) { return base + (on.indexOf(id) >= 0 ? ' lab-on' : ''); }
    inner += '<rect class="' + cls('lab-cold', 'cold') + '" x="8" y="6" width="164" height="12" rx="2"/>';
    [[12, 60], [120, 168]].forEach(function (span) {
      for (i = 0; i < 8; i++) inner += '<rect class="' + cls('lab-part', 'dram') + '" x="' + span[0] + '" y="' + (28 + i * 5) + '" width="' + (span[1] - span[0]) + '" height="4" rx="1"/>';
      inner += '<rect class="' + cls('lab-part', 'base') + '" x="' + span[0] + '" y="69" width="' + (span[1] - span[0]) + '" height="8" rx="1"/>';
      [14, 24, 34].forEach(function (dx) { inner += '<line class="' + cls('lab-tsv', 'tsv') + '" x1="' + (span[0] + dx) + '" x2="' + (span[0] + dx) + '" y1="28" y2="69"/>'; });
    });
    inner += '<rect class="' + cls('lab-part', 'die') + '" x="68" y="28" width="44" height="49" rx="2"/><text x="90" y="56" text-anchor="middle"' + (on.indexOf('die') >= 0 ? ' class="lab-on"' : '') + '>GPU</text>';
    for (x = 15; x <= 166; x += 6) inner += '<circle class="' + cls('lab-ball', 'ubump') + '" cx="' + x + '" cy="80.5" r="1.5"/>';
    inner += '<rect class="' + cls('lab-part', 'interposer') + '" x="6" y="84" width="168" height="12" rx="2"/>';
    for (x = 14; x <= 168; x += 11) inner += '<circle class="' + cls('lab-ball', 'c4') + '" cx="' + x + '" cy="101" r="2.5"/>';
    inner += '<rect class="' + cls('lab-part', 'substrate') + '" x="2" y="106" width="176" height="16" rx="2"/>';
    for (x = 12; x <= 170; x += 17.5) inner += '<circle class="' + cls('lab-ball', 'balls') + '" cx="' + x + '" cy="128.5" r="4"/>';
    inner += '<rect class="' + cls('lab-part', 'pcb') + '" x="0" y="135" width="180" height="14" rx="2"/>';
    if (on.indexOf('link') >= 0) inner += '<path class="lab-link" d="M36 77V90H90V77"/><path class="lab-link" d="M144 77V90H90"/>';
    if (on.indexOf('heat') >= 0) [36, 90, 144].forEach(function (hx) { inner += '<path class="lab-heatline" d="M' + hx + ' 27V20"/><path class="lab-heathead" d="M' + (hx - 4) + ' 21L' + hx + ' 14L' + (hx + 4) + ' 21Z"/>'; });
    STACK_LABELS.forEach(function (label, n) {
      var y = 14 + n * 15, lit = on.indexOf(label[0]) >= 0, tx = { cold: 172, dram: 168, tsv: 154, base: 168, ubump: 168, interposer: 174, c4: 170, substrate: 178, balls: 172, pcb: 180 }[label[0]];
      inner += '<path class="lab-lead" d="M' + tx + ' ' + label[2] + 'L190 ' + (y - 4) + '"/><text x="194" y="' + y + '"' + (lit ? ' class="lab-on"' : '') + '>' + t(label[1]) + '</text>';
    });
    var svg = '<svg class="lab-svg" viewBox="0 0 326 156" role="img" aria-label="' + t(L('封装的剖面：从冷板到电路板', 'Cross-section of the package, cold plate down to the board')) + '">' + inner + '</svg>';
    return '<div class="lab-fig">' + svg + (step === 0 ? '<p class="lab-note">' + t(L('剖面示意，没有按比例画。亮起来的是这一步讲的部分。', 'A cross-section sketch, not to scale. The lit parts are the ones this step is about.')) + '</p>' : '') + log('stacking', step, model) + '</div>';
  }

  var FIGURES = { gemm: gemm, pagetable: pagetable, pixel: pixel, stacking: stacking };
  // The figure for one step as an HTML string. Pure, so Node tests can read it.
  function markup(journey, step, model, language) {
    var draw = FIGURES[journey] || gemm;
    var i = Math.max(0, Math.min(7, Math.floor(Number(step) || 0)));
    var previous = forced; forced = language || null;
    try { return draw(i, model || 'h100'); } finally { forced = previous; }
  }

  var caches = typeof WeakMap === 'function' ? new WeakMap() : null;
  function setProgress(container, progress) {
    if (!container || !caches) return;
    var cache = caches.get(container); if (!cache) return;
    var p = clamp(progress);
    cache.root.dataset.progress = p.toFixed(3);
    if (cache.journey !== 'gemm' || cache.step < 5) return;
    var acc = accumulation(cache.step, p);
    if (acc.count === cache.accCount) return;
    cache.accCount = acc.count;
    if (cache.acc) cache.acc.textContent = String(acc.value);
    if (cache.expression) cache.expression.textContent = expression(cache.step, acc.count);
    cache.products.forEach(function (node) {
      var k = Number(node.dataset.labP), done = k < acc.count;
      node.textContent = done ? TRACE[k].product : '·';
      node.classList.toggle('lab-done', done);
      node.classList.toggle('lab-next', !done && k === acc.count && (cache.step === 5 || cache.step === 6));
    });
  }
  function render(container, state, step, progress) {
    if (!container || !container.ownerDocument) return;
    installStyle(container.ownerDocument);
    var journey = FIGURES[state.journey] ? state.journey : 'gemm';
    var i = Math.max(0, Math.min(7, Math.floor(state.stepIndex || 0)));
    var key = journey + ':' + i + ':' + (state.model || 'h100') + ':' + lang();
    var cache = caches && caches.get(container);
    if (!cache || cache.key !== key) {
      container.innerHTML = '<div class="lab-root" data-journey="' + esc(journey) + '" data-step="' + i + '" data-lang="' + lang() + '">' + markup(journey, i, state.model) + '</div>';
      cache = { key: key, root: container.firstElementChild, journey: journey, step: i, accCount: -1,
        products: Array.from(container.querySelectorAll('[data-lab-p]')), acc: container.querySelector('[data-lab-acc]'), expression: container.querySelector('[data-lab-expression]') };
      if (caches) caches.set(container, cache);
    }
    setProgress(container, progress === undefined ? 0 : progress);
  }
  return { render: render, setProgress: setProgress, markup: markup, logRows: logRows, roundStatus: roundStatus, activeRound: activeRound, LOGS: LOGS, STYLE: STYLE,
    GEMM: { A: A, B: B, C: C, row: ROW, col: COL, k: K, tileK: TILE_K, trace: TRACE, tileSums: [19, 18], result: C[ROW][COL] },
    multiply: multiply, dotTrace: dotTrace, accumulation: accumulation,
    gpuAddressFields: gpuAddressFields, physicalAddress: physicalAddress, PAGE: PAGE, PAGE_BITS: PAGE_BITS,
    PIXEL: PIXEL, barycentricColor: barycentricColor, barycentricWeights: barycentricWeights,
    perLineRate: perLineRate, PRODUCT: PRODUCT, STACK_ON: STACK_ON };
});
