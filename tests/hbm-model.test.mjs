import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../three/three.module.js';
import { createHBMDetail } from '../hbm-model.js';
import { createHardwareModel, calculateCameraFit } from '../hardware-model.js';

const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>context})};

for(const model of ['h100','a100']) {
  test(`${model}: HBM interface channels are independent of the illustrative die count`,()=>{
    const detail=createHBMDetail(T,model),s=detail.specification;
    assert.equal(s.channels*s.channelBits,1024);
    assert.equal(s.pseudoChannels,s.channels*2);
    assert.equal(s.channels,model==='h100'?16:8);
    assert.ok(s.scope.includes('不对应特定供应商版图'));
    assert.ok(detail.components['hbm-channel'].description.includes('不等于 DRAM 层数'));
    assert.ok(detail.components['hbm-controller'].description.includes('GPU 内部'));
  });

  test(`${model}: the open quadrant exposes silicon TSVs through the complete stack`,()=>{
    const detail=createHBMDetail(T,model);
    for(const amount of [0,.5,1,0]) {
      detail.setExplode(amount);detail.root.updateMatrixWorld(true);
      const ray=new T.Raycaster(new T.Vector3(-.74,8,.8),new T.Vector3(0,-1,0));
      const hits=ray.intersectObject(detail.root,true);
      assert.equal(hits[0]?.object.parent.userData.componentId,'hbm-tsv','cutaway must expose the TSV, not a solid DRAM cap');
      assert.ok(hits[0].point.y>detail.layerGroups.at(-1).position.y);
      for(let layer=1;layer<detail.layerGroups.length;layer++)assert.ok(detail.layerGroups[layer].position.y-detail.layerGroups[layer-1].position.y>.40,'slices may not intersect during decomposition');
      assert.ok(hits.some(hit=>hit.object.parent.userData.componentId==='hbm-base'),'the TSV continues to the interface die');
    }
    const assembled=detail.getBounds().clone();detail.setExplode(1);const exploded=detail.getBounds();
    assert.ok(exploded.max.y>assembled.max.y+1.4,'bounding volume must be refreshed after stretching instanced TSVs');
    detail.setExplode(0);assert.ok(detail.getBounds().max.distanceTo(assembled.max)<1e-5,'decomposition must be reversible');
  });

  test(`${model}: HBM detail stays framed in portrait and landscape after decomposition`,()=>{
    const detail=createHBMDetail(T,model);
    for(const amount of [0,1])for(const aspect of [274/750,375/380,814/440]) {
      detail.setExplode(amount);const bounds=detail.getBounds();
      const fit=calculateCameraFit(T,bounds,new T.Vector3(.62,.83,1),38,aspect,1.1);
      const camera=new T.PerspectiveCamera(38,aspect,.08,fit.far);camera.position.copy(fit.position);camera.lookAt(fit.target);camera.updateMatrixWorld(true);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
        const p=new T.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>=-1&&p.z<=1,'a detail bounds corner would be clipped');
      }
    }
    let drawObjects=0,instanceCount=0;detail.root.traverse(o=>{if(o.isMesh)drawObjects++;if(o.isInstancedMesh)instanceCount+=o.count;});
    assert.ok(drawObjects<125,'repeated bank, bump and TSV detail should remain instanced');
    assert.ok(instanceCount>1000);
  });

  test(`${model}: each of seven exploration scales shows only its own roots`,()=>{
    const hardware=createHardwareModel(T,model);
    const roots={board:[hardware.pcb,hardware.serial],package:[hardware.serial],die:[hardware.serial],sm:[hardware.smRoot],hbm:[hardware.hbmRoot],power:[hardware.powerRoot],interconnect:[hardware.interconnectRoot]};
    const all=new Set(Object.values(roots).flat());
    for(const level of ['board','hbm','sm','power','package','interconnect','die','board']) {
      hardware.setLevel(level);
      for(const root of all)assert.equal(root.visible,roots[level].includes(root),`${level}: an unrelated scale is visible`);
      hardware.setExplode(1);hardware.setExplode(0);
    }
    assert.equal(hardware.siliconCoverMaterial,hardware.siliconCover.material);
    assert.equal(hardware.anchors['hbm-tsv'],hardware.hbmDetail.anchors['hbm-tsv']);
    for(const detail of [hardware.hbmDetail,hardware.powerDetail,hardware.interconnectDetail])for(const component of Object.values(detail.components))assert.equal(hardware.components[component.id],component,'detail components must remain pickable');
  });
}
