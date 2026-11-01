/* Numeric teaching overlays. Scalar examples are deliberately separate from
 * the hardware geometry and from instruction-level Tensor Core fragment maps. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GpuExplorerLab = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
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
    return { count: count, value: count ? TRACE[count - 1].acc : 0,
      currentK: count < K ? count : K - 1, complete: count === K };
  }
  // x86-64, 4-level translation, 4 KiB pages; not a claim about GPU page tables.
  var VA = 0x00007f001234;
  function pageIndices(address) {
    if (!Number.isSafeInteger(address) || address < 0 || address >= Math.pow(2, 48)) throw new Error('Expected an unsigned 48-bit address');
    return { pgd: Math.floor(address / Math.pow(2, 39)) % 512,
      pud: Math.floor(address / Math.pow(2, 30)) % 512,
      pmd: Math.floor(address / Math.pow(2, 21)) % 512,
      pte: Math.floor(address / Math.pow(2, 12)) % 512,
      offset: address % 4096 };
  }
  function barycentricColor(weights, colors) {
    if (weights.length !== colors.length) throw new Error('One weight per vertex is required');
    return colors[0].map(function (_, channel) {
      return weights.reduce(function (sum, weight, i) { return sum + weight * colors[i][channel]; }, 0);
    });
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  var STYLE = `
.lab-root {--lab-a:#74d6c2;--lab-b:#e9b77d;--lab-c:#91b5ec;--lab-line:rgba(184,201,218,.14);--lab-dim:#82909d;color:#d9e1e7;font-family:inherit;font-size:12px;line-height:1.5;min-width:0}
.lab-root * {box-sizing:border-box}.lab-root button{font:inherit}.lab-matrices{display:grid;grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr) 12px minmax(0,1fr);gap:4px;align-items:center;padding:12px 0 14px}
.lab-matrix{min-width:0}.lab-matrix-title{display:flex;align-items:baseline;gap:5px;margin-bottom:7px;font:600 12px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-a)}.lab-matrix-title small{font-size:9px;color:var(--lab-dim);font-weight:400;white-space:nowrap}.lab-matrix-b .lab-matrix-title{color:var(--lab-b)}.lab-matrix-c .lab-matrix-title{color:var(--lab-c)}
.lab-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:2px}.lab-cell{display:flex;align-items:center;justify-content:center;min-width:0;height:13px;border-radius:1px;background:rgba(140,159,176,.045);color:#53616c;font:9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;transition:background .2s,color .2s,box-shadow .2s}.lab-cell.lab-a{background:rgba(116,214,194,.19);color:var(--lab-a)}.lab-cell.lab-b{background:rgba(233,183,125,.19);color:var(--lab-b)}.lab-cell.lab-c{background:rgba(145,181,236,.14);color:var(--lab-c)}.lab-cell.lab-output{box-shadow:0 0 0 1px var(--lab-c);color:var(--lab-c);background:rgba(145,181,236,.24);font-weight:700}.lab-cell.lab-k-focus{box-shadow:0 0 0 1px currentColor;filter:brightness(1.45)}.lab-cell.lab-computed{background:rgba(145,181,236,.7);color:#09131e}.lab-operator{text-align:center;font:16px Georgia,serif;color:var(--lab-dim)}
.lab-vectors{display:grid;gap:5px;padding:10px 0 12px}.lab-vector-row{display:grid;grid-template-columns:52px repeat(8,minmax(0,1fr));align-items:center;gap:3px}.lab-vector-label{font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-a)}.lab-vector-row:last-child .lab-vector-label{color:var(--lab-b)}.lab-vector-row .lab-cell{height:19px;font-size:11px}.lab-final-result{display:flex;align-items:center;justify-content:space-between;padding:7px 0 0;color:var(--lab-c);font:13px ui-monospace,SFMono-Regular,Consolas,monospace}.lab-final-result strong{font-size:34px;font-weight:500;line-height:1}.lab-root[data-step="5"] .lab-equation-status strong,.lab-root[data-step="6"] .lab-equation-status strong{font-size:30px;line-height:1.1}.lab-root[data-step="5"] .lab-expression,.lab-root[data-step="6"] .lab-expression{font-size:14px;min-height:28px;padding-top:6px}.lab-caption{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid var(--lab-line);padding-top:9px;margin-bottom:9px;color:var(--lab-dim);font-size:10px}.lab-caption strong{font:500 11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#d9e1e7}.lab-kicker{font:9px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.11em;text-transform:uppercase;color:var(--lab-dim)}
.lab-stage{position:relative;padding:12px;border:1px solid var(--lab-line);border-radius:6px;background:rgba(6,12,18,.24);min-height:97px}.lab-formula{display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;font:21px/1.5 Georgia,'Times New Roman',serif;min-height:42px;letter-spacing:.01em}.lab-formula .lab-acolor{color:var(--lab-a)}.lab-formula .lab-bcolor{color:var(--lab-b)}.lab-formula .lab-ccolor{color:var(--lab-c)}.lab-formula sub{font-size:.56em}.lab-sigma{display:inline-flex;align-items:center;justify-content:center;flex-direction:column;line-height:1;font-size:26px;margin:0 4px}.lab-sigma sup,.lab-sigma sub{font:9px ui-monospace,SFMono-Regular,Consolas,monospace}.lab-note{font-size:10px;color:var(--lab-dim);margin:7px 0 0;line-height:1.55}.lab-note em{font-style:normal;color:#b2bdc8}.lab-small-note{color:var(--lab-dim);font-size:9px;margin:8px 0 0;line-height:1.5}
.lab-products{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;margin-top:10px}.lab-product{display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;padding:5px 0;border:1px solid transparent;border-radius:3px;background:rgba(255,255,255,.035);color:#9ca8b3;cursor:pointer;font:10px ui-monospace,SFMono-Regular,Consolas,monospace!important}.lab-product .lab-product-k{font-size:8px;color:#65747f}.lab-product .lab-product-number{font-size:13px;color:#b4c5d7}.lab-product:hover,.lab-product:focus-visible,.lab-product.lab-product-on{background:rgba(145,181,236,.1);border-color:rgba(145,181,236,.55);outline:none}.lab-product .lab-av{color:var(--lab-a)}.lab-product .lab-bv{color:var(--lab-b)}.lab-product.lab-product-done{background:rgba(116,214,194,.08)}.lab-product.lab-product-done .lab-product-number{color:var(--lab-a)}
.lab-equation-status{display:flex;justify-content:space-between;align-items:center;gap:5px;color:var(--lab-dim);font:10px ui-monospace,SFMono-Regular,Consolas,monospace}.lab-equation-status strong{color:var(--lab-c);font-size:20px;font-weight:500}.lab-expression{font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;color:#b5c0ca;margin-top:4px;min-height:20px}.lab-expression .lab-av{color:var(--lab-a)}.lab-expression .lab-bv{color:var(--lab-b)}.lab-expression .lab-cv{color:var(--lab-c)}
.lab-transfer{display:grid;grid-template-columns:1fr 27px 1fr;gap:5px;align-items:center;margin-top:8px}.lab-transfer-box{padding:7px;border:1px solid var(--lab-line);border-radius:4px;min-width:0}.lab-transfer-box .lab-kicker{font-size:8px;letter-spacing:.02em}.lab-pair-row{display:flex;gap:3px;margin-top:5px}.lab-pair{flex:1;text-align:center;font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-a);border-radius:2px;background:rgba(116,214,194,.1);padding:3px 0;transition:opacity .15s,transform .15s}.lab-pair.lab-b{color:var(--lab-b);background:rgba(233,183,125,.1)}.lab-transfer-arrow{font-size:21px;text-align:center;color:var(--lab-a)}.lab-stage .lab-packet{opacity:var(--packet-alpha,0);transform:translateY(calc((1 - var(--packet-alpha,0)) * 4px))}.lab-copy-progress{height:2px;background:rgba(116,214,194,.12);margin-top:9px;overflow:hidden}.lab-copy-progress i{display:block;background:var(--lab-a);height:100%;width:var(--lab-progress,0%);transition:width .08s linear}
.lab-lanes{display:grid;grid-template-columns:repeat(16,minmax(0,1fr));gap:3px;margin-top:9px}.lab-lane{height:17px;display:flex;align-items:center;justify-content:center;border-radius:2px;background:rgba(116,214,194,.12);color:var(--lab-a);font:8px ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.4;transition:opacity .15s}.lab-root[data-animate="true"] .lab-lane{animation:lab-lane-pulse 2s ease-in-out infinite;animation-delay:calc(var(--i) * 15ms)}@keyframes lab-lane-pulse{0%,100%{opacity:.4}50%{opacity:1}}.lab-lane.lab-lane-on{opacity:1;background:rgba(116,214,194,.3)}
.lab-blocks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:7px}.lab-block{padding:7px;border:1px solid var(--lab-line);text-align:center;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:#82909d;border-radius:3px}.lab-block:last-child{border-color:var(--lab-c);background:rgba(145,181,236,.1);color:var(--lab-c)}.lab-output-badge{font:32px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-c);padding:2px 0}.lab-output-path{display:flex;align-items:center;justify-content:space-between;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;gap:5px;margin:9px 0 3px}.lab-output-path span{padding:6px;border:1px solid var(--lab-line);border-radius:3px;color:var(--lab-c)}
.lab-address{font:17px ui-monospace,SFMono-Regular,Consolas,monospace;color:#d9e1e7;margin:8px 0 12px;letter-spacing:.02em}.lab-address-bits{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.3fr;gap:3px}.lab-address-bit{background:rgba(145,181,236,.07);border-top:2px solid rgba(145,181,236,.18);padding:7px 2px;text-align:center;font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:#8d9ba7}.lab-address-bit small{display:block;font-size:8px;margin-bottom:4px;color:var(--lab-dim)}.lab-address-bit.lab-active{border-color:var(--lab-c);color:var(--lab-c);background:rgba(145,181,236,.17)}.lab-address-bit:last-child{border-color:var(--lab-b);color:var(--lab-b)}
.lab-walk{display:flex;align-items:center;gap:5px;margin:15px 0;justify-content:space-between;font:10px ui-monospace,SFMono-Regular,Consolas,monospace}.lab-walk-node{padding:9px 5px;border:1px solid var(--lab-line);border-radius:3px;color:var(--lab-dim);text-align:center}.lab-walk-node.lab-active{border-color:var(--lab-c);color:var(--lab-c);background:rgba(145,181,236,.08)}.lab-walk-node.lab-done{color:var(--lab-a);border-color:rgba(116,214,194,.4)}.lab-walk-arrow{color:#52606d}.lab-tlb{display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid var(--lab-line);border-radius:4px;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;margin:12px 0}.lab-miss{color:var(--lab-b)}
.lab-pixel-view{display:flex;gap:12px;align-items:center;justify-content:center;margin:7px 0 9px}.lab-triangle{width:150px;height:115px;overflow:visible}.lab-framebuffer{display:grid;grid-template-columns:repeat(8,10px);gap:2px}.lab-pixel{height:10px;background:rgba(145,181,236,.07);border-radius:1px}.lab-pixel.lab-target{background:#33804d;box-shadow:0 0 12px #33804d88}.lab-rgb{display:flex;gap:3px;justify-content:center;margin-top:8px}.lab-rgb span{padding:5px 8px;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;border-radius:2px}.lab-rgb span:nth-child(1){background:#743d3d55;color:#f3a3a3}.lab-rgb span:nth-child(2){background:#3d743d55;color:#a3f3a3}.lab-rgb span:nth-child(3){background:#3d3d7455;color:#a3a3f3}
.lab-stack{display:flex;flex-direction:column;gap:5px;margin:8px auto 10px;width:82%;perspective:700px}.lab-stack-layer{position:relative;padding:5px 10px;background:rgba(145,181,236,.09);border:1px solid rgba(145,181,236,.2);border-radius:2px;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:#9eb4ca;transform:rotateX(30deg) skewX(-12deg);transition:background .2s,border-color .2s,transform .4s}.lab-stack-layer.lab-active{background:rgba(116,214,194,.2);border-color:var(--lab-a);color:var(--lab-a);transform:rotateX(30deg) skewX(-12deg) translateX(5px)}.lab-stack-layer span{display:block;transform:skewX(12deg)}.lab-stack-layer:after{content:'';position:absolute;inset:3px -3px -3px 3px;border-right:2px solid rgba(145,181,236,.2);border-bottom:2px solid rgba(145,181,236,.2);z-index:-1}.lab-two-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.lab-metric{border:1px solid var(--lab-line);border-radius:4px;padding:8px;font-size:10px;color:var(--lab-dim)}.lab-metric strong{display:block;font:17px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-a);margin-top:4px}
@media(prefers-reduced-motion:reduce){.lab-root *{animation:none!important;transition:none!important}}@media(max-width:400px){.lab-product{font-size:9px!important}.lab-stage{padding:9px}.lab-cell{height:12px;font-size:8px}}
`;
  var caches = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function installStyle(doc) {
    if (doc.getElementById('gpu-explorer-lab-style')) return;
    var style = doc.createElement('style'); style.id = 'gpu-explorer-lab-style'; style.textContent = STYLE;
    doc.head.appendChild(style);
  }
  function matrix(data, name, which, step) {
    var cols = data[0].length;
    var out = '<div class="lab-matrix lab-matrix-' + which + '"><div class="lab-matrix-title">' + name + '<small>' + data.length + ' × ' + cols + '</small></div><div class="lab-grid" role="img" aria-label="矩阵 ' + name + '，' + data.length + ' 行 ' + cols + ' 列">';
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
    return '<div class="lab-vectors" aria-label="目标输出使用的 A 行与 B 列">' + ['a','b'].map(function(which) {
      return '<div class="lab-vector-row"><span class="lab-vector-label">' + (which === 'a' ? 'A[3,:]' : 'B[:,7]') + '</span>' + TRACE.map(function(t) {
        return '<span class="lab-cell lab-' + which + '" data-matrix-k="' + t.k + '" title="' + (which === 'a' ? 'A[3,' + t.k + ']' : 'B[' + t.k + ',7]') + ' = ' + t[which] + '">' + t[which] + '</span>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }
  function products(step) {
    return '<div class="lab-products">' + TRACE.map(function (t) {
      return '<button type="button" class="lab-product" data-lab-k="' + t.k + '" aria-label="k=' + t.k + '：' + t.a + ' 乘 ' + t.b + ' 等于 ' + t.product + '" title="A[3,' + t.k + '] × B[' + t.k + ',7] = ' + t.product + '"><span class="lab-product-k">k' + t.k + '</span><span><span class="lab-av">' + t.a + '</span>·<span class="lab-bv">' + t.b + '</span></span><span class="lab-product-number">' + t.product + '</span></button>';
    }).join('') + '</div>';
  }
  function transfer(start, end) {
    function bank(isDestination) {
      return '<div class="lab-transfer-box"><div class="lab-kicker">' + (isDestination ? 'Shared memory · 片上' : 'HBM · 片外') + '</div>' + ['a', 'b'].map(function (which) {
        return '<div class="lab-pair-row">' + TRACE.slice(start, end).map(function (t, i) {
          return '<span class="lab-pair' + (which === 'b' ? ' lab-b' : '') + (isDestination ? ' lab-packet' : '') + '"' + (isDestination ? ' data-packet="' + i + '"' : '') + '>' + t[which] + '</span>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="lab-transfer">' + bank(false) + '<span class="lab-transfer-arrow">→</span>' + bank(true) + '</div><div class="lab-copy-progress"><i></i></div>';
  }
  function gemm(step) {
    var html = step >= 3 && step <= 6 ? vectors() : (step === 7 ? '<div class="lab-final-result" role="status" aria-label="目标输出 C 第 3 行第 7 列等于 37"><span>C[3,7] = 19 + 18</span><strong>37</strong></div>' : '') + matrices(step), body;
    var captions = ['选择一个输出', '追踪输入依赖', '一个 CTA 负责一个输出块', '载入第 1 个 K-tile', '32 个 lane 协同工作', '累加第 1 个 K-tile', '同步 · 复用 · 下一块', '结果写回显存'];
    var locations = ['C[3,7]', 'A[3,:] · B[:,7]', 'tile → CTA → SM', 'k = 0…3', 'warp = 32 threads', 'acc = 0 → 19', 'acc = 19 → 37', 'C[3,7] = 37'];
    html += '<div class="lab-caption"><span>' + captions[step] + '</span><strong>' + locations[step] + '</strong></div>';
    if (step === 0) {
      body = '<div class="lab-formula"><span class="lab-ccolor">C<sub>3,7</sub></span><span>=</span><span class="lab-sigma"><sup>7</sup>∑<sub>k = 0</sub></span><span class="lab-acolor">A<sub>3,k</sub></span><span>·</span><span class="lab-bcolor">B<sub>k,7</sub></span></div><p class="lab-note">从一个输出出发，跟随它经过<em>显存 → 共享内存 → 计算 → 写回</em>。</p>';
    } else if (step === 1) {
      body = '<div class="lab-kicker">依赖一行与一列 · 点击任意一项追踪</div>' + products(step) + '<p class="lab-note">每一对彩色数值相乘，8 项相加得到目标输出。</p>';
    } else if (step === 2) {
      body = '<div class="lab-kicker">缩小的输出矩阵 · 每块 2 × 4</div><div class="lab-blocks"><div class="lab-block">CTA 0 · C[0:2, 0:4]</div><div class="lab-block">CTA 1 · C[0:2, 4:8]</div><div class="lab-block">CTA 2 · C[2:4, 0:4]</div><div class="lab-block">CTA 3 · C[2:4, 4:8]</div></div><p class="lab-note">目标在 CTA 3 中。实际 kernel 的 tile 通常更大。</p>';
    } else if (step === 3) {
      body = '<div class="lab-kicker">K-tile 01 / 02 · k = 0…3</div>' + transfer(0, 4) + '<p class="lab-note">这里只展开目标输出使用的数；实际搬运的是可复用的二维 tile。</p>';
    } else if (step === 4) {
      body = '<div class="lab-kicker">一条指令 · 32 个 lane · 分布式数据片段</div><div class="lab-lanes">' + Array.from({length:32}, function (_, i) { return '<span class="lab-lane" style="--i:' + i + '">' + i + '</span>'; }).join('') + '</div><p class="lab-note">Tensor Core MMA 由线程协同提供矩阵片段。<em>下方标量内积用于解释数学，不是 lane 到元素的映射。</em></p>';
    } else if (step === 5 || step === 6) {
      body = '<div class="lab-equation-status"><span>' + (step === 5 ? 'K-tile 01 / 02' : 'K-tile 02 / 02 · 同步完成后继续') + '</span><span>acc <strong data-lab-acc role="status" aria-label="当前累加值">' + (step === 5 ? '0' : '19') + '</strong></span></div><div class="lab-expression" data-lab-expression></div>' + products(step);
    } else {
      body = '<div class="lab-kicker">8 项乘积 · 2 个 K-tile · 累加完成</div><div class="lab-output-path"><span>累加结果</span>→<span>Store</span>→<span>C[3,7]</span></div><p class="lab-note">19 + 18 = 37。仅在所有 K-tile 累加完成后写回。</p>';
    }
    return html + '<div class="lab-stage">' + body + '</div><p class="lab-small-note">4 × 8 微型数值例；索引从 0 开始。硬件动画不代表真实周期或 Tensor Core 指令时序。</p>';
  }
  function pagetable(step) {
    var idx = pageIndices(VA), fields = ['pgd','pud','pmd','pte','offset'];
    var active = Math.max(0, Math.min(3, step - 2));
    var html = '<div class="lab-kicker">x86-64 · 4 级页表 · 4 KiB 普通页</div><div class="lab-address">0x0000_7f00_1234</div><div class="lab-address-bits">' + fields.map(function (key, i) {
      return '<div class="lab-address-bit' + ((step >= 2 && i === active) || (step >= 5 && i === 4) ? ' lab-active' : '') + '"><small>' + key.toUpperCase() + ' · ' + (i === 4 ? '12' : '9') + ' bit</small>' + (i === 4 ? '0x' + idx[key].toString(16) : idx[key]) + '</div>';
    }).join('') + '</div><div class="lab-tlb"><span>TLB · 翻译缓存</span><strong class="lab-miss">' + (step === 0 ? '查询 →' : 'MISS') + '</strong></div><div class="lab-walk">' + fields.slice(0,4).map(function (key, i) {
      return (i ? '<span class="lab-walk-arrow">→</span>' : '') + '<span class="lab-walk-node' + (step >= 2 && i === active ? ' lab-active' : '') + (step > i + 2 ? ' lab-done' : '') + '">' + key.toUpperCase() + '<br>[' + idx[key] + ']</span>';
    }).join('') + '</div><div class="lab-stage"><div class="lab-kicker">' + (step >= 5 ? '页号 + 页内偏移' : '每次取出下一级页表的基址') + '</div><div class="lab-formula"><span class="lab-ccolor">PA</span> = <span class="lab-acolor">0x12345000</span> + <span class="lab-bcolor">0x234</span></div><p class="lab-note">示例物理页基址 → <em>PA = 0x12345234</em>。偏移 0x234 在翻译中保持不变。</p></div><p class="lab-small-note">CPU 地址翻译独立示例；GPU 的页表布局依架构而异。此处假设无大页、无缺页。</p>';
    return html;
  }
  function pixel(step) {
    var weights = [.2,.5,.3], color = barycentricColor(weights, [[1,0,0],[0,1,0],[0,0,1]]);
    var rgb = color.map(function (x) { return Math.round(x * 255); });
    var cells = Array.from({length:64},function(_,i){return '<i class="lab-pixel' + (i === 35 && step >= 6 ? ' lab-target' : '') + '"></i>';}).join('');
    return '<div class="lab-kicker">一个片元 · 一个可检验的颜色</div><div class="lab-pixel-view"><svg class="lab-triangle" viewBox="0 0 160 120" role="img" aria-label="三角形内部目标像素，重心权重为 0.2、0.5、0.3"><defs><linearGradient id="lab-trigrad" x1="0%" y1="0%" x2="90%" y2="100%"><stop offset="0%" stop-color="#bf7474"/><stop offset="50%" stop-color="#659b79"/><stop offset="100%" stop-color="#7d93ba"/></linearGradient></defs><path d="M80 8 12 105 148 105Z" fill="url(#lab-trigrad)" fill-opacity=".35" stroke="#8ba5bb" stroke-width="1"/><path d="M80 8 66.4 85.6 12 105M66.4 85.6 148 105" fill="none" stroke="#8397a8" stroke-width=".7" stroke-dasharray="3 3"/><circle cx="66.4" cy="85.6" r="4" fill="#92c0ab"/><text x="80" y="94" fill="#d1dbe1" font-family="monospace" font-size="10">P</text><text x="85" y="13" fill="#df8e8e" font-family="monospace" font-size="9">v0</text><text x="0" y="118" fill="#8fbc9c" font-family="monospace" font-size="9">v1</text><text x="140" y="118" fill="#91b5ec" font-family="monospace" font-size="9">v2</text></svg><div><div class="lab-kicker" style="margin-bottom:8px">帧缓冲</div><div class="lab-framebuffer">' + cells + '</div></div></div><div class="lab-stage"><div class="lab-kicker">重心插值 · w0 + w1 + w2 = 1</div><div class="lab-formula" style="font-size:17px">0.2 · <span style="color:#df8e8e">v0</span> + 0.5 · <span style="color:#8fbc9c">v1</span> + 0.3 · <span class="lab-ccolor">v2</span></div><div class="lab-rgb">' + rgb.map(function(v,i){return '<span>' + ['R','G','B'][i] + ' ' + v + '</span>';}).join('') + '</div><p class="lab-note">' + (step === 4 ? '示例纹理采样取白色，乘法调制后颜色不变。' : step === 5 ? '深度 0.4 < 已存深度 0.7 → 通过测试，允许写入。' : step >= 6 ? '通过深度测试后，将 RGB(51,128,77) 写入目标像素。' : '顶点使用 RGB 三原色；插值得到该片元的线性颜色。') + '</p></div><p class="lab-small-note">简化的不透明片元流程；演示使用后置深度测试，不展示 early-Z、色彩空间转换或 MSAA。</p>';
  }
  function stacking(step) {
    var layers = ['散热盖','上层逻辑','混合键合','下层逻辑','内存 / 缓存','封装基板'];
    var active = [[0,1],[1],[0,2,5],[1],[2],[3,4],[2,4],[0,1]][step] || [];
    return '<div class="lab-kicker">通用 3D 逻辑堆叠 · 教学剖面</div><div class="lab-stack">' + layers.map(function(label,i){return '<div class="lab-stack-layer' + (active.indexOf(i)>=0 ? ' lab-active' : '') + '"><span>' + String(i+1).padStart(2,'0') + '　' + label + '</span></div>';}).join('') + '</div><div class="lab-stage"><div class="lab-formula" style="font-size:18px">' + (step === 1 ? '可用单元 = 总单元 − 关闭单元' : step === 7 ? 'P = α · C · V² · f' : '连线越短 → 寄生电容通常越小') + '</div><p class="lab-note">' + (step === 1 ? '分档可关闭部分逻辑；关闭单元仍在硅片中。具体产品的分档方式不同。' : step === 7 ? '动态功耗取决于翻转活动 α、电容 C、电压 V 与频率 f。堆叠还必须解决热阻、供电和良率。' : '垂直互连把层间距离缩短；实际收益还依赖互连密度、带宽、布线与供电设计。') + '</p></div><p class="lab-small-note">概念性逻辑堆叠，不表示 H100 的物理结构，也不宣称任何未公开芯片的封装方案。</p>';
  }
  function focusK(cache, k) {
    cache.k = k;
    cache.matrixCells.forEach(function (node) { node.classList.toggle('lab-k-focus', Number(node.dataset.matrixK) === k); });
    cache.products.forEach(function (node) { node.classList.toggle('lab-product-on', Number(node.dataset.labK) === k); });
  }
  function setProgress(container, progress) {
    if (!container || !caches) return;
    var cache = caches.get(container); if (!cache) return;
    var p = clamp(progress), root = cache.root;
    root.style.setProperty('--lab-progress', (p * 100).toFixed(1) + '%');
    if (cache.journey !== 'gemm') return;
    if (cache.step === 3) cache.packets.forEach(function (node) {
      node.style.setProperty('--packet-alpha', String(clamp(p * 5 - Number(node.dataset.packet))));
    });
    if (cache.step === 4) cache.lanes.forEach(function (node, i) { node.classList.toggle('lab-lane-on', i <= Math.floor(p * 31)); });
    if (cache.step === 5 || cache.step === 6) {
      var acc = accumulation(cache.step, p);
      if (acc.count !== cache.accCount) {
        cache.accCount = acc.count;
        cache.acc.textContent = String(acc.value);
        var t = TRACE[acc.count < K ? acc.count : K - 1];
        cache.expression.innerHTML = cache.step === 5 && acc.count === TILE_K
          ? '<span class="lab-cv">2 + 3 + 6 + 8 = 19</span> · 第一块完成'
          : acc.count === K
          ? '<span class="lab-cv">19 + 18 = 37</span> · 累加完成'
          : String(acc.value) + ' + <span class="lab-av">' + t.a + '</span> × <span class="lab-bv">' + t.b + '</span> → <span class="lab-cv">' + t.acc + '</span>';
        cache.products.forEach(function (node) { node.classList.toggle('lab-product-done', Number(node.dataset.labK) < acc.count); });
        if (cache.playing || cache.manualK === null) focusK(cache, acc.currentK);
      }
    }
  }
  function render(container, state, step, progress) {
    if (!container || !container.ownerDocument) return;
    installStyle(container.ownerDocument);
    var journey = state.journey || 'gemm', i = Math.max(0, Math.floor(state.stepIndex || 0));
    var key = journey + ':' + i;
    var cache = caches && caches.get(container);
    if (!cache || cache.key !== key) {
      var builder = ({ gemm:gemm, pagetable:pagetable, pixel:pixel, stacking:stacking })[journey] || gemm;
      var max = journey === 'pagetable' ? 6 : 7; i = Math.min(i,max);
      container.innerHTML = '<div class="lab-root" data-journey="' + escapeHTML(journey) + '" data-step="' + i + '" data-animate="' + (state.playing ? 'true' : 'false') + '">' + builder(i) + '</div>';
      cache = { key:key, container:container, root:container.firstElementChild, journey:journey, step:i, accCount:-1, playing:!!state.playing, manualK:null,
        matrixCells:Array.from(container.querySelectorAll('[data-matrix-k]')),
        packets:Array.from(container.querySelectorAll('[data-packet]')), lanes:Array.from(container.querySelectorAll('.lab-lane')),
        products:Array.from(container.querySelectorAll('[data-lab-k]')), acc:container.querySelector('[data-lab-acc]'), expression:container.querySelector('[data-lab-expression]') };
      if (caches) caches.set(container,cache);
      cache.products.forEach(function(node){
        function selectPair() { cache.manualK = Number(node.dataset.labK); focusK(cache, cache.manualK); }
        node.addEventListener('click',selectPair); node.addEventListener('focus',selectPair);
      });
    }
    if (state.playing && !cache.playing) cache.manualK = null;
    cache.playing = !!state.playing;
    cache.root.dataset.animate = state.playing ? 'true' : 'false';
    setProgress(container, progress === undefined ? 0 : progress);
  }
  return { render:render, setProgress:setProgress, STYLE:STYLE,
    GEMM:{ A:A, B:B, C:C, row:ROW, col:COL, k:K, tileK:TILE_K, trace:TRACE, tileSums:[19,18], result:C[ROW][COL] },
    multiply:multiply, dotTrace:dotTrace, accumulation:accumulation,
    pageIndices:pageIndices, PAGE:{ va:VA, indices:pageIndices(VA), pageBase:0x12345000, physical:0x12345234 },
    barycentricColor:barycentricColor };
});
