const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../interaction-state.js');
const S = require('../state.js');
const base = { journey: 'gemm', stepIndex: 0, atEnd: false, reducedMotion: false, speed: 1 };
function act(ui, type, fields = {}, context = base) {
  return I.transition(ui, { type, ...fields }, context);
}
function cleanGuide(ui, level) {
  assert.equal(ui.mode, 'learn'); assert.equal(ui.level, level);
  assert.equal(ui.explode, 0); assert.equal(ui.explodeAuto, false);
  assert.equal(ui.isolated, false); assert.equal(ui.selection, null);
  assert.equal(ui.cameraPreset, 'three-quarter');
}
test('SM isolation → Learn restores the current lesson, even after camera and dissection', () => {
  let ui = I.create({}, base);
  ui = act(ui, 'LEVEL', { level: 'sm' });
  ui = act(ui, 'SELECT', { id: 'tensor' });
  ui = act(ui, 'ISOLATE');
  ui = act(ui, 'CAMERA', { preset: 'top' });
  assert.equal(ui.isolated, true);
  ui = act(ui, 'ENTER_GUIDE');
  cleanGuide(ui, 'board');
  assert.equal(ui.playback, 'step'); assert.equal(ui.progress, 0);
});
test('every GEMM step has a canonical view, independent of previous exploration', () => {
  for (let stepIndex = 0; stepIndex < 8; stepIndex++) {
    const context = { ...base, stepIndex };
    let ui = I.create({ mode: 'explore', level: 'sm', explode: .85, selection: 'tensor' }, context);
    ui = act(ui, 'ISOLATE', {}, context);
    ui = act(ui, 'ENTER_GUIDE', {}, context);
    cleanGuide(ui, I.GEMM_LEVELS[stepIndex]);
  }
});
test('reclicking Learn forces restoration and a fresh camera revision', () => {
  let ui = I.create({}, base), revision = ui.guideRevision;
  ui = act(ui, 'ENTER_GUIDE');
  assert.equal(ui.guideRevision, revision + 1);
  ui = act(ui, 'TICK', { dt: 100 }); assert.ok(ui.progress > 0);
  ui = act(ui, 'ENTER_GUIDE'); assert.equal(ui.progress, 0);
  cleanGuide(ui, 'board');
});
test('automatic dissection cannot keep mutating a re-entered lesson', () => {
  let ui = act(I.create({}, base), 'EXPLODE_TOGGLE');
  for (let i = 0; i < 12; i++) ui = act(ui, 'TICK', { dt: 100 });
  assert.ok(ui.explode > .4); assert.equal(ui.mode, 'explore');
  ui = act(ui, 'ENTER_GUIDE');
  for (let i = 0; i < 80; i++) ui = act(ui, 'TICK', { dt: 100 });
  cleanGuide(ui, 'board');
});
test('mechanical dissection from an isolated functional SM opens the package instead', () => {
  for (const type of ['EXPLODE_SET', 'EXPLODE_TOGGLE']) {
    let ui = I.create({ mode: 'explore', level: 'sm', selection: 'tensor' }, base);
    ui = act(ui, 'ISOLATE'); ui = act(ui, type, { value: .7 });
    assert.equal(ui.level, 'package'); assert.equal(ui.isolated, false);
    assert.equal(ui.selection, null); assert.equal(ui.mode, 'explore');
  }
});
test('hardware actions pause sequence playback; presentation preferences need no mode transition', () => {
  for (const [type, fields] of [['LEVEL',{level:'die'}],['SELECT',{id:'hbm'}],['NAVIGATE',{}],['CAMERA',{preset:'top'}],['EXPLODE_SET',{value:.5}]]) {
    let ui = act(I.create({}, base), 'ENTER_GUIDE', { playback: 'sequence' });
    ui = act(ui, type, fields);
    assert.equal(ui.mode, 'explore'); assert.equal(ui.playback, 'paused');
    assert.equal(ui.explodeAuto, false);
  }
});
test('replay cancels sequence advancement and stays on the same domain step', () => {
  const context = { ...base, stepIndex: 5 };
  let ui = act(I.create({}, context), 'ENTER_GUIDE', { playback: 'sequence' }, context);
  ui = act(ui, 'ENTER_GUIDE', {}, context);
  for (let i = 0; i < 80; i++) { ui = act(ui, 'TICK', {dt:100}, context); assert.equal(ui.advanceRequested, false); }
  assert.equal(ui.playback, 'paused'); assert.equal(ui.progress, 1);
  cleanGuide(ui, 'sm');
});
test('pause freezes progress and resuming sequence continues from that point', () => {
  let ui = I.create({}, base);
  for (let i=0;i<10;i++) ui=act(ui,'TICK',{dt:100});
  const p=ui.progress; ui=act(ui,'PAUSE');
  for (let i=0;i<30;i++) ui=act(ui,'TICK',{dt:100});
  assert.equal(ui.progress,p); ui=act(ui,'RESUME_SEQUENCE'); ui=act(ui,'TICK',{dt:100});
  assert.ok(ui.progress>p); assert.equal(ui.playback,'sequence');
});
test('timeline/domain navigation always re-enters the guide at the selected step', () => {
  const domain=S.createState({});
  let ui=I.create({mode:'explore',level:'sm',explode:.75,selection:'tensor'},base);
  ui=act(ui,'ISOLATE');
  S.goto(domain,3); ui=act(ui,'ENTER_GUIDE',{}, {...base,stepIndex:domain.stepIndex});
  cleanGuide(ui,'package'); assert.equal(domain.stepIndex,3);
  S.setJourney(domain,'pagetable'); ui=act(ui,'ENTER_GUIDE',{}, {...base,journey:domain.journey,stepIndex:domain.stepIndex});
  cleanGuide(ui,'board'); assert.equal(domain.stepIndex,0);
});
test('reduced-motion autoplay has finite dwell and reaches every step without stalling', () => {
  let stepIndex=0;
  let context={...base,reducedMotion:true};
  let ui=act(I.create({},context),'ENTER_GUIDE',{playback:'sequence'},context);
  for(let frame=0;frame<250;frame++){
    context={...context,stepIndex,atEnd:stepIndex===7};
    ui=act(ui,'TICK',{dt:100},context);
    assert.equal(ui.progress,1);
    if(ui.advanceRequested){stepIndex++;ui=act(ui,'ENTER_GUIDE',{playback:'sequence'},{...context,stepIndex});}
  }
  assert.equal(stepIndex,7);assert.equal(ui.playback,'paused');
});
test('ordinary sequence stops at the last step rather than looping', () => {
  let stepIndex=0, context={...base,speed:2};
  let ui=act(I.create({},context),'ENTER_GUIDE',{playback:'sequence'},context);
  for(let frame=0;frame<600;frame++){
    context={...context,stepIndex,atEnd:stepIndex===7};ui=act(ui,'TICK',{dt:100},context);
    if(ui.advanceRequested){stepIndex++;ui=act(ui,'ENTER_GUIDE',{playback:'sequence'},{...context,stepIndex});}
  }
  assert.equal(stepIndex,7);assert.equal(ui.progress,1);assert.equal(ui.playback,'paused');
});
test('Play restarts from the last step even while its single-step animation is unfinished', () => {
  const final={...base,stepIndex:7,atEnd:true};
  let ui=I.create({},final);assert.equal(ui.progress,0);
  assert.equal(I.sequenceIntent(ui,final),'restart');
  ui=act(ui,'TICK',{dt:100},final);assert.equal(I.sequenceIntent(ui,final),'restart');
  ui=act(ui,'RESUME_SEQUENCE',{},final);assert.equal(I.sequenceIntent(ui,final),'pause');
  ui=I.create({},base);assert.equal(I.sequenceIntent(ui,base),'resume');
  ui=act(ui,'ENTER_EXPLORE');assert.equal(I.sequenceIntent(ui,base),'replay');
});
test('exploration links restore physical context; lesson links normalize conflicting geometry', () => {
  let ui=I.create({mode:'explore',level:'package',explode:.75,selection:'hbm'},base);
  assert.equal(ui.explode,.75);assert.equal(ui.selection,'hbm');assert.equal(ui.level,'package');
  ui=I.create({mode:'learn',level:'sm',explode:.75,selection:'tensor'},base);
  cleanGuide(ui,'board');
  ui=I.create({mode:'explore',level:'invalid',explode:Infinity},base);
  assert.equal(ui.level,'board');assert.ok(Number.isFinite(ui.explode));
});
test('automatic dissection ends assembled with its play state reset', () => {
  let ui=act(I.create({},base),'EXPLODE_TOGGLE');
  for(let i=0;i<80;i++)ui=act(ui,'TICK',{dt:100});
  assert.equal(ui.explodeAuto,false);assert.equal(ui.explode,0);assert.equal(ui.playback,'paused');
});
test('closing the selected component also exits isolation', () => {
  let ui=I.create({mode:'explore',level:'sm',selection:'tensor'},base);
  ui=act(ui,'ISOLATE');assert.equal(ui.isolated,true);
  ui=act(ui,'SELECT',{id:null});assert.equal(ui.selection,null);assert.equal(ui.isolated,false);
});
test('changing isolated component or changing scale clears isolation consistently', () => {
  let ui=I.create({mode:'explore',level:'sm',selection:'tensor'},base);
  ui=act(ui,'ISOLATE');ui=act(ui,'SELECT',{id:'hbm'});
  assert.equal(ui.isolated,false);
  ui=act(ui,'ISOLATE');ui=act(ui,'SCENE_LEVEL',{level:'package'});
  assert.equal(ui.isolated,false);assert.equal(ui.level,'package');
});
test('opening an SM clears mechanical explosion; pausing cancels automatic dissection', () => {
  let ui=I.create({mode:'explore',level:'package',explode:.8},base);
  ui=act(ui,'LEVEL',{level:'sm'});assert.equal(ui.explode,0);
  ui=act(ui,'EXPLODE_TOGGLE');assert.equal(ui.explodeAuto,true);
  ui=act(ui,'PAUSE');assert.equal(ui.explodeAuto,false);
});
test('explore reset clears selection, isolation, dissection and camera preset together', () => {
  let ui=I.create({mode:'explore',level:'die',explode:.7,selection:'sm'},base);
  ui=act(ui,'ISOLATE');ui=act(ui,'CAMERA',{preset:'top'});ui=act(ui,'EXPLORE_RESET');
  assert.equal(ui.level,'die');assert.equal(ui.selection,null);assert.equal(ui.isolated,false);
  assert.equal(ui.explode,0);assert.equal(ui.explodeAuto,false);assert.equal(ui.cameraPreset,'three-quarter');
});
test('seeded mixed click patterns preserve guide/anatomy exclusivity for 12000 actions', () => {
  let seed=937,ui=I.create({},base);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const events=[()=>({type:'LEVEL',level:LEVELS[Math.floor(random()*4)]}),()=>({type:'SELECT',id:'tensor'}),()=>({type:'ISOLATE'}),()=>({type:'EXPLODE_SET',value:random()}),()=>({type:'EXPLODE_TOGGLE'}),()=>({type:'ENTER_GUIDE',playback:random()<.4?'sequence':'step'}),()=>({type:'NAVIGATE'}),()=>({type:'MOTION_TOGGLE'}),()=>({type:'TICK',dt:100}),()=>({type:'EXPLORE_RESET'}),()=>({type:'PAUSE'})];
  const LEVELS=I.LEVELS;
  for(let i=0;i<12000;i++){
    const context={...base,stepIndex:Math.floor(random()*8),reducedMotion:random()<.1};
    ui=I.transition(ui,events[Math.floor(random()*events.length)](),context);
    assert.ok(ui.progress>=0&&ui.progress<=1);assert.ok(ui.explode>=0&&ui.explode<=1);
    if(ui.mode==='learn'){assert.equal(ui.isolated,false);assert.equal(ui.selection,null);assert.equal(ui.explode,0);assert.equal(ui.explodeAuto,false);}
    else assert.equal(ui.playback,'paused');
    if(ui.explodeAuto)assert.equal(ui.mode,'explore');
  }
});
