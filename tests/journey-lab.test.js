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
console.log('Journey lab: ' + passed + ' tests passed');
