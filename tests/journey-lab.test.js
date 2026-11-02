// Check that the displayed teaching examples are mathematically consistent.
var assert = require('assert');
var L = require('../journey-lab.js');
var passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

test('matrix arithmetic gives the canonical rectangular product', function () {
  assert.deepStrictEqual(L.multiply([[1,2,3],[4,5,6]], [[7,8],[9,10],[11,12]]), [[58,64],[139,154]]);
  assert.throws(function () { L.multiply([[1,2]], [[3,4]]); }, /Incompatible/);
});
test('C[3,7] comes from exactly A row 3 and B column 7', function () {
  var M = L.GEMM;
  assert.strictEqual(M.A.length,4);
  assert.strictEqual(M.B[0].length,8);
  assert.deepStrictEqual(M.A[3],[2,1,3,2,4,1,2,3]);
  assert.deepStrictEqual(M.B.map(function(row){return row[7];}),[1,3,2,4,1,2,3,2]);
  assert.strictEqual(M.C[3][7],37);
  assert.strictEqual(M.result,37);
  assert.deepStrictEqual(M.trace.map(function(t){return t.product;}),[2,3,6,8,4,2,6,6]);
});
test('two K-tiles produce 19 then 37 without double counting', function () {
  var result = [];
  [0,.21,.41,.61,1].forEach(function(p){result.push(L.accumulation(5,p).value);});
  assert.deepStrictEqual(result,[0,2,5,11,19]);
  result = [];
  [0,.21,.41,.61,1].forEach(function(p){result.push(L.accumulation(6,p).value);});
  assert.deepStrictEqual(result,[19,23,25,31,37]);
  assert.strictEqual(L.accumulation(6,1).complete,true);
  assert.strictEqual(L.accumulation(7,0).value,37);
  assert.strictEqual(L.accumulation(3,.9).value,0);
});
test('scrubbing clamps at numerical boundaries', function () {
  assert.strictEqual(L.accumulation(5,-10).value,0);
  assert.strictEqual(L.accumulation(6,100).value,37);
  assert.strictEqual(L.accumulation(5,NaN).value,0);
});
test('x86 page indices reconstruct all 48 bits without JS 32-bit shifts', function () {
  var address = 0x123456789abc;
  var i = L.pageIndices(address);
  assert.strictEqual(i.pgd * Math.pow(2,39) + i.pud * Math.pow(2,30) + i.pmd * Math.pow(2,21) + i.pte * 4096 + i.offset, address);
  assert.deepStrictEqual(L.PAGE.indices,{pgd:0,pud:1,pmd:504,pte:1,offset:0x234});
  assert.strictEqual(L.PAGE.pageBase + L.PAGE.indices.offset,L.PAGE.physical);
  assert.throws(function(){L.pageIndices(Math.pow(2,48));});
});
test('RGB interpolation preserves barycentric normalization and primary contributions', function () {
  assert.deepStrictEqual(L.barycentricColor([.2,.5,.3],[[1,0,0],[0,1,0],[0,0,1]]),[.2,.5,.3]);
  assert.deepStrictEqual(L.barycentricColor([0,1,0],[[1,0,0],[0,1,0],[0,0,1]]),[0,1,0]);
});
test('all non-GEMM steps have math and a distinct semantic activity', function () {
  assert.deepStrictEqual(Object.keys(L.PANEL_STEPS), ['pagetable','pixel','stacking']);
  assert.strictEqual(L.PANEL_STEPS.pagetable.length,7);
  assert.strictEqual(L.PANEL_STEPS.pixel.length,8);
  assert.strictEqual(L.PANEL_STEPS.stacking.length,8);
  Object.keys(L.PANEL_STEPS).forEach(function(journey){
    L.PANEL_STEPS[journey].forEach(function(spec){
      assert.ok(spec.formula.length>10,journey+' needs explanatory math');
      assert.ok(spec.detail.length>20,journey+' needs an annotation');
      assert.strictEqual(spec.stages.length,3);
    });
  });
});
Object.keys(L.PANEL_STEPS).forEach(function(journey){
  L.PANEL_STEPS[journey].forEach(function(spec,step){
    test(journey+' step '+step+': signal moves at fixed completed progress, freezes at equal phase',function(){
      var first=L.visualState(journey,step,.17,1),later=L.visualState(journey,step,.67,1);
      assert.strictEqual(first.active,spec.active);
      assert.ok(first.particles.length>0,'each step must draw a signal');
      assert.notDeepStrictEqual({particles:first.particles,scan:first.scan,gap:first.gap,channel:first.channel},{particles:later.particles,scan:later.scan,gap:later.gap,channel:later.channel},'signals or scans must keep moving after step progress reaches1');
      assert.deepStrictEqual(L.visualState(journey,step,.17,1),first,'same phase must be an exact freeze');
      first.particles.concat(later.particles).forEach(function(p){
        assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),'finite SVG positions');
        assert.ok(p.x>=0&&p.x<=340&&p.y>=0&&p.y<=185,'signal stays inside figure');
      });
      assert.notStrictEqual(first.signal,later.signal,'step annotations follow the animated signal');
    });
  });
});
test('page traversal follows the actual CPU→TLB→PGD→PUD→PMD→PTE path',function(){
  var ids=['cpu','tlb','pgd','pud','pmd','pte>tlb','ram>cache>cpu'];
  ids.forEach(function(id,i){assert.strictEqual(L.visualState('pagetable',i,0,1).active,id);});
  assert.deepStrictEqual(L.visualState('pagetable',2,0,1).particles[0],{x:110,y:25});
  assert.deepStrictEqual(L.visualState('pagetable',5,0,1).particles[0],{x:264,y:99});
  assert.strictEqual(L.visualState('pagetable',6,.99,1).particles[0].x,33);
});
test('stacking geometry comparison uses the same displayed signal speed',function(){
  var p=L.visualState('stacking',6,.1,1).particles;
  assert.ok(Math.abs((p[0].y-38)-(p[1].x-175))<1e-9);
  p=L.visualState('stacking',6,.5,1).particles;
  assert.deepStrictEqual(p[0],{x:89,y:112},'short path has finished');
  assert.notDeepStrictEqual(p[1],{x:175,y:112},'long path is still travelling');
});
test('expanded stack layers remain inside their SVG without overlapping the caption',function(){
  [0,.25,.5,.75,.99].forEach(function(phase){
    var gap=L.visualState('stacking',2,phase,1).gap;
    assert.ok(10+8-2.5*gap>=0,'top layer stays in the viewport');
    assert.ok(137+16+8+2.5*gap<=185,'bottom layer stays in the viewport');
  });
});
test('pixel shader cycles actual RGB channel emphasis while final color stays fixed',function(){
  assert.strictEqual(L.visualState('pixel',3,.1,1).channel,0);
  assert.strictEqual(L.visualState('pixel',3,.5,1).channel,1);
  assert.strictEqual(L.visualState('pixel',3,.9,1).channel,2);
  assert.deepStrictEqual(L.barycentricColor([.2,.5,.3],[[1,0,0],[0,1,0],[0,0,1]]).map(function(x){return Math.round(x*255);}),[51,128,77]);
  assert.strictEqual(L.GEMM.result,37);
});
console.log('Journey lab: ' + passed + ' tests passed');
