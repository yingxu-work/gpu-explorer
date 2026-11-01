const test=require('node:test');
const assert=require('node:assert/strict');
const story=require('../lesson-story.js');
test('the first three steps distinguish target, dependency and placement from memory transfer',()=>{
  assert.deepEqual(story.STEPS.slice(0,3).map(s=>s.kind),['target','dependency','placement']);
  assert.match(story.STEPS[1].caption,/尚未搬运/);assert.match(story.STEPS[2].caption,/输入仍在显存/);
  assert.equal(story.STEPS[3].kind,'transfer');assert.ok(story.STEPS[3].nodes.includes('L2'));
});
test('every step has a readable phase, persistent path and meaningful completed state',()=>{
  assert.equal(story.STEPS.length,8);
  for(const step of story.STEPS){assert.ok(step.phase.length<=8);assert.ok(step.nodes.length>=3&&step.nodes.length<=4);assert.ok(step.complete.length>0);assert.ok(step.caption.length<=40);}
  assert.equal(story.STEPS[7].kind,'writeback');assert.match(story.STEPS[7].nodes.at(-1),/C\[3,7\]/);
});
