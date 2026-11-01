import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../three/three.module.js';
import {createPowerDetail} from '../power-model.js';
import {createInterconnectDetail} from '../interconnect-model.js';

// Only printed surface textures are mocked. Mesh hierarchy, instancing,
// transforms and bounding boxes are actual Three.js geometry.
const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>context})};
const finiteBox=b=>[...b.min.toArray(),...b.max.toArray()].every(Number.isFinite)&&!b.isEmpty();
for(const model of ['h100','a100']){
  for(const [name,create] of [['power',createPowerDetail],['interconnect',createInterconnectDetail]]){
    test(`${model} ${name}: selectable physical components have finite local geometry`,()=>{
      const detail=create(T,model);
      assert.equal(detail.root.visible,false);
      assert.equal(detail.specification.illustrative,true);
      assert.ok(Object.keys(detail.components).length>=8);
      detail.root.updateMatrixWorld(true);
      for(const c of Object.values(detail.components)){
        assert.equal(c.level,name);assert.ok(c.label.length>0);assert.ok(c.description.length>15);
        assert.ok(c.id.startsWith(name==='power'?'power-':'link-'));
        assert.equal(c.group.userData.componentId,c.id);
        assert.ok(finiteBox(new T.Box3().setFromObject(c.group)),`${c.id} has real visible geometry`);
        for(const n of detail.anchors[c.id].toArray())assert.ok(Number.isFinite(n));
      }
      let instanced=0,drawables=0;
      detail.root.traverse(o=>{if(o.isInstancedMesh)instanced+=o.count;if(o.isMesh)drawables++;});
      assert.ok(instanced>100,'repeated contacts/capacitors should be batched');
      assert.ok(drawables<450,'detail must not become hundreds of per-pad draw calls');
    });
    test(`${model} ${name}: dissection is clamped, finite and reversible`,()=>{
      const detail=create(T,model);detail.setExplode(0);detail.root.updateMatrixWorld(true);
      const start=new T.Box3().setFromObject(detail.root);
      for(const p of [-1,0,.5,1,3]){
        detail.setExplode(p);detail.root.updateMatrixWorld(true);
        assert.ok(finiteBox(new T.Box3().setFromObject(detail.root)));
      }
      detail.setExplode(0);detail.root.updateMatrixWorld(true);
      const reset=new T.Box3().setFromObject(detail.root);
      assert.ok(start.min.distanceTo(reset.min)<1e-8);assert.ok(start.max.distanceTo(reset.max)<1e-8);
    });
  }
  test(`${model} power: control/sense path is separate from the load-current path`,()=>{
    const detail=createPowerDetail(T,model),power=detail.paths.find(p=>p.kind==='power'),control=detail.paths.find(p=>p.kind==='control');
    assert.deepEqual(power.stages,['power-input','power-stage','power-inductor','power-output','power-rail']);
    assert.ok(!power.stages.includes('power-controller'));
    assert.ok(control.stages.includes('power-controller'));assert.ok(control.stages.includes('power-feedback'));
    let winding=0,core=0;detail.components['power-inductor'].group.traverse(o=>{if(o.material===detail.materials.copper)winding++;if(o.material===detail.materials.core)core++;});
    assert.ok(winding>=5&&core>=4,'opened inductor must expose both conductor and core');
    assert.ok(detail.components['power-board'].description.includes('不代表'));
  });
  test(`${model} interconnect: vias, return plane and connector are distinct hierarchical objects`,()=>{
    const detail=createInterconnectDetail(T,model);
    assert.notEqual(detail.components['link-vias'].group,detail.components['link-ground'].group);
    assert.ok(detail.components['link-vias'].description.includes('TSV'));
    assert.ok(detail.components['link-socket'].description.includes('并非 NVIDIA 引脚图'));
    assert.deepEqual(detail.paths.find(p=>p.kind==='signal').stages,['link-socket','link-vias','link-pairs','link-footprint']);
    assert.ok(detail.paths.find(p=>p.kind==='reference').stages.includes('link-ground'));
    const socketBox=new T.Box3().setFromObject(detail.components['link-socket'].group);
    assert.ok(socketBox.max.z>4.4,'connector witness view must be exposed beyond opaque PCB edge');
  });
}
