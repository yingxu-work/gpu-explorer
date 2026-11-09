/* Worked examples shown beside the 3D model. The scalar arithmetic is kept
 * separate from the hardware geometry and from Tensor Core fragment maps. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GpuExplorerLab = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';
  var I18N = (root && root.GpuExplorerI18n) || (typeof require === 'function' ? require('./i18n.js') : null);
  function L(zh, en) { return { zh: zh, en: en }; }
  function lang() { return (I18N && I18N.lang) || 'zh'; }
  function tr(v) { return v && typeof v === 'object' && 'zh' in v ? v[lang()] : v; }

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
  function accumulation(step, progress) {
    var p = clamp(progress), count;
    if (step < 5) return { count: 0, value: 0, currentK: null, complete: false };
    if (step === 5) count = Math.min(4, Math.floor(p * 4.999));
    else if (step === 6) count = Math.min(8, 4 + Math.floor(p * 4.999));
    else count = K;
    return { count: count, value: count ? TRACE[count - 1].acc : 0, currentK: count < K ? count : K - 1, complete: count === K };
  }

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
  function barycentricColor(weights, colors) {
    if (weights.length !== colors.length) throw new Error('One weight per vertex is required');
    return colors[0].map(function (_, channel) {
      return weights.reduce(function (sum, weight, i) { return sum + weight * colors[i][channel]; }, 0);
    });
  }
  // HBM bandwidth per data line, from the published product bandwidth.
  function perLineRate(bytesPerSecond, stacks, bitsPerStack) { return bytesPerSecond * 8 / (stacks * bitsPerStack); }

  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  var MONO = 'ui-monospace,SFMono-Regular,"JetBrains Mono",Consolas,monospace';
  var STYLE = [
    '.lab-root{--lab-a:#6fd3bf;--lab-b:#e7b67a;--lab-c:#94b6ee;--lab-addr:#c9a7f2;--lab-heat:#f08a5d;--lab-line:rgba(237,237,237,.09);--lab-dim:#8b8f93;color:#e6e7e4;font-size:13px;line-height:1.5;min-width:0}',
    '.lab-root *{box-sizing:border-box}.lab-root button{font:inherit}',
    '.lab-caption{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0 0 8px;color:var(--lab-dim);font-size:12px}',
    '.lab-caption strong{font:500 12px ' + MONO + ';color:#e6e7e4;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.lab-kicker{font-size:12px;color:var(--lab-dim);margin-bottom:6px}',
    '.lab-matrices{display:grid;grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr) 12px minmax(0,1fr);gap:4px;align-items:center;padding:4px 0 12px}',
    '.lab-matrix{min-width:0}.lab-matrix-title{display:flex;align-items:baseline;gap:6px;margin-bottom:6px;font:500 12px ' + MONO + ';color:var(--lab-a)}.lab-matrix-title small{font-size:11px;color:var(--lab-dim);font-weight:400}',
    '.lab-matrix-b .lab-matrix-title{color:var(--lab-b)}.lab-matrix-c .lab-matrix-title{color:var(--lab-c)}',
    '.lab-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:2px}',
    '.lab-cell{display:flex;align-items:center;justify-content:center;min-width:0;height:14px;border-radius:2px;background:rgba(237,237,237,.04);color:#5d6266;font:10px/1 ' + MONO + ';transition:background-color .15s,color .15s}',
    '.lab-cell.lab-a{background:rgba(111,211,191,.16);color:var(--lab-a)}.lab-cell.lab-b{background:rgba(231,182,122,.16);color:var(--lab-b)}.lab-cell.lab-c{background:rgba(148,182,238,.14);color:var(--lab-c)}',
    '.lab-cell.lab-output{box-shadow:0 0 0 1px var(--lab-c);color:var(--lab-c);background:rgba(148,182,238,.22)}.lab-cell.lab-k-focus{box-shadow:0 0 0 1px currentColor}',
    '.lab-operator{text-align:center;color:var(--lab-dim)}',
    '.lab-vectors{display:grid;gap:4px;padding:2px 0 12px}.lab-vector-row{display:grid;grid-template-columns:56px repeat(8,minmax(0,1fr));align-items:center;gap:3px}',
    '.lab-vector-label{font:11px ' + MONO + ';color:var(--lab-a)}.lab-vector-row:last-child .lab-vector-label{color:var(--lab-b)}.lab-vector-row .lab-cell{height:22px;font-size:12px}',
    '.lab-final-result{display:flex;align-items:baseline;justify-content:space-between;padding:0 0 12px;color:var(--lab-c);font:13px ' + MONO + '}.lab-final-result strong{font-size:32px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums}',
    '.lab-stage{position:relative;padding:12px;border:1px solid var(--lab-line);border-radius:10px;background:#18191b;min-height:96px}',
    '.lab-formula{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;font:20px/1.5 ' + MONO + ';min-height:40px}',
    '.lab-acolor{color:var(--lab-a)}.lab-bcolor{color:var(--lab-b)}.lab-ccolor{color:var(--lab-c)}.lab-formula sub{font-size:.6em}',
    '.lab-note{font-size:12px;color:var(--lab-dim);margin:8px 0 0;line-height:1.55}',
    '.lab-products{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;margin-top:10px}',
    '.lab-product{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0;border:1px solid transparent;border-radius:6px;background:rgba(237,237,237,.04);color:#9a9ea1;font:11px ' + MONO + ';cursor:pointer;transition:background-color .15s,border-color .15s}',
    '.lab-product .lab-product-k{font-size:10px;color:#6c7174}.lab-product .lab-product-number{font-size:14px;color:#c9cdd0}',
    '.lab-product:hover,.lab-product:focus-visible,.lab-product.lab-product-on{background:rgba(148,182,238,.1);border-color:rgba(148,182,238,.5);outline:none}',
    '.lab-av{color:var(--lab-a)}.lab-bv{color:var(--lab-b)}.lab-cv{color:var(--lab-c)}.lab-product.lab-product-done .lab-product-number{color:var(--lab-a)}',
    '.lab-equation-status{display:flex;justify-content:space-between;align-items:center;gap:6px;color:var(--lab-dim);font:12px ' + MONO + '}.lab-equation-status strong{color:var(--lab-c);font-size:28px;font-weight:500;font-variant-numeric:tabular-nums}',
    '.lab-expression{font:13px/1.6 ' + MONO + ';color:#b9bdc0;margin-top:4px;min-height:22px}',
    '.lab-transfer{display:grid;grid-template-columns:1fr 24px 1fr;gap:6px;align-items:center}.lab-transfer-box{padding:8px;border:1px solid var(--lab-line);border-radius:6px;min-width:0}',
    '.lab-pair-row{display:flex;gap:3px;margin-top:6px}.lab-pair{flex:1;text-align:center;font:12px ' + MONO + ';color:var(--lab-a);border-radius:4px;background:rgba(111,211,191,.1);padding:3px 0}.lab-pair.lab-b{color:var(--lab-b);background:rgba(231,182,122,.1)}',
    '.lab-transfer-arrow{text-align:center;color:var(--lab-a)}.lab-packet{opacity:var(--packet-alpha,0)}',
    '.lab-copy-progress{height:2px;background:rgba(111,211,191,.12);margin-top:10px;overflow:hidden}.lab-copy-progress i{display:block;background:var(--lab-a);height:100%;width:var(--lab-progress,0%)}',
    '.lab-lanes{display:grid;grid-template-columns:repeat(16,minmax(0,1fr));gap:3px;margin-top:8px}.lab-lane{height:18px;display:flex;align-items:center;justify-content:center;border-radius:3px;background:rgba(111,211,191,.1);color:var(--lab-a);font:10px ' + MONO + ';opacity:.45}.lab-lane.lab-lane-on{opacity:1;background:rgba(111,211,191,.26)}',
    '.lab-blocks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.lab-block{padding:8px;border:1px solid var(--lab-line);text-align:center;font:11px ' + MONO + ';color:var(--lab-dim);border-radius:6px}.lab-block.lab-target{border-color:var(--lab-c);background:rgba(148,182,238,.1);color:var(--lab-c)}',
    '.lab-output-path{display:flex;align-items:center;justify-content:space-between;font:12px ' + MONO + ';gap:6px;margin:4px 0}.lab-output-path span{padding:6px 8px;border:1px solid var(--lab-line);border-radius:6px;color:var(--lab-c)}',
    '.lab-bits{display:grid;gap:3px;margin-bottom:10px}.lab-bit{min-width:0;padding:6px 2px;text-align:center;border-top:2px solid rgba(201,167,242,.2);background:rgba(201,167,242,.05);border-radius:0 0 4px 4px;font:12px ' + MONO + ';color:#8e9195;font-variant-numeric:tabular-nums}',
    '.lab-bit small{display:block;font-size:10px;color:#6f7377;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lab-bit.lab-active{border-color:var(--lab-addr);color:var(--lab-addr);background:rgba(201,167,242,.13)}.lab-bit.lab-offset.lab-active{border-color:var(--lab-b);color:var(--lab-b);background:rgba(231,182,122,.12)}',
    '.lab-svg{display:block;width:100%;overflow:visible;margin:0 0 8px}',
    '.lab-svg text{font:10px ' + MONO + ';text-anchor:middle;fill:#9a9ea1}.lab-svg .lab-svg-strong{fill:#e6e7e4;font-size:11px}.lab-svg .lab-svg-result{fill:var(--lab-a);font-size:12px}.lab-svg .lab-svg-dim{fill:#6f7377}',
    '.lab-box{fill:#1d1f21;stroke:rgba(237,237,237,.14);stroke-width:1}.lab-box.lab-active{fill:#1c2e2b;stroke:var(--lab-a)}.lab-box.lab-addr{fill:#272231;stroke:var(--lab-addr)}.lab-box.lab-warn{fill:#2c2519;stroke:var(--lab-b)}.lab-box.lab-off{fill:#121314;stroke:rgba(237,237,237,.06)}',
    '.lab-path{fill:none;stroke:rgba(237,237,237,.16);stroke-width:1.4}.lab-path.lab-live{stroke:var(--lab-a);stroke-width:1.6}.lab-path.lab-addr{stroke:var(--lab-addr)}.lab-path.lab-heat{stroke:var(--lab-heat)}',
    '.lab-dot{fill:#f2f2ee}.lab-dot.lab-dot-addr{fill:var(--lab-addr)}.lab-dot.lab-dot-heat{fill:var(--lab-heat)}',
    '.lab-pixel{fill:rgba(237,237,237,.06)}.lab-pixel.lab-target{fill:none;stroke:var(--lab-c);stroke-width:1.5}.lab-pixel.lab-filled{fill:#33804d}',
    '.lab-tri{fill:url(#lab-tri-grad);opacity:.55;stroke:rgba(148,182,238,.5)}.lab-weight{stroke:rgba(237,237,237,.25);stroke-dasharray:3 3;fill:none}',
    '.lab-bar-r{fill:#d47b7b}.lab-bar-g{fill:#6cbc7c}.lab-bar-b{fill:#7b92d4}',
    '.lab-scan{fill:rgba(148,182,238,.5)}',
    '.lab-status{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:12px;color:var(--lab-dim);margin:0 0 6px}.lab-status span:last-child{font:12px ' + MONO + ';color:var(--lab-a);white-space:nowrap}',
    '.lab-result{font:13px ' + MONO + ';color:#e6e7e4;padding:10px 12px;border:1px solid var(--lab-line);border-radius:8px;background:#18191b;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}',
    '@media(prefers-reduced-motion:reduce){.lab-root *{transition:none!important}}'
  ].join('\n');
  function installStyle(doc) {
    if (doc.getElementById('gpu-explorer-lab-style')) return;
    var style = doc.createElement('style'); style.id = 'gpu-explorer-lab-style'; style.textContent = STYLE;
    doc.head.appendChild(style);
  }

  // ---------- GEMM ----------
  function matrix(data, name, which, step) {
    var cols = data[0].length;
    var out = '<div class="lab-matrix lab-matrix-' + which + '"><div class="lab-matrix-title">' + name + '<small>' + data.length + ' × ' + cols + '</small></div><div class="lab-grid" role="img" aria-label="' + escapeHTML(tr(L('矩阵 ' + name + '，' + data.length + ' 行 ' + cols + ' 列', 'Matrix ' + name + ', ' + data.length + ' rows by ' + cols + ' columns'))) + '">';
    data.forEach(function (row, i) { row.forEach(function (value, j) {
      var cls = 'lab-cell', content = value, k = -1;
      if (which === 'a' && i === ROW && step >= 1) { cls += ' lab-a'; k = j; }
      if (which === 'b' && j === COL && step >= 1) { cls += ' lab-b'; k = i; }
      if (which === 'c') {
        content = '·';
        if (step === 2 && i >= 2 && j >= 4) cls += ' lab-c';
        if (i === ROW && j === COL) { cls += ' lab-output'; content = step === 7 ? C[ROW][COL] : '?'; }
      }
      out += '<span class="' + cls + '"' + (k >= 0 ? ' data-matrix-k="' + k + '"' : '') + ' title="' + name + '[' + i + ',' + j + ']' + (which !== 'c' ? ' = ' + value : '') + '">' + content + '</span>';
    }); });
    return out + '</div></div>';
  }
  function matrices(step) {
    return '<div class="lab-matrices">' + matrix(A, 'A', 'a', step) + '<div class="lab-operator">×</div>' + matrix(B, 'B', 'b', step) + '<div class="lab-operator">=</div>' + matrix(C, 'C', 'c', step) + '</div>';
  }
  function vectors() {
    return '<div class="lab-vectors" aria-label="' + escapeHTML(tr(L('C[3,7] 用到的 A 行和 B 列', 'The row of A and column of B used by C[3,7]'))) + '">' + ['a', 'b'].map(function (which) {
      return '<div class="lab-vector-row"><span class="lab-vector-label">' + (which === 'a' ? 'A[3,:]' : 'B[:,7]') + '</span>' + TRACE.map(function (t) {
        return '<span class="lab-cell lab-' + which + '" data-matrix-k="' + t.k + '" title="' + (which === 'a' ? 'A[3,' + t.k + ']' : 'B[' + t.k + ',7]') + ' = ' + t[which] + '">' + t[which] + '</span>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }
  function products() {
    return '<div class="lab-products">' + TRACE.map(function (t) {
      return '<button type="button" class="lab-product" data-lab-k="' + t.k + '" aria-label="' + escapeHTML(tr(L('k=' + t.k + '：' + t.a + ' 乘 ' + t.b + ' 等于 ' + t.product, 'k=' + t.k + ': ' + t.a + ' times ' + t.b + ' is ' + t.product))) + '" title="A[3,' + t.k + '] × B[' + t.k + ',7] = ' + t.product + '"><span class="lab-product-k">k' + t.k + '</span><span><span class="lab-av">' + t.a + '</span>·<span class="lab-bv">' + t.b + '</span></span><span class="lab-product-number">' + t.product + '</span></button>';
    }).join('') + '</div>';
  }
  function transfer(start, end) {
    function bank(isDestination) {
      return '<div class="lab-transfer-box"><div class="lab-kicker">' + escapeHTML(tr(isDestination ? L('共享内存 · 片上', 'Shared memory · on chip') : L('HBM · 片外', 'HBM · off chip'))) + '</div>' + ['a', 'b'].map(function (which) {
        return '<div class="lab-pair-row">' + TRACE.slice(start, end).map(function (t, i) {
          return '<span class="lab-pair' + (which === 'b' ? ' lab-b' : '') + (isDestination ? ' lab-packet' : '') + '"' + (isDestination ? ' data-packet="' + i + '"' : '') + '>' + t[which] + '</span>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="lab-transfer">' + bank(false) + '<span class="lab-transfer-arrow">→</span>' + bank(true) + '</div><div class="lab-copy-progress"><i></i></div>';
  }
  var GEMM_CAPTIONS = [L('只看一个输出', 'One output'), L('它依赖的输入', 'Its inputs'), L('一个 CTA 负责一块输出', 'One CTA per output tile'), L('载入第 1 个 K 块', 'Load K tile 1'), L('32 个 lane 一起工作', '32 lanes together'), L('累加第 1 个 K 块', 'Accumulate K tile 1'), L('同步，换下一块', 'Sync, then the next tile'), L('写回显存', 'Write back')];
  var GEMM_LOCATIONS = ['C[3,7]', 'A[3,:] · B[:,7]', 'tile → CTA → SM', 'k = 0…3', 'warp = 32 threads', 'acc = 0 → 19', 'acc = 19 → 37', 'C[3,7] = 37'];
  function gemm(step) {
    var html = step >= 3 && step <= 6 ? vectors() : (step === 7 ? '<div class="lab-final-result" role="status" aria-label="' + escapeHTML(tr(L('C[3,7] 等于 37', 'C[3,7] equals 37'))) + '"><span>C[3,7] = 19 + 18</span><strong>37</strong></div>' : '') + matrices(step), body;
    html += '<div class="lab-caption"><span>' + escapeHTML(tr(GEMM_CAPTIONS[step])) + '</span><strong>' + GEMM_LOCATIONS[step] + '</strong></div>';
    if (step === 0) {
      body = '<div class="lab-formula"><span class="lab-ccolor">C<sub>3,7</sub></span><span>=</span><span>Σ<sub>k=0..7</sub></span><span class="lab-acolor">A<sub>3,k</sub></span><span>·</span><span class="lab-bcolor">B<sub>k,7</sub></span></div><p class="lab-note">' + escapeHTML(tr(L('跟着这一个数，看它经过显存、共享内存、计算，再写回。', 'Follow this one number from memory to shared memory, through compute and back.'))) + '</p>';
    } else if (step === 1) {
      body = '<div class="lab-kicker">' + escapeHTML(tr(L('点任意一项，看它来自哪两个数', 'Click a term to trace its two inputs'))) + '</div>' + products() + '<p class="lab-note">' + escapeHTML(tr(L('每对数相乘，8 项加起来就是 C[3,7]。', 'Multiply each pair; the eight products add up to C[3,7].'))) + '</p>';
    } else if (step === 2) {
      body = '<div class="lab-blocks"><div class="lab-block">CTA 0 · C[0:2, 0:4]</div><div class="lab-block">CTA 1 · C[0:2, 4:8]</div><div class="lab-block">CTA 2 · C[2:4, 0:4]</div><div class="lab-block lab-target">CTA 3 · C[2:4, 4:8]</div></div><p class="lab-note">' + escapeHTML(tr(L('C[3,7] 在 CTA 3 里，每个 CTA 算自己那一块。', 'C[3,7] is in CTA 3. Each CTA computes its own tile.'))) + '</p>';
    } else if (step === 3) {
      body = '<div class="lab-kicker">' + escapeHTML(tr(L('第 1 / 2 个 K 块 · k = 0…3', 'K tile 1 of 2 · k = 0…3'))) + '</div>' + transfer(0, 4) + '<p class="lab-note">' + escapeHTML(tr(L('搬进共享内存后，同一块 A、B 会被多个输出反复读取。', 'Once in shared memory, the same tiles are read by many outputs.'))) + '</p>';
    } else if (step === 4) {
      body = '<div class="lab-kicker">' + escapeHTML(tr(L('一条指令，32 个 lane', 'One instruction, 32 lanes'))) + '</div><div class="lab-lanes">' + Array.from({ length: 32 }, function (_, i) { return '<span class="lab-lane">' + i + '</span>'; }).join('') + '</div><p class="lab-note">' + escapeHTML(tr(L('线程一起给 Tensor Core 提供矩阵片段。下一步把目标输出的内积展开来算。', 'The threads feed matrix fragments to the Tensor Core together. The next step unrolls the dot product for our output.'))) + '</p>';
    } else if (step === 5 || step === 6) {
      body = '<div class="lab-equation-status"><span>' + escapeHTML(tr(step === 5 ? L('第 1 / 2 个 K 块', 'K tile 1 of 2') : L('第 2 / 2 个 K 块', 'K tile 2 of 2'))) + '</span><span>acc <strong data-lab-acc role="status" aria-label="' + escapeHTML(tr(L('当前累加值', 'Current accumulator'))) + '">' + (step === 5 ? '0' : '19') + '</strong></span></div><div class="lab-expression" data-lab-expression></div>' + products();
    } else {
      body = '<div class="lab-output-path"><span>acc = 37</span>→<span>Store</span>→<span>C[3,7]</span></div><p class="lab-note">' + escapeHTML(tr(L('19 + 18 = 37。两个 K 块都加完才写回。', '19 + 18 = 37. It is only written once both K tiles are added.'))) + '</p>';
    }
    return html + '<div class="lab-stage">' + body + '</div>';
  }

  // ---------- Other walkthroughs: small diagrams driven by the visual clock ----------
  function svgText(x, y, text, klass) { return '<text x="' + x + '" y="' + y + '" class="' + (klass || '') + '">' + escapeHTML(tr(text)) + '</text>'; }
  function box(x, y, w, h, label, state) { return '<rect class="lab-box' + (state ? ' lab-' + state : '') + '" x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="5"/>' + svgText(x, y + 4, label, state ? 'lab-svg-strong' : ''); }
  function poly(points, klass) { return '<polyline class="lab-path ' + (klass || '') + '" points="' + points.map(function (p) { return p.join(','); }).join(' ') + '"/>'; }
  function dots(count, klass) { var out = ''; for (var i = 0; i < count; i++) out += '<circle data-phase-marker="' + i + '" class="lab-dot ' + (klass || '') + '" cx="-20" cy="-20" r="3.5"/>'; return out; }
  function svg(inner, label, height) { return '<svg class="lab-svg" viewBox="0 0 340 ' + (height || 150) + '" role="img" aria-label="' + escapeHTML(tr(label)) + '"><defs><linearGradient id="lab-tri-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d47b7b"/><stop offset=".5" stop-color="#6cbc7c"/><stop offset="1" stop-color="#7b92d4"/></linearGradient></defs>' + inner + '</svg>'; }

  var PAGE_NODES = { lsu: [34, 26], tlb1: [102, 26], tlb2: [170, 26], gmmu: [238, 26], hbm: [306, 26], pd4: [34, 104], pd3: [92, 104], pd2: [150, 104], pd1: [208, 104], pd0: [266, 104], page: [318, 104] };
  var PAGE_LABELS = { lsu: 'LD/ST', tlb1: 'L1 TLB', tlb2: 'L2 TLB', gmmu: 'GMMU', hbm: 'HBM', pd4: 'PD4[0]', pd3: 'PD3[0]', pd2: 'PD2[508]', pd1: 'PD1[470]', pd0: 'PD0[22]', page: '2 MiB' };
  function pageDiagram(spec) {
    var inner = poly([[34, 26], [306, 26]]) + poly([[238, 26], [238, 64], [34, 64], [34, 104]]) + poly([[34, 104], [318, 104]]);
    spec.paths.forEach(function (p) { inner += poly(p, 'lab-live lab-addr'); });
    Object.keys(PAGE_NODES).forEach(function (id) {
      var p = PAGE_NODES[id], w = id === 'page' ? 40 : id.indexOf('pd') === 0 ? 52 : 56;
      var state = spec.miss && spec.miss.indexOf(id) >= 0 ? 'warn' : spec.active.indexOf(id) >= 0 ? 'addr' : spec.done && spec.done.indexOf(id) >= 0 ? 'active' : null;
      inner += box(p[0], p[1], w, 26, PAGE_LABELS[id], state);
    });
    inner += svgText(170, 140, spec.note, 'lab-svg-dim') + dots(spec.paths.length, 'lab-dot-addr');
    return inner;
  }
  var PAGE_STEPS = [
    { active: ['lsu'], paths: [[[34, 52], [34, 26]]], bits: [0, 1, 2, 3, 4, 5], note: L('程序只看得到虚拟地址', 'Programs only see virtual addresses'), stages: [L('算地址', 'Compute address'), L('交给 LD/ST', 'Hand to LD/ST'), L('准备翻译', 'Translate')] },
    { active: ['tlb1'], miss: ['tlb1'], paths: [[[34, 26], [102, 26]]], bits: [0, 1, 2, 3, 4], note: L('虚拟页号 = 地址 >> 21', 'Virtual page = address >> 21'), stages: [L('查 L1 TLB', 'Check L1 TLB'), L('没有这一项', 'No entry'), L('未命中', 'Miss')] },
    { active: ['tlb2', 'gmmu'], miss: ['tlb1', 'tlb2'], paths: [[[102, 26], [170, 26], [238, 26]]], bits: [0, 1, 2, 3, 4], note: L('GMMU 开始查页表', 'The GMMU starts the walk'), stages: [L('查共享 TLB', 'Check shared TLB'), L('未命中', 'Miss'), L('GMMU 接手', 'GMMU takes over')] },
    { active: ['pd4', 'pd3', 'pd2', 'hbm'], miss: ['tlb1', 'tlb2'], paths: [[[238, 26], [306, 26]], [[34, 104], [92, 104], [150, 104]]], bits: [0, 1, 2], note: L('每一层都要读一次显存', 'Each level is one memory read'), stages: ['PD4[0]', 'PD3[0]', 'PD2[508]'] },
    { active: ['pd1', 'pd0', 'page'], done: ['pd4', 'pd3', 'pd2'], miss: ['tlb1', 'tlb2'], paths: [[[150, 104], [208, 104], [266, 104], [318, 104]]], bits: [3, 4], note: L('PD0 这一项就是 2 MiB 页的页表项', 'The PD0 entry is the 2 MiB page entry'), stages: ['PD1[470]', 'PD0[22]', L('页基址', 'Page base')] },
    { active: ['page', 'tlb1', 'tlb2'], done: ['pd4', 'pd3', 'pd2', 'pd1', 'pd0'], paths: [[[318, 104], [318, 64], [102, 64], [102, 26]]], bits: [5], pa: true, note: '0x24e000000 + 0x164a40', stages: [L('页基址', 'Page base'), L('+ 偏移', '+ offset'), L('填回 TLB', 'Fill TLBs')] },
    { active: ['hbm'], done: ['tlb1', 'tlb2', 'gmmu'], paths: [[[238, 26], [306, 26]]], bits: [], pa: true, note: L('物理地址 → 堆栈、通道、bank', 'PA → stack, channel, bank'), stages: [L('L2 未命中', 'L2 miss'), L('存储控制器', 'Memory controller'), L('读 DRAM', 'Read DRAM')] },
    { active: ['lsu'], done: ['tlb1', 'tlb2', 'hbm'], paths: [[[306, 26], [306, 64], [34, 64], [34, 26]]], bits: [], pa: true, note: L('同一页的下次访问：TLB 命中', 'Next access in this page: TLB hit'), stages: ['HBM', 'L2', L('寄存器', 'Register')] }
  ];
  function addressBits(spec) {
    var labels = ['PD4', 'PD3', 'PD2', 'PD1', 'PD0', 'offset'];
    var widths = [1, 9, 9, 9, 8, 21];
    var cols = widths.map(function (w) { return Math.max(w, 6) + 'fr'; }).join(' ');
    var values = [PAGE.fields.pd4, PAGE.fields.pd3, PAGE.fields.pd2, PAGE.fields.pd1, PAGE.fields.pd0, '0x' + PAGE.fields.offset.toString(16)];
    return '<div class="lab-bits" style="grid-template-columns:' + cols + '" aria-label="' + escapeHTML(tr(L('虚拟地址 0x7f3ac2d64a40 按页表层级拆开', 'Virtual address 0x7f3ac2d64a40 split by page-table level'))) + '">' + labels.map(function (name, i) {
      return '<div class="lab-bit' + (i === 5 ? ' lab-offset' : '') + (spec.bits.indexOf(i) >= 0 ? ' lab-active' : '') + '" title="' + widths[i] + ' bit"><small>' + escapeHTML(i === 5 ? tr(L('偏移', 'offset')) : name) + '</small>' + values[i] + '</div>';
    }).join('') + '</div>';
  }

  var PIXEL_STEPS = [
    { stages: [L('132 个 SM', '132 SMs'), L('2 个图形 TPC', '2 graphics TPCs'), L('像素 (3, 4)', 'Pixel (3, 4)')], paths: [[[90, 75], [150, 75]]], height: 150 },
    { stages: ['v₀', 'v₁', 'v₂'], paths: [[[30, 120], [68, 13]], [[30, 120], [10, 121]], [[30, 120], [136, 121]]], height: 150 },
    { stages: [L('读位置', 'Read position'), 'M · p', L('屏幕坐标', 'Screen position')], paths: [[[150, 70], [230, 70]]], height: 150 },
    { stages: [L('扫描', 'Scan'), L('判断在内部', 'Inside test'), L('生成片元', 'Emit fragment')], paths: [[[68, 13], [59.4, 99.4]], [[10, 121], [59.4, 99.4]], [[136, 121], [59.4, 99.4]]], scan: true, height: 150 },
    { stages: ['R 0.2', 'G 0.5', 'B 0.3'], paths: [[[40, 75], [150, 75]]], height: 150 },
    { stages: ['uv (0.25, 0.75)', L('白色纹素', 'White texel'), L('颜色不变', 'Color unchanged')], paths: [[[50, 106], [50, 80], [170, 80], [170, 46], [260, 46]]], height: 150 },
    { stages: [L('新 z = 0.4', 'New z = 0.4'), L('已有 z = 0.7', 'Stored z = 0.7'), L('通过，写入', 'Pass, write')], paths: [[[40, 42], [150, 42], [150, 72], [250, 72]]], height: 150 },
    { stages: [L('帧缓冲', 'Framebuffer'), L('PCIe / NVLink', 'PCIe / NVLink'), L('主机', 'Host')], paths: [[[100, 75], [240, 75]]], height: 150 }
  ];
  function pixelGrid(x, y, size, filled) {
    var out = '';
    for (var i = 0; i < 64; i++) {
      var col = i % 8, row = Math.floor(i / 8), target = col === 3 && row === 4;
      out += '<rect x="' + (x + col * size) + '" y="' + (y + row * size) + '" width="' + (size - 2) + '" height="' + (size - 2) + '" rx="1" class="lab-pixel' + (target ? ' lab-target' : '') + (target && filled ? ' lab-filled' : '') + '"/>';
    }
    return out;
  }
  function triangle() {
    return '<path class="lab-tri" d="M68 13 10 121 136 121Z"/><path class="lab-weight" d="M68 13 59.4 99.4 10 121M59.4 99.4 136 121"/>' + svgText(68, 9, 'v₀') + svgText(8, 136, 'v₁') + svgText(140, 136, 'v₂') + '<circle cx="59.4" cy="99.4" r="3.5" fill="#f2f2ee"/>';
  }
  function pixelDiagram(step, model) {
    var inner = '';
    if (step === 0) {
      for (var t = 0; t < 8; t++) for (var r2 = 0; r2 < 9; r2++) inner += '<rect x="' + (14 + t * 9) + '" y="' + (18 + r2 * 12) + '" width="7" height="10" rx="1" class="lab-box' + (t === 0 && r2 === 3 ? ' lab-active' : '') + '"/>';
      inner += svgText(50, 140, L('一个 GPC（9 个 TPC）', 'One GPC (9 TPCs)'), 'lab-svg-dim') + pixelGrid(170, 18, 13, false) + svgText(222, 140, L('目标像素 (3, 4)', 'Target pixel (3, 4)'), 'lab-svg-dim');
      if (model === 'a100') inner += svgText(170, 8, L('A100 的图形能力 NVIDIA 没有说明，按 H100 讲', 'NVIDIA doesn’t describe A100 graphics; shown as on H100'), 'lab-svg-dim');
    } else if (step === 1) {
      inner = '<g transform="translate(160,0)">' + triangle() + '</g>' + box(40, 75, 64, 30, L('顶点缓冲', 'Vertex buffer'), 'active') + poly([[72, 75], [150, 75]], 'lab-live') + svgText(48, 120, 'HBM → L2 → SM', 'lab-svg-dim');
    } else if (step === 2) {
      inner = box(60, 70, 80, 34, 'p = (x, y, z, 1)', null) + box(190, 70, 70, 34, 'M · p', 'active') + box(290, 70, 80, 34, L('屏幕 x, y', 'Screen x, y'), null) + poly([[100, 70], [155, 70]], 'lab-live') + poly([[225, 70], [250, 70]], 'lab-live') + svgText(170, 125, L('在 SM 的 FP32 通道上执行', 'Runs on the SM’s FP32 lanes'), 'lab-svg-dim');
    } else if (step === 3) {
      inner = '<clipPath id="lab-tri-clip"><path d="M68 13 10 121 136 121Z"/></clipPath>' + triangle() + '<rect data-phase-scan class="lab-scan" x="8" y="14" width="132" height="2"/>' + svgText(250, 50, 'w = (0.2, 0.5, 0.3)', 'lab-svg-result') + svgText(250, 74, L('三个权重都 ≥ 0', 'All three weights ≥ 0'), 'lab-svg-dim') + svgText(250, 96, L('在三角形内', 'Inside the triangle'), 'lab-svg-dim');
    } else if (step === 4) {
      inner = box(40, 75, 60, 34, L('片元', 'Fragment'), null) + box(150, 75, 90, 40, 'Σ wᵢ · vᵢ', 'active') + poly([[70, 75], [105, 75]], 'lab-live');
      [.2, .5, .3].forEach(function (v, i) { inner += '<rect class="' + ['lab-bar-r', 'lab-bar-g', 'lab-bar-b'][i] + '" x="' + (232 + i * 28) + '" y="' + (115 - v * 90) + '" width="18" height="' + (v * 90) + '" rx="2"/>' + svgText(241 + i * 28, 132, ['R', 'G', 'B'][i]); });
    } else if (step === 5) {
      for (var yy = 0; yy < 2; yy++) for (var xx = 0; xx < 2; xx++) inner += '<rect x="' + (20 + xx * 30) + '" y="' + (94 + yy * 22) + '" width="28" height="20" class="lab-box' + (xx === 0 && yy === 1 ? ' lab-active' : '') + '"/>';
      inner += svgText(50, 86, L('纹理', 'Texture'), 'lab-svg-dim') + box(170, 46, 90, 34, 'sample(uv)', 'active') + svgText(285, 42, '(1, 1, 1)', 'lab-svg-result') + svgText(200, 122, 'c × 1 = c', 'lab-svg-result') + poly([[50, 106], [50, 80], [170, 80], [170, 63]], 'lab-live');
    } else if (step === 6) {
      inner = '<rect x="20" y="36" width="88" height="10" rx="2" fill="#6fd3bf"/>' + svgText(64, 28, 'z = 0.4') + '<rect x="20" y="96" width="154" height="10" rx="2" fill="#5d6266"/>' + svgText(97, 122, L('已有 z = 0.7', 'Stored z = 0.7')) + box(210, 72, 74, 34, '0.4 < 0.7', 'active') + svgText(300, 76, 'pass', 'lab-svg-result') + svgText(210, 130, 'fb[3,4] = (51, 128, 77)', 'lab-svg-strong');
    } else {
      inner = pixelGrid(20, 30, 11, true) + svgText(64, 22, L('帧缓冲 · HBM', 'Framebuffer · HBM'), 'lab-svg-dim') + box(270, 75, 90, 34, L('主机', 'Host'), 'active') + poly([[110, 75], [225, 75]], 'lab-live') + svgText(168, 66, 'PCIe / NVLink', 'lab-svg-dim') + svgText(170, 135, L('H100 SXM 没有显示接口', 'H100 SXM has no display output'), 'lab-svg-dim');
    }
    return inner + dots(PIXEL_STEPS[step].paths.length);
  }

  var STACK_STEPS = [
    { stages: ['A100 2.04 TB/s', 'H100 3.35 TB/s', L('5 组 HBM', '5 stacks')], paths: [[[40, 110], [40, 30]]] },
    { stages: L('DRAM ×8 · 底部芯片 · 中介层', 'DRAM ×8 · base die · interposer'), paths: [[[300, 130], [300, 20]]] },
    { stages: ['TSV', L('微凸点', 'Microbump'), L('底部芯片', 'Base die')], paths: [[[130, 134], [130, 18]], [[210, 134], [210, 18]]] },
    { stages: [L('通道并行', 'Channels in parallel'), '1024 bit', '× 5'], paths: [[[20, 70], [320, 70]]] },
    { stages: ['HBM', L('中介层', 'Interposer'), 'PHY'], paths: [[[64, 40], [138, 40]], [[64, 78], [138, 78]], [[64, 116], [138, 116]], [[276, 40], [202, 40]], [[276, 78], [202, 78]]] },
    { stages: L('微凸点 · 凸点 · 焊球', 'Microbumps · bumps · balls'), paths: [[[24, 18], [24, 138]]] },
    { stages: [L('发热', 'Heat'), L('顶面', 'Top surface'), L('冷板', 'Cold plate')], paths: [[[170, 112], [170, 20]], [[70, 112], [70, 30]], [[270, 112], [270, 30]]], heat: true },
    { stages: ['144 → 132 SM', L('6 → 5 组 HBM', '6 → 5 stacks'), L('位置每颗不同', 'Varies per chip')], paths: [[[14, 10], [166, 10]], [[212, 12], [316, 12]]] }
  ];
  function stackDiagram(step, model) {
    var inner = '', a100 = model === 'a100', i;
    if (step === 0) {
      inner += svgText(40, 140, L('需求', 'Need'), 'lab-svg-dim');
      [['A100', 2.04], ['H100', 3.35]].forEach(function (row, n) {
        var w = row[1] / 3.35 * 200, y = 40 + n * 44, on = (n === 1) !== a100;
        inner += svgText(100, y + 4, row[0], on ? 'lab-svg-strong' : '') + '<rect x="130" y="' + (y - 9) + '" width="' + w.toFixed(1) + '" height="16" rx="3" fill="' + (on ? '#6fd3bf' : '#3b3f42') + '"/>' + svgText(130 + w + 26, y + 4, row[1] + ' TB/s', on ? 'lab-svg-result' : '');
      });
    } else if (step === 1 || step === 2) {
      for (i = 0; i < 8; i++) inner += '<rect class="lab-box' + (step === 1 ? ' lab-active' : '') + '" x="70" y="' + (18 + i * 13) + '" width="200" height="10" rx="2"/>';
      inner += '<rect class="lab-box lab-addr" x="60" y="124" width="220" height="12" rx="2"/>' + svgText(170, 148, L('底部接口芯片', 'Base die'), 'lab-svg-dim');
      if (step === 2) for (i = 0; i < 9; i++) { inner += '<line x1="130" x2="130" y1="' + (18 + i * 13 - 3) + '" y2="' + (18 + i * 13 + 10) + '" stroke="#b87a4c" stroke-width="3"/><line x1="210" x2="210" y1="' + (18 + i * 13 - 3) + '" y2="' + (18 + i * 13 + 10) + '" stroke="#b87a4c" stroke-width="3"/>'; }
      else inner += svgText(300, 76, '×8', 'lab-svg-strong');
    } else if (step === 3) {
      var ch = a100 ? 8 : 16, w = 280 / ch;
      for (i = 0; i < ch; i++) inner += '<rect class="lab-box lab-active" x="' + (30 + i * w) + '" y="44" width="' + (w - 3) + '" height="52" rx="2"/>';
      inner += svgText(170, 30, a100 ? '8 × 128 bit' : '16 × 64 bit', 'lab-svg-strong') + svgText(170, 122, a100 ? '2.04e12 × 8 ÷ 5120 ≈ 3.2 Gb/s' : '3.35e12 × 8 ÷ 5120 ≈ 5.2 Gb/s', 'lab-svg-result') + svgText(170, 142, L('每根数据线的速率', 'Rate per data line'), 'lab-svg-dim');
    } else if (step === 4) {
      inner += box(170, 78, 64, 116, 'GPU', 'active');
      [40, 78, 116].forEach(function (y) { inner += box(40, y, 48, 30, 'HBM', 'addr'); });
      [40, 78].forEach(function (y) { inner += box(300, y, 48, 30, 'HBM', 'addr'); });
      inner += box(300, 116, 48, 30, L('未启用', 'off'), 'off');
      [40, 78, 116].forEach(function (y) { inner += poly([[64, y], [138, y]], 'lab-live'); });
      [40, 78].forEach(function (y) { inner += poly([[276, y], [202, y]], 'lab-live'); });
      inner += svgText(170, 150, L('每组 1024 根线，长约 1 mm', '1024 lines per stack, about 1 mm long'), 'lab-svg-dim');
    } else if (step === 5) {
      var rows = [[L('裸片 / HBM', 'Die / HBM'), '#4d565d'], [L('微凸点', 'Microbumps'), '#9aa1a6'], [L('硅中介层', 'Silicon interposer'), '#3b4248'], [L('C4 凸点', 'C4 bumps'), '#9aa1a6'], [L('有机基板', 'Organic substrate'), '#2f3a33'], [L('焊球', 'Solder balls'), '#9aa1a6'], ['PCB', '#1b4a3a']];
      rows.forEach(function (r, n) { var h = n % 2 ? 6 : 14, y = 18 + n * 17; inner += '<rect x="60" y="' + y + '" width="220" height="' + h + '" rx="2" fill="' + r[1] + '"/>' + svgText(310, y + 8, r[0], 'lab-svg-dim'); });
    } else if (step === 6) {
      inner += '<rect x="30" y="16" width="280" height="10" rx="2" fill="#3b3f42"/>' + svgText(170, 12, L('冷板（模型里没有画）', 'Cold plate (not in the model)'), 'lab-svg-dim');
      inner += box(170, 124, 70, 24, 'GPU', 'warn') + box(70, 124, 50, 24, 'HBM', 'warn') + box(270, 124, 50, 24, 'HBM', 'warn');
      [70, 170, 270].forEach(function (x) { inner += poly([[x, 112], [x, 30]], 'lab-live lab-heat'); });
      inner += svgText(170, 80, a100 ? '400 W' : '≤ 700 W', 'lab-svg-strong');
    } else {
      var off = a100 ? function (g, t) { return g === 7 || (g >= 5 && t === (g * 3 + 2) % 8); } : function (g, t) { return g < 6 && t === (g * 5 + 3) % 9; };
      var tpcs = a100 ? 8 : 9;
      for (var g = 0; g < 8; g++) for (var t2 = 0; t2 < tpcs; t2++) inner += '<rect x="' + (14 + (g % 4) * 38 + (g % 4 > 1 ? 4 : 0)) + '" y="' + (16 + Math.floor(g / 4) * 64 + t2 * 6.4) + '" width="32" height="5" rx="1" class="lab-box' + (off(g, t2) ? ' lab-off' : ' lab-active') + '"/>';
      for (var s = 0; s < 6; s++) inner += '<rect x="' + (212 + (s % 2) * 56) + '" y="' + (18 + Math.floor(s / 2) * 40) + '" width="48" height="32" rx="3" class="lab-box' + (s === 5 ? ' lab-off' : ' lab-addr') + '"/>';
      inner += svgText(84, 148, a100 ? '108 / 128 SM' : '132 / 144 SM', 'lab-svg-strong') + svgText(264, 148, L('5 / 6 组 HBM', '5 / 6 stacks'), 'lab-svg-strong');
    }
    return inner + dots(STACK_STEPS[step].paths.length, STACK_STEPS[step].heat ? 'lab-dot-heat' : '');
  }

  var SPECS = { pagetable: PAGE_STEPS, pixel: PIXEL_STEPS, stacking: STACK_STEPS };
  function stagesOf(spec) { var st = spec.stages; return Array.isArray(st) ? st : tr(st).split(' · '); }
  function along(points, fraction) {
    var lengths = [], total = 0;
    for (var i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
      total += Math.sqrt(dx * dx + dy * dy); lengths.push(total);
    }
    var target = clamp(fraction) * total, last = 0;
    for (var j = 0; j < lengths.length; j++) {
      if (target <= lengths[j] || j === lengths.length - 1) {
        var p = (target - last) / (lengths[j] - last || 1);
        return { x: points[j][0] + (points[j + 1][0] - points[j][0]) * p, y: points[j][1] + (points[j + 1][1] - points[j][1]) * p };
      }
      last = lengths[j];
    }
    return { x: points[0][0], y: points[0][1] };
  }
  function cycle(phase) { phase = Number(phase); return Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0; }
  // The repeating illustration is driven by an unbounded visual phase; it never
  // changes the worked result, which follows the separate progress clock.
  function visualState(journey, step, phase, progress) {
    var table = SPECS[journey]; if (!table) return null;
    step = Math.max(0, Math.min(table.length - 1, Math.floor(Number(step) || 0)));
    var u = cycle(phase), spec = table[step], stages = stagesOf(spec), segment = Math.min(stages.length - 1, Math.floor(u * stages.length));
    var paths = journey === 'pagetable' ? spec.paths : spec.paths;
    return { journey: journey, step: step, phase: Number(phase) || 0, cycle: u, segment: segment, signal: tr(stages[segment]),
      pulse: .5 - .5 * Math.cos(u * Math.PI * 2), progress: progress === undefined ? null : clamp(progress),
      particles: paths.map(function (p, i) { return along(p, cycle(u + i * (journey === 'stacking' && step === 4 ? .2 : 0))); }),
      scan: spec.scan ? { x: 8, y: 14 + u * 107, width: 132, height: 2 } : null };
  }
  function concept(journey, step, model) {
    var spec = SPECS[journey][step], stages = stagesOf(spec), status = '<div class="lab-status"><span>' + escapeHTML(tr(L('循环演示', 'Looping'))) + '</span><span data-phase-status>' + escapeHTML(tr(stages[0])) + '</span></div>';
    var body;
    if (journey === 'pagetable') body = addressBits(spec) + svg(pageDiagram(spec), L('地址翻译经过的部件', 'Parts the translation passes through'), 150) + (spec.pa ? '<div class="lab-result">PA = 0x24e000000 + 0x164a40 = 0x24e164a40</div>' : '');
    else if (journey === 'pixel') body = svg(pixelDiagram(step, model), L('像素 (3, 4) 在这一步的处理', 'Pixel (3, 4) at this step'), spec.height);
    else body = svg(stackDiagram(step, model), L('封装和堆叠示意', 'Package and stacking sketch'), 152);
    return status + body;
  }

  var caches = typeof WeakMap === 'function' ? new WeakMap() : null;
  function setVisualPhase(container, phase, progress) {
    if (!container || !caches) return;
    var cache = caches.get(container); if (!cache || cache.journey === 'gemm') return;
    var d = visualState(cache.journey, cache.step, phase, progress); if (!d) return;
    var rootNode = cache.root;
    rootNode.dataset.phase = Number(d.phase).toFixed(4);
    rootNode.dataset.signal = d.signal;
    rootNode.dataset.segment = String(d.segment);
    if (progress !== undefined) rootNode.dataset.progress = clamp(progress).toFixed(3);
    cache.phaseMarkers.forEach(function (node, i) { var p = d.particles[i]; if (!p) return; node.setAttribute('cx', p.x.toFixed(2)); node.setAttribute('cy', p.y.toFixed(2)); });
    if (d.scan) cache.phaseScans.forEach(function (node) { node.setAttribute('y', d.scan.y.toFixed(2)); });
    if (cache.phaseStatus && cache.phaseStatus.textContent !== d.signal) cache.phaseStatus.textContent = d.signal;
    cache.lastVisualPhase = Number(phase) || 0;
  }
  function focusK(cache, k) {
    cache.k = k;
    cache.matrixCells.forEach(function (node) { node.classList.toggle('lab-k-focus', Number(node.dataset.matrixK) === k); });
    cache.products.forEach(function (node) { node.classList.toggle('lab-product-on', Number(node.dataset.labK) === k); });
  }
  function setProgress(container, progress) {
    if (!container || !caches) return;
    var cache = caches.get(container); if (!cache) return;
    var p = clamp(progress);
    cache.root.style.setProperty('--lab-progress', (p * 100).toFixed(1) + '%');
    if (cache.journey !== 'gemm') return;
    if (cache.step === 3) cache.packets.forEach(function (node) { node.style.setProperty('--packet-alpha', String(clamp(p * 5 - Number(node.dataset.packet)))); });
    if (cache.step === 4) cache.lanes.forEach(function (node, i) { node.classList.toggle('lab-lane-on', i <= Math.floor(p * 31)); });
    if (cache.step === 5 || cache.step === 6) {
      var acc = accumulation(cache.step, p);
      if (acc.count !== cache.accCount) {
        cache.accCount = acc.count;
        cache.acc.textContent = String(acc.value);
        var t = TRACE[acc.count < K ? acc.count : K - 1];
        cache.expression.innerHTML = cache.step === 5 && acc.count === TILE_K
          ? '<span class="lab-cv">2 + 3 + 6 + 8 = 19</span> · ' + escapeHTML(tr(L('第一块完成', 'tile 1 done')))
          : acc.count === K
          ? '<span class="lab-cv">19 + 18 = 37</span> · ' + escapeHTML(tr(L('累加完成', 'done')))
          : String(acc.value) + ' + <span class="lab-av">' + t.a + '</span> × <span class="lab-bv">' + t.b + '</span> → <span class="lab-cv">' + t.acc + '</span>';
        cache.products.forEach(function (node) { node.classList.toggle('lab-product-done', Number(node.dataset.labK) < acc.count); });
        if (cache.playing || cache.manualK === null) focusK(cache, acc.currentK);
      }
    }
  }
  function render(container, state, step, progress) {
    if (!container || !container.ownerDocument) return;
    installStyle(container.ownerDocument);
    var journey = SPECS[state.journey] ? state.journey : 'gemm';
    var max = journey === 'gemm' ? 7 : SPECS[journey].length - 1;
    var i = Math.max(0, Math.min(max, Math.floor(state.stepIndex || 0)));
    var key = journey + ':' + i + ':' + (state.model || 'h100') + ':' + lang();
    var cache = caches && caches.get(container);
    if (!cache || cache.key !== key) {
      var html = journey === 'gemm' ? gemm(i) : concept(journey, i, state.model);
      container.innerHTML = '<div class="lab-root" data-journey="' + escapeHTML(journey) + '" data-step="' + i + '" data-lang="' + lang() + '">' + html + '</div>';
      cache = { key: key, container: container, root: container.firstElementChild, journey: journey, step: i, accCount: -1, playing: !!state.playing, manualK: null,
        lastVisualPhase: cache && cache.lastVisualPhase || 0,
        matrixCells: Array.from(container.querySelectorAll('[data-matrix-k]')),
        phaseMarkers: Array.from(container.querySelectorAll('[data-phase-marker]')), phaseScans: Array.from(container.querySelectorAll('[data-phase-scan]')),
        phaseStatus: container.querySelector('[data-phase-status]'),
        packets: Array.from(container.querySelectorAll('[data-packet]')), lanes: Array.from(container.querySelectorAll('.lab-lane')),
        products: Array.from(container.querySelectorAll('[data-lab-k]')), acc: container.querySelector('[data-lab-acc]'), expression: container.querySelector('[data-lab-expression]') };
      if (caches) caches.set(container, cache);
      cache.products.forEach(function (node) {
        function selectPair() { cache.manualK = Number(node.dataset.labK); focusK(cache, cache.manualK); }
        node.addEventListener('click', selectPair); node.addEventListener('focus', selectPair);
      });
    }
    if (state.playing && !cache.playing) cache.manualK = null;
    cache.playing = !!state.playing;
    setProgress(container, progress === undefined ? 0 : progress);
    if (journey !== 'gemm') setVisualPhase(container, cache.lastVisualPhase || 0, progress);
  }
  return { render: render, setProgress: setProgress, setVisualPhase: setVisualPhase, visualState: visualState, SPECS: SPECS, STYLE: STYLE,
    GEMM: { A: A, B: B, C: C, row: ROW, col: COL, k: K, tileK: TILE_K, trace: TRACE, tileSums: [19, 18], result: C[ROW][COL] },
    multiply: multiply, dotTrace: dotTrace, accumulation: accumulation,
    gpuAddressFields: gpuAddressFields, physicalAddress: physicalAddress, PAGE: PAGE,
    barycentricColor: barycentricColor, perLineRate: perLineRate };
});
