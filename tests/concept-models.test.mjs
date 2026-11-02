import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../three/three.module.js';
import { calculateCameraFit } from '../hardware-model.js';
import { createConceptModel } from '../concept-models.js';

// The model uses canvas lettering; the tests exercise real Three geometry,
// transforms and animation state without depending on a WebGL context.
const renderedLabels=[];
const context=new Proxy({measureText:text=>({width:String(text).length*60}),fillText:text=>renderedLabels.push(String(text))},{get:(object,key)=>key in object?object[key]:(()=>{}),set:(object,key,value)=>(object[key]=value,true)});
globalThis.document={createElement:()=>({width:1024,height:128,getContext:()=>context})};
const stages={
  pagetable:[['cpu'],['tlb'],['pgd'],['pud'],['pmd'],['pte','tlb'],['ram','cache','cpu']],
  pixel:[['pixel'],['tri','pixel'],['raster','tri'],['shader'],['tex','shader'],['depth','pixel'],['fb'],['fb','pixel']],
  stacking:[['lid','logic-top'],['cut-core','logic-top'],['lid','bond','substrate'],['logic-top'],['bond'],['logic-low','mem-layer'],['bond','mem-layer'],['lid','logic-top']]
};
function snapshot(root){
  const objects=[];
  root.traverse(object=>{
    if(!object.isMesh&&!object.isLine&&!object.isSprite)return;
    const materials=(Array.isArray(object.material)?object.material:[object.material]).filter(Boolean);
    objects.push({name:object.name,visible:object.visible,position:object.position.toArray(),rotation:object.quaternion.toArray(),scale:object.scale.toArray(),
      materials:materials.map(material=>({color:material.color?.toArray(),emissive:material.emissive?.toArray(),emissiveIntensity:material.emissiveIntensity,opacity:material.opacity})),
      instances:object.instanceMatrix?Array.from(object.instanceMatrix.array):undefined,
      colors:object.instanceColor?Array.from(object.instanceColor.array):undefined});
  });
  return objects;
}
function resources(root){
  const found=new Map();root.traverse(object=>{if(object.userData.conceptResource)found.set(object.userData.conceptResource,object);});return found;
}
function visibleInTree(object){for(let cursor=object;cursor;cursor=cursor.parent)if(!cursor.visible)return false;return true;}

for(const [journey,expected] of Object.entries(stages)){
  test(`${journey}: conceptual resources follow all ${expected.length} source lesson stages`,()=>{
    const model=createConceptModel(T,journey);
    assert.ok(model.root.isGroup);assert.equal(model.root.userData.semantic,'conceptual');
    assert.equal(model.stepInfo.length,expected.length);
    assert.ok(model.fitObject?.isObject3D);
    assert.ok((model.markers||[]).length<=2,'projected marker count must stay sparse');
    const parts=resources(model.root);assert.ok(parts.size>=expected.flat().filter((id,index,array)=>array.indexOf(id)===index).length);
    const signatures=[];
    expected.forEach((ids,step)=>{
      const result=model.update(step,.7,1.24);
      assert.equal(result.stepIndex,step);assert.equal(result.progress,.7);
      assert.ok(result.stage&&typeof result.stage==='string');
      for(const id of ids){
        assert.ok(result.activeResources.includes(id),`${journey} step ${step+1} must highlight ${id}`);
        assert.ok(parts.has(id),`${id} must have a dedicated scene resource`);
        assert.ok(visibleInTree(parts.get(id)),`active ${id} is hidden`);
      }
      assert.deepEqual(new Set(result.activeResources),new Set(model.stepInfo[step].active));
      assert.deepEqual(new Set(result.activeRoutes),new Set(model.stepInfo[step].routes));
      signatures.push(JSON.stringify({active:result.activeResources,routes:result.activeRoutes,stage:result.stage}));
    });
    assert.equal(new Set(signatures).size,expected.length,'every source step needs a distinct scene state');
    model.dispose?.();
  });

  test(`${journey}: visual cycles animate each step independently of completed mathematical progress`,()=>{
    const model=createConceptModel(T,journey);
    for(let step=0;step<expected.length;step++){
      const first=model.update(step,1,1.13),a=snapshot(model.root);
      const second=model.update(step,1,1.57),b=snapshot(model.root);
      assert.notDeepEqual(a,b,`${journey} step ${step+1} must continue animating after mathematical completion`);
      assert.equal(first.progress,1);assert.equal(second.progress,1);
      assert.deepEqual(first.activeResources,second.activeResources);assert.deepEqual(first.activeRoutes,second.activeRoutes);
      model.update(step,1,1.57);assert.deepEqual(snapshot(model.root),b,'same visual phase must freeze all animation while paused');
      model.update(step,1,2.13);const repeated=snapshot(model.root);
      // Repeated floating-point phases may differ in the last arithmetic bits.
      const rounded=value=>JSON.parse(JSON.stringify(value,(_,item)=>typeof item==='number'?Math.round(item*1e6)/1e6:item));
      assert.deepEqual(rounded(repeated),rounded(a),'one visual cycle must return to the same geometry/highlights');
    }
    model.dispose?.();
  });

  test(`${journey}: geometry stays finite and fits desktop/mobile camera presets`,()=>{
    const model=createConceptModel(T,journey);
    for(let step=0;step<expected.length;step++)for(const progress of [0,.5,1]){
      model.update(step,progress,.39);model.root.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(model.fitObject);
      assert.ok(!bounds.isEmpty());assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
      for(const aspect of [800/500,375/380])for(const direction of [new T.Vector3(.62,.83,1),new T.Vector3(.001,1,.001),new T.Vector3(1,.18,1.05)]){
        const fit=calculateCameraFit(T,bounds,direction.normalize(),38,aspect,1.12);
        const camera=new T.PerspectiveCamera(38,aspect,.08,fit.far);camera.position.copy(fit.position);camera.lookAt(fit.target);camera.updateMatrixWorld(true);
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
          const point=new T.Vector3(x,y,z).project(camera);
          assert.ok(Math.abs(point.x)<=1+1e-8&&Math.abs(point.y)<=1+1e-8,`${journey} stage ${step+1} clips a camera preset`);
        }
      }
    }
    model.dispose?.();
  });

  test(`${journey}: moving pulses remain smaller than 0.1 world units`,()=>{
    const model=createConceptModel(T,journey);let count=0;
    for(let step=0;step<expected.length;step++){
      model.update(step,1,.42);model.root.updateMatrixWorld(true);
      model.root.traverse(object=>{
        if(!object.userData.conceptPulse||!object.geometry)return;
        count++;object.geometry.computeBoundingBox();
        const dimensions=object.geometry.boundingBox.getSize(new T.Vector3());
        const scale=object.getWorldScale(new T.Vector3());
        if(object.isInstancedMesh){
          for(let index=0;index<object.count;index++){
            const matrix=new T.Matrix4();object.getMatrixAt(index,matrix);const instanceScale=new T.Vector3();matrix.decompose(new T.Vector3(),new T.Quaternion(),instanceScale);
            const size=dimensions.clone().multiply(scale).multiply(instanceScale);assert.ok(Math.max(...size.toArray())<.1,'packet may not obscure its conceptual resource');
          }
        }else{
          const size=dimensions.multiply(scale);assert.ok(Math.max(...size.toArray())<.1,'packet may not obscure its conceptual resource');
        }
      });
    }
    assert.ok(count>0,'journey must supply visible route pulses');model.dispose?.();
  });
}


test('the x86-64 exhibit uses four 9-bit indices, preserves the 12-bit offset, and caches a translation separately from data',()=>{
  renderedLabels.length=0;const model=createConceptModel(T,'pagetable');model.update(5,1,1.42);
  const translation=model.root.userData.translation,address=Number(translation.virtualAddress);
  const indices=[39,30,21,12].map(shift=>Math.floor(address/2**shift)%512);
  assert.deepEqual(translation.indices,indices);assert.deepEqual(indices,[0,1,504,1]);
  assert.equal(translation.offset,address%4096);assert.equal(translation.offset,0x234);
  assert.equal(translation.pageBase%4096,0);assert.equal(translation.physicalAddress,translation.pageBase+translation.offset);
  assert.equal(translation.physicalAddress,0x12345234);assert.equal(translation.tlb,'miss');
  assert.equal(renderedLabels.filter(label=>label==='9 bits').length,4);assert.equal(renderedLabels.filter(label=>label==='12 bits').length,1);
  for(const label of ['PML4','PDPT','PD','PT'])assert.ok(renderedLabels.includes(label),`${label} must be visible lettering`);
  const parts=resources(model.root);assert.notEqual(parts.get('tlb'),parts.get('cache'));assert.notEqual(parts.get('cache'),parts.get('ram'));
  const routes=[];model.root.traverse(object=>{if(object.userData.conceptRoute)routes.push(object);});
  const hit=routes.find(object=>object.userData.conceptRoute==='tlb-hit');assert.equal(hit?.userData.kind,'alternative');assert.equal(hit.userData.active,false,'the miss example may not animate the hit alternative');
  assert.ok(model.root.userData.step.activeRoutes.includes('tlb-fill'));
  const stable=structuredClone(translation);model.update(5,1,3.72);assert.deepEqual(model.root.userData.translation,stable,'visual repetition must preserve the translated address');model.dispose();
});

test('the target fragment is the weighted point of the drawn triangle and passes depth before writing framebuffer index 35',()=>{
  const model=createConceptModel(T,'pixel'),parts=resources(model.root);model.update(5,1,.3);
  const fragment=model.root.userData.fragment;
  assert.deepEqual(fragment.weights,[.2,.5,.3]);assert.equal(fragment.weights.reduce((sum,weight)=>sum+weight,0),1);
  const triangle=parts.get('tri').children.find(object=>object.geometry?.attributes?.position?.count===3);
  assert.ok(triangle,'the visible triangle must have three explicit vertices');
  const attribute=triangle.geometry.attributes.position;
  const weighted=new T.Vector3();fragment.weights.forEach((weight,index)=>weighted.addScaledVector(new T.Vector3().fromBufferAttribute(attribute,index),weight));
  const point=parts.get('raster').children.find(object=>object.isMesh&&Math.abs(object.scale.x-.19)<1e-8&&Math.abs(object.scale.z-.19)<1e-8);
  assert.ok(point);assert.ok(Math.abs(weighted.x-point.position.x)<1e-6&&Math.abs(weighted.z-point.position.z)<1e-6,'shown interpolation point must match the actual triangle vertices');
  const vertexColors=triangle.geometry.attributes.color;assert.ok(vertexColors,'the drawn triangle must expose its RGB vertex attributes');
  const interpolatedColor=new T.Vector3();fragment.weights.forEach((weight,index)=>interpolatedColor.addScaledVector(new T.Vector3().fromBufferAttribute(vertexColors,index),weight));
  interpolatedColor.toArray().forEach((channel,index)=>assert.ok(Math.abs(channel-fragment.linearColor[index])<1e-8,'the actual rendered vertex attributes must produce the displayed fragment color'));
  assert.deepEqual(fragment.linearColor,fragment.weights);assert.deepEqual(fragment.rgb,fragment.linearColor.map(channel=>Math.round(channel*255)));
  assert.ok(fragment.depth<fragment.storedDepth);assert.equal(fragment.depthPassed,true);assert.equal(fragment.framebufferWritten,false);assert.equal(fragment.displayed,false);
  model.update(6,1,.3);assert.equal(model.root.userData.fragment.framebufferWritten,true);assert.equal(model.root.userData.fragment.displayed,false);
  const cells=group=>group.children.filter(object=>object.isMesh&&object.material?.isMeshBasicMaterial&&Math.abs(object.scale.x-.16)<1e-8);
  const fbCells=cells(parts.get('fb'));assert.equal(fbCells.length,64);assert.deepEqual(fragment.framebufferSize,[8,8]);assert.equal(fragment.targetIndex,35);assert.equal(fragment.targetRow*8+fragment.targetColumn,fragment.targetIndex);
  const color=new T.Color().setRGB(.2,.5,.3),isTarget=object=>object.material.color.toArray().every((value,index)=>Math.abs(value-color.toArray()[index])<1e-8);
  const fbTarget=fbCells.filter(isTarget);assert.equal(fbTarget.length,1,'exactly one framebuffer cell receives the fragment color');
  const rank=(items,target,axis)=>Array.from(new Set(items.map(cell=>cell.position[axis]))).sort((a,b)=>a-b).indexOf(target.position[axis]);
  assert.equal(rank(fbCells,fbTarget[0],'x'),3);assert.equal(rank(fbCells,fbTarget[0],'z'),4);
  model.update(7,1,.3);const displayCells=cells(parts.get('pixel'));assert.equal(displayCells.length,64);const displayTarget=displayCells.filter(isTarget);assert.equal(displayTarget.length,1);
  assert.equal(rank(displayCells,displayTarget[0],'x'),3);assert.equal(rank(displayCells,displayTarget[0],'y'),3,'the display flips the framebuffer row orientation consistently');model.dispose();
});

test('binning keeps the disabled core physically present and the six layer order is preserved when separated',()=>{
  const model=createConceptModel(T,'stacking'),parts=resources(model.root),core=parts.get('cut-core');
  const geometry=core.children.filter(object=>object.isMesh).map(object=>object.geometry);assert.ok(geometry.length>0);
  model.update(1,0,.18);const initial=new T.Box3().setFromObject(core).getSize(new T.Vector3());
  for(const progress of [.5,1]){
    model.update(1,progress,.71);assert.equal(core.visible,true);assert.equal(core.userData.disabled,true);assert.equal(core.userData.physicallyPresent,true);
    assert.deepEqual(core.children.filter(object=>object.isMesh).map(object=>object.geometry),geometry,'binning must not delete silicon geometry');
    assert.ok(new T.Box3().setFromObject(core).getSize(new T.Vector3()).distanceTo(initial)<1e-8);
    assert.equal(model.root.userData.stack.disabledCorePhysicallyPresent,true);
  }
  const scan=[];model.root.traverse(object=>{if(object.userData.conceptRoute==='bin-scan')scan.push(object);});assert.equal(scan[0].userData.kind,'selection','disabled cores receive a selection cue rather than a working signal');
  const ids=['lid','logic-top','bond','logic-low','mem-layer','substrate'];
  for(const progress of [0,.5,1]){
    model.update(2,progress,.3);assert.equal(model.root.userData.stack.layerCount,6);
    for(let index=1;index<ids.length;index++)assert.ok(parts.get(ids[index-1]).position.y>parts.get(ids[index]).position.y,'separation may not reorder the functional layers');
  }
  model.dispose();
});

for(const [journey,steps] of Object.entries(stages))test(`${journey}: fixed fitting bounds contain every animated stage`,()=>{
  const model=createConceptModel(T,journey);assert.ok(model.bounds?.isBox3);
  for(let step=0;step<steps.length;step++)for(const progress of [0,.5,1])for(const phase of [.13,.66]){
    model.update(step,progress,phase);model.root.updateMatrixWorld(true);
    const actual=new T.Box3().setFromObject(model.root);
    assert.ok(model.bounds.containsBox(actual),`fixed fit clips ${journey} step ${step+1}, progress ${progress}`);
  }
  model.dispose();
});
