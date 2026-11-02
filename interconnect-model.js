// A PCB/SXM cutaway specimen, not a vendor pinout or a recovered module netlist.
export function createInterconnectDetail(T, model='h100') {
  const root=new T.Group();root.name='interconnect-detail';root.visible=false;
  const components={},anchors={},layers=[],viaAssemblies=[];
  const boxGeo=new T.BoxGeometry(1,1,1);
  const mats={
    mask:new T.MeshStandardMaterial({color:0x204e39,roughness:.62,metalness:.09}),
    core:new T.MeshStandardMaterial({color:0x73765a,roughness:.86,metalness:.02}),
    resin:new T.MeshStandardMaterial({color:0x8b8969,roughness:.8,metalness:.02}),
    copper:new T.MeshStandardMaterial({color:0xb57d4d,roughness:.38,metalness:.87}),
    gold:new T.MeshStandardMaterial({color:0xc1a96f,roughness:.28,metalness:.88}),
    ground:new T.MeshStandardMaterial({color:0x68796f,roughness:.38,metalness:.78}),
    silver:new T.MeshStandardMaterial({color:0xb8c4be,roughness:.23,metalness:.9}),
    plastic:new T.MeshStandardMaterial({color:0x17211f,roughness:.7,metalness:.04}),
    cavity:new T.MeshStandardMaterial({color:0x09110e,roughness:.9,metalness:0}),
    positive:new T.MeshStandardMaterial({color:0xa3c3a0,roughness:.25,metalness:.7}),
    negative:new T.MeshStandardMaterial({color:0x6fa49e,roughness:.25,metalness:.7})
  };
  function group(id,label,description,parent=root,parentId='link-board'){
    const g=new T.Group();g.userData.componentId=id;parent.add(g);components[id]={id,label,description,level:'interconnect',parent:parentId,group:g};return g;
  }
  function box(p,x,y,z,w,h,d,m){const a=new T.Mesh(boxGeo,m);a.position.set(x,y,z);a.scale.set(w,h,d);a.castShadow=true;a.receiveShadow=true;p.add(a);return a;}
  function inst(p,list,m,g=boxGeo){const a=new T.InstancedMesh(g,m,list.length),d=new T.Object3D();list.forEach((v,i)=>{d.position.set(v.x||0,v.y||0,v.z||0);d.scale.set(v.w||1,v.h||1,v.d||1);d.rotation.set(v.rx||0,v.ry||0,v.rz||0);d.updateMatrix();a.setMatrixAt(i,d.matrix);});a.castShadow=true;a.receiveShadow=true;p.add(a);return a;}
  function print(p,text,x,y,z,w=4,d=.25,color='#c9d5c5'){
    const aspect=w/d,c=document.createElement('canvas');c.height=Math.min(128,Math.floor(2048/aspect));c.width=Math.round(c.height*aspect);
    const q=c.getContext('2d');let fontPixels=Math.floor(c.height*.68);
    const font=()=>{q.font='600 '+fontPixels+'px Arial, sans-serif';};font();
    const measure=()=>q.measureText?.(text)?.width||text.length*fontPixels*.58;
    if(measure()>c.width*.92){fontPixels=Math.max(1,Math.floor(fontPixels*c.width*.92/measure()));font();}
    const textWidthPixels=measure();q.fillStyle=color;q.textAlign='center';q.textBaseline='middle';q.fillText(text,c.width/2,c.height/2);
    const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;const a=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));a.rotation.x=-Math.PI/2;a.position.set(x,y,z);a.userData.surfaceText={text,canvasAspect:c.width/c.height,worldAspect:aspect,fontPixels,canvasWidth:c.width,canvasHeight:c.height,textWidthPixels};p.add(a);return a;
  }
  // Remove a bounded witness window from each slab rather than putting an
  // apparently solid pin through an opaque block. The remaining edges retain
  // the original board outline; this is an illustrative section, not a drill map.
  const window={x0:3.18,x1:4.94,z0:-2.79,z1:1.85};
  function slab(p,x,y,z,w,h,d,m){
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
    const a=Math.max(x0,window.x0),b=Math.min(x1,window.x1),c=Math.max(z0,window.z0),e=Math.min(z1,window.z1);
    if(a>=b||c>=e)return box(p,x,y,z,w,h,d,m);
    if(a>x0)box(p,(x0+a)/2,y,z,a-x0,h,d,m);
    if(b<x1)box(p,(b+x1)/2,y,z,x1-b,h,d,m);
    if(c>z0)box(p,(a+b)/2,y,(z0+c)/2,b-a,h,c-z0,m);
    if(e<z1)box(p,(a+b)/2,y,(e+z1)/2,b-a,h,z1-e,m);
  }
  function tube(outer,inner,height){
    const shape=new T.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
    const hole=new T.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
    const geometry=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:16});
    geometry.rotateX(Math.PI/2);geometry.translate(0,height/2,0);return geometry;
  }
  function track(p,points,width,mat,y=.15){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];box(p,(a[0]+b[0])/2,y,(a[1]+b[1])/2,Math.max(Math.abs(a[0]-b[0]),width),.024,Math.max(Math.abs(a[1]-b[1]),width),mat);}}
  const board=group('link-board','PCB 与 SXM 互连剖面','通用多层 PCB 与板对板连接器的教学剖面。层数、接点数量和路由均为示意，不是 H100/A100 的真实堆叠、SXM 引脚定义或高速网表。',root,null);
  const stack=group('link-layers','介质与铜层','PCB 由绝缘介质、铜信号层和参考平面交替组成。右侧阶梯和局部教学开窗露出层间与孔壁，不代表真实 PCB 挖空；拆解只放大层间距。这里的层数不是特定 GPU 模组的制造层数。',board);
  const copper=group('link-copper','PCB 铜走线','板级走线在铜层上传输信号和电源。这里画出通向封装焊盘的概念网络，没有指定它们对应 PCIe 或 NVLink 的哪一组引脚。',board);
  const vias=group('link-vias','PCB 金属化过孔','普通 PCB 金属化孔连接不同铜层；旁边的参考过孔为回流提供跨层路径。它们与穿过硅片的 HBM TSV 属于不同制造层级。',board);
  const pairs=group('link-pairs','差分对与相邻参考面','两条配对走线用相同的路径与相近长度传输差分信号。跨层时保持参考面与回流路径连续；示意颜色区分两根导体，不代表具体通信协议。',board);
  const ground=group('link-ground','参考平面 / 回流路径','高速信号需要邻近、连续的参考平面。连接层改变时，参考过孔帮助回流跨层；不能只把两根差分线当作与地无关的孤立导线。',board);
  const socket=group('link-socket','SXM 板对板接触阵列','SXM 模组连接到载板。连接器向前移出剖面以露出接触阵列；接点布局、数量和信号分配为示意，并非 NVIDIA 引脚图。',board);
  socket.position.z=3;
  const footprint=group('link-footprint','GPU 封装焊盘区','模组 PCB 上的封装连接区。焊盘/焊球通过板内走线与连接器、电源网络相连；不等同于封装内连接 GPU 与 HBM 的硅中介层。',board);
  // Left edges stay aligned while the right edge steps inward, exposing copper
  // and dielectric. No specific manufacturing stack-up is asserted.
  for(let i=0;i<8;i++){
    const g=new T.Group();stack.add(g);g.position.y=-i*.17;
    const w=12.4-i*.32,d=8.8-i*.24,x=-i*.16,z=-i*.12;
    slab(g,x,0,z,w,.13,d,i%2?mats.resin:mats.core);
    slab(g,x,.073,z,w,.018,d,i===1||i===5?mats.ground:mats.copper);
    // A small routed internal pattern makes the copper planes distinct.
    if(i%2===0)for(let line=0;line<6;line++)track(g,[[-5.4,-2.9+line*.45],[-3.9,-2.9+line*.45],[-3.9,-2.6+line*.45],[-2.8,-2.6+line*.45]],.045,mats.gold,.093);
    layers.push({group:g,base:-i*.17,factor:-i*.22});
  }
  slab(board,-1.25,.13,-.85,9.9,.08,6.5,mats.mask);
  // The open right-hand strip exposes via barrels through the cutaway.
  slab(ground,2.3,-.37,-.3,6.9,.035,7.0,mats.ground);
  print(board,'PCB / BOARD-TO-BOARD INTERCONNECT',-.8,.2,-3.8,9.4,.39);
  print(board,'ILLUSTRATIVE STACK-UP / NO VENDOR PINOUT',-.8,.2,3.6,9.8,.24,'#8fa798');
  print(stack,'DIELECTRIC + COPPER',4.45,.095,2.9,3.7,.25,'#d1ba94');
  // Top package land pattern: pad array plus a lifted package frame for context.
  box(footprint,-1.4,.215,-.6,5.3,.12,4.3,mats.plastic);
  box(footprint,-1.4,.29,-.6,5.05,.025,4.05,mats.mask);
  const lands=[];for(let r=0;r<15;r++)for(let c=0;c<19;c++){
    if(r>3&&r<11&&c>5&&c<13)continue;
    lands.push({x:-3.65+c*.25,y:.325,z:-2.35+r*.25,w:.065,h:.025,d:.065});
  }
  inst(footprint,lands,mats.gold,new T.CylinderGeometry(1,1,1,10));
  box(footprint,-1.4,.37,-.6,1.7,.12,1.2,mats.plastic);print(footprint,'LAND FIELD',-1.4,.44,-.6,1.52,.23);
  // Annular copper through-vias along the witness strip, with both an inner
  // bore and a finite copper wall rather than a solid pin or zero-thickness tube.
  const barrelGeo=tube(.135,.105,1.55);
  const rings=[],grounds=[];
  for(let r=0;r<7;r++)for(let c=0;c<3;c++){
    const x=3.5+c*.57,z=-2.45+r*.66;
    const barrel=new T.Mesh(barrelGeo,mats.copper);barrel.position.set(x,-.56,z);barrel.castShadow=true;barrel.receiveShadow=true;barrel.userData.section='finite copper barrel with open bore';vias.add(barrel);viaAssemblies.push(barrel);
    rings.push({x,y:0,z,w:1,h:1,d:1,rx:-Math.PI/2});
    if(c===2)grounds.push({x:x+.25,y:0,z,w:1,h:1,d:1});
  }
  const topRings=inst(vias,rings,mats.gold,new T.RingGeometry(.105,.19,24));topRings.position.y=.215;
  const bottomRings=inst(vias,rings.map(v=>({...v,rx:Math.PI/2})),mats.gold,new T.RingGeometry(.105,.19,24));bottomRings.position.y=-1.335;
  const groundBarrels=inst(ground,grounds,mats.silver,tube(.055,.03,1.55));groundBarrels.position.y=-.56;
  // Board-side connector banks beneath the PCB, separated from the GPU lands.
  const contacts=[],recesses=[],fingers=[];
  for(const x of [-3.75,2.25]){
    box(socket,x,-1.7,.9,4.1,.2,3.05,mats.plastic);
    for(const side of [-1,1]){
      box(socket,x+side*1.98,-1.47,.9,.14,.22,3.05,mats.plastic);
      box(socket,x,-1.47,.9+side*1.455,3.82,.22,.14,mats.plastic);
    }
    box(socket,x,-1.83,.9,3.75,.06,2.72,mats.plastic);
    for(let r=0;r<8;r++)for(let c=0;c<12;c++){
      const cx=x-1.7+c*.31,cz=-.23+r*.32;
      contacts.push({x:cx,y:-1.89,z:cz,w:.105,h:.42,d:.11});
      recesses.push({x:cx,y:-1.56,z:cz,w:.18,h:.085,d:.22});
      for(const side of [-1,1])fingers.push({x:cx+side*.041,y:-1.47,z:cz,w:.032,h:.12,d:.13});
    }
  }
  inst(socket,recesses,mats.cavity);inst(socket,fingers,mats.gold);inst(socket,contacts,mats.gold);print(socket,'SXM CONTACT ARRAY',-3.75,-1.35,2.49,4,.25,'#b9c7bd');
  const padSolder=[];for(const x of [-3.75,2.25])for(let i=0;i<14;i++)padSolder.push({x:x-1.85+i*.285,y:-1.26,z:2.61,w:.12,h:.1,d:.18});inst(socket,padSolder,mats.silver);
  // Readable paired conductors. Routes are orthogonal schematic examples with
  // lengths matched within each pair; they are not PCIe/NVLink net mappings.
  for(let p=0;p<3;p++){
    const z=-2.55+p*.55;
    const route=[[-5.55,z],[-4.65,z],[-4.65,z+.25],[-3.85,z+.25],[-3.85,z+.52],[-3.45,z+.52]];
    track(pairs,route,.065,mats.positive,.22);
    track(pairs,route.map(([x,v])=>[x,v+.14]),.065,mats.negative,.22);
    track(copper,[[3.5,z],[2.85,z],[2.85,z+.42],[1.5,z+.42]],.075,mats.gold,.22);
  }
  // A low-profile visual route joins contacts, PCB via, pair and land pattern.
  track(copper,[[-5.65,2.7],[-4.65,2.7],[-4.65,.65],[-4.05,.65]],.17,mats.copper,.215);
  print(pairs,'PAIRED SIGNAL ROUTES',-4.8,.23,-3.25,3.3,.23,'#b2cbc0');
  print(vias,'PCB VIAS',4.1,.3,2.5,2.5,.23,'#d0b886');
  const groundCuts=[];for(let z=-3.4;z<3;z+=.38)groundCuts.push({x:5.45,y:-.35,z,w:.12,h:.035,d:.08});inst(ground,groundCuts,mats.silver);
  // Corner fastening rings and broad ground stitching retain a module look.
  const screws=[];for(const x of [-5.85,5.85])for(const z of [-4.1,4.1])screws.push({x,y:.13,z,w:.18,h:.05,d:.18});inst(board,screws,mats.silver,new T.CylinderGeometry(1,1,1,16));
  const anchorValues={
    'link-board':[0,-.3,0],'link-layers':[5.4,-.6,1.8],'link-copper':[2.5,.25,-1.7],
    'link-vias':[4.1,.3,.2],'link-pairs':[-4.7,.3,-1.2],'link-ground':[5.1,-.35,-1.5],
    'link-socket':[-3.75,-1.8,3.9],'link-footprint':[-1.4,.48,-.6]
  };for(const [id,p]of Object.entries(anchorValues))anchors[id]=new T.Vector3(...p);
  function setExplode(t){t=Math.max(0,Math.min(1,Number(t)||0));for(const v of layers)v.group.position.y=v.base+t*v.factor;socket.position.y=-t*1.5;socket.position.z=3+t*.9;footprint.position.y=t*.65;for(const v of viaAssemblies){v.scale.y=1+t*.82;v.position.y=-.56-t*.64;}groundBarrels.scale.y=1+t*.82;groundBarrels.position.y=-.56-t*.64;topRings.position.y=.215-t*.0045;bottomRings.position.y=-1.335-t*1.2755;}
  root.updateMatrixWorld(true);
  return {root,components,anchors,setExplode,materials:mats,
    bounds:new T.Box3().setFromObject(root),
    paths:[{kind:'signal',stages:['link-socket','link-vias','link-pairs','link-footprint']},{kind:'reference',stages:['link-socket','link-ground','link-vias']}],
    specification:{kind:'pcb-sxm',illustrative:true,layerCount:8,contactCount:contacts.length,model},
    sources:['https://www.ti.com/lit/an/sbaa405a/sbaa405a.pdf','https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html']};
}
