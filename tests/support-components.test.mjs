import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../three/three.module.js';
import {createPowerDetail} from '../power-model.js';
import {createInterconnectDetail} from '../interconnect-model.js';

// Only printed surface textures are mocked. Mesh hierarchy, instancing,
// transforms and bounding boxes are actual Three.js geometry.
const context=new Proxy({measureText(text){return {width:text.length*Number(this.font.match(/([\d.]+)px/)?.[1]||16)*.61};}}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
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
        assert.equal(c.level,name);assert.ok(c.label.zh&&c.label.en,'bilingual label');assert.ok(c.description.zh.length>15&&c.description.en.length>15,'bilingual description');
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
    test(`${model} ${name}: surface lettering keeps its physical aspect and fits inside its texture`,()=>{
      const detail=create(T,model),marks=[];
      detail.root.traverse(o=>{if(o.userData.surfaceText)marks.push(o);});
      assert.ok(marks.length>=6,'surface marks should remain explicit inspectable meshes');
      for(const mark of marks){
        const {width,height}=mark.geometry.parameters,image=mark.material.map.image,data=mark.userData.surfaceText;
        assert.ok(Math.abs(image.width/image.height-width/height)/(width/height)<.01,`${data.text} must not stretch glyphs`);
        assert.ok(data.fontSize>=20,`${data.text} needs enough source pixels for oblique views`);
        assert.ok(data.fontSize<=image.height,`${data.text} must fit the label height`);
        assert.equal(mark.material.toneMapped,false,'printed ink should not wash out with metallic lighting');
      }
    });
  }
  test(`${model} power: control/sense path is separate from the load-current path`,()=>{
    const detail=createPowerDetail(T,model),power=detail.paths.find(p=>p.kind==='power'),control=detail.paths.find(p=>p.kind==='control');
    assert.deepEqual(power.stages,['power-input','power-stage','power-inductor','power-output','power-rail']);
    assert.ok(!power.stages.includes('power-controller'));
    assert.ok(control.stages.includes('power-controller'));assert.ok(control.stages.includes('power-feedback'));
    let winding=0,core=0;detail.components['power-inductor'].group.traverse(o=>{if(o.material===detail.materials.copper)winding++;if(o.material===detail.materials.core)core++;});
    assert.ok(winding>=5&&core>=4,'opened inductor must expose both conductor and core');
    assert.match(detail.components['power-board'].description.zh,/降压.*电感.*电容/);assert.match(detail.components['power-board'].description.en,/buck.*Inductors.*capacitors/);
  });
  test(`${model} power: winding turns connect and the lid markings stay on their shells`,()=>{
    const detail=createPowerDetail(T,model),turns=[],marks=[];
    detail.root.traverse(o=>{if(Number.isInteger(o.userData.windingTurn))turns.push(o);if(o.userData.surfaceText?.text==='R22'&&o.parent?.name?.startsWith('inductor-shell'))marks.push(o);});
    turns.sort((a,b)=>a.userData.windingTurn-b.userData.windingTurn);assert.equal(turns.length,5);
    for(let i=1;i<turns.length;i++)assert.ok(turns[i-1].geometry.parameters.path.getPoint(1).distanceTo(turns[i].geometry.parameters.path.getPoint(0))<1e-6,'a winding must be continuous instead of disconnected closed rings');
    assert.equal(marks.length,5);detail.setExplode(0);detail.root.updateMatrixWorld(true);
    const initial=marks.map(o=>o.getWorldPosition(new T.Vector3()));detail.setExplode(1);detail.root.updateMatrixWorld(true);
    marks.forEach((o,i)=>assert.ok(Math.abs(o.getWorldPosition(new T.Vector3()).y-initial[i].y-.45)<1e-8,'a package marking must move with its physical shell'));
  });
  test(`${model} interconnect: vias, return plane and connector are distinct hierarchical objects`,()=>{
    const detail=createInterconnectDetail(T,model);
    assert.notEqual(detail.components['link-vias'].group,detail.components['link-ground'].group);
    assert.ok(detail.components['link-vias'].description.zh.includes('TSV')&&detail.components['link-vias'].description.en.includes('TSV'));
    assert.match(detail.components['link-socket'].description.en,/module.*server board.*power.*signals/);
    assert.deepEqual(detail.paths.find(p=>p.kind==='signal').stages,['link-socket','link-vias','link-pairs','link-footprint']);
    assert.ok(detail.paths.find(p=>p.kind==='reference').stages.includes('link-ground'));
    const socketBox=new T.Box3().setFromObject(detail.components['link-socket'].group);
    assert.ok(socketBox.max.z>4.4,'connector witness view must be exposed beyond opaque PCB edge');
  });
}
