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
  STYLE += `
.lab-concept-svg{display:block;width:100%;max-height:178px;overflow:visible;margin:1px 0 8px;background:radial-gradient(ellipse at center,rgba(116,214,194,.025),transparent 72%)}
.lab-concept-svg text{font:9px ui-monospace,SFMono-Regular,Consolas,monospace;text-anchor:middle;fill:#9aabb9}
.lab-concept-svg .lab-svg-text{font-size:10px;fill:#96a6b3}.lab-concept-svg .lab-svg-active{fill:#c0eee0}.lab-concept-svg .lab-svg-annotation{font-size:8px;fill:#7e929f}.lab-concept-svg .lab-svg-result{font-size:12px;fill:var(--lab-a)}.lab-concept-svg .lab-svg-a{fill:var(--lab-a);font-size:9px}
.lab-motion-caption{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0 5px}.lab-motion-caption .lab-kicker{color:#a5b8c7;letter-spacing:.04em}.lab-motion-status{font:9px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-a);white-space:nowrap;min-height:14px}
.lab-concept-math{padding:11px 12px 10px;border:1px solid var(--lab-line);border-radius:5px;background:rgba(5,12,17,.3)}.lab-concept-math strong{font:500 13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lab-c);display:block;overflow-wrap:anywhere}.lab-concept-math p{font-size:10px;line-height:1.7;margin:6px 0 0;color:#8fa3b1}.lab-address-bits-compact{margin-top:11px}.lab-address-bits-compact .lab-address-bit{padding:5px 2px;font-size:11px}.lab-address-bits-compact .lab-address-bit small{font-size:7.5px;margin-bottom:2px}
.lab-process-box{fill:#111d25;stroke:#3e505c;stroke-width:.8}.lab-process-box.lab-active{fill:#17362f;stroke:#74d6c2;stroke-width:1.2}.lab-signal-path{fill:none;stroke:#41545f;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}.lab-return-path{stroke:#74d6c2;stroke-dasharray:3 4;opacity:.5}.lab-motion-dot{fill:#9cf0d4;stroke:#c9ffec;stroke-width:.8;filter:drop-shadow(0 0 3px #74d6c277)}.lab-motion-dot-1{fill:#edba79;stroke:#ffe1ba}.lab-motion-dot-2{fill:#9dbbe9;stroke:#d2e4ff}.lab-scan-bar{fill:rgba(116,214,194,.38);stroke:#9cf0d4;stroke-width:.4}
.lab-svg-pixel{fill:#172831;stroke:#324650;stroke-width:.4}.lab-svg-pixel-target{fill:#152c2c;stroke:#8fd5c5;stroke-width:1}.lab-svg-pixel-filled{fill:#33804d;stroke:#92c8a1;stroke-width:1}.lab-screen-outline{fill:#0b121a;stroke:#5e7887;stroke-width:1}.lab-triangle-fill{fill:#18302b;stroke:#6b9b8b;stroke-width:1}.lab-weight-lines{fill:none;stroke:#9cb4b1;stroke-width:.6;stroke-dasharray:3 3;opacity:.6}.lab-triangle-target{fill:#a8e2cf}.lab-channel-bar{stroke-width:.6;opacity:.8}.lab-channel-0{fill:#a86363;stroke:#e29b9b}.lab-channel-1{fill:#5d9f74;stroke:#a5dab1}.lab-channel-2{fill:#657eab;stroke:#b2c5e7}.lab-concept-svg [data-channel]{opacity:.35}.lab-concept-svg [data-channel].lab-signal-on{opacity:1;filter:drop-shadow(0 0 3px #91b5ec44)}
.lab-texture-pixel{fill:#c0c9c5;stroke:#6e827e;stroke-width:.7}.lab-texture-selected{fill:white;stroke:#74d6c2;stroke-width:2}.lab-depth-near{fill:#74d6c2}.lab-depth-far{fill:#aa7e63;opacity:.6}.lab-display-scan{fill:#74d6c233;stroke:#74d6c2;stroke-width:.5}
.lab-stack-svg-layer{fill:#162830;stroke:#45606f;stroke-width:.7}.lab-stack-svg-layer.lab-active{fill:#1b3a33;stroke:#74d6c2;stroke-width:1}.lab-stack-svg-layer.lab-heat-source{fill:#51362c;stroke:#e4a06d}.lab-core-cell{fill:#31604e;stroke:#92c6a6;stroke-width:.5}.lab-core-disabled{fill:#352e2a;stroke:#b4876b}.lab-concept-svg .lab-core-cross{font-size:12px;fill:#e9b77d}.lab-bond-point{fill:#b9d4c9}.lab-vertical-route{stroke:#74d6c2;stroke-width:2}.lab-horizontal-route{stroke:#e9b77d;stroke-width:2;opacity:.7}
@media(max-width:500px){.lab-concept-svg{max-height:165px}.lab-concept-math strong{font-size:12px}.lab-motion-status{font-size:8px}}
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
  // Per-step concept animations are driven by the application's frozen or
  // advancing visual phase. A phase is an unbounded number of cycles, not time.
  // Replaying a signal does not replay a hardware instruction or change results.
  var PANEL_STEPS = {
    pagetable: [
      {active:'cpu', label:'发出虚拟地址', formula:'VA = 0x0000_7f00_1234', detail:'CPU 发出程序可见的虚拟地址。高位索引决定页表路径，低 12 位是页内偏移。', stages:['CPU 发出','携带 VA','送往 TLB']},
      {active:'tlb', label:'检查翻译缓存', formula:'TLB[VPN 0x7f001] → MISS', detail:'本例故意选择未命中路径；需要查页表，不能直接用虚拟地址访问物理内存。', stages:['比较 VPN','未找到项','启动遍历']},
      {active:'pgd', label:'第 1 级 · PGD[0]', formula:'⌊VA / 2³⁹⌋ mod 512 = 0', detail:'读取 PGD 的第 0 项。示例根基址 0x00100000，条目给出下一级基址 0x00200000。', stages:['索引 0','读取条目','得到 PUD 基址']},
      {active:'pud', label:'第 2 级 · PUD[1]', formula:'0x00200000 + 1 × 8 = 0x00200008', detail:'条目宽 8 字节。读取 PUD 第 1 项，示例条目指向 PMD 基址 0x00300000。', stages:['索引 1','读取条目','得到 PMD 基址']},
      {active:'pmd', label:'第 3 级 · PMD[504]', formula:'0x00300000 + 504 × 8 = 0x00300fc0', detail:'读取 PMD 第 504 项，示例条目指向 PTE 页表基址 0x00400000。', stages:['索引 504','读取条目','得到 PTE 基址']},
      {active:'pte>tlb', label:'叶条目 · 组合物理地址', formula:'PA = 0x12345000 + 0x234 = 0x12345234', detail:'PTE[1] 给出物理页基址。偏移不变；翻译结果可回填 TLB，供后续访问复用。', stages:['读取 PTE[1]','保留 offset','回填 TLB']},
      {active:'ram>cache>cpu', label:'从物理内存返回数据', formula:'load(0x12345234) → 0x2A', detail:'示例数据为 0x2A。绿色信号按内存 → 缓存 → CPU 返回，地址翻译到此完成。', stages:['物理内存','缓存装入','CPU 收到']}
    ],
    pixel: [
      {active:'pixel', label:'选定目标像素', formula:'target = framebuffer[3,4]', detail:'先固定一个像素的位置，再追踪覆盖它的几何与最后写入的颜色。', stages:['像素坐标','选中目标','追踪来源']},
      {active:'tri>pixel', label:'覆盖测试', formula:'w₀ ≥ 0, w₁ ≥ 0, w₂ ≥ 0 → inside', detail:'扫描线扫过三角形。目标位于内部，因此产生候选片元；本例不展开边界填充规则。', stages:['扫描覆盖','命中目标','产生片元']},
      {active:'raster>tri', label:'重心插值', formula:'c = 0.2v₀ + 0.5v₁ + 0.3v₂', detail:'三个权重相加为 1。RGB 三原色顶点插值得到线性颜色 (0.2, 0.5, 0.3)。', stages:['红色贡献 0.2','绿色贡献 0.5','蓝色贡献 0.3']},
      {active:'shader', label:'片元着色', formula:'shade(c) = c = (0.2, 0.5, 0.3)', detail:'本例着色器保留插值颜色。R、G、B 通道依次高亮，表示一次片元程序处理的数据。', stages:['R = 0.2','G = 0.5','B = 0.3']},
      {active:'tex>shader', label:'纹理采样与调制', formula:'c × texture(0.25,0.75) = c × (1,1,1)', detail:'选中的纹素为白色，逐通道相乘后颜色不变。示例使用最近邻采样，跳过过滤细节。', stages:['uv = (0.25,0.75)','读取白色纹素','调制颜色']},
      {active:'depth>pixel', label:'深度比较', formula:'z = 0.4 < stored z = 0.7 → PASS', detail:'更小的深度表示更近。候选片元通过测试；若更远，则在本例的写入步骤前丢弃。', stages:['候选深度 0.4','比较已存 0.7','允许写入']},
      {active:'fb', label:'写入帧缓冲', formula:'C[3,4] ← round(255c) = (51,128,77)', detail:'绿色数据点到达目标格后，帧缓冲保存新颜色，同时更新深度值为 0.4。', stages:['Store RGB','目标格更新','深度写入']},
      {active:'fb>pixel', label:'显示与反向追溯', formula:'display[3,4] ← framebuffer[3,4]', detail:'显示阶段从帧缓冲读取颜色。追溯该像素，可回到纹理、顶点属性及覆盖它的三角形。', stages:['帧缓冲读取','传送像素','屏幕显示']}
    ],
    stacking: [
      {active:'lid>logic-top', label:'查看完整剖面', formula:'盖 → 上层逻辑 → 键合 → 下层 → 内存 → 基板', detail:'从顶部散热盖到封装基板逐层读图。这里展示通用概念剖面，非 H100 的逻辑堆叠结构。', stages:['散热盖','逻辑与互连','封装基板']},
      {active:'cut-core>logic-top', label:'关闭单元仍存在', formula:'可用单元 = 8 − 1 = 7', detail:'上层 8 个示例单元中，打叉的一个被关闭。扫描仍会经过它，关闭不等于从硅片中删除。', stages:['同一硅片','关闭 1 单元','剩余 7 可用']},
      {active:'lid>bond>substrate', label:'分离六个层面', formula:'6 层结构 · 每层承担不同职责', detail:'层间间距按展示比例展开，让键合层与封装基板可见。展示间距不代表制造尺寸。', stages:['辨认上层','查看键合','辨认基板']},
      {active:'logic-top', label:'上层逻辑的位置', formula:'热源：上层逻辑 → 散热盖', detail:'上层逻辑同时靠近散热盖与键合层。绿色信号走向下层，暖色热流走向散热盖。', stages:['上层计算','向下传信号','向上传热']},
      {active:'bond', label:'穿过混合键合层', formula:'上层信号 → 垂直互连 → 下层逻辑', detail:'高亮小点表示层间连接。数据沿垂直方向穿过互连，键合层不负责执行程序。', stages:['上层发出','穿过键合','下层收到']},
      {active:'logic-low>mem-layer', label:'下层访问附近存储', formula:'read → memory → return', detail:'请求从下层逻辑发出，到附近存储后带数据返回。容量和带宽仍有限，距离短不等于无限快。', stages:['下层请求','存储读取','返回下层']},
      {active:'bond>mem-layer', label:'对比互连的几何路径', formula:'E ≈ C · V²；连线长度影响寄生 C', detail:'相同的展示速度下，较短的垂直路径先到达；这里只比较几何，不推算真实时延或功耗。', stages:['同时出发','短路径先到','长路径继续']},
      {active:'lid>logic-top', label:'热量必须导出', formula:'ΔT ≈ P · Rθ', detail:'热从逻辑层向散热盖流动。堆叠可能提高热阻；收益需与温度、供电、良率及制造成本一起权衡。', stages:['逻辑产生热','逐层导热','散热盖导出']}
    ]
  };
  var PAGE_POINTS = {cpu:[33,25],tlb:[110,25],pgd:[187,25],pud:[264,25],pmd:[264,99],pte:[187,99],ram:[110,99],cache:[33,99]};
  function along(points, fraction) {
    var lengths = [], total = 0;
    for (var i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i-1][0], dy = points[i][1] - points[i-1][1];
      total += Math.sqrt(dx*dx + dy*dy); lengths.push(total);
    }
    var target = clamp(fraction) * total, last = 0;
    for (var j = 0; j < lengths.length; j++) {
      if (target <= lengths[j] || j === lengths.length-1) {
        var p = (target-last) / (lengths[j]-last || 1);
        return {x:points[j][0] + (points[j+1][0]-points[j][0])*p, y:points[j][1] + (points[j+1][1]-points[j][1])*p};
      }
      last = lengths[j];
    }
    return {x:points[0][0],y:points[0][1]};
  }
  function cycle(phase) { phase = Number(phase); return Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0; }
  function visualState(journey, step, phase, progress) {
    var table = PANEL_STEPS[journey]; if (!table) return null;
    step = Math.max(0, Math.min(table.length-1, Math.floor(Number(step) || 0)));
    var u = cycle(phase), spec = table[step], segment = Math.min(2, Math.floor(u*3));
    var result = {journey:journey, step:step, phase:Number(phase)||0, cycle:u, active:spec.active,
      signal:spec.stages[segment], label:spec.label, segment:segment, pulse:.5-.5*Math.cos(u*Math.PI*2),
      progress:progress === undefined ? null : clamp(progress), particles:[], scan:null, channel:-1, gap:0};
    if (journey === 'pagetable') {
      var routes = [ ['cpu','tlb'], ['tlb','tlb'], ['tlb','pgd'], ['pgd','pud'], ['pud','pmd'], ['pmd','pte'], ['pte','ram','cache','cpu'] ];
      if (step === 1) result.particles.push({x:88+u*44,y:25});
      else result.particles.push(along(routes[step].map(function(id){return PAGE_POINTS[id];}),u));
      if (step === 1) result.scan = {x:86+u*42,y:10,width:3,height:30};
      if (step === 5) result.particles.push(along([[187,99],[187,62],[110,62],[110,25]],cycle(phase+.5)));
    } else if (journey === 'pixel') {
      if (step === 0) result.particles.push({x:149+Math.cos(u*Math.PI*2)*15,y:87+Math.sin(u*Math.PI*2)*15});
      if (step === 1) { result.particles.push({x:59.4,y:99.4}); result.scan={x:8,y:14+u*107,width:132,height:2}; }
      if (step === 2) [[68,13],[10,121],[136,121]].forEach(function(v,i){result.particles.push(along([v,[59.4,99.4]],cycle(phase+i/3)));});
      if (step === 3) {result.particles.push(along([[36,76],[135,76],[255,76],[301,76]],u));result.channel=segment;}
      if (step === 4) result.particles.push(along([[46,107],[46,80],[169,80],[169,46],[267,46]],u));
      if (step === 5) result.particles.push(along([[35,42],[142,42],[142,72],[267,72]],u));
      if (step === 6) result.particles.push(along([[24,75],[120,75],[164,75],[226,88]],u));
      if (step === 7) {result.particles.push(along([[63,83],[175,83],[267,83]],u));result.scan={x:235,y:44+u*75,width:73,height:2};}
    } else if (journey === 'stacking') {
      if (step === 0) result.particles.push({x:35,y:18+u*124});
      if (step === 1) {result.particles.push({x:55+u*222,y:41});result.scan={x:48+u*239,y:31,width:4,height:23};}
      if (step === 2) {result.gap=3+result.pulse*3;result.particles.push({x:35,y:12+u*140});}
      if (step === 3) {result.particles.push(along([[112,43],[112,71],[171,91]],u));result.particles.push(along([[224,43],[224,19]],cycle(phase+.5)));}
      if (step === 4) {result.particles.push(along([[171,43],[171,70],[171,91]],u));result.particles.push(along([[211,43],[211,70],[211,91]],cycle(phase+.5)));}
      if (step === 5) result.particles.push(along([[132,91],[132,117],[215,117],[215,91]],u));
      if (step === 6) {result.particles.push(along([[89,38],[89,112]],Math.min(1,u*(292/74))));result.particles.push(along([[175,38],[284,38],[284,112],[175,112]],u));}
      if (step === 7) {result.particles.push(along([[171,119],[171,91],[171,43],[171,16]],u));result.particles.push(along([[219,91],[219,43],[219,16]],cycle(phase+.4)));}
    }
    return result;
  }
  function svgText(x,y,text,klass) {return '<text x="'+x+'" y="'+y+'" class="'+(klass||'')+'">'+escapeHTML(text)+'</text>';}
  function marker(count) {return Array.from({length:count},function(_,i){return '<circle data-phase-marker="'+i+'" class="lab-motion-dot lab-motion-dot-'+i+'" cx="0" cy="0" r="4"/>';}).join('');}
  function line(points,klass) {return '<polyline class="lab-signal-path '+(klass||'')+'" points="'+points.map(function(p){return p.join(',');}).join(' ')+'"/>';}
  function box(x,y,w,h,label,active) {return '<rect class="lab-process-box'+(active?' lab-active':'')+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3"/>'+svgText(x+w/2,y+h/2+3,label,active?'lab-svg-text lab-svg-active':'lab-svg-text');}
  function diagram(inner,label,height) {return '<svg class="lab-concept-svg" viewBox="0 0 340 '+(height||155)+'" role="img" aria-label="'+escapeHTML(label)+'">'+inner+'</svg>';}
  function conceptCaption(spec) {return '<div class="lab-motion-caption"><span class="lab-kicker">'+escapeHTML(spec.label)+'</span><span class="lab-motion-status" data-phase-status>'+escapeHTML(spec.stages[0])+'</span></div>';}
  function conceptMath(spec) {return '<div class="lab-concept-math"><strong>'+escapeHTML(spec.formula)+'</strong><p>'+escapeHTML(spec.detail)+'</p></div>';}
  function pagetable(step) {
    var spec=PANEL_STEPS.pagetable[step],idx=pageIndices(VA),fields=['pgd','pud','pmd','pte','offset'];
    var active=Math.max(0,Math.min(3,step-2));
    var bits='<div class="lab-address-bits lab-address-bits-compact">'+fields.map(function(key,i){return '<div class="lab-address-bit'+((step>=2&&i===active)||(step>=5&&i===4)?' lab-active':'')+'"><small>'+key.toUpperCase()+' · '+(i===4?'12':'9')+'b</small>'+(i===4?'0x'+idx[key].toString(16):idx[key])+'</div>';}).join('')+'</div>';
    var inner='';
    [['cpu','tlb'],['tlb','pgd'],['pgd','pud'],['pud','pmd'],['pmd','pte'],['pte','ram'],['ram','cache'],['cache','cpu']].forEach(function(route){inner+=line(route.map(function(id){return PAGE_POINTS[id];}));});
    if(step===5)inner+=line([[187,99],[187,62],[110,62],[110,25]],'lab-return-path');
    Object.keys(PAGE_POINTS).forEach(function(id){var p=PAGE_POINTS[id];inner+=box(p[0]-25,p[1]-15,50,30,({cpu:'CPU',tlb:'TLB',ram:'MEM',cache:'CACHE'})[id]||id.toUpperCase(),spec.active.split('>').indexOf(id)>=0);});
    if(step===1)inner+='<rect data-phase-scan class="lab-scan-bar" x="87" y="10" width="3" height="30"/>';
    inner+=svgText(170,65,step===1?'MISS → 逐级查表':step===5?'翻译可回填 TLB':step===6?'0x2A → CPU':'VA → 页表项 → 下一层基址','lab-svg-annotation');
    inner+=marker(step===5?2:1);
    return '<div class="lab-kicker">CPU 内存访问 · x86-64 · 4 KiB 普通页</div>'+bits+conceptCaption(spec)+diagram(inner,'CPU、TLB 与四级页表的逐级信号路径',132)+conceptMath(spec)+'<p class="lab-small-note">CPU 地址翻译独立示例，不表示 H100 页表。页表基址和数据均为教学数值，假设无缺页、无大页。</p>';
  }
  function pixelGrid(x,y,size,filled,screen) {
    var out='';
    for(var i=0;i<64;i++){
      var col=i%8,row=Math.floor(i/8),target=i===35;
      out+='<rect x="'+(x+col*size)+'" y="'+(y+row*size)+'" width="'+(size-2)+'" height="'+(size-2)+'" rx="1" class="lab-svg-pixel'+(target?' lab-svg-pixel-target':'')+(target&&filled?' lab-svg-pixel-filled':'')+'"/>';
    }
    if(screen)out='<rect class="lab-screen-outline" x="'+(x-5)+'" y="'+(y-5)+'" width="'+(size*8+8)+'" height="'+(size*8+8)+'" rx="4"/>'+out;
    return out;
  }
  function triangle(inner,clip) {
    return '<defs><clipPath id="lab-triangle-clip"><path d="M68 13 10 121 136 121Z"/></clipPath></defs><path class="lab-triangle-fill" d="M68 13 10 121 136 121Z"/>'+(clip?'<g clip-path="url(#lab-triangle-clip)">'+inner+'</g>':inner)+'<path class="lab-weight-lines" d="M68 13 59.4 99.4 10 121M59.4 99.4 136 121"/>'+svgText(68,9,'v₀','lab-svg-a')+svgText(8,137,'v₁','lab-svg-a')+svgText(139,137,'v₂','lab-svg-a')+'<circle cx="59.4" cy="99.4" r="3" class="lab-triangle-target"/>';
  }
  function pixel(step) {
    var spec=PANEL_STEPS.pixel[step],inner='',name='通用图形管线教学示例';
    if(step===0){inner=pixelGrid(101,25,14,false,true)+svgText(167,17,'目标像素 (x=3, y=4)','lab-svg-annotation')+svgText(167,151,'屏幕位置 → 几何来源','lab-svg-annotation')+marker(1);}
    if(step===1){inner=triangle('<rect data-phase-scan class="lab-scan-bar" x="8" y="15" width="132" height="2"/>',true)+svgText(235,56,'inside = true','lab-svg-result')+svgText(235,79,'P 的三个权重均 ≥ 0','lab-svg-annotation')+svgText(235,100,'产生候选片元','lab-svg-annotation')+marker(1);}
    if(step===2){inner=triangle('',false)+svgText(236,35,'w₀ + w₁ + w₂ = 1','lab-svg-annotation')+svgText(236,61,'0.2R + 0.5G + 0.3B','lab-svg-result');['R','G','B'].forEach(function(c,i){inner+='<rect x="'+(182+i*35)+'" y="'+(121-[.2,.5,.3][i]*80)+'" width="23" height="'+([.2,.5,.3][i]*80)+'" class="lab-channel-bar lab-channel-'+i+'"/>'+svgText(193+i*35,138,c,'lab-svg-annotation');});inner+=marker(3);}
    if(step===3){inner=line([[36,76],[135,76],[255,76],[301,76]])+box(20,53,69,46,'c input',false)+box(120,41,93,70,'shade(c)',true);[.2,.5,.3].forEach(function(v,i){inner+='<g data-channel="'+i+'"><rect class="lab-channel-bar lab-channel-'+i+'" x="'+(253+i*25)+'" y="'+(112-v*100)+'" width="17" height="'+(v*100)+'"/>'+svgText(261+i*25,129,['R','G','B'][i],'lab-svg-annotation')+'</g>';});inner+=svgText(165,24,'本例为 passthrough shader','lab-svg-annotation')+marker(1);}
    if(step===4){inner=line([[46,107],[46,80],[169,80],[169,46],[267,46]]);for(var y=0;y<2;y++)for(var x=0;x<2;x++)inner+='<rect x="'+(18+x*31)+'" y="'+(93+y*24)+'" width="29" height="22" class="lab-texture-pixel'+(x===0&&y===1?' lab-texture-selected':'')+'"/>';inner+=svgText(49,82,'texture','lab-svg-annotation')+box(125,24,89,44,'sample(uv)',true)+svgText(269,39,'(1,1,1)','lab-svg-result')+svgText(269,60,'白色纹素','lab-svg-annotation')+svgText(193,119,'c × 1 = c','lab-svg-result')+marker(1);}
    if(step===5){inner=line([[35,42],[142,42],[142,72],[267,72]])+svgText(64,25,'候选 z = 0.4','lab-svg-annotation')+'<rect x="20" y="37" width="88" height="10" class="lab-depth-near"/>'+svgText(71,116,'已存 z = 0.7','lab-svg-annotation')+'<rect x="20" y="94" width="154" height="10" class="lab-depth-far"/>'+box(193,48,73,49,'0.4 < 0.7',true)+svgText(301,79,'PASS','lab-svg-result')+svgText(166,142,'本例采用更小深度优先','lab-svg-annotation')+marker(1);}
    if(step===6){inner=line([[24,75],[120,75],[164,75],[226,88]])+box(11,54,111,43,'RGB(51,128,77)',true)+pixelGrid(185,35,12,true,false)+svgText(231,21,'Framebuffer','lab-svg-annotation')+svgText(231,149,'color + depth = 0.4','lab-svg-annotation')+marker(1);}
    if(step===7){inner=line([[63,83],[175,83],[267,83]])+pixelGrid(25,34,11,true,false)+pixelGrid(236,43,9,true,true)+svgText(69,22,'Framebuffer','lab-svg-annotation')+svgText(274,26,'Display','lab-svg-annotation')+svgText(169,103,'scanout','lab-svg-annotation')+'<rect data-phase-scan class="lab-display-scan" x="235" y="44" width="73" height="2"/>'+marker(1);}
    return '<div class="lab-kicker">通用光栅图形管线 · 与所选计算 GPU 的硬件视图独立</div>'+conceptCaption(spec)+diagram(inner,name,158)+conceptMath(spec)+'<p class="lab-small-note">简化的不透明片元过程；不表示 H100 具有显示输出。跳过 early-Z、MSAA、透视校正和色彩空间转换。</p>';
  }
  var STACK_LAYERS=['散热盖','上层逻辑','混合键合','下层逻辑','内存 / 缓存','封装基板'];
  var STACK_IDS=['lid','logic-top','bond','logic-low','mem-layer','substrate'];
  function stacking(step) {
    var spec=PANEL_STEPS.stacking[step],inner=line([[35,18],[35,145]],'lab-return-path');
    if(step===6){
      inner=line([[89,38],[89,112]],'lab-vertical-route')+line([[175,38],[284,38],[284,112],[175,112]],'lab-horizontal-route');
      inner+=box(59,17,61,20,'上层',true)+box(59,112,61,20,'下层',true)+box(145,17,61,20,'起点',false)+box(145,112,61,20,'终点',false)+svgText(89,150,'短的垂直路径','lab-svg-annotation')+svgText(248,150,'更长的横向绕行','lab-svg-annotation')+marker(2);
    } else {
      STACK_LAYERS.forEach(function(label,i){
        var y=[10,35,62,84,111,137][i],active=spec.active.split('>').indexOf(STACK_IDS[i])>=0;
        inner+='<g data-stack-layer="'+i+'"><rect x="48" y="'+y+'" width="244" height="16" rx="2" class="lab-stack-svg-layer'+(active?' lab-active':'')+(step===7&&i===1?' lab-heat-source':'')+'"/>'+svgText(171,y+11,label,'lab-svg-text')+'</g>';
      });
      if(step===1){for(var c=0;c<8;c++){inner+='<rect x="'+(54+c*29)+'" y="37" width="24" height="12" rx="1" class="lab-core-cell'+(c===5?' lab-core-disabled':'')+'"/>';if(c===5)inner+=svgText(66+c*29,47,'×','lab-core-cross');}inner+='<rect data-phase-scan class="lab-scan-bar" x="48" y="31" width="4" height="23"/>';}
      if(step===4){for(var b=0;b<16;b++)inner+='<circle cx="'+(61+b*14.5)+'" cy="70" r="2" class="lab-bond-point"/>';}
      if(step===5)inner+=line([[132,91],[132,117],[215,117],[215,91]],'lab-return-path');
      if(step===7)inner+=svgText(319,25,'↑ heat','lab-svg-annotation');
      inner+=marker(step===3||step===4||step===7?2:1);
    }
    return '<div class="lab-kicker">通用 3D 逻辑堆叠 · 概念剖面</div>'+conceptCaption(spec)+diagram(inner,'通用六层剖面与当前步骤中的信号或热流',step===2?185:163)+conceptMath(spec)+'<p class="lab-small-note">概念性逻辑堆叠，不表示 H100 的结构。几何与动画仅用于解释，不代表尺寸、时延或热仿真结果。</p>';
  }
  function setVisualPhase(container, phase, progress) {
    if(!container||!caches)return;
    var cache=caches.get(container);if(!cache||cache.journey==='gemm')return;
    var descriptor=visualState(cache.journey,cache.step,phase,progress);if(!descriptor)return;
    var root=cache.root;
    root.dataset.phase=Number(descriptor.phase).toFixed(4);
    root.dataset.active=descriptor.active;
    root.dataset.signal=descriptor.signal;
    root.dataset.segment=String(descriptor.segment);
    if(progress!==undefined)root.dataset.progress=clamp(progress).toFixed(3);
    cache.phaseMarkers.forEach(function(node,i){var p=descriptor.particles[i];if(!p)return;node.setAttribute('cx',p.x.toFixed(2));node.setAttribute('cy',p.y.toFixed(2));node.setAttribute('r',(3.2+descriptor.pulse*.9).toFixed(2));});
    if(descriptor.scan)cache.phaseScans.forEach(function(node){['x','y','width','height'].forEach(function(key){node.setAttribute(key,descriptor.scan[key].toFixed(2));});});
    cache.channels.forEach(function(node){node.classList.toggle('lab-signal-on',Number(node.dataset.channel)===descriptor.channel);});
    if(cache.step===2&&cache.journey==='stacking')cache.stackLayers.forEach(function(node,i){node.setAttribute('transform','translate(0,'+(8+(i-2.5)*descriptor.gap).toFixed(2)+')');});
    if(cache.phaseStatus&&cache.phaseStatus.textContent!==descriptor.signal)cache.phaseStatus.textContent=descriptor.signal;
    cache.lastVisualPhase=Number(phase)||0;
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
        phaseMarkers:Array.from(container.querySelectorAll('[data-phase-marker]')),phaseScans:Array.from(container.querySelectorAll('[data-phase-scan]')),
        phaseStatus:container.querySelector('[data-phase-status]'),channels:Array.from(container.querySelectorAll('[data-channel]')),stackLayers:Array.from(container.querySelectorAll('[data-stack-layer]')),
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
    if (journey !== 'gemm') setVisualPhase(container, cache.lastVisualPhase || 0, progress);
  }
  return { render:render, setProgress:setProgress, setVisualPhase:setVisualPhase, visualState:visualState, PANEL_STEPS:PANEL_STEPS, STYLE:STYLE,
    GEMM:{ A:A, B:B, C:C, row:ROW, col:COL, k:K, tileK:TILE_K, trace:TRACE, tileSums:[19,18], result:C[ROW][COL] },
    multiply:multiply, dotTrace:dotTrace, accumulation:accumulation,
    pageIndices:pageIndices, PAGE:{ va:VA, indices:pageIndices(VA), pageBase:0x12345000, physical:0x12345234 },
    barycentricColor:barycentricColor };
});
