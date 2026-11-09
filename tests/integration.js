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
      'explode-slider','explode-auto-btn','overview','play-btn','prev-btn','next-btn',
      'focus-btn','isolate-btn','home-btn','labels-btn','paths-btn','replay-btn','motion-btn',
      'help-dialog','sources-dialog','crumb','teaching-status','route-nodes','explore-title','explore-description','rotate-btn','pan-btn','selection-enter','sm-resource-legend','sm-resource-items']) {
      assert.ok(index.body.includes('id="' + id + '"'), 'missing public control: ' + id);
    }
    assert.ok(index.body.includes('data-lang="zh"') && index.body.includes('data-lang="en"'), 'visible language switch');
    for (const level of ['board','package','die','sm','hbm','power','interconnect']) {
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
      for (const match of result.body.matchAll(/from\s+['"](\.\.?\/[^'"]+\.js)(?:\?[^'"]*)?['"]/g)) {
        assets.add(path.posix.resolve(path.posix.dirname(asset), match[1]));
      }
    }
    assert.strictEqual((await get(port, '/missing.html')).status, 404);
    assert.ok(index.body.includes('./three/three.module.js'), 'Three.js must remain local');
    assert.ok(index.body.indexOf('i18n.js') < index.body.indexOf('state.js'), 'dictionary loads before content');
    assert.ok(index.body.indexOf('journey-lab.js') < index.body.indexOf('app.js'), 'numeric lab must load before controller');
    // One asset version for every local script, stylesheet and module import, so a deploy loads consistently.
    const versions = new Set([...index.body.matchAll(/\?v=(\w+)/g)].map(m => m[1]));
    for (const file of ['scene3d.js','hardware-model.js','teaching-flow.js','hbm-model.js','power-model.js','interconnect-model.js']) for (const m of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/\?v=(\w+)/g)) versions.add(m[1]);
    assert.strictEqual(versions.size, 1, 'mixed asset versions: ' + [...versions].join(', '));

    // Shared links retain the computation across anatomy/UI parameters.
    const restored = S.decodeState('#j=gemm&m=a100&s=5&sel=smem&cmp=h100&level=sm&mode=learn&x=65&lang=en');
    assert.strictEqual(restored.journey,'gemm'); assert.strictEqual(restored.model,'a100');
    assert.strictEqual(restored.stepIndex,5); assert.strictEqual(restored.selected,'smem');
    assert.strictEqual(restored.compareModel,'h100');
    assert.deepStrictEqual(S.decodeState('#' + S.encodeState(restored)),restored);
    S.setJourney(restored,'pagetable'); assert.strictEqual(restored.stepIndex,0);
    while (!S.isAtEnd(restored)) S.next(restored);
    assert.strictEqual(S.currentStep(restored).id,'return');

    // The lesson's displayed arithmetic must agree with an independently evaluated dot product.
    const a = L.GEMM.A[L.GEMM.row];
    const b = L.GEMM.B.map(row => row[L.GEMM.col]);
    const expected = a.reduce((sum, value, k) => sum + value*b[k],0);
    assert.strictEqual(expected,37); assert.strictEqual(L.accumulation(7,1).value,expected);
    assert.strictEqual(L.GEMM.tileSums.reduce((x,y) => x+y,0),expected);
    assert.strictEqual('0x' + L.physicalAddress(L.PAGE.pageBase, L.PAGE.va, 21).toString(16), L.PAGE.physical);
    console.log('INTEGRATION OK: served assets, public controls, shared state and numeric lessons');
    server.close();
  } catch (error) {
    console.error('INTEGRATION FAIL:',error);
    server.close(); process.exitCode=1;
  }
});
