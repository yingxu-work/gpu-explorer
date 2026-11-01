import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../three/three.module.js';
import { createHardwareModel, calculateCameraFit } from '../hardware-model.js';
import { lessonPresentation, createTeachingVisuals, routeState, samplePath, pathLength, FLOW_PHASES } from '../teaching-flow.js';

const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>context})};
const levels=['board','hbm','die','package','sm','sm','sm','package'];

test('all eight guided steps have an explicit, persistent physical or logical presentation',()=>{
  for(let step=0;step<8;step++){
    const presentation=lessonPresentation(levels[step],step);
    assert.equal(presentation.kind,FLOW_PHASES[step].kind);
    assert.ok(presentation.routes.length,'every step needs a visible direction, including the first three');
    assert.ok(presentation.markers.some(marker=>marker.role==='target'),'a learner can locate the destination without motion');
    for(const route of presentation.routes){
      assert.ok(route.width>=.14,'data buses must be thicker than the former hairline traces');
      assert.ok(route.points.every(p=>p.every(Number.isFinite)));
      assert.ok(pathLength(route.points)>0);
      for(let n=1;n<route.points.length;n++)assert.ok(route.points[n].filter((v,k)=>Math.abs(v-route.points[n-1][k])>1e-8).length<=1,'ribbon follows orthogonal routing');
      assert.deepEqual(samplePath(route.points,0),route.points[0]);
      samplePath(route.points,1).forEach((v,k)=>assert.ok(Math.abs(v-route.points.at(-1)[k])<1e-8));
      const complete=routeState(route,1);
      assert.equal(complete.visible,true);assert.equal(complete.complete,true);assert.ok(complete.opacity>=.65,'the completed route must not fade away');
    }
  }
});

test('dependency, work placement and actual memory transfers remain different concepts',()=>{
  for(let step=0;step<3;step++){
    const view=lessonPresentation(levels[step],step);
    assert.ok(view.routes.every(route=>route.dashed));
    assert.ok(view.routes.every(route=>['dependency','placement'].includes(route.kind)));
    assert.match(view.note,step===2?/不是数据传输/:/尚未搬运|仍在 HBM/);
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

for(const model of ['h100','a100'])test(`${model}: lesson visuals attach to the displayed physical assembly and release their resources`,()=>{
  const hw=createHardwareModel(THREE,model);
  for(let step=0;step<8;step++){
    const level=levels[step];hw.setLevel(level);hw.setExplode(0);
    const presentation=lessonPresentation(level,step,model);
    const visual=createTeachingVisuals(THREE,hw,presentation);
    assert.equal(visual.visuals.length,presentation.routes.length,'a missing physical host must not silently drop a route');
    assert.equal(visual.markers.length,presentation.markers.length);
    hw.root.updateMatrixWorld(true);
    for(const item of [...visual.visuals,...visual.markers]){
      for(let node=item.group;node;node=node.parent)assert.equal(node.visible,true,`step ${step+1} host is hidden`);
      const bounds=new THREE.Box3().setFromObject(item.group);
      assert.ok(!bounds.isEmpty());assert.ok(bounds.min.toArray().every(Number.isFinite));
    }
    visual.update(.45);visual.update(1);
    for(const item of visual.visuals){
      assert.ok(item.railMaterial.opacity>=.65);
      assert.ok(item.arrows.count>=2,'route retains static arrowheads at the end');
      const matrix=new THREE.Matrix4();item.packets.getMatrixAt(0,matrix);
      const scale=new THREE.Vector3();matrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);
      assert.equal(scale.x>0,!item.route.dashed,'only actual data/control buses use moving packets');
    }
    const groups=[...visual.visuals,...visual.markers].map(item=>item.group);visual.dispose();
    assert.ok(groups.every(group=>group.parent===null),'step changes leave no orphan overlays');
  }
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
