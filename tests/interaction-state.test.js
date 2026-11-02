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
test('initial Learn opens Anatomy at the board instead of adopting the lesson view', () => {
  for (const context of [base, { ...base, stepIndex: 5 }, { ...base, journey: 'pixel', stepIndex: 3 }]) {
    let ui = I.create({ mode: 'learn', level: 'sm', explode: .8, selection: 'tensor' }, context);
    ui = act(ui, 'ENTER_EXPLORE', {}, context);
    assert.equal(ui.mode, 'explore'); assert.equal(ui.level, 'board');
    assert.equal(ui.selection, null); assert.equal(ui.isolated, false); assert.equal(ui.explode, 0);
    assert.equal(ui.cameraPreset, 'three-quarter'); assert.equal(ui.playback, 'paused');
  }
});
test('Anatomy → Learn → Anatomy restores level, selection, isolation, explosion and camera preset', () => {
  let ui = I.create({ mode: 'explore', level: 'hbm', explode: .72, selection: 'hbm-dram' }, base);
  ui = act(ui, 'ISOLATE'); ui = act(ui, 'CAMERA', { preset: 'top' });
  const remembered = { level: 'hbm', selection: 'hbm-dram', isolated: true, explode: .72, cameraPreset: 'top' };
  ui = act(ui, 'ENTER_GUIDE', {}, { ...base, stepIndex: 5 });
  cleanGuide(ui, 'sm'); assert.deepEqual(ui.anatomy, remembered);
  ui = act(ui, 'ENTER_EXPLORE');
  for (const [key, value] of Object.entries(remembered)) assert.equal(ui[key], value, key);
  assert.equal(ui.mode, 'explore'); assert.equal(ui.motionPlaying, false);
  assert.equal(ui.playback, 'paused'); assert.equal(ui.explodeAuto, false);
});
test('guide replay, next step and guide camera changes preserve the remembered Anatomy context', () => {
  let ui = I.create({ mode: 'explore', level: 'power', explode: .46, selection: 'power-inductor' }, base);
  ui = act(ui, 'CAMERA', { preset: 'side' }); ui = act(ui, 'ENTER_GUIDE');
  const remembered = { ...ui.anatomy };
  for (const stepIndex of [1, 5, 6, 0]) {
    const context = { ...base, stepIndex };
    ui = act(ui, 'ENTER_GUIDE', { playback: 'sequence' }, context);
    ui = act(ui, 'TICK', { dt: 100 }, context);
    ui = act(ui, 'CAMERA', { preset: 'top' }, context);
    ui = act(ui, 'NAVIGATE', {}, context);
    assert.deepEqual(ui.anatomy, remembered);
  }
  ui = act(ui, 'ENTER_EXPLORE');
  for (const [key, value] of Object.entries(remembered)) assert.equal(ui[key], value, key);
});
test('explicit hardware actions in Learn apply their target instead of restoring previous Anatomy', () => {
  const context = { ...base, stepIndex: 5 };
  const start = () => act(I.create({ mode: 'explore', level: 'power', selection: 'power-stage', explode: .8 }, base), 'ENTER_GUIDE', {}, context);
  let ui = act(start(), 'LEVEL', { level: 'die' }, context);
  assert.equal(ui.level, 'die'); assert.equal(ui.selection, null); assert.equal(ui.mode, 'explore');
  ui = act(start(), 'SELECT', { id: 'registers', level: 'sm' }, context);
  assert.equal(ui.level, 'sm'); assert.equal(ui.selection, 'registers'); assert.equal(ui.isolated, false);
  ui = act(start(), 'EXPLODE_SET', { value: .25 }, context);
  assert.equal(ui.level, 'package'); assert.equal(ui.explode, .25); assert.equal(ui.selection, null);
  ui = act(start(), 'EXPLODE_TOGGLE', {}, context);
  assert.equal(ui.level, 'package'); assert.equal(ui.explodeAuto, true);
});
test('reclicking Anatomy preserves current exploration and the next guide entry remembers it', () => {
  let ui = I.create({ mode: 'explore', level: 'hbm', selection: 'hbm-tsv', explode: .5 }, base);
  ui = act(ui, 'ENTER_GUIDE'); ui = act(ui, 'LEVEL', { level: 'interconnect' });
  ui = act(ui, 'SELECT', { id: 'link-vias' }); ui = act(ui, 'CAMERA', { preset: 'side' });
  ui = act(ui, 'ENTER_EXPLORE');
  assert.equal(ui.level, 'interconnect'); assert.equal(ui.selection, 'link-vias');
  ui = act(ui, 'ENTER_GUIDE'); ui = act(ui, 'ENTER_EXPLORE');
  assert.equal(ui.level, 'interconnect'); assert.equal(ui.selection, 'link-vias'); assert.equal(ui.cameraPreset, 'side');
});
test('returning to Anatomy restores a static assembly without reviving automatic dissection', () => {
  let ui = act(I.create({ mode: 'explore', level: 'package' }, base), 'EXPLODE_TOGGLE');
  for (let i = 0; i < 9; i++) ui = act(ui, 'TICK', { dt: 100 });
  const exploded = ui.explode;
  ui = act(ui, 'ENTER_GUIDE', { playback: 'sequence' }); ui = act(ui, 'ENTER_EXPLORE');
  assert.equal(ui.explode, exploded); assert.equal(ui.explodeAuto, false);
  const phase = ui.visualPhase;
  for (let i = 0; i < 30; i++) ui = act(ui, 'TICK', { dt: 100 });
  assert.equal(ui.explode, exploded); assert.equal(ui.visualPhase, phase);
  assert.equal(ui.advanceRequested, false); assert.equal(ui.playback, 'paused');
});
test('saved Anatomy context is immutable and keeps all camera preset values', () => {
  for (const preset of ['three-quarter', 'top', 'side', 'free']) {
    const source = act(I.create({ mode: 'explore', level: 'die', selection: 'l2' }, base), 'CAMERA', { preset });
    const original = JSON.stringify(source);
    let ui = act(source, 'ENTER_GUIDE');
    ui = act(ui, 'CAMERA', { preset: 'top' }); ui = act(ui, 'ENTER_GUIDE');
    assert.equal(JSON.stringify(source), original);
    ui = act(ui, 'ENTER_EXPLORE'); assert.equal(ui.cameraPreset, preset);
  }
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
  for (const [type, fields] of [['LEVEL',{level:'die'}],['SELECT',{id:'hbm'}],['EXPLODE_SET',{value:.5}]]) {
    let ui = act(I.create({}, base), 'ENTER_GUIDE', { playback: 'sequence' });
    ui = act(ui, type, fields);
    assert.equal(ui.mode, 'explore'); assert.equal(ui.playback, 'paused');
    assert.equal(ui.explodeAuto, false);
  }
});
test('camera presets and orbit preserve guide step, clock, sequence and revision', () => {
  const context={...base,stepIndex:5};
  let ui=act(I.create({},context),'ENTER_GUIDE',{playback:'sequence'},context);
  ui=act(ui,'TICK',{dt:100},context);
  const progress=ui.progress,revision=ui.guideRevision;
  for(const preset of ['top','side','three-quarter']){
    ui=act(ui,'CAMERA',{preset},context);
    assert.equal(ui.mode,'learn');assert.equal(ui.playback,'sequence');assert.equal(ui.progress,progress);
    assert.equal(ui.guideRevision,revision);assert.equal(ui.level,'sm');assert.equal(ui.cameraPreset,preset);
  }
  ui=act(ui,'NAVIGATE',{},context);
  assert.equal(ui.mode,'learn');assert.equal(ui.playback,'sequence');assert.equal(ui.cameraPreset,'free');
  assert.equal(ui.progress,progress);assert.equal(ui.guideRevision,revision);
  ui=act(ui,'TICK',{dt:100},context);assert.ok(ui.progress>progress);
});
test('camera changes while paused never resume or restart the lesson', () => {
  let ui=I.create({},base);ui=act(ui,'TICK',{dt:100});ui=act(ui,'PAUSE');
  const progress=ui.progress,revision=ui.guideRevision;
  ui=act(ui,'CAMERA',{preset:'top'});ui=act(ui,'NAVIGATE');
  assert.equal(ui.mode,'learn');assert.equal(ui.playback,'paused');assert.equal(ui.progress,progress);
  assert.equal(ui.guideRevision,revision);
});
test('HBM, power and interconnect have independent breadcrumbs and return to the lesson', () => {
  assert.deepEqual(I.breadcrumbs('hbm'),['board','package','hbm']);
  assert.deepEqual(I.breadcrumbs('power'),['board','power']);
  assert.deepEqual(I.breadcrumbs('interconnect'),['board','interconnect']);
  assert.deepEqual(I.breadcrumbs('sm'),['board','package','die','sm']);
  for(const level of ['hbm','power','interconnect']){
    let ui=I.create({mode:'explore',level},base);
    ui=act(ui,'EXPLODE_SET',{value:.7});assert.equal(ui.level,level);assert.equal(ui.explode,.7);
    ui=act(ui,'ENTER_GUIDE',{}, {...base,stepIndex:1});cleanGuide(ui,'hbm');
  }
});
test('scene level changes reconcile camera preset, while same-level notifications preserve it', () => {
  for (const preset of ['top','side']) {
    for (const level of ['die','sm','hbm','power','interconnect']) {
      let ui = I.create({mode:'explore',level:'package'},base);
      ui = act(ui,'CAMERA',{preset});
      ui = act(ui,'SCENE_LEVEL',{level:'package'});
      assert.equal(ui.cameraPreset,preset,'same-level notification must not change the camera');
      ui = act(ui,'SCENE_LEVEL',{level});
      assert.equal(ui.level,level);
      assert.equal(ui.cameraPreset,'three-quarter','new level is fitted in the oblique view');
      assert.equal(ui.mode,'explore');
      assert.equal(ui.playback,'paused');
    }
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
test('the completed arithmetic stays fixed while its route keeps cycling', () => {
  let ui=I.create({},base);
  for(let i=0;i<60;i++)ui=act(ui,'TICK',{dt:100});
  assert.equal(ui.progress,1);assert.equal(ui.playback,'paused');assert.equal(ui.motionPlaying,true);
  const phase=ui.visualPhase,revision=ui.guideRevision;
  for(let i=0;i<120;i++)ui=act(ui,'TICK',{dt:100});
  assert.ok(ui.visualPhase>phase+2);assert.equal(ui.progress,1);assert.equal(ui.advanceRequested,false);
  assert.equal(ui.guideRevision,revision);
});
test('explicit pause freezes both clocks; resuming completed motion never reruns arithmetic', () => {
  let ui=I.create({},base);for(let i=0;i<60;i++)ui=act(ui,'TICK',{dt:100});
  ui=act(ui,'MOTION_TOGGLE');const phase=ui.visualPhase,revision=ui.guideRevision;
  for(let i=0;i<40;i++)ui=act(ui,'TICK',{dt:100});
  assert.equal(ui.motionPlaying,false);assert.equal(ui.visualPhase,phase);assert.equal(ui.progress,1);
  ui=act(ui,'MOTION_TOGGLE');ui=act(ui,'TICK',{dt:100});
  assert.equal(ui.motionPlaying,true);assert.ok(ui.visualPhase>phase);assert.equal(ui.progress,1);
  assert.equal(ui.guideRevision,revision);
  ui=act(ui,'PAUSE');const frozen=ui.visualPhase;ui=act(ui,'CAMERA',{preset:'top'});ui=act(ui,'NAVIGATE');ui=act(ui,'TICK',{dt:100});
  assert.equal(ui.visualPhase,frozen);assert.equal(ui.motionPlaying,false);
});
test('hardware exploration stops the route clock and returning prepares one clean cycle', () => {
  for(const level of I.LEVELS){
    let ui=act(I.create({},base),'TICK',{dt:100});ui=act(ui,'LEVEL',{level});
    const phase=ui.visualPhase;ui=act(ui,'TICK',{dt:100});
    assert.equal(ui.motionPlaying,false);assert.equal(ui.visualPhase,phase);
    ui=act(ui,'ENTER_GUIDE');assert.equal(ui.visualPhase,0);assert.equal(ui.motionPlaying,true);
  }
});
test('reduced motion begins static and can be explicitly enabled without restarting arithmetic', () => {
  const context={...base,reducedMotion:true};let ui=I.create({},context);
  for(let i=0;i<10;i++)ui=act(ui,'TICK',{dt:100},context);
  assert.equal(ui.progress,1);assert.equal(ui.motionPlaying,false);assert.equal(ui.visualPhase,0);
  ui=act(ui,'MOTION_TOGGLE',{},context);ui=act(ui,'TICK',{dt:100},context);
  assert.equal(ui.motionPlaying,true);assert.ok(ui.visualPhase>0);assert.equal(ui.progress,1);
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
  assert.equal(ui.motionPlaying,true,'the final route continues while sequence advancement stops');
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
  const events=[()=>({type:'LEVEL',level:LEVELS[Math.floor(random()*LEVELS.length)]}),()=>({type:'SELECT',id:'tensor'}),()=>({type:'ISOLATE'}),()=>({type:'EXPLODE_SET',value:random()}),()=>({type:'EXPLODE_TOGGLE'}),()=>({type:'ENTER_GUIDE',playback:random()<.4?'sequence':'step'}),()=>({type:'NAVIGATE'}),()=>({type:'CAMERA',preset:['top','side','three-quarter'][Math.floor(random()*3)]}),()=>({type:'MOTION_TOGGLE'}),()=>({type:'TICK',dt:100}),()=>({type:'EXPLORE_RESET'}),()=>({type:'PAUSE'})];
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
