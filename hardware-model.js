import { createHBMDetail } from './hbm-model.js?v=20261102i';
import { createPowerDetail } from './power-model.js?v=20261102i';
import { createInterconnectDetail } from './interconnect-model.js?v=20261102i';

// Hide every sibling subtree along the selected object's ancestor path.
// Ancestors remain as paths, without retaining their unselected own meshes.
export function isolateHardwareSubtree(root, selected) {
  const path = new Set();
  for(let node=selected;node;node=node.parent){path.add(node);if(node===root)break;}
  if(!path.has(root))return [];
  const hidden=[];
  function prune(node){
    if(node===selected)return;
    for(const child of node.children){
      if(path.has(child))prune(child);
      else if(child.visible){child.visible=false;hidden.push(child);}
    }
  }
  prune(root);return hidden;
}

// Fit all eight bounds corners in camera space. Returning orbit/far limits
// with the position prevents OrbitControls from clamping a valid narrow fit.
export function calculateCameraFit(T,bounds,viewDirection,fov,aspect,margin=1.1) {
  const target=bounds.getCenter(new T.Vector3()),direction=viewDirection.clone().normalize();
  const right=new T.Vector3(0,1,0).cross(direction).normalize();if(right.lengthSq()<.01)right.set(1,0,0);
  const up=direction.clone().cross(right).normalize(),tangent=Math.tan(T.MathUtils.degToRad(fov/2));
  let distance=3.5;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const point=new T.Vector3(x,y,z).sub(target),near=point.dot(direction);
    distance=Math.max(distance,near+Math.abs(point.dot(right))*margin/(tangent*aspect),near+Math.abs(point.dot(up))*margin/tangent);
  }
  distance+=.2;
  const maxDistance=Math.max(52,distance*1.8),far=Math.max(180,maxDistance+bounds.getSize(new T.Vector3()).length()*2);
  return {position:target.clone().addScaledVector(direction,distance),target,distance,maxDistance,far};
}

// Procedural SXM anatomy. Package/board geometry is a recognizable physical
// reconstruction, not a vendor CAD model. The etched logical floorplan is
// schematic; its active SM and HBM counts match the selected shipping product.
export function createHardwareModel(T, model = 'h100') {
  const ampere = model === 'a100';
  const specification = ampere
    ? { name: 'A100', die: 'GA100', sm: 108, gpc: 7, l2: '40 MB', hbm: 'HBM2e', memory: '80 GB' }
    : { name: 'H100', die: 'GH100', sm: 132, gpc: 8, l2: '50 MB', hbm: 'HBM3', memory: '80 GB' };
  const root = new T.Group();
  const components = {};
  const layers = [];
  const hbmSlices = [];
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const mats = {
    pcb: new T.MeshStandardMaterial({ color: 0x174d3d, roughness: .7, metalness: .13 }),
    pcbEdge: new T.MeshStandardMaterial({ color: 0x273d2f, roughness: .68, metalness: .1 }),
    substrate: new T.MeshStandardMaterial({ color: 0x21432f, roughness: .55, metalness: .2 }),
    ceramic: new T.MeshStandardMaterial({ color: 0xd3c9ac, roughness: .61, metalness: .1 }),
    silver: new T.MeshStandardMaterial({ color: 0xaab5b9, roughness: .24, metalness: .95 }),
    bright: new T.MeshStandardMaterial({ color: 0xe1e5e6, roughness: .18, metalness: .95 }),
    darkMetal: new T.MeshStandardMaterial({ color: 0x3e4a4e, roughness: .32, metalness: .72 }),
    black: new T.MeshStandardMaterial({ color: 0x182024, roughness: .55, metalness: .24 }),
    chip: new T.MeshStandardMaterial({ color: 0x252c32, roughness: .38, metalness: .45 }),
    memory: new T.MeshStandardMaterial({ color: 0x3b4149, roughness: .34, metalness: .61 }),
    silicon: new T.MeshStandardMaterial({ color: 0x3b4b4c, roughness: .24, metalness: .78 }),
    siliconSide: new T.MeshStandardMaterial({ color: 0x111b24, roughness: .19, metalness: .86 }),
    gold: new T.MeshStandardMaterial({ color: 0xbda677, roughness: .34, metalness: .85 }),
    copper: new T.MeshStandardMaterial({ color: 0xb77c4b, roughness: .38, metalness: .85 }),
    activeSM: new T.MeshStandardMaterial({ color: ampere ? 0x779380 : 0x839b88, roughness: .3, metalness: .7 }),
    inactiveSM: new T.MeshStandardMaterial({ color: 0x283637, roughness: .6, metalness: .3 }),
    trace: new T.MeshStandardMaterial({ color: 0xa3ab83, roughness: .44, metalness: .67 }),
    smem: new T.MeshStandardMaterial({ color: 0x4f9b94, roughness: .4, metalness: .56 }),
    tensor: new T.MeshStandardMaterial({ color: 0xc9a46a, roughness: .28, metalness: .68 }),
    register: new T.MeshStandardMaterial({ color: 0x7e8ea2, roughness: .4, metalness: .65 }),
    scheduler: new T.MeshStandardMaterial({ color: 0xb88959, roughness: .4, metalness: .63 })
  };
  const box = (parent, x, y, z, w, h, d, mat, shadow = true) => {
    const mesh = new T.Mesh(unitBox, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  };
  const instances = (parent, list, mat, geometry = unitBox) => {
    const mesh = new T.InstancedMesh(geometry, mat, list.length);
    const dummy = new T.Object3D();
    list.forEach((item, index) => {
      dummy.position.set(item.x || 0, item.y || 0, item.z || 0);
      dummy.scale.set(item.w || 1, item.h || 1, item.d || 1);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  };
  const component = (id, label, description, level, parent = root, parentId = null) => {
    const group = new T.Group(); group.userData.componentId = id; parent.add(group);
    components[id] = { id, label, description, level, parent: parentId, group };
    return group;
  };
  function surfaceText(parent, text, x, y, z, w, d, color = '#d4ddca', font = '500 36px monospace') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.font = font;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(text, 512, 64);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new T.Mesh(new T.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function boardTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 2048;
    const c = canvas.getContext('2d'); c.fillStyle = '#275747'; c.fillRect(0, 0, 2048, 2048);
    // Repeatable, multilayer-looking routing. Most of the centre is hidden
    // under the physical package, exactly as it is on a real board.
    let seed = 8281;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 360; i++) {
      const x = 100 + rand() * 1848, z = 100 + rand() * 1848;
      c.strokeStyle = i % 9 === 0 ? 'rgba(178,173,104,.19)' : 'rgba(113,170,126,.15)';
      c.lineWidth = 1 + rand() * 2;
      c.beginPath(); c.moveTo(x, z); c.lineTo(x + 20 + rand() * 160, z);
      c.lineTo(x + 60 + rand() * 180, z + 40); c.lineTo(x + 60 + rand() * 180, z + 90 + rand() * 180); c.stroke();
    }
    c.strokeStyle = 'rgba(193,211,171,.18)'; c.lineWidth = 2;
    c.strokeRect(38, 38, 1972, 1972);
    for (let i = 0; i < 44; i++) {
      const x = 75 + i * 43;
      c.beginPath(); c.moveTo(x, 150); c.lineTo(x, 300); c.lineTo(x + 110, 410); c.lineTo(x + 110, 560); c.stroke();
      c.beginPath(); c.moveTo(x, 1898); c.lineTo(x, 1748); c.lineTo(x + 110, 1638); c.lineTo(x + 110, 1488); c.stroke();
    }
    c.fillStyle = '#a4b5a1'; c.font = '22px monospace'; c.fillText('GPU EXPLORER   /   SXM MODULE', 180, 1900);
    c.font = '17px monospace'; c.fillText('PROCEDURAL HARDWARE RECONSTRUCTION', 180, 1935);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8; return texture;
  }
  function dieTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
    const c = canvas.getContext('2d'); c.fillStyle = '#435253'; c.fillRect(0, 0, 1024, 1024);
    c.strokeStyle = '#7a8271'; c.lineWidth = 2;
    for (let i = 10; i < 1024; i += 24) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 1024); c.stroke(); }
    c.strokeStyle = '#687d6c'; c.lineWidth = 1;
    for (let i = 12; i < 1024; i += 12) { c.beginPath(); c.moveTo(0, i); c.lineTo(1024, i); c.stroke(); }
    c.strokeStyle = '#a7a58b'; c.lineWidth = 4; c.strokeRect(12, 12, 1000, 1000);
    c.strokeStyle = '#888c78'; c.lineWidth = 2; c.strokeRect(24, 24, 976, 976);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8; return texture;
  }
  function siliconCoverTexture() {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1536;
    const c=canvas.getContext('2d');c.fillStyle='#263b43';c.fillRect(0,0,1024,1536);
    // On a physical naked die the metallization is microscopic. Retain its
    // dark optical sheen and faint etching; the raised logical floorplan is
    // only revealed by the explicitly educational Die hierarchy level.
    c.strokeStyle='rgba(155,183,181,.055)';c.lineWidth=1;
    for(let x=24;x<1024;x+=32){c.beginPath();c.moveTo(x,20);c.lineTo(x,1516);c.stroke();}
    for(let z=24;z<1536;z+=32){c.beginPath();c.moveTo(20,z);c.lineTo(1004,z);c.stroke();}
    c.strokeStyle='rgba(176,184,162,.25)';c.lineWidth=3;c.strokeRect(13,13,998,1510);
    c.strokeStyle='rgba(176,184,162,.10)';c.lineWidth=1;c.strokeRect(24,24,976,1488);
    c.fillStyle='rgba(187,205,202,.68)';c.font='500 104px monospace';c.textAlign='center';c.fillText(specification.die,512,700);
    c.fillStyle='rgba(177,196,192,.34)';c.font='26px monospace';c.fillText(specification.name+'  ·  SXM 80GB',512,762);
    c.font='19px monospace';c.fillText('SILICON SURFACE',512,819);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;return texture;
  }
  const pcb = component('pcb', 'SXM 模组电路板', '承载 GPU 封装、供电与高速连接器的多层 PCB。走线和元件布局为可交互重建。', 'board');
  const outline = new T.Shape(); const s = 8.5, r = .38;
  outline.moveTo(-s + r, -s); outline.lineTo(s - r, -s); outline.quadraticCurveTo(s, -s, s, -s + r);
  outline.lineTo(s, s - r); outline.quadraticCurveTo(s, s, s - r, s); outline.lineTo(-s + r, s);
  outline.quadraticCurveTo(-s, s, -s, s - r); outline.lineTo(-s, -s + r); outline.quadraticCurveTo(-s, -s, -s + r, -s);
  [-7.65, 7.65].forEach(x => [-7.65, 7.65].forEach(z => { const hole = new T.Path(); hole.absarc(x, z, .32, 0, Math.PI * 2, true); outline.holes.push(hole); }));
  const pcbGeometry = new T.ExtrudeGeometry(outline, { depth: .2, bevelEnabled: false, curveSegments: 12 });
  pcbGeometry.rotateX(-Math.PI / 2);
  const pcbBody = new T.Mesh(pcbGeometry, [mats.pcb, mats.pcbEdge]); pcbBody.position.y = -.51; pcb.add(pcbBody); pcbBody.castShadow = true; pcbBody.receiveShadow = true;
  // Surface texture has matching holes. It is an actual shaped PCB face,
  // not a square alpha decal that would accidentally fill the holes.
  const faceGeo = new T.ShapeGeometry(outline, 12); faceGeo.rotateX(-Math.PI / 2);
  const uv = faceGeo.attributes.uv;
  const pos = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 8.5) / 17, (8.5 - pos.getZ(i)) / 17);
  const face = new T.Mesh(faceGeo, new T.MeshStandardMaterial({ map: boardTexture(), roughness: .68, metalness: .23 }));
  face.position.y = -.302; face.receiveShadow = true; pcb.add(face);
  // Conductive via stitching at the edge, rendered in one draw call.
  const vias = [];
  for (let p = -7; p <= 7; p += .3) { vias.push({x:p,y:-.29,z:8.18,w:.035,h:.012,d:.035},{x:p,y:-.29,z:-8.18,w:.035,h:.012,d:.035},{x:8.18,y:-.29,z:p,w:.035,h:.012,d:.035},{x:-8.18,y:-.29,z:p,w:.035,h:.012,d:.035}); }
  instances(pcb, vias, mats.gold);
  // Bolts, washer rings, and visible cross slots make scale legible.
  const washerGeo = new T.TorusGeometry(.33, .055, 8, 24);
  const boltGeo = new T.CylinderGeometry(.235, .235, .14, 24);
  [-7.65, 7.65].forEach(x => [-7.65, 7.65].forEach(z => {
    const washer = new T.Mesh(washerGeo, mats.gold); washer.rotation.x = Math.PI / 2; washer.position.set(x,-.285,z); pcb.add(washer);
    const screw = new T.Mesh(boltGeo, mats.silver); screw.position.set(x,-.24,z); pcb.add(screw); screw.castShadow = true;
    box(pcb,x,-.163,z,.25,.012,.035,mats.black,false); box(pcb,x,-.162,z,.035,.012,.25,mats.black,false);
  }));
  const power = component('power', '多相供电 / VRM', '电感、功率级与去耦电容将电源转换为 GPU 使用的低电压、大电流供电。', 'board', pcb, 'pcb');
  const inductors = [], inductorCaps = [], controllers = [], caps = [], capEnds = [];
  const powerLeads = [], powerLands = [], magneticSeams = [];
  for (const side of [-1,1]) for (let i = 0; i < 8; i++) {
    const z = -5.85 + i * 1.62;
    inductors.push({x:side*6.55,y:.05,z,w:.82,h:.62,d:1.03});
    inductorCaps.push({x:side*6.55,y:.37,z,w:.72,h:.025,d:.85});
    controllers.push({x:side*7.45,y:-.12,z,w:.36,h:.33,d:.82});
    // Solder lands, power-stage leads and the seam in each molded ferrite
    // housing give the board a readable manufacturing scale at grazing angles.
    for(const end of [-1,1]) {
      powerLands.push({x:side*6.55,y:-.245,z:z+end*.46,w:.90,h:.07,d:.18});
      magneticSeams.push({x:side*6.55+end*.315,y:.386,z,w:.012,h:.012,d:.76});
      for(let pin=0;pin<6;pin++)powerLeads.push({x:side*7.45+end*.215,y:-.225,z:z-.32+pin*.128,w:.12,h:.07,d:.064});
    }
    for(let k=0;k<3;k++) { const cz=z-.42+k*.42;
      caps.push({x:side*5.56,y:-.18,z:cz,w:.22,h:.22,d:.25});
      capEnds.push({x:side*5.56,y:-.168,z:cz-.105,w:.23,h:.23,d:.045},{x:side*5.56,y:-.168,z:cz+.105,w:.23,h:.23,d:.045});
    }
  }
  instances(power,inductors,mats.black); instances(power,inductorCaps,mats.darkMetal); instances(power,controllers,mats.chip);
  instances(power,caps,mats.ceramic); instances(power,capEnds,mats.silver);
  instances(power,powerLands,mats.silver); instances(power,powerLeads,mats.silver); instances(power,magneticSeams,mats.black);
  for(const side of [-1,1]) for(let i=0;i<8;i++) surfaceText(power,'R22',side*6.55,.388,-5.85+i*1.62,.5,.23,'#879293','500 45px monospace');
  // Dense decoupling rows at north/south edges and around the package.
  const smallCaps = [], smallEnds = [], resistors=[];
  for(const side of [-1,1]) for(let i=0;i<26;i++) {
    const x=-5.55+i*.44, z=side*6.2;
    smallCaps.push({x,y:-.21,z,w:.22,h:.18,d:.31});
    smallEnds.push({x:x-.09,y:-.2,z,w:.055,h:.2,d:.32},{x:x+.09,y:-.2,z,w:.055,h:.2,d:.32});
    if(i%2===0) resistors.push({x,y:-.23,z:side*6.7,w:.3,h:.12,d:.16});
  }
  instances(pcb,smallCaps,mats.ceramic); instances(pcb,smallEnds,mats.silver); instances(pcb,resistors,mats.chip);
  const sxm = component('sxm','SXM 高密度连接器','SXM 连接器位于模组背面，承担高速信号和电源连接；此处以可见剖面表达。','board',pcb,'pcb');
  const contacts=[];
  for(const side of [-1,1]) {
    box(sxm,0,-.65,side*6.85,10.5,.28,1.0,mats.black);
    for(let row=0;row<3;row++) for(let i=0;i<70;i++) contacts.push({x:-5.08+i*.147,y:-.8,z:side*6.85+(row-1)*.24,w:.08,h:.08,d:.10});
  }
  instances(sxm,contacts,mats.gold);
  surfaceText(pcb,`${specification.name}  ·  SXM   /   ${specification.memory}`,0,-.285,7.13,5.5,.44,'#d2dbcb','600 42px monospace');
  surfaceText(pcb,'GPU EXPLORER  /  ANATOMY LAB',0,-.285,-7.45,5.6,.38,'#b8c7b6','400 34px monospace');
  const serial = component('package','GPU 封装','有机封装基板承载硅中介层、GPU 裸片和 HBM；这些部件通过微凸点互连。','package');
  const substrate = new T.Group(); serial.add(substrate); layers.push({group:substrate,factor:.9});
  box(substrate,0,-.105,0,10.7,.32,10.2,mats.substrate);
  box(substrate,0,.062,0,10.34,.025,9.84,mats.gold);
  box(substrate,0,.085,0,10.28,.03,9.78,mats.substrate);
  const bga=[];
  for(let x=-4.9;x<=4.9;x+=.24) for(let z=-4.65;z<=4.65;z+=.24) if(Math.abs(x)>4.1||Math.abs(z)>3.9) bga.push({x,y:-.29,z,w:.11,h:.11,d:.11});
  instances(substrate,bga,mats.silver,new T.SphereGeometry(.5,6,4));
  // A segmented substrate edge reveals the copper-bearing laminate without
  // pretending the microscopic production stack-up is visible at this scale.
  const substrateEdges=[];
  for(const x of [-5.355,5.355])for(let band=0;band<3;band++)substrateEdges.push({x,y:-.205+band*.075,z:0,w:.012,h:.009,d:9.72});
  for(const z of [-5.105,5.105])for(let band=0;band<3;band++)substrateEdges.push({x:0,y:-.205+band*.075,z,w:10.15,h:.009,d:.012});
  instances(substrate,substrateEdges,mats.copper);
  const interposer = component('interposer','硅中介层','高密度横向连接将 GPU 与五组 HBM 连接起来。拆解时，纵向间距被放大以便观察。','package',serial,'package');
  layers.push({group:interposer,factor:1.8});
  box(interposer,0,.145,0,9.75,.10,8.4,mats.siliconSide);
  box(interposer,0,.2,0,9.58,.018,8.24,mats.darkMetal);
  const interconnect=[];
  for(const side of [-1,1]) for(let i=0;i<48;i++) interconnect.push({x:side*3.22,y:.216,z:-3.6+i*.153,w:1.35,h:.012,d:.012});
  instances(interposer,interconnect,mats.gold);
  // Low mounting rim: brushed nickel, with a real recessed centre.
  for(const z of [-4.8,4.8]) box(substrate,0,.2,z,10.45,.28,.35,mats.silver);
  for(const x of [-5.05,5.05]) box(substrate,x,.2,0,.35,.28,9.28,mats.silver);
  for(const x of [-4.98,4.98]) for(const z of [-4.72,4.72]) {
    const screw = new T.Mesh(new T.CylinderGeometry(.13,.13,.035,16),mats.darkMetal); screw.position.set(x,.36,z); substrate.add(screw);
    box(substrate,x,.382,z,.16,.008,.025,mats.black,false);
  }
  const packageCaps=[], packageEnds=[];
  for(let x=-4.5;x<=4.5;x+=.34) for(const side of [-1,1]) {
    packageCaps.push({x,y:.15,z:side*4.45,w:.16,h:.13,d:.22});
    packageEnds.push({x:x-.07,y:.16,z:side*4.45,w:.035,h:.14,d:.23},{x:x+.07,y:.16,z:side*4.45,w:.035,h:.14,d:.23});
  }
  instances(substrate,packageCaps,mats.ceramic); instances(substrate,packageEnds,mats.silver);
  const hbm = component('hbm',`5 × ${specification.hbm} 堆栈`,`五组有源 HBM 提供 ${specification.memory} 容量。每组由多层 DRAM 通过 TSV 垂直连接；展示厚度经过放大。`,'package',serial,'package');
  layers.push({group:hbm,factor:3.1});
  const hbmPositions = [{x:-3.75,z:-2.6},{x:-3.75,z:0},{x:-3.75,z:2.6},{x:3.75,z:-2.6},{x:3.75,z:0}];
  const hbmBasePads=[];
  for(let i=0;i<hbmPositions.length;i++) {
    const p=hbmPositions[i];
    box(hbm,p.x,.26,p.z,1.65,.07,1.95,mats.gold);
    for(const side of [-1,1])for(let contact=0;contact<18;contact++)hbmBasePads.push({x:p.x+side*.825,y:.262,z:p.z-.83+contact*.098,w:.035,h:.055,d:.045});
    for(let slice=0;slice<8;slice++) {
      const plate=box(hbm,p.x,.32+slice*.045,p.z,1.54,.035,1.82,slice%2?mats.memory:mats.darkMetal);
      hbmSlices.push({mesh:plate,y:plate.position.y,index:slice});
    }
    const top=box(hbm,p.x,.692,p.z,1.56,.065,1.84,mats.memory); hbmSlices.push({mesh:top,y:top.position.y,index:8});
    const memoryLabel=surfaceText(hbm,specification.hbm,p.x,.731,p.z-.1,1.3,.25,'#c4cbd0','500 45px monospace');
    const capacityLabel=surfaceText(hbm,`${i+1}  ·  16 GB`,p.x,.732,p.z+.3,1.1,.18,'#89979e','400 40px monospace');
    hbmSlices.push({mesh:memoryLabel,y:.731,index:8},{mesh:capacityLabel,y:.732,index:8});
  }
  instances(hbm,hbmBasePads,mats.silver);
  // Sixth site is a visible unpopulated pad, not a claimed sixth HBM stack.
  if(!ampere) {
    box(interposer,3.75,.245,2.6,1.64,.035,1.94,mats.substrate);
    const pads=[]; for(let x=0;x<10;x++) for(let z=0;z<12;z++) pads.push({x:3.1+x*.145,y:.269,z:1.82+z*.14,w:.044,h:.008,d:.044});
    instances(interposer,pads,mats.gold);
  }
  const die = component('gpu-die',`${specification.die} GPU 裸片`,`${specification.name} 中真正执行计算的硅裸片。${specification.sm} 个有源 SM，${specification.l2} L2；逻辑区块布局是教学重建。`,'die',serial,'package');
  layers.push({group:die,factor:3.1});
  box(die,0,.31,0,5.30,.18,7.65,mats.siliconSide);
  const siliconMat = mats.silicon.clone(); siliconMat.map = dieTexture();
  const diePlane = new T.Mesh(new T.PlaneGeometry(5.26,7.61),siliconMat); diePlane.rotation.x=-Math.PI/2; diePlane.position.y=.406; die.add(diePlane); diePlane.receiveShadow=true;
  // Seal ring catches grazing light, a thin continuous metallic edge.
  for(const z of [-3.76,3.76]) box(die,0,.419,z,5.18,.015,.025,mats.gold,false);
  for(const x of [-2.57,2.57]) box(die,x,.419,0,.025,.015,7.52,mats.gold,false);
  const dieBumps=[];
  for(const side of [-1,1])for(let pin=0;pin<48;pin++)dieBumps.push({x:side*2.52,y:.223,z:-3.48+pin*.148,w:.043,h:.035,d:.043});
  instances(die,dieBumps,mats.gold,new T.SphereGeometry(.5,6,4));
  const l2 = component('l2',`${specification.l2} L2 缓存`,'SM 与显存之间共享的片上缓存。读写可能命中 L2，未命中时才访问 HBM。','die',die,'gpu-die');
  box(l2,0,.438,0,.35,.048,6.28,mats.gold);
  const l2Banks=[]; for(let i=0;i<36;i++) l2Banks.push({x:0,y:.471,z:-2.98+i*.17,w:.25,h:.014,d:.1});
  instances(l2,l2Banks,mats.darkMetal);
  const sm = component('sm',`${specification.sm} 个有源 SM`,'线程块被调度到 SM。双击进入一个 SM，查看四个执行子分区、寄存器、Tensor Core 和共享内存。','die',die,'gpu-die');
  const smCells=[], disabledCells=[],smBanks=[],smPartitionLines=[],smTensorTiles=[],smRegisterRows=[];
  let activeIndex=0;
  const rows=4;
  for(let gpc=0;gpc<specification.gpc;gpc++) {
    const side=gpc%2?1:-1, row=Math.floor(gpc/2);
    const centreX=side*1.38, centreZ=-2.57+row*1.71;
    box(sm,centreX,.434,centreZ,2.05,.035,1.52,mats.black,false);
    surfaceText(sm,`GPC ${gpc}`,centreX,.456,centreZ-.695,1.68,.10,'#839987','400 30px monospace');
    const count=ampere?(gpc<3?16:15):(gpc<4?17:16);
    for(let n=0;n<18;n++) {
      const x=centreX-.85+(n%6)*.34, z=centreZ-.52+Math.floor(n/6)*.49;
      const cell={x,y:.466,z,w:.295,h:.035,d:.405};
      if(n<count) {
        smCells.push(cell); activeIndex++;
        for(let b=0;b<3;b++) smBanks.push({x:x-.085+b*.085,y:.487,z:z-.07,w:.045,h:.009,d:.19});
        smPartitionLines.push({x,y:.489,z:z+.14,w:.24,h:.008,d:.035});
        for(const dx of [-.075,.075])smTensorTiles.push({x:x+dx,y:.495,z:z+.074,w:.045,h:.012,d:.048});
        for(let row=0;row<3;row++)smRegisterRows.push({x:x-.086+row*.086,y:.495,z:z-.145,w:.055,h:.011,d:.028});
      } else disabledCells.push(cell);
    }
  }
  instances(sm,smCells,mats.activeSM); instances(sm,disabledCells,mats.inactiveSM);
  instances(sm,smBanks,mats.darkMetal); instances(sm,smPartitionLines,mats.trace);
  instances(sm,smTensorTiles,mats.tensor); instances(sm,smRegisterRows,mats.register);
  surfaceText(die,`${specification.die}   /   ${specification.sm} SM`,0,.45,3.55,3.5,.28,'#b4c1ae','600 42px monospace');
  surfaceText(die,'PCIe  ·  GIGATHREAD ENGINE',0,.451,-3.54,4.0,.21,'#aebbac','500 34px monospace');
  const siliconCover=new T.Mesh(unitBox,new T.MeshPhysicalMaterial({
    color:0x8aa0a5,map:siliconCoverTexture(),roughness:.19,metalness:.92,
    clearcoat:1,clearcoatRoughness:.13,iridescence:.62,iridescenceIOR:1.33,iridescenceThicknessRange:[100,270]
  }));
  siliconCover.position.set(0,.486,0);siliconCover.scale.set(5.255,.105,7.605);siliconCover.castShadow=true;siliconCover.receiveShadow=true;die.add(siliconCover);
  // Functional organization follows NVIDIA's 2 × 2 SM subpartition diagrams.
  // These raised shapes show shared resources and connectivity, not silicon distances.
  const smRoot = new T.Group(); smRoot.visible=false; root.add(smRoot);
  const smAssembly = component('sm-detail','SM 功能组织','四个子分区共用 L1 数据缓存/共享内存。按官方功能框图重建；相对距离、浮雕高度不是物理版图。','sm',smRoot,'sm');
  box(smAssembly,0,-.08,0,10.9,.28,8.6,mats.siliconSide);
  box(smAssembly,0,.07,0,10.6,.025,8.3,mats.darkMetal);
  const registerGroup = component('registers','寄存器文件','每个子分区有自己的寄存器文件，保存线程操作数和累加器。图中位置表示资源归属，不表示物理距离。','sm',smAssembly,'sm-detail');
  const scheduler = component('warp','Warp 调度器','四个子分区各有一个调度器，从可就绪的 warp 中发射指令。调度器属于控制路径，数据通过寄存器、执行管线和 LD/ST 访问存储。','sm',smAssembly,'sm-detail');
  const dispatch = component('dispatch','指令派发','每个子分区的派发单元把调度器选定的指令送往执行管线。它不是矩阵操作数的传输通道。','sm',smAssembly,'sm-detail');
  const tensor = component('tensor','Tensor Core',ampere?'矩阵乘加执行单元。线程协同提供矩阵片段，操作数与累加器分布依具体 MMA 指令而异。':'矩阵乘加执行单元。Hopper GMMA 可从共享内存取得矩阵操作数；具体来源和寄存器分布依指令而异。','sm',smAssembly,'sm-detail');
  const lsu=component('lsu','Load / Store 单元','执行线程的载入和存储请求，连接寄存器与 L1 数据缓存/共享内存子系统。与 scheduler 的指令控制路径不同。','sm',smAssembly,'sm-detail');
  const smem=component('smem','L1 数据缓存 / 共享内存',`四个子分区共用的统一存储资源，合计 ${ampere?'192':'256'} KB；其中 Shared Memory 最多 ${ampere?'164':'228'} KB。32 banks 指共享内存，不是整个 L1 缓存。这里的长条位置来自功能框图，不表示真实芯片距离。`,'sm',smAssembly,'sm-detail');
  const instruction=component('instruction-cache','L1 指令缓存','SM 级指令缓存与 L1 数据缓存不同；每个子分区还具有本地 L0 指令缓存。','sm',smAssembly,'sm-detail');
  const smBus=component('sm-bus','SM 内部互连','功能示意：执行管线、LD/ST 与共用 L1 数据缓存/共享内存相连。线路是教学路由，不是厂家金属布线。','sm',smAssembly,'sm-detail');
  const fp32=[],registers=[],registerStrips=[],lsuCells=[],laneContacts=[],registerWordlines=[],tensorArrays=[],tensorBus=[];
  const partitionOrigins=[{x:-2.65,z:-1.72},{x:2.65,z:-1.72},{x:-2.65,z:1.08},{x:2.65,z:1.08}];
  box(instruction,0,.23,-3.65,10.15,.12,.25,mats.register);
  surfaceText(instruction,'L1 INSTRUCTION CACHE',0,.296,-3.65,8.5,.18,'#d0dfeb','500 32px monospace');
  for(let partition=0;partition<4;partition++) {
    const {x,z}=partitionOrigins[partition];
    box(smAssembly,x,.13,z,4.95,.08,2.62,mats.black);
    box(smAssembly,x,.225,z-1.10,4.65,.07,.15,mats.register);
    box(scheduler,x,.255,z-.87,4.65,.14,.20,mats.scheduler);
    surfaceText(scheduler,`SMSP ${partition}  /  WARP SCHEDULER`,x,.332,z-.87,4.27,.16,'#eee2cb','500 31px monospace');
    box(dispatch,x,.25,z-.64,4.65,.10,.13,mats.copper);
    for(let row=0;row<2;row++)for(let bank=0;bank<16;bank++){
      const bx=x-2.14+bank*.285,bz=z-.43+row*.16;
      registers.push({x:bx,y:.25,z:bz,w:.22,h:.10,d:.105});
      registerWordlines.push({x:bx,y:.307,z:bz,w:.16,h:.012,d:.018});
    }
    registerStrips.push({x,y:.33,z:z-.11,w:4.40,h:.025,d:.07});
    // The small green cells retain the correct FP32 lane count (32/16 per partition).
    for(let row=0;row<(ampere?2:4);row++)for(let lane=0;lane<8;lane++){
      const lx=x-1.52+lane*.31,lz=z+.10+row*.19;
      fp32.push({x:lx,y:.24,z:lz,w:.23,h:.13,d:.14});
      laneContacts.push({x:lx-.092,y:.313,z:lz,w:.026,h:.014,d:.105},{x:lx+.092,y:.313,z:lz,w:.026,h:.014,d:.105});
    }
    box(smAssembly,x-2.04,.24,z+.39,.27,.13,.88,mats.trace);
    box(smAssembly,x+1.00,.24,z+.39,.31,.13,.88,mats.register);
    box(tensor,x+1.80,.27,z+.39,.98,.22,.93,mats.tensor);
    for(let row=0;row<4;row++)for(let col=0;col<4;col++)tensorArrays.push({x:x+1.48+col*.21,y:.391,z:z+.08+row*.20,w:.14,h:.02,d:.13});
    tensorBus.push({x:x+1.80,y:.408,z:z+.39,w:.84,h:.016,d:.035},{x:x+1.80,y:.408,z:z+.39,w:.035,h:.016,d:.80});
    surfaceText(tensor,'TENSOR',x+1.80,.426,z+.39,.89,.20,'#f1e4c8','600 34px monospace');
    for(let lane=0;lane<8;lane++)lsuCells.push({x:x-2.10+lane*.47,y:.25,z:z+1.02,w:.37,h:.12,d:.17});
    box(smAssembly,x+1.98,.25,z+1.02,.56,.12,.17,mats.scheduler);
    // Branches terminate at the central interconnect, rather than crossing scheduler boxes.
    box(smBus,x*.5,.18,z+1.18,Math.abs(x),.035,.045,mats.trace,false);
  }
  instances(registerGroup,registers,mats.register);instances(registerGroup,registerStrips,mats.silver);
  instances(registerGroup,registerWordlines,mats.darkMetal);
  instances(smAssembly,fp32,mats.activeSM);instances(lsu,lsuCells,mats.copper);
  instances(smAssembly,laneContacts,mats.trace);instances(tensor,tensorArrays,mats.darkMetal);instances(tensor,tensorBus,mats.copper);
  box(smBus,0,.18,.50,.065,.035,3.75,mats.trace,false);
  box(smBus,0,.18,2.40,10.1,.035,.07,mats.trace,false);
  const tma=ampere?null:component('tma','Tensor Memory Accelerator','Hopper 的 TMA 异步搬运张量，可将全局内存的数据搬入共享内存。它是数据搬运硬件，和 warp 调度器不同。','sm',smAssembly,'sm-detail');
  if(!ampere){box(tma,0,.24,2.65,10.05,.10,.22,mats.activeSM);surfaceText(tma,'TENSOR MEMORY ACCELERATOR',0,.296,2.65,8.5,.18,'#d6e9ce','500 32px monospace');}
  box(smem,0,.25,3.20,10.09,.25,.66,mats.smem);
  const sharedBanks=[];for(let bank=0;bank<32;bank++)sharedBanks.push({x:-4.79+bank*.309,y:.39,z:3.20,w:.20,h:.025,d:.39});
  instances(smem,sharedBanks,mats.darkMetal);
  surfaceText(smem,`${ampere?'192':'256'} KB  L1 DATA CACHE / SHARED MEMORY`,0,.43,3.20,9.25,.26,'#d6efea','500 32px monospace');
  for(let unit=0;unit<4;unit++)box(smAssembly,-3.84+unit*2.56,.21,3.86,2.32,.10,.24,mats.register);
  surfaceText(smAssembly,'FUNCTIONAL ORGANIZATION  /  NOT A PHYSICAL FLOORPLAN',0,.12,-4.03,9.6,.20,'#aab9ba','400 28px monospace');
  const hbmDetail=createHBMDetail(T,model),powerDetail=createPowerDetail(T,model),interconnectDetail=createInterconnectDetail(T,model);
  const hbmRoot=hbmDetail.root,powerRoot=powerDetail.root,interconnectRoot=interconnectDetail.root;
  root.add(hbmRoot,powerRoot,interconnectRoot);
  Object.assign(components,hbmDetail.components,powerDetail.components,interconnectDetail.components);
  const anchors={
    pcb:new T.Vector3(-6.5,.25,6.1),package:new T.Vector3(-4.7,.3,4.7),interposer:new T.Vector3(4.8,.35,3.6),
    hbm:new T.Vector3(-3.75,.9,-2.6),'gpu-die':new T.Vector3(0,.8,0),l2:new T.Vector3(0,.6,0),
    power:new T.Vector3(6.55,.5,-3),sxm:new T.Vector3(0,-.65,6.85),sm:new T.Vector3(-1.5,.7,-1),
    'a-tile':new T.Vector3(-3.75,.9,-2.6),'b-tile':new T.Vector3(-3.75,.9,0),'c-out':new T.Vector3(3.75,.9,0),
    warp:new T.Vector3(-2.65,.5,-2.59),smem:new T.Vector3(0,.6,3.20),tensor:new T.Vector3(-.85,.5,-1.33),registers:new T.Vector3(-2.65,.5,-2.03),lsu:new T.Vector3(-2.65,.4,-.70),tma:new T.Vector3(0,.4,2.65),
    ...hbmDetail.anchors,...powerDetail.anchors,...interconnectDetail.anchors
  };
  function setExplode(t) {
    t=Math.max(0,Math.min(1,Number(t)||0));
    for(const layer of layers) layer.group.position.y=t*layer.factor;
    for(const slice of hbmSlices) slice.mesh.position.y=slice.y+slice.index*t*.12;
    hbmDetail.setExplode(t);powerDetail.setExplode(t);interconnectDetail.setExplode(t);
  }
  function setLevel(level){
    siliconCover.visible=level==='board'||level==='package';
    pcb.visible=level==='board';serial.visible=['board','package','die'].includes(level);smRoot.visible=level==='sm';
    hbmRoot.visible=level==='hbm';powerRoot.visible=level==='power';interconnectRoot.visible=level==='interconnect';
  }
  return { root, components, layers, smRoot, pcb, serial, hbmRoot, hbmDetail, powerRoot, powerDetail, interconnectRoot, interconnectDetail,
    siliconCover, siliconCoverMaterial:siliconCover.material, anchors, specification, materials:mats, partitionOrigins, setExplode, setLevel, surfaceText };
}

// Surface-aligned teaching routes. These express memory hierarchy and functional
// connectivity; public architecture diagrams do not reveal metal-mask routing.
export function teachingRouteSpecs(level, stepIndex, model='h100') {
  const routes=[];
  const add=(id,host,stages,points,phase=0,kind='data')=>routes.push({id,host,stages,points,phase,kind});
  const load=stepIndex===3||stepIndex===6,store=stepIndex===7;
  if(!['board','package','die','sm'].includes(level))return routes;
  if(level!=='sm'){
    if(load){
      for(const [i,z]of [[0,-2.529],[1,.072]]){
        add('hbm-input-'+i,'interposer',['HBM','memory-controller'],[[-3.75,.226,z],[-2.57,.226,z]],i*.08);
        add('cache-to-sm-'+i,'gpu-die',['memory-controller','L2','SM'],[[-2.57,.507,z],[-.18,.507,z],[-.18,.507,-1.05],[-1.5,.507,-1.05]],.18+i*.08);
      }
    }else if(store){
      add('sm-to-l2','gpu-die',['SM','L2','memory-controller'],[[-1.5,.507,-1.05],[-.18,.507,-1.05],[-.18,.507,.072],[2.57,.507,.072]]);
      add('hbm-writeback','interposer',['memory-controller','HBM'],[[2.57,.226,.072],[3.75,.226,.072]],.22);
    }
    return routes;
  }
  const shared=[-4.90,.439,3.20],lsu=[-4.72,.439,-.70],reg=[-4.72,.439,-2.03],tensor=[-.85,.439,-1.33];
  if(load){
    add('global-to-shared','sm-detail',model==='a100'?['L2/interconnect','async-copy','Shared Memory']:['L2/interconnect','TMA','Shared Memory'],[[5.16,.439,2.65],[0,.439,2.65],[0,.439,3.20],shared],0);
  }
  if(stepIndex===4||stepIndex===6){
    add('shared-to-load-store','sm-detail',['Shared Memory','LD/ST'],[shared,[-5.10,.439,3.20],[-5.10,.439,-.70],lsu],stepIndex===6?.20:0);
    add('load-store-to-register','sm-detail',['LD/ST','Register File'],[lsu,[-5.10,.439,-.70],[-5.10,.439,-2.03],reg],.22);
    add('issue-instruction','sm-detail',['Warp Scheduler','Dispatch'],[[-2.65,.34,-2.59],[-2.65,.34,-2.36]],.05,'control');
  }
  if(stepIndex===5||stepIndex===6){
    add('register-to-mma','sm-detail',['Register File','Tensor Core'],[reg,[-5.10,.439,-2.03],[-5.10,.439,-1.33],tensor],stepIndex===6?.42:0);
    add('mma-accumulator','sm-detail',['Tensor Core','Accumulator registers'],[tensor,[.0,.439,-1.33],[.0,.439,-2.03],[-.5,.439,-2.03]],.28);
  }
  if(store)add('store-output','sm-detail',['Accumulator registers','LD/ST','L2/interconnect'],[reg,[-5.10,.439,-2.03],[-5.10,.439,-.70],lsu,[-4.72,.439,2.40],[5.16,.439,2.40]]);
  return routes;
}

export function sampleSignalPath(points, fraction) {
  if(!points.length)return[0,0,0];
  const segments=[];let length=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(...b.map((v,k)=>v-a[k]));segments.push(d);length+=d;}
  if(!length)return points[0].slice();
  let position=Math.max(0,Math.min(1,Number(fraction)||0))*length;
  for(let i=0;i<segments.length;i++){
    if(position<=segments[i]||i===segments.length-1){const t=segments[i]?position/segments[i]:0;return points[i].map((v,k)=>v+(points[i+1][k]-v)*t);}
    position-=segments[i];
  }
  return points[points.length-1].slice();
}
