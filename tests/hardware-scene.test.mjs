import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../three/three.module.js';
import { createHardwareModel,calculateCameraFit,isolateHardwareSubtree,sampleSignalPath,getSMResourceLegend,dieFloorplan,HBM_SITES } from '../hardware-model.js';

// Textures are deliberately mocked: this test verifies real Three geometry,
// projection, orbit limits and isolation rather than a browser/WebGL renderer.
const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>context})};
for(const model of ['h100','a100']){
  const hw=createHardwareModel(THREE,model);
  for(const [width,height] of [[375,380],[274,750],[814,440]])for(const explode of [0,1])for(const level of ['board','sm']){
    test(`${model} ${level}, ${width}x${height}, explode=${explode}: all corners fit`,()=>{
      hw.setExplode(explode);hw.root.updateMatrixWorld(true);
      const bounds=level==='board'?new THREE.Box3().setFromObject(hw.pcb).union(new THREE.Box3().setFromObject(hw.serial)):new THREE.Box3().setFromObject(hw.smRoot);
      const aspect=width/height,fit=calculateCameraFit(THREE,bounds,new THREE.Vector3(.62,.83,1),38,aspect,aspect<1.1?1.1:1.025);
      assert.ok(fit.maxDistance>fit.distance,'orbit max must allow the computed fit');
      const camera=new THREE.PerspectiveCamera(38,aspect,.08,fit.far);
      camera.position.copy(fit.position);camera.lookAt(fit.target);camera.updateMatrixWorld(true);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
        const point=new THREE.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(point.x)<=1+1e-6,`horizontal clipping at ${point.x}`);
        assert.ok(Math.abs(point.y)<=1+1e-6,`vertical clipping at ${point.y}`);
        assert.ok(point.z>=-1&&point.z<=1,'corner must lie between near and far planes');
      }
      if(width===274&&level==='board')assert.ok(fit.distance>52,'regression: this fit needs more than old orbit cap');
    });
  }
  test(`${model}: isolate HBM removes all unrelated meshes and restores siblings`,()=>{
    hw.pcb.visible=false;hw.smRoot.visible=false;const keep=hw.components.hbm.group;
    const hidden=isolateHardwareSubtree(hw.root,keep);let count=0;
    hw.root.traverseVisible(object=>{if(!object.isMesh)return;let selected=false;for(let p=object;p;p=p.parent)if(p===keep)selected=true;assert.ok(selected,'unrelated visible mesh after isolation');count++;});
    assert.ok(count>0);hidden.forEach(object=>{object.visible=true;});
    assert.ok(hw.components.interposer.group.visible);assert.ok(hw.components['gpu-die'].group.visible);
  });
}

// The diagram preserves resource ownership without claiming real floorplan distances.
for(const model of ['h100','a100'])test(`${model}: four local subpartitions share one L1 data/shared resource`,()=>{
  const hw=createHardwareModel(THREE,model);
  assert.equal(hw.partitionOrigins.length,4);
  assert.equal(new Set(hw.partitionOrigins.map(p=>p.x)).size,2);
  assert.equal(new Set(hw.partitionOrigins.map(p=>p.z)).size,2);
  for(const id of ['warp','dispatch','registers','tensor','lsu','smem','instruction-cache','sm-bus'])assert.equal(hw.components[id].parent,'sm-detail');
  assert.equal(Boolean(hw.components.tma),model==='h100','Ampere must not acquire a Hopper TMA unit');
  const fp=[];hw.smRoot.traverse(o=>{if(o.isInstancedMesh&&o.material===hw.materials.activeSM)fp.push(o);});
  assert.equal(fp.reduce((sum,o)=>sum+o.count,0),model==='h100'?128:64);
  assert.ok(hw.components.smem.description.en.includes(model==='h100'?'256':'192'));
  assert.ok(hw.components.smem.description.en.includes('32 banks')&&hw.components.smem.description.zh.includes('32 banks'));
});

// The die follows the full-GPU block diagrams; enabled counts match the products.
for(const model of ['h100','a100'])test(`${model}: die floorplan enables the shipping SM, TPC, GPC and HBM counts`,()=>{
  const fp=dieFloorplan(model),a=model==='a100';
  assert.equal(fp.gpcs.length,8);assert.equal(fp.totalSMs,a?128:144);assert.equal(fp.activeSMs,a?108:132);
  const tpcs=fp.gpcs.flatMap(g=>g.tpcs);assert.equal(tpcs.length,a?64:72);assert.equal(tpcs.filter(t=>t.active).length,a?54:66);
  assert.equal(fp.gpcs.filter(g=>g.active).length,a?7:8,'A100 ships with seven GPCs');
  assert.equal(fp.l2.length,2,'L2 is split into two partitions');
  assert.equal(fp.memoryControllers.length,6);assert.equal(fp.memoryControllers.filter(m=>m.active).length,5);
  assert.equal(HBM_SITES.length,6);assert.equal(HBM_SITES.filter(s=>s.active).length,5);
  const lesson=tpcs.find(t=>t.sms.some(sm=>sm.x===fp.lessonSM.x&&sm.z===fp.lessonSM.z));assert.ok(lesson?.active,'the lesson SM is an enabled one');
  const hw=createHardwareModel(THREE,model);
  for(const id of ['l2','memory-controller','pcie','nvlink','sm','hbm-inactive'])assert.ok(hw.components[id],id);
  assert.ok(hw.components['hbm-inactive'].label.en.includes('not enabled'));
  for(const box of fp.gpcs.map(g=>[g.x-g.w/2,g.x+g.w/2]))assert.ok(box[0]>=-2.65&&box[1]<=2.65,'GPCs stay on the die');
});

test('surface lettering switches language in place without rebuilding the model',()=>{
  const hw=createHardwareModel(THREE,'h100');
  const labels=[];hw.root.traverse(o=>{if(o.userData.surfaceLabel)labels.push(o);});
  assert.ok(labels.length>40);
  const before=labels.map(o=>o.userData.surfaceLabel.text);
  assert.equal(hw.setLanguage('en'),true);
  const after=labels.map(o=>o.userData.surfaceLabel.text);
  assert.ok(after.every(t=>!/[\u3400-\u9fff]/.test(t)),'English lettering has no Chinese');
  assert.ok(after.some((t,i)=>t!==before[i]),'translated labels actually change');
  hw.setLanguage('zh');assert.deepEqual(labels.map(o=>o.userData.surfaceLabel.text),before);
  for(const o of labels){const {width,height}=o.geometry.parameters,img=o.material.map.image;assert.ok(Math.abs(img.width/img.height-width/height)/(width/height)<.02,'label texture keeps the physical aspect');}
});

for(const model of ['h100','a100']){
  test(`${model}: coloured arithmetic resources carry accurate semantic counts`,()=>{
    const hw=createHardwareModel(THREE,model),a=model==='a100';
    const expected={fp32:a?64:128,fp64:a?32:64,int32:64,sfu:16,lsu:32};
    for(const [id,total]of Object.entries(expected)){
      const component=hw.components[id];assert.equal(component.parent,'sm-detail');assert.equal(component.category==='execution'||id==='lsu',true);
      assert.equal(component.countPerSM,total);assert.equal(component.countPerPartition,total/4);
      let actual=0;const partitionCounts=[0,0,0,0];
      component.group.traverse(mesh=>{if(mesh.userData.resourceId!==id)return;assert.ok(mesh.isInstancedMesh);actual+=mesh.count;
        for(let instance=0;instance<mesh.count;instance++){
          const matrix=new THREE.Matrix4();mesh.getMatrixAt(instance,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);
          const distances=hw.partitionOrigins.map(p=>(position.x-p.x)**2+(position.z-p.z)**2);partitionCounts[distances.indexOf(Math.min(...distances))]++;
        }
      });
      assert.equal(actual,total,`${id} must render the claimed actual lane/unit count`);
      assert.deepEqual(partitionCounts,[total/4,total/4,total/4,total/4]);
    }
    for(const id of ['tensor','warp','dispatch','l0-instruction-cache','texture']){
      let actual=0;hw.components[id].group.traverse(mesh=>{actual+=mesh.userData.unitCount||0;});assert.equal(actual,4,`${id} has four real outer units, not its decorative cell count`);
    }
    assert.equal(hw.components.registers.category,'storage');assert.equal(hw.components.registers.countPerSM,65536);
    assert.equal(hw.components.registers.countPerPartition,16384);assert.equal(hw.components.registers.countUnit,'32-bit registers');
    assert.equal(hw.components.registers.color,'#a79bc7');assert.ok(!hw.components.fp16,'must not invent a dedicated FP16 block');
    assert.ok(hw.components.fp32.precisionNote.en.includes('FP16'));assert.ok(hw.components.tensor.description.en.includes('FP16'));assert.ok(hw.components.tensor.description.zh.includes('FP16'));
    const legend=getSMResourceLegend(model);assert.equal(new Set(legend.map(item=>item.id)).size,legend.length);
    for(const item of legend){assert.equal(hw.components[item.id].color,item.color);assert.ok(item.sourceUrls.every(url=>/^https:\/\/(docs|developer)\.nvidia\.com\//.test(url)));}
  });
  test(`${model}: raycasting coloured execution cells selects their named resource`,()=>{
    const hw=createHardwareModel(THREE,model);hw.setLevel('sm');hw.root.updateMatrixWorld(true);
    for(const id of ['fp32','fp64','int32','sfu','lsu']){
      let first;hw.components[id].group.traverse(o=>{if(o.userData.resourceId===id)first=o;});
      const matrix=new THREE.Matrix4();first.getMatrixAt(0,matrix);const centre=new THREE.Vector3().setFromMatrixPosition(matrix);
      const ray=new THREE.Raycaster(new THREE.Vector3(centre.x,5,centre.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(hw.smRoot,true)[0];assert.ok(hit,'semantic cell must be pickable');
      let actual=null;for(let node=hit.object;node;node=node.parent)if(!actual&&node.userData.componentId)actual=node.userData.componentId;
      assert.equal(actual,id,`${id} must not fall back to generic SM assembly`);
    }
  });
}
