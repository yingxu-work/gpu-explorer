// Static resource + public-state contract checks. Browser/WebGL QA is separate.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../state.js');
const L = require('../journey-lab.js');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  const p = path.resolve(root, '.' + file);
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, res => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }));
    }).on('error', reject);
  });
}
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    const index = await get(port, '/');
    assert.strictEqual(index.status, 200);
    // Public UI targets the controller depends on. Behavior is verified in a browser.
    for (const id of ['model-select','compare-select','scene3d','component-tree','journey-lab',
      'explode-slider','explode-auto-btn','block-list','overview','play-btn','prev-btn','next-btn',
      'focus-btn','isolate-btn','home-btn','labels-btn','follow-camera','replay-btn','motion-btn',
      'help-dialog','sources-dialog','crumb']) {
      assert.ok(index.body.includes('id="' + id + '"'), 'missing public control: ' + id);
    }
    for (const level of ['board','package','die','sm']) {
      assert.ok(index.body.includes('data-level="' + level + '"'), 'missing anatomy level: ' + level);
    }
    // Follow all local script/style references, then the ESM imports they use.
    const assets = new Set(['/hardware-model.js','/three/three.module.js','/three/addons/controls/OrbitControls.js']);
    for (const match of index.body.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^"#]*)?)"/g)) {
      if (!match[1].includes('://')) assets.add('/' + match[1].replace(/^\.\//, '').split('?')[0]);
    }
    for (const asset of assets) {
      const result = await get(port, asset);
      assert.strictEqual(result.status, 200, 'asset must serve: ' + asset);
      assert.ok(result.body.length > 100, 'empty asset: ' + asset);
      assert.ok(result.type === (asset.endsWith('.js') ? 'text/javascript' : 'text/css'), 'correct MIME: ' + asset);
    }
    assert.strictEqual((await get(port, '/missing.html')).status, 404);
    assert.ok(index.body.includes('./three/three.module.js'), 'Three.js must remain local');
    assert.ok(index.body.includes('journey-lab.js'), 'numeric lab must load before controller');

    // Shared links retain the computation across anatomy/UI parameters.
    const restored = S.decodeState('#j=gemm&m=a100&v=data&s=5&sel=smem&cmp=h100&level=sm&mode=learn&x=65');
    assert.strictEqual(restored.journey,'gemm'); assert.strictEqual(restored.model,'a100');
    assert.strictEqual(restored.stepIndex,5); assert.strictEqual(restored.selected,'smem');
    assert.strictEqual(restored.compareModel,'h100');
    assert.deepStrictEqual(S.decodeState('#' + S.encodeState(restored)),restored);
    S.setModel(restored,'h100'); assert.strictEqual(restored.compareModel,null);
    S.setView(restored,'structure'); assert.strictEqual(restored.stepIndex,5);
    S.setJourney(restored,'pagetable'); assert.strictEqual(restored.stepIndex,0);
    assert.strictEqual(restored.selected,null);
    while (!S.isAtEnd(restored)) S.next(restored);
    assert.strictEqual(S.currentStep(restored).title,'内存访问与缓存装入');

    // The lesson's displayed arithmetic must agree with an independently evaluated dot product.
    const a = L.GEMM.A[L.GEMM.row];
    const b = L.GEMM.B.map(row => row[L.GEMM.col]);
    const expected = a.reduce((sum, value, k) => sum + value*b[k],0);
    assert.strictEqual(expected,37); assert.strictEqual(L.accumulation(7,1).value,expected);
    assert.strictEqual(L.GEMM.tileSums.reduce((x,y) => x+y,0),expected);
    const indices = L.pageIndices(L.PAGE.va);
    assert.strictEqual(indices.offset, L.PAGE.va % 4096);
    assert.strictEqual(L.PAGE.physical,L.PAGE.pageBase + indices.offset);
    console.log('INTEGRATION OK: served assets, public controls, shared state and numeric lessons');
    server.close();
  } catch (error) {
    console.error('INTEGRATION FAIL:',error);
    server.close(); process.exitCode=1;
  }
});
