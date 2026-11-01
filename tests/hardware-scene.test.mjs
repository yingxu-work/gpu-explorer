import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../three/three.module.js';
import { createHardwareModel,calculateCameraFit,isolateHardwareSubtree } from '../hardware-model.js';

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
