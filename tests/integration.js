// Integration test: serve the static app locally, fetch it, and simulate
// a full user flow through the shared state machine.
// Run: node tests/integration.js  (exits non-zero on any failure)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../state.js');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const p = path.join(root, file);
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'text/plain' });
  fs.createReadStream(p).pipe(res);
});

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    const index = await get(port, '/');
    assert.equal(index.status, 200);
    for (const marker of ['GPU Explorer', 'model-select', 'compare-select', 'compare-diagram', 'diagram', 'scene3d', 'scene3d.js', 'scene-map.js', 'three.module.js', 'explode-slider', 'explode-auto-btn', 'block-list', 'overview', 'play-btn', 'state.js', 'app.js', 'sidebar', 'inspector', 'bottombar', 'data-journey', 'cam-bar', 'data-cam', 'crumb', 'journey-gloss', 'phase-gloss', 'predict-details', 'code-details', 'legend-row']) {
      assert.ok(index.body.includes(marker), 'index missing: ' + marker);
    }
    for (const asset of ['/state.js', '/app.js', '/scene-map.js', '/scene3d.js', '/three/three.module.js', '/three/addons/controls/OrbitControls.js', '/styles.css']) {
      const r = await get(port, asset);
      assert.equal(r.status, 200, asset + ' should serve');
      assert.ok(r.body.length > 200, asset + ' should not be empty');
    }
    const missing = await get(port, '/nope.html');
    assert.equal(missing.status, 404);

    // Full simulated user flow: GEMM -> step to end -> view switch preserves
    // -> switch journey -> page-table flow -> model switch preserves step.
    const s = S.createState({});
    assert.equal(S.currentJourney(s).title.includes('矩阵乘法'), true);
    while (!S.isAtEnd(s)) S.next(s);
    assert.equal(S.currentStep(s).title, '写回 C[3,7]');
    S.setView(s, 'data'); assert.equal(s.stepIndex, S.currentJourney(s).steps.length - 1);
    S.setJourney(s, 'pagetable');
    while (!S.isAtEnd(s)) S.next(s);
    assert.equal(S.currentStep(s).title, '内存访问与缓存装入');
    S.setModel(s, 'a20pro'); assert.equal(s.journey, 'pagetable'); assert.equal(S.isAtEnd(s), true);
    console.log('INTEGRATION OK: http serve + full user flow passed (port ' + port + ')');
    server.close(); process.exit(0);
  } catch (e) {
    console.error('INTEGRATION FAIL:', e);
    server.close(); process.exit(1);
  }
});
