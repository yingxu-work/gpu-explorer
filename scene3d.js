import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHardwareModel, isolateHardwareSubtree } from './hardware-model.js?v=20261102d';

// The hardware and the lesson share a scene, but never confuse a logical
// operation with a separate physical chip. A/B/C are regions in HBM; Shared
// Memory, register files and tensor units are inside an SM.
const ALIASES = { 'a-tile': 'hbm', 'b-tile': 'hbm', 'c-out': 'hbm' };
const LEVELS = ['board', 'package', 'die', 'sm'];
const LABELS = { board: ['gpu-die', 'hbm', 'power'], package: ['gpu-die', 'hbm', 'interposer'], die: ['sm', 'l2'], sm: ['warp', 'registers', 'tensor', 'smem'] };
const LEVEL_INFO = { board:'SXM MODULE', package:'GPU PACKAGE', die:'SILICON FLOORPLAN', sm:'STREAMING MULTIPROCESSOR' };
const EASE = t => 1 - Math.pow(1 - t, 3);
const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));

function environment(renderer) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const c = canvas.getContext('2d'); c.fillStyle='#394047'; c.fillRect(0,0,1024,512);
  let gradient=c.createLinearGradient(0,0,0,512); gradient.addColorStop(0,'#9eb4c6');gradient.addColorStop(.45,'#222a31');gradient.addColorStop(.65,'#10161b');gradient.addColorStop(1,'#394340');c.fillStyle=gradient;c.fillRect(0,0,1024,512);
  c.fillStyle='#e7edf1';c.fillRect(80,70,130,130);c.fillRect(480,35,260,85);
  c.fillStyle='#a9bbc8';c.fillRect(840,110,80,240);
  c.fillStyle='#eadbc1';c.fillRect(260,190,36,140);
  const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); const target=pmrem.fromEquirectangular(texture);texture.dispose();pmrem.dispose();return target;
}

class HardwareScene {
  constructor(container, compare = false) {
    this.container=container;this.compare=compare;this.level='board';this.model='h100';this.selected=null;this.hovered=null;this.explode=0;this.explodeTarget=0;this.progress=0;this.labelsVisible=true;this.isolated=false;this.flowObjects=[];this.labelNodes=[];this.picking=true;this.lastStep='';this.userSelection=false;this.autoFrame=true;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const canvas=this.renderer.domElement;
    canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline:none;';
    canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','可交互 GPU 三维模型。拖动旋转，滚轮缩放，右键平移，双击进入。F 聚焦，I 隔离，R 复位。');
    container.appendChild(canvas);
    this.scene=new THREE.Scene();
    this.scene.fog=new THREE.FogExp2(0x11191b,.011);
    this.camera=new THREE.PerspectiveCamera(38,1,.08,180);this.camera.position.set(16,18.2,21.8);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,.2,0);this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.minDistance=2.8;this.controls.maxDistance=52;this.controls.maxPolarAngle=Math.PI*.86;this.controls.panSpeed=.7;this.controls.rotateSpeed=.65;this.controls.zoomSpeed=.9;
    this.controls.addEventListener('start',()=>{this.cameraTween=null;this.controls.enabled=true;this.autoFrame=false;});
    this.environment=environment(this.renderer);this.scene.environment=this.environment.texture;
    this.scene.add(new THREE.HemisphereLight(0xdce8f2,0x363c2c,1.25));
    const key=new THREE.DirectionalLight(0xfff1d7,3.5);key.position.set(-8,16,10);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=15;key.shadow.camera.bottom=-15;key.shadow.camera.near=1;key.shadow.camera.far=55;key.shadow.normalBias=.035;key.shadow.bias=-.0002;this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xa5c8de,1.9);fill.position.set(10,9,-8);this.scene.add(fill);
    const rim=new THREE.DirectionalLight(0xf5e0b3,1.5);rim.position.set(-12,3,-10);this.scene.add(rim);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.ShadowMaterial({opacity:.27}));ground.rotation.x=-Math.PI/2;ground.position.y=-.86;ground.receiveShadow=true;this.scene.add(ground);
    this.ground=ground;
    this.flowGroup=new THREE.Group();this.scene.add(this.flowGroup);
    this.outline=new THREE.Box3Helper(new THREE.Box3(),0xeac27a);this.outline.material.transparent=true;this.outline.material.opacity=.82;this.outline.material.depthTest=false;this.outline.renderOrder=12;this.outline.visible=false;this.scene.add(this.outline);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.dragStart=null;
    this.labelLayer=document.createElement('div');this.labelLayer.className='hardware-label-layer';this.labelLayer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3;';container.appendChild(this.labelLayer);
    this.makeModel('h100');this.bind();this.resize();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
  }

  makeModel(model) {
    if(this.hardware){this.scene.remove(this.hardware.root);this.disposeObject(this.hardware.root);}
    this.model=model;
    this.hardware=createHardwareModel(THREE,model==='a100'?'a100':'h100');
    this.scene.add(this.hardware.root);this.hardware.setExplode(this.explode);this.setVisibility();this.makeLabels();
    this.container.dataset.model=model;this.container.dataset.level=this.level;
  }

  disposeObject(root) {
    const geometry=new Set(),materials=new Set(),textures=new Set();
    root.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.map)textures.add(m.map);}});
    geometry.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
  }

  bind() {
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{this.dragStart={x:event.clientX,y:event.clientY};this.cameraTween=null;});
    canvas.addEventListener('pointerup',event=>{
      if(!this.dragStart||Math.hypot(event.clientX-this.dragStart.x,event.clientY-this.dragStart.y)>5)return;
      const hit=this.pick(event);if(hit)this.selectComponent(hit);
    });
    canvas.addEventListener('dblclick',event=>{
      const id=this.pick(event);if(!id)return;
      this.selectComponent(id);
      if(id==='gpu-die')this.setLevel('die');
      else if(id==='sm')this.setLevel('sm');
      else if(id==='package'||id==='interposer')this.setLevel('package');
      else this.focusSelected();
    });
    canvas.addEventListener('pointermove',event=>{
      const hit=this.pick(event);this.hovered=hit;canvas.style.cursor=hit?'pointer':'grab';
      const tip=document.getElementById('tooltip');
      if(tip&&hit){const info=this.hardware.components[hit];tip.textContent=info?`${info.label} · 双击聚焦`:hit;tip.hidden=false;tip.style.display='block';tip.style.left=`${Math.min(event.clientX+14,window.innerWidth-250)}px`;tip.style.top=`${Math.min(event.clientY+15,window.innerHeight-65)}px`;}
      else if(tip){tip.hidden=true;tip.style.display='none';}
    });
    canvas.addEventListener('pointerleave',()=>{this.hovered=null;const tip=document.getElementById('tooltip');if(tip){tip.hidden=true;tip.style.display='none';}});
    canvas.addEventListener('keydown',event=>{
      const key=event.key.toLowerCase();
      if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(event.key)&&window.__gpuExplorerMoveSelection){event.preventDefault();event.stopPropagation();window.__gpuExplorerMoveSelection(['ArrowRight','ArrowDown'].includes(event.key)?1:-1);return;}
      if(['f','i','r','escape','backspace'].includes(key)){event.preventDefault();event.stopPropagation();}
      if(key==='f'){const button=document.getElementById('focus-btn');if(button)button.click();else this.focusSelected();}
      else if(key==='i'){const button=document.getElementById('isolate-btn');if(button)button.click();else this.isolateSelected();}
      else if(key==='r'){const button=document.getElementById('home-btn');if(button)button.click();else this.resetView();}
      else if(key==='escape'){if(this.isolated){const button=document.getElementById('isolate-btn');if(button)button.click();else this.isolateSelected(false);}this.selected=null;this.userSelection=false;this.outline.visible=false;window.dispatchEvent(new CustomEvent('gpu-isolation-change',{detail:{isolated:false,selected:null}}));}
      else if(key==='backspace')this.setLevel(LEVELS[Math.max(0,LEVELS.indexOf(this.level)-1)]);
    });
  }

  resize() {
    const width=this.container.clientWidth||800,height=this.container.clientHeight||600;
    this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    // A resize wins over the old hierarchy transition. Otherwise the next
    // animation frame would restore a camera target fitted to the old aspect.
    this.cameraTween=null;
    if(this.hardware)this.fitView(0,true);
  }

  pick(event) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObject(this.hardware.root,true);
    for(const hit of hits){let node=hit.object,visible=true,id=null;while(node){if(!node.visible)visible=false;if(!id&&node.userData.componentId)id=node.userData.componentId;node=node.parent;}if(visible&&id)return id;}
    return null;
  }

  canonical(id) {
    if(this.level!=='sm'&&['warp','smem','tensor','registers','sm-detail'].includes(id))return'sm';
    if(this.level==='sm'&&id==='sm')return'sm-detail';
    return ALIASES[id]||id;
  }

  getComponents() {
    return Object.values(this.hardware.components).map(({id,label,description,level,parent})=>({id,label,description,level,parent}));
  }

  selectComponent(id,notify=true) {
    // Tree selection is an explicit physical navigation action. Logical
    // lesson selection enters through update(), so it never forces a level.
    const rawComponent=this.hardware.components[id];
    if(notify&&rawComponent?.level==='sm'&&this.level!=='sm')this.setLevel('sm');
    else if(notify&&rawComponent&&this.level==='sm'&&rawComponent.level!=='sm')this.setLevel(rawComponent.level);
    else if(notify&&['sm','l2'].includes(id)&&['board','package'].includes(this.level))this.setLevel('die');
    const key=this.canonical(id),component=this.hardware.components[key];if(!component)return;
    this.selected=id;this.userSelection=true;
    if(this.isolated)this.setVisibility();
    if(notify&&!this.compare){
      window.dispatchEvent(new CustomEvent('gpu-component-select',{detail:{id,label:component.label,description:component.description,level:component.level}}));
      // Preserve the existing app contract for logical teaching nodes.
      if(this.state?.journey==='gemm'&&this.journey?.nodes?.some(node=>node.id===id)&&window.__gpuExplorerOnSelect)window.__gpuExplorerOnSelect(id);
    }
  }

  setVisibility() {
    const hw=this.hardware;
    // Restore only objects changed by isolation before setting normal level
    // visibility. Substrate/frame meshes are siblings, not selected content.
    for(const object of this.isolationHidden||[])object.visible=true;
    this.isolationHidden=[];
    hw.setLevel?.(this.level);
    hw.pcb.visible=this.level==='board';hw.serial.visible=this.level!=='sm';hw.smRoot.visible=this.level==='sm';
    this.ground.visible=this.level==='board';
    // Restore every component before applying isolation, including components
    // hidden by an earlier isolation at a different hierarchy level.
    for(const item of Object.values(hw.components)) {
      if(item.id!=='pcb'&&item.id!=='package')item.group.visible=true;
    }
    if(this.isolated&&this.selected){
      const keep=hw.components[this.canonical(this.selected)]?.group;
      if(keep)this.isolationHidden=isolateHardwareSubtree(hw.root,keep);
    }
  }

  setLevel(level,animate=true) {
    if(!LEVELS.includes(level))return;
    const changed=this.level!==level,wasIsolated=this.isolated;this.level=level;this.isolated=false;this.setVisibility();this.makeLabels();this.container.dataset.level=level;
    this.lastFlowKey='';if(this.step)this.buildFlows(this.step);
    this.autoFrame=true;this.fitView(animate?850:0);
    if(wasIsolated&&!this.compare)window.dispatchEvent(new CustomEvent('gpu-isolation-change',{detail:{isolated:false}}));
    if(changed&&!this.compare)window.dispatchEvent(new CustomEvent('gpu-level-change',{detail:{level,label:LEVEL_INFO[level]}}));
  }

  setExplode(value) {this.explodeTarget=clamp(value);if(this.autoFrame&&performance.now()-(this.lastExplodeFit||0)>150){this.fitView(550,true);this.lastExplodeFit=performance.now();}}
  setProgress(value) {this.progress=clamp(value);}
  setLabels(value) {this.labelsVisible=value===undefined?!this.labelsVisible:!!value;this.labelLayer.style.display=this.labelsVisible?'':'none';return this.labelsVisible;}

  moveCamera(position,target,duration=800) {
    if(duration===0){this.cameraTween=null;this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();return;}
    this.cameraTween={from:this.camera.position.clone(),to:position.clone(),targetFrom:this.controls.target.clone(),targetTo:target.clone(),start:performance.now(),duration};
  }

  fitView(duration=650,preserveDirection=false) {
    const hw=this.hardware;if(!hw)return;
    // Fit camera-space corners rather than a bounding sphere. A sphere would
    // shrink this flat board unnecessarily on a wide desktop viewport, while
    // a fixed camera distance clips it on a narrow phone viewport.
    hw.setExplode(this.explodeTarget);hw.root.updateMatrixWorld(true);
    let bounds;
    if(this.isolated&&this.selected&&hw.components[this.canonical(this.selected)])bounds=new THREE.Box3().setFromObject(hw.components[this.canonical(this.selected)].group);
    else if(this.level==='board')bounds=new THREE.Box3().setFromObject(hw.pcb).union(new THREE.Box3().setFromObject(hw.serial));
    else if(this.level==='package')bounds=new THREE.Box3().setFromObject(hw.serial);
    else if(this.level==='die')bounds=new THREE.Box3().setFromObject(hw.components['gpu-die'].group);
    else bounds=new THREE.Box3().setFromObject(hw.smRoot);
    hw.setExplode(this.explode);hw.root.updateMatrixWorld(true);
    if(bounds.isEmpty())return;
    const target=bounds.getCenter(new THREE.Vector3());
    const direction=preserveDirection?this.camera.position.clone().sub(this.controls.target).normalize():new THREE.Vector3(.62,.83,1).normalize();
    const right=new THREE.Vector3(0,1,0).cross(direction).normalize();if(right.lengthSq()<.01)right.set(1,0,0);
    const up=direction.clone().cross(right).normalize();
    const tangent=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    const margin=Math.max(this.camera.aspect<1.1?1.10:1,{board:1.025,package:1.11,die:1.22,sm:1.10}[this.level]);let distance=3.5;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const relative=new THREE.Vector3(x,y,z).sub(target),near=relative.dot(direction);
      distance=Math.max(distance,near+Math.abs(relative.dot(right))*margin/(tangent*this.camera.aspect),near+Math.abs(relative.dot(up))*margin/tangent);
    }
    this.moveCamera(target.clone().addScaledVector(direction,distance+.2),target,duration);
  }

  setCamera(name) {
    const target=this.controls.target.clone();const distance=this.camera.position.distanceTo(target);
    const direction=name==='top'?new THREE.Vector3(.001,1,.001):name==='side'?new THREE.Vector3(1,.18,1.05).normalize():new THREE.Vector3(.62,.83,1).normalize();
    this.moveCamera(target.clone().addScaledVector(direction,distance),target);
  }

  focusSelected() {
    const key=this.canonical(this.selected||(this.state?.journey==='gemm'?this.step?.active?.[0]:null)||'gpu-die');const component=this.hardware.components[key];if(!component)return;
    this.hardware.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(component.group);if(bounds.isEmpty())return;
    const size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());
    const distance=Math.max(size.x,size.z,size.y*1.5)*1.65;
    const direction=this.camera.position.clone().sub(this.controls.target).normalize();this.moveCamera(centre.clone().addScaledVector(direction,Math.max(3.2,distance)),centre);
  }

  isolateSelected(value) {
    if(!this.selected&&value!==false)this.selectComponent(this.state?.journey==='gemm'?this.step?.active?.[0]||'gpu-die':'gpu-die',false);
    const selectedComponent=this.hardware.components[this.canonical(this.selected)];
    if(value!==false&&this.level==='sm'&&selectedComponent&&selectedComponent.level!=='sm')this.setLevel(selectedComponent.level);
    if(value!==false&&['sm','l2'].includes(this.canonical(this.selected))&&['board','package'].includes(this.level))this.setLevel('die');
    this.isolated=value===undefined?!this.isolated:!!value;this.setVisibility();if(this.isolated)this.focusSelected();return this.isolated;
  }

  resetView() {this.isolated=false;this.selected=null;this.userSelection=false;this.setLevel(this.level);}
  clearSelection() {this.selected=null;this.userSelection=false;this.lastStateSelection=this.state?.selected;this.outline.visible=false;}

  makeLabels() {
    this.labelLayer.replaceChildren();this.labelNodes=[];
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;';this.labelLayer.appendChild(svg);
    for(const id of LABELS[this.level]){
      const info=this.hardware.components[id];if(!info)continue;
      const node=document.createElement('button');node.type='button';node.className='hardware-label';node.dataset.component=id;
      const short={ 'gpu-die':this.hardware.specification.die+' GPU',hbm:`5 × ${this.hardware.specification.hbm}`,power:'VRM / POWER',interposer:'SILICON INTERPOSER',sm:this.hardware.specification.sm+' ACTIVE SMs',l2:this.hardware.specification.l2+' L2',warp:'WARP SCHEDULER',registers:'REGISTER FILE',tensor:'TENSOR CORE',smem:'L1 / SHARED MEMORY' };
      node.textContent=short[id]||info.label;
      node.setAttribute('aria-label',info.label+'，点击选中');
      node.style.cssText='position:absolute;pointer-events:auto;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(15,24,26,.88);color:#c8d2cb;border:1px solid rgba(174,195,177,.27);border-radius:3px;padding:6px 9px;font:500 10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.055em;box-shadow:0 2px 12px #0003;cursor:pointer;';
      node.addEventListener('click',()=>this.selectComponent(id));node.addEventListener('dblclick',()=>{this.selectComponent(id);if(id==='sm')this.setLevel('sm');else if(id==='gpu-die')this.setLevel('die');else this.focusSelected();});
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('stroke','rgba(174,195,177,.5)');line.setAttribute('stroke-width','1');svg.appendChild(line);
      const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r','2');dot.setAttribute('fill','#c7b484');svg.appendChild(dot);
      this.labelLayer.appendChild(node);this.labelNodes.push({id,node,line,dot});
    }
    this.labelLayer.style.display=this.labelsVisible?'':'none';
  }

  anchor(id) {
    const hw=this.hardware;
    if(this.level==='sm'){
      const map={ 'a-tile':[-5.6,.6,3.0],'b-tile':[5.6,.6,3.0],'c-out':[5.6,.6,1.5],sm:[-3.88,.8,1.48],'sm-detail':[0,.7,0],warp:[-3.88,.6,-2.68],smem:[0,.64,3.21],tensor:[-3.88,.8,1.48],registers:[-3.88,.6,-1.5],'gpu-die':[0,.6,0] };
      return new THREE.Vector3(...(map[id]||[0,.7,0]));
    }
    if(['smem','warp','tensor','registers'].includes(id))id='sm';
    const a=hw.anchors[id]||hw.anchors[this.canonical(id)]||hw.anchors['gpu-die'];const result=a.clone();
    const key=this.canonical(id);
    if(['hbm','gpu-die','l2','sm'].includes(key))result.y+=this.explode*3.1;
    if(key==='hbm')result.y+=this.explode*.55;
    if(key==='interposer')result.y+=this.explode*1.8;
    if(key==='package')result.y+=this.explode*.9;
    return result;
  }

  buildFlows(step) {
    this.flowGroup.clear();for(const item of this.flowObjects){item.geometry?.dispose();item.material?.dispose();}this.flowObjects=[];
    // Page translation, pixels and stacking are independent conceptual labs.
    // Animating their nodes on an H100 board would teach a false topology.
    if(this.state?.journey!=='gemm')return;
    const flows=step.flows||[];
    for(let index=0;index<flows.length;index++){
      const flow=flows[index];let from,to;
      if(typeof flow==='string')[from,to]=flow.split('>');else({from,to}=flow);
      if(!from||!to)continue;
      const start=this.anchor(from),end=this.anchor(to);
      if(start.distanceTo(end)<.3)continue;
      const middle=start.clone().lerp(end,.5);middle.y+=this.level==='sm'?.9:1.0;
      const curve=new THREE.QuadraticBezierCurve3(start,middle,end);
      const geometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const material=new THREE.LineBasicMaterial({color:0xeac789,transparent:true,opacity:.24,depthTest:false});
      const line=new THREE.Line(geometry,material);line.renderOrder=8;this.flowGroup.add(line);
      const dots=[];
      for(let particle=0;particle<5;particle++){
        const geo=new THREE.SphereGeometry(this.level==='sm'?.045:.065,8,6);const mat=new THREE.MeshBasicMaterial({color:particle?0xc79b56:0xffdda0,transparent:true,opacity:1-particle*.15,depthTest:false});
        const dot=new THREE.Mesh(geo,mat);dot.renderOrder=10;this.flowGroup.add(dot);dots.push(dot);this.flowObjects.push(dot);
      }
      this.flowObjects.push({curve,dots,geometry,material,flowIndex:index});
    }
  }

  update(journey,step,state) {
    this.journey=journey;this.step=step;this.state=state;
    if(state.model!==this.model)this.makeModel(state.model);
    // User inspection is sticky while a step animates, but changing steps
    // returns the highlight to the lesson's active physical location.
    const key=`${state.journey}:${state.stepIndex}`;
    const restarted=(Number(state.stepProgress)||0)<.01&&this.progress>.02;
    if(state.journey!=='gemm'){
      if(this.lastStep!==key){if(!this.userSelection)this.selected=null;this.lastStep=key;this.buildFlows(step);}
    }else if(this.lastStep!==key||restarted){this.lastStep=key;this.userSelection=false;this.selected=state.selected||step.active?.[0]||null;this.progress=Number(state.stepProgress)||0;this.buildFlows(step);}
    else if(state.selected!==this.lastStateSelection){this.selected=state.selected||null;this.userSelection=false;}
    this.lastStateSelection=state.selected;
    this.lastProgress=Number(state.stepProgress)||0;
  }

  animate(now) {
    this.frame=requestAnimationFrame(this.animate);
    // Compare is created lazily. Skip rendering if its panel is collapsed.
    if(this.compare&&(!this.container.clientWidth||!this.container.clientHeight))return;
    if(this.cameraTween){const t=clamp((now-this.cameraTween.start)/this.cameraTween.duration),e=EASE(t);this.camera.position.lerpVectors(this.cameraTween.from,this.cameraTween.to,e);this.controls.target.lerpVectors(this.cameraTween.targetFrom,this.cameraTween.targetTo,e);if(t===1)this.cameraTween=null;}
    if(Math.abs(this.explode-this.explodeTarget)>.0005){this.explode+=(this.explodeTarget-this.explode)*.09;this.hardware.setExplode(this.explode);if(this.step&&now-(this.lastExplodeFlow||0)>70){this.buildFlows(this.step);this.lastExplodeFlow=now;}}
    else if(this.explode!==this.explodeTarget){this.explode=this.explodeTarget;this.hardware.setExplode(this.explode);if(this.step)this.buildFlows(this.step);}
    this.controls.update();this.hardware.root.updateMatrixWorld(true);
    // Selection uses a fine engineering bounding frame, so silicon and PCB
    // retain their actual material colours rather than turning into neon blocks.
    const component=this.selected&&this.hardware.components[this.canonical(this.selected)];
    if(component){let visible=true,cursor=component.group;while(cursor){if(!cursor.visible)visible=false;cursor=cursor.parent;}this.outline.visible=visible;if(visible){this.outline.box.setFromObject(component.group);this.outline.box.expandByScalar(.04);}}
    else this.outline.visible=false;
    const progress=Number.isFinite(window.__gpuExplorerStepProgress)?clamp(window.__gpuExplorerStepProgress):this.progress;
    for(const item of this.flowObjects)if(item.curve){item.dots.forEach((dot,index)=>{const p=progress-index*.045;dot.visible=p>=0&&p<=1;dot.position.copy(item.curve.getPoint(clamp(p)));});item.material.opacity=.15+progress*.15;}
    // Sparse labels projected from the actual hardware, with local collision
    // avoidance. Labels behind the camera and hidden isolated parts disappear.
    const occupied=[];
    for(const label of this.labelNodes){
      const item=this.hardware.components[this.canonical(label.id)];let visible=!!item,cursor=item?.group;while(cursor){if(!cursor.visible)visible=false;cursor=cursor.parent;}
      const point=this.anchor(label.id).project(this.camera);if(point.z>1||point.z< -1)visible=false;
      let x=(point.x*.5+.5)*this.width,y=(-point.y*.5+.5)*this.height;const anchorX=x,anchorY=y;
      const offset={ 'gpu-die':[-30,-52],hbm:[-42,-25],power:[42,-35],interposer:[20,40],sm:[-18,-25],l2:[80,10],warp:[0,-30],registers:[-42,0],tensor:[-20,10],smem:[0,38] }[label.id]||[0,0];x+=offset[0];y+=offset[1];
      x=Math.max(76,Math.min(this.width-76,x));y=Math.max(32,Math.min(this.height-30,y));
      for(const previous of occupied)if(Math.abs(previous.x-x)<145&&Math.abs(previous.y-y)<31)y=previous.y+34;
      occupied.push({x,y});label.node.style.left=`${x}px`;label.node.style.top=`${Math.min(this.height-22,y)}px`;label.node.style.display=visible?'':'none';
      label.line.setAttribute('x1',anchorX);label.line.setAttribute('y1',anchorY);label.line.setAttribute('x2',x);label.line.setAttribute('y2',Math.min(this.height-22,y));label.line.style.display=visible?'':'none';label.dot.setAttribute('cx',anchorX);label.dot.setAttribute('cy',anchorY);label.dot.style.display=visible?'':'none';
      label.node.style.borderColor=this.selected===label.id?'#eac27a':'rgba(174,195,177,.27)';
    }
    this.renderer.render(this.scene,this.camera);
  }
}

const container=document.getElementById('scene3d');
if(container){
  try{
    const main=new HardwareScene(container);let compare=null;let lastUpdate=null;
    const api={
      update(journey,step,state){lastUpdate={journey,step,state};main.update(journey,step,state);const cmp=document.getElementById('scene3d-compare');if(state.compareModel&&cmp){if(!compare)compare=new HardwareScene(cmp,true);compare.update(journey,step,{...state,model:state.compareModel});}},
      setCamera(name){main.setCamera(name);compare?.setCamera(name);},
      setExplode(value){main.setExplode(value);compare?.setExplode(value);},
      setProgress(value){main.setProgress(value);compare?.setProgress(value);},
      setLevel(level){main.setLevel(level);compare?.setLevel(level);},
      focusSelected(){main.focusSelected();},isolateSelected(value){return main.isolateSelected(value);},
      resetView(){main.resetView();},setLabels(value){return main.setLabels(value);},
      clearSelection(){main.clearSelection();compare?.clearSelection();},
      getComponents(){return main.getComponents();},selectComponent(id){main.selectComponent(id);},
      getLevel(){return main.level;},getSelected(){return main.selected;},
      getStatus(){return {model:main.model,level:main.level,selected:main.selected,isolated:main.isolated,exploded:main.explode,drawCalls:main.renderer.info.render.calls,triangles:main.renderer.info.render.triangles};}
    };
    window.GpuExplorer3D=api;window.dispatchEvent(new CustomEvent('gpu-scene-ready',{detail:{components:main.getComponents()}}));
    if(window.__gpuExplorerRender)window.__gpuExplorerRender();
  }catch(error){
    console.error('GPU Explorer 3D initialization failed',error);
    const message=document.createElement('div');message.className='webgl-fallback';message.style.cssText='padding:40px;color:#d5dfd9;font:14px/1.8 system-ui;';message.textContent='三维视图未能启动。请开启浏览器的硬件加速后重载；右侧仍可逐步阅读计算过程。';container.appendChild(message);
    window.dispatchEvent(new CustomEvent('gpu-scene-error',{detail:{message:error.message}}));
  }
}
