import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../three/three.module.js';
import { createHardwareModel, calculateCameraFit } from '../hardware-model.js';
import { lessonPresentation, anatomyPaths, createTeachingVisuals, routeState, samplePath, pathLength, signalCycleState, bandOffset, routeMoves, FLOW_PHASES, FLOW_COLORS } from '../teaching-flow.js';
import { createRequire } from 'node:module';
const S=createRequire(import.meta.url)('../state.js');

const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>context})};
const levels=['board','hbm','die','package','sm','sm','sm','package'];

const CJK=/[　-〿㐀-鿿＀-￯]/;
const allSteps=()=>Object.entries(S.JOURNEYS).flatMap(([journey,data])=>data.steps.map((step,index)=>({journey,index,step})));
const near=(a,b,eps=1e-6)=>a.every((v,k)=>Math.abs(v-b[k])<eps);

test('every step of every walkthrough draws on the hardware it names',()=>{
  for(const {journey,index,step} of allSteps())for(const model of ['h100','a100']){
    const level=step.level,presentation=lessonPresentation(level,index,model,journey);
    if(journey==='gemm')assert.equal(presentation.kind,FLOW_PHASES[index].kind);
    assert.ok(presentation.routes.length||presentation.markers.length>=2,`${journey} ${index+1}: needs something drawn on ${level}`);
    assert.ok(presentation.markers.some(marker=>['target','location'].includes(marker.role)),`${journey} ${index+1}: a learner can locate the destination without motion`);
    assert.ok(presentation.title.zh&&presentation.title.en&&presentation.note.zh&&presentation.note.en,'bilingual phase text');
    assert.ok(!CJK.test(presentation.title.en+presentation.note.en),`${journey} ${index+1}: English text has no Chinese`);
    assert.ok(!/[!！]/.test(presentation.note.zh+presentation.note.en+presentation.title.zh+presentation.title.en));
    for(const marker of presentation.markers){
      assert.ok(typeof marker.label==='string'?!CJK.test(marker.label):(marker.label.zh&&marker.label.en&&!CJK.test(marker.label.en)),'marker labels are bilingual or language-neutral');
      assert.ok(FLOW_COLORS[marker.color]!==undefined,'marker colour is one of the fixed set');
    }
    for(const route of presentation.routes){
      assert.ok(route.width>=.12,'a route is wide enough to see');
      assert.ok(route.points.length>=2&&route.points.every(p=>p.length===3&&p.every(Number.isFinite)));
      assert.ok(pathLength(route.points)>0);
      assert.ok(FLOW_COLORS[route.color]!==undefined,`${journey} ${index+1}: ${route.id} colour`);
      assert.deepEqual(samplePath(route.points,0),route.points[0]);
      assert.ok(near(samplePath(route.points,1),route.points.at(-1),1e-8));
      const complete=routeState(route,1);
      assert.equal(complete.visible,true);assert.equal(complete.complete,true);assert.ok(complete.opacity>=.65,'the completed route must not fade away');
    }
  }
});

test('each colour keeps one meaning across the four walkthroughs',()=>{
  for(const {journey,index,step} of allSteps()){
    const view=lessonPresentation(step.level,index,'h100',journey);
    for(const route of view.routes){
      if(route.kind==='control'||route.kind==='placement')assert.equal(route.color,'control',`${journey} ${index+1}: instructions and work assignment are grey`);
      if(route.kind==='store'||route.kind==='output')assert.equal(route.color,'c',`${journey} ${index+1}: a written result is blue`);
      if(route.kind==='return')assert.equal(route.color,'a',`${journey} ${index+1}: data read back is teal`);
      if(route.kind==='heat')assert.equal(route.color,'heat');
      if(route.color==='heat')assert.equal(journey,'stacking','red-orange is heat only');
      if(route.color==='addr')assert.ok(['pagetable','pixel'].includes(journey),'purple is an address or request');
      if(route.kind==='dependency'||route.kind==='placement'||route.kind==='structure')assert.equal(route.dashed,true,`${journey} ${index+1}: a relation that moves nothing is dashed`);
      if(['transfer','compute','store','return','heat'].includes(route.kind))assert.equal(route.dashed,false,`${journey} ${index+1}: a real transfer is solid`);
    }
  }
  assert.deepEqual(Object.values(FLOW_COLORS).length,new Set(Object.values(FLOW_COLORS)).size,'no two meanings share a colour');
});

test('the legend names every kind of line on the model and nothing that is not there',()=>{
  for(const {journey,index,step} of allSteps())for(const model of ['h100','a100']){
    const view=lessonPresentation(step.level,index,model,journey),where=`${journey} ${index+1}`;
    const drawn=new Set(view.routes.map(route=>route.color+(route.dashed?'~':''))),keyed=view.legend.map(entry=>entry.color+(entry.dashed?'~':''));
    assert.deepEqual([...new Set(keyed)].sort(),[...drawn].sort(),`${where}: legend rows match the lines`);
    assert.equal(new Set(keyed).size,keyed.length,`${where}: one row per kind of line`);
    assert.ok(view.legend.length<=4,`${where}: the legend stays short`);
    for(const entry of view.legend){
      assert.ok(entry.label.zh&&entry.label.en,`${where}: legend label in both languages`);
      assert.ok(!CJK.test(entry.label.en),`${where}: English legend has no Chinese`);
      assert.ok(entry.label.zh.length<=30&&entry.label.en.length<=64,`${where}: legend row fits the card: ${entry.label.en}`);
      assert.ok(!/[。.]$/.test(entry.label.zh)&&!/[。.]$/.test(entry.label.en),`${where}: a legend row is a label, not a sentence`);
    }
  }
});

test('dependency, work placement and actual memory transfers remain different concepts',()=>{
  for(let step=0;step<3;step++){
    const view=lessonPresentation(levels[step],step);
    assert.ok(view.routes.every(route=>route.dashed));
    assert.ok(view.routes.every(route=>['dependency','placement'].includes(route.kind)));
    assert.match(view.note.zh,step===2?/不是搬数据/:/还没有搬|还在 HBM/);
    assert.match(view.note.en,step===2?/not moving data/:/nothing moves yet|still in HBM/);
  }
  assert.ok(lessonPresentation('die',2).routes.some(route=>route.stages.includes('selected SM')));
  assert.ok(!lessonPresentation('package',3).markers.some(marker=>marker.id==='output-c'),'loading inputs must not mark the output as written');
  for(const step of [3,7]){
    const view=lessonPresentation('package',step);
    assert.equal(view.xray,true,'package cover must reveal the internal cache and SM');
    assert.ok(view.routes.some(route=>route.stages.includes('L2')));
    assert.ok(view.routes.every(route=>!route.dashed));
  }
  const issue=lessonPresentation('sm',4);
  assert.ok(issue.routes.some(route=>route.kind==='control'&&route.stages.includes('Warp Scheduler')));
  assert.ok(issue.routes.filter(route=>route.kind!=='control').every(route=>!route.stages.includes('Warp Scheduler')),'operand values never travel through the scheduler');
  assert.ok(lessonPresentation('sm',6,'a100').routes.some(route=>route.stages.includes('async copy')));
  assert.ok(lessonPresentation('sm',6,'h100').routes.some(route=>route.stages.includes('TMA')));
});

test('a route that continues another one is drawn as one arrow: one start dot, one head',()=>{
  let chains=0;
  for(const {journey,index,step} of allSteps()){
    const view=lessonPresentation(step.level,index,'h100',journey);
    for(const route of view.routes.filter(r=>r.after)){
      const first=view.routes.find(r=>r.id===route.after);chains++;
      assert.ok(first,'the earlier leg exists');
      assert.equal(first.head,false);assert.equal(route.tail,false);
      assert.equal(first.color,route.color);assert.equal(first.period,route.period);
      assert.ok(Math.abs(route.lead-first.lead-pathLength(first.points))<1e-9,'the band crosses the join without a jump');
    }
    for(const route of view.routes.filter(r=>r.kind!=='structure'&&!r.after&&!view.routes.some(o=>o.after===r.id))){assert.equal(route.head,true);assert.equal(route.tail,true);}
  }
  assert.ok(chains>=6,'HBM to die routes cross two hosts');
});

for(const model of ['h100','a100'])test(`${model}: arrows are tubes with a start dot and a head that points along the last leg`,()=>{
  const hw=createHardwareModel(THREE,model);let thin=0,total=0;
  for(const {journey,index,step} of allSteps()){
    hw.setLevel(step.level);hw.setExplode(step.explode||0);
    const presentation=lessonPresentation(step.level,index,model,journey),visual=createTeachingVisuals(THREE,hw,presentation),where=`${journey} ${index+1}`;
    assert.equal(visual.visuals.length,presentation.routes.length,`${where}: a missing physical host must not silently drop a route`);
    assert.equal(visual.markers.length,presentation.markers.length,`${where}: every marker has a host`);
    hw.root.updateMatrixWorld(true);
    for(const item of [...visual.visuals,...visual.markers]){
      for(let node=item.group;node;node=node.parent)assert.equal(node.visible,true,`${where} host is hidden`);
      const bounds=new THREE.Box3().setFromObject(item.group);
      assert.ok(!bounds.isEmpty());assert.ok(bounds.min.toArray().every(Number.isFinite));
    }
    for(const item of visual.visuals){
      const route=item.route,length=pathLength(route.points),full=route.width*.32;total++;
      assert.equal(item.tube.geometry.type,'TubeGeometry',`${where}: ${route.id} is a tube`);
      assert.ok(item.radius<=full+1e-9&&item.radius>=full*.6-1e-9,`${where}: ${route.id} radius stays in range`);
      if(item.radius<full-1e-9){thin++;assert.ok(length<full/.06,`${where}: only a short route is thinned`);}
      assert.ok(length>=item.radius*8,`${where}: ${route.id} is long enough to read as an arrow, not a blob (${length.toFixed(2)} vs radius ${item.radius.toFixed(3)})`);
      assert.equal(!!item.head,route.head,`${where}: ${route.id} head`);assert.equal(!!item.tail,route.tail,`${where}: ${route.id} start dot`);
      const end=route.points.at(-1),start=route.points[0];
      if(item.head){
        const headLength=item.head.geometry.parameters.height,tip=item.head.position.clone().addScaledVector(item.direction,headLength/2);
        assert.ok(near(tip.toArray(),end,1e-5),`${where}: ${route.id} head ends exactly at the destination`);
        assert.ok(headLength<=length*.45+1e-9,`${where}: ${route.id} head is shorter than half the route`);
        assert.ok(item.head.geometry.parameters.radius>item.radius*2,'the head is wider than the shaft');
        if(!route.smooth){
          const leg=new THREE.Vector3(...end).sub(new THREE.Vector3(...route.points.at(-2))).normalize();
          assert.ok(item.direction.dot(leg)>.999,`${where}: ${route.id} head points along the last leg`);
        }
      }
      if(item.tail){assert.ok(near(item.tail.position.toArray(),start),`${where}: ${route.id} start dot sits on the first point`);assert.ok(item.tail.geometry.parameters.radius>item.radius);}
      assert.equal(!!item.dash,route.dashed,`${where}: ${route.id} dashing follows the route`);
      assert.equal(!!item.band,routeMoves(route),`${where}: only a real transfer carries a moving band`);
      let outlined=0;item.group.traverse(o=>{if(o.isMesh&&o.material.side===THREE.BackSide)outlined++;});
      assert.ok(outlined>=1,`${where}: ${route.id} has a dark outline so it reads on a busy model`);
    }
    const groups=[...visual.visuals,...visual.markers].map(item=>item.group);visual.update(.45,.3);visual.update(1,1.7);visual.dispose();
    assert.ok(groups.every(group=>group.parent===null),'step changes leave no orphan overlays');
  }
  assert.ok(thin>=3&&thin<total/2,`short routes get a thinner tube (${thin} of ${total})`);
});

for(const [width,height] of [[800,500],[375,380]])test(`${width}×${height}: actual lesson assemblies fit 3D, TOP and SIDE presets`,()=>{
  const hw=createHardwareModel(THREE,'h100');
  for(const level of ['board','package','die','sm','hbm','power','interconnect'])for(const explode of [0,1]){
    hw.setLevel(level);hw.setExplode(explode);hw.root.updateMatrixWorld(true);
    const object={board:hw.pcb,package:hw.serial,die:hw.components['gpu-die'].group,sm:hw.smRoot,hbm:hw.hbmRoot,power:hw.powerRoot,interconnect:hw.interconnectRoot}[level];
    const bounds=new THREE.Box3().setFromObject(object);
    if(level==='board')bounds.union(new THREE.Box3().setFromObject(hw.serial));
    for(const direction of [new THREE.Vector3(.62,.83,1),new THREE.Vector3(.001,1,.001),new THREE.Vector3(1,.18,1.05)]){
      const fit=calculateCameraFit(THREE,bounds,direction.normalize(),38,width/height,1.1);
      const camera=new THREE.PerspectiveCamera(38,width/height,.08,fit.far);camera.position.copy(fit.position);camera.lookAt(fit.target);camera.updateMatrixWorld(true);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
        const p=new THREE.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1,`${level}, explode ${explode}: preset clips model`);
      }
    }
  }
});


const geometrySnapshot = group => {
  const nodes=[];group.traverse(object=>nodes.push({id:object.uuid,position:object.position.toArray(),rotation:object.quaternion.toArray(),scale:object.scale.toArray(),visible:object.visible,
    color:object.material?.color?.getHex(),vertices:object.geometry?.attributes?.position?Array.from(object.geometry.attributes.position.array.slice(0,240)):undefined}));return nodes;
};
const offsets=visual=>visual.visuals.map(item=>item.band?item.band.offset.x:null);

test('the band offset moves towards the head, repeats every whole phase and ignores bad input',()=>{
  for(const {journey,index,step} of allSteps())for(const route of lessonPresentation(step.level,index,'h100',journey).routes){
    const early=signalCycleState(route,1.25),later=signalCycleState(route,1.4),repeat=signalCycleState(route,4.25);
    assert.ok(Math.abs(early.offset-repeat.offset)<1e-9,'a whole number of phases later the band is back where it was');
    assert.notEqual(early.offset,later.offset);
    assert.ok(early.offset>=0&&early.offset<1);
    assert.equal(early.mode,'band');assert.equal(early.semantic,route.dashed?'dependency':'transfer');
    assert.equal(bandOffset(route,NaN),bandOffset(route,0));assert.equal(bandOffset(route,Infinity),bandOffset(route,0));assert.equal(bandOffset(route,-3),bandOffset(route,0));
    const step1=bandOffset(route,.01),step0=bandOffset(route,0),moved=((step0-step1)%1+1)%1;
    assert.ok(moved>0&&moved<.5,'the texture offset falls as phase grows, which moves the bright band towards the head');
  }
});

test('animation changes texture offsets only: tubes, heads and colours stay fixed for the whole step',()=>{
  const hw=createHardwareModel(THREE,'h100');
  for(const {journey,index,step} of allSteps()){
    hw.setLevel(step.level);hw.setExplode(step.explode||0);
    const presentation=lessonPresentation(step.level,index,'h100',journey),visual=createTeachingVisuals(THREE,hw,presentation),where=`${journey} ${index+1}`;
    visual.update(1,1.13);const geometry=visual.visuals.map(item=>geometrySnapshot(item.group)),first=offsets(visual);
    const seen=visual.visuals.map(()=>new Set());
    for(const phase of [1.03,1.13,1.23,1.37,1.51,1.67,1.83,1.97]){
      visual.update(1,phase);
      visual.visuals.forEach((item,i)=>{
        assert.deepEqual(geometrySnapshot(item.group),geometry[i],`${where}: animation may not move, scale, recolour or rebuild a route`);
        let instanced=0;item.group.traverse(o=>{if(o.isInstancedMesh||o.isPoints||o.isSprite)instanced++;});assert.equal(instanced,0,`${where}: no particles or packets`);
        if(item.band)seen[i].add(item.band.offset.x.toFixed(4));
      });
    }
    visual.visuals.forEach((item,i)=>{if(item.band)assert.ok(seen[i].size>=6,`${where}: ${item.route.id} band visibly advances`);});
    visual.update(1,1.57);const second=offsets(visual);
    visual.update(1,1.57);assert.deepEqual(offsets(visual),second,'a paused phase is an exact freeze');
    visual.update(.2,1.57);assert.deepEqual(offsets(visual),second,'the band is independent of lesson progress');
    visual.update(1,2.13);offsets(visual).forEach((v,i)=>{if(v!==null)assert.ok(Math.abs(v-first[i])<1e-9,'a complete visual cycle repeats exactly');});
    visual.update(.4,2.13);assert.ok(visual.markers.filter(item=>item.marker.role==='target').every(item=>item.fill.opacity===.22));
    visual.update(1,2.13);assert.ok(visual.markers.filter(item=>item.marker.role==='target').every(item=>item.fill.opacity===.45),'the destination fills in when the step completes');
    visual.dispose();
  }
});

for(const model of ['h100','a100'])test(`${model}: other walkthroughs attach to visible hosts at their own explosion`,()=>{
  const hw=createHardwareModel(THREE,model);
  for(const journey of ['pagetable','pixel','stacking'])S.JOURNEYS[journey].steps.forEach((step,index)=>{
    hw.setLevel(step.level);hw.setExplode(step.explode||0);
    const presentation=lessonPresentation(step.level,index,model,journey),visual=createTeachingVisuals(THREE,hw,presentation);
    assert.equal(visual.visuals.length,presentation.routes.length,`${journey} ${index+1}: every route has a host`);
    assert.equal(visual.markers.length,presentation.markers.length,`${journey} ${index+1}: every marker has a host`);
    hw.root.updateMatrixWorld(true);
    for(const item of [...visual.visuals,...visual.markers])for(let node=item.group;node;node=node.parent)assert.equal(node.visible,true,`${journey} step ${index+1} host is hidden`);
    visual.update(.5,.3);visual.dispose();
  });
});

test('address walkthrough reads page tables from HBM and never invents a CPU',()=>{
  const walk=lessonPresentation('package',3,'h100','pagetable');
  assert.equal(walk.xray,true);
  assert.ok(walk.routes.some(r=>r.stages.includes('page table in HBM')));
  for(let i=0;i<8;i++){const p=lessonPresentation(S.JOURNEYS.pagetable.steps[i].level,i,'h100','pagetable');assert.ok(p.routes.every(r=>!r.stages.join().includes('CPU')));}
  assert.ok(lessonPresentation('die',2,'h100','pagetable').markers.some(m=>m.id==='gmmu'));
});

test('anatomy data paths exist for every level except the board cutaway and are static',()=>{
  for(const level of ['board','package','die','sm','hbm','power']){const p=anatomyPaths(level,'h100');assert.ok(p.routes.length>0,level);assert.ok(p.routes.every(r=>r.kind==='path'&&!r.head&&!r.tail));}
  assert.equal(anatomyPaths('interconnect').routes.length,0);
  const hw=createHardwareModel(THREE,'h100');hw.setLevel('die');
  const paths=anatomyPaths('die','h100'),v=createTeachingVisuals(THREE,hw,paths,{static:true}),moving=createTeachingVisuals(THREE,hw,lessonPresentation('die',2,'h100','gemm'));
  assert.equal(v.visuals.length,paths.routes.length);
  for(const item of v.visuals){
    assert.equal(item.band,null,'a static path has no travelling band');assert.equal(item.head,null);assert.equal(item.tail,null);
    assert.ok(item.radius<item.route.width*.32,'static paths are thinner than lesson arrows');
    let meshes=0;item.group.traverse(o=>{if(o.isMesh)meshes++;});assert.equal(meshes,1,'a static path is one plain tube with no outline');
  }
  const before=v.visuals.map(item=>geometrySnapshot(item.group));v.update(.5,.7);
  assert.deepEqual(v.visuals.map(item=>geometrySnapshot(item.group)),before,'static paths do not animate');v.dispose();moving.dispose();
});

// Two differently coloured routes on the same host must not run alongside each
// other: a teal and a purple tube a hair apart read as one band.
test('routes of different colours keep a visible gap instead of running as one band',()=>{
  const segDist=(p,a,b)=>{const ab=b.map((v,k)=>v-a[k]),ap=p.map((v,k)=>v-a[k]),l=ab.reduce((s,v)=>s+v*v,0),t=l?Math.max(0,Math.min(1,ab.reduce((s,v,k)=>s+v*ap[k],0)/l)):0;return Math.hypot(...p.map((v,k)=>v-(a[k]+ab[k]*t)));};
  const gap=(p,pts)=>Math.min(...pts.slice(1).map((b,i)=>segDist(p,pts[i],b)));
  for(const model of ['h100','a100'])for(const {journey,index,step} of allSteps()){
    const routes=lessonPresentation(step.level,index,model,journey).routes;
    for(const a of routes)for(const b of routes){
      if(a===b||a.host!==b.host||a.color===b.color)continue;
      const limit=3*(a.width+b.width)*.32,n=40;let close=0;
      for(let s=0;s<=n;s++)if(gap(samplePath(a.points,s/n),b.points)<limit)close++;
      assert.ok(close/(n+1)<=.25,`${model} ${journey} ${index+1}: ${a.id} runs alongside ${b.id} for ${Math.round(close/(n+1)*100)}% of its length`);
    }
  }
});

test('every arrow keeps a visible shaft: dot and head never take most of a route',()=>{
  const hw=createHardwareModel(THREE,'h100');
  for(const {journey,index,step} of allSteps()){
    hw.setLevel(step.level);hw.setExplode(step.explode||0);
    const presentation=lessonPresentation(step.level,index,'h100',journey),visual=createTeachingVisuals(THREE,hw,presentation);
    for(const item of visual.visuals){
      const used=item.headLength+2*item.dotRadius;
      assert.ok(used<=.5*item.length,`${journey} ${index+1}: ${item.route.id} is ${Math.round(used/item.length*100)}% dot and head`);
      if(item.head)assert.ok(item.headRadius>item.radius*1.2,`${journey} ${index+1}: ${item.route.id} head is wider than its shaft`);
    }
    visual.dispose();
  }
});
