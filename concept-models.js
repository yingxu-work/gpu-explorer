// Independent conceptual exhibits. They intentionally contain no GPU model or
// vendor-specific floorplan: CPU translation, generic graphics, and 3D logic.
export const CONCEPT_STEPS = {
  pagetable: [
    {title:'Virtual address',active:['cpu','va'],routes:['cpu-va']},
    {title:'TLB miss',active:['tlb'],routes:['cpu-tlb','tlb-miss']},
    {title:'PML4 / PGD',active:['pgd'],routes:['tlb-pgd']},
    {title:'PDPT / PUD',active:['pud'],routes:['pgd-pud']},
    {title:'PD / PMD',active:['pmd'],routes:['pud-pmd']},
    {title:'PT entry + offset',active:['pte','tlb','pa'],routes:['pmd-pte','pte-pa','tlb-fill']},
    {title:'Physical data access',active:['ram','cache','cpu'],routes:['pa-ram','ram-cache','cache-cpu']}
  ],
  pixel: [
    {title:'Target pixel',active:['pixel'],routes:['target-scan']},
    {title:'Triangle coverage',active:['tri','pixel'],routes:['coverage']},
    {title:'Barycentric interpolation',active:['tri','raster'],routes:['weight-0','weight-1','weight-2']},
    {title:'Fragment shader',active:['shader'],routes:['raster-shader']},
    {title:'Texture sample',active:['tex','shader'],routes:['shader-tex','tex-shader']},
    {title:'Depth 0.4 < 0.7',active:['depth','pixel'],routes:['shader-depth']},
    {title:'Framebuffer write',active:['fb'],routes:['depth-fb']},
    {title:'Display scanout',active:['fb','pixel'],routes:['fb-pixel']}
  ],
  stacking: [
    {title:'Logic stack cutaway',active:['lid','logic-top'],routes:['outline']},
    {title:'Binning: disabled unit',active:['cut-core','logic-top'],routes:['bin-scan']},
    {title:'Six separated layers',active:['lid','bond','substrate'],routes:[]},
    {title:'Upper logic',active:['logic-top'],routes:['top-bond']},
    {title:'Vertical hybrid bond',active:['bond'],routes:['bond-low']},
    {title:'Lower logic + memory',active:['logic-low','mem-layer'],routes:['low-memory']},
    {title:'Short vs long connection',active:['bond','mem-layer'],routes:['vertical','lateral']},
    {title:'Heat and manufacturing',active:['lid','logic-top'],routes:['heat']}
  ]
};
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const phaseOf=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
const wrap=n=>n-Math.floor(n);
function sample(points,fraction){
  const lengths=points.slice(1).map((p,i)=>Math.hypot(...p.map((v,k)=>v-points[i][k])));
  let d=clamp(fraction)*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){
    if(d<=lengths[i]||i===lengths.length-1){const t=lengths[i]?d/lengths[i]:0;return points[i].map((v,k)=>v+(points[i+1][k]-v)*t);}d-=lengths[i];
  }return points.at(-1);
}

export function createConceptModel(T,journey){
  if(!CONCEPT_STEPS[journey])throw new Error('Unsupported concept journey: '+journey);
  const root=new T.Group();root.name='concept-'+journey;root.userData.semantic='conceptual';root.userData.journey=journey;
  const geometries=new Set(),materials=new Set(),textures=new Set(),resources={},routes={};
  const unit=new T.BoxGeometry(1,1,1),lineGeometry=new T.CylinderGeometry(1,1,1,7);geometries.add(unit);geometries.add(lineGeometry);
  const neutral=0x283b44,teal=0x78c8b5,blue=0x92afd3,gold=0xd2b17f,red=0xcd8277;
  const mat=(color,options={})=>{const m=new T.MeshStandardMaterial({color,roughness:.55,metalness:.38,...options});materials.add(m);return m;};
  const basic=(color,opacity=1)=>{const m=new T.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity>=1,toneMapped:false,side:T.DoubleSide});materials.add(m);return m;};
  const box=(parent,x,y,z,w,h,d,material)=>{const mesh=new T.Mesh(unit,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;};
  const line=(parent,a,b,width,material)=>{const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av);const mesh=new T.Mesh(lineGeometry,material);mesh.position.copy(av.add(bv).multiplyScalar(.5));mesh.scale.set(width,delta.length(),width);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());parent.add(mesh);return mesh;};
  function label(parent,text,x,y,z,w,h,color='#c6d6d3',vertical=false){
    const canvas=document.createElement('canvas'),aspect=w/h;canvas.width=Math.min(2048,Math.max(256,Math.round(128*aspect)));canvas.height=Math.max(32,Math.round(canvas.width/aspect));
    const c=canvas.getContext('2d');c.font='100px ui-monospace,monospace';const measured=c.measureText?.(text)?.width||text.length*62;
    const size=Math.min(canvas.height*.78,canvas.width*.93/Math.max(1,measured)*100);c.font='500 '+size+'px ui-monospace,monospace';c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.fillText(text,canvas.width/2,canvas.height/2);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;textures.add(tex);const m=basic(0xffffff,.96);m.map=tex;m.depthWrite=false;
    const geo=new T.PlaneGeometry(w,h);geometries.add(geo);const mesh=new T.Mesh(geo,m);mesh.position.set(x,y,z);if(!vertical)mesh.rotation.x=-Math.PI/2;parent.add(mesh);return mesh;
  }
  function resource(id,x,y,z,w=1.6,d=1.4,accent=teal,title=id.toUpperCase(),body=true){
    const group=new T.Group();group.position.set(x,y,z);group.userData.conceptResource=id;root.add(group);
    const m=mat(neutral),entry={group,materials:[m],accent:new T.Color(accent),base:new T.Color(neutral)};resources[id]=entry;
    if(body){box(group,0,0,0,w,.27,d,m);box(group,0,.15,0,w-.08,.035,d-.08,mat(0x13232b));entry.rim=basic(accent,.38);box(group,0,.19,-d/2+.09,w-.16,.025,.055,entry.rim);label(group,title,0,.181,0,w-.16,.25);}
    return entry;
  }
  function route(id,points,color=teal,{delay=0,kind='signal'}={}){
    const group=new T.Group();group.userData.conceptRoute=id;group.userData.kind=kind;root.add(group);const material=basic(color,.18);
    const traces=[];for(let i=1;i<points.length;i++)traces.push(line(group,points[i-1],points[i],.018,material));
    // Tiny pulses retain the route's scale and never cover resources or labels.
    const pulses=[];for(let i=0;i<2;i++){const p=box(group,0,0,0,.065,.045,.060,basic(color));p.userData.conceptPulse=true;p.visible=false;pulses.push(p);}
    routes[id]={group,points,color,material,pulses,traces,delay};return routes[id];
  }
  const floorMat=mat(0x111e25,{roughness:.8,metalness:.20});box(root,0,-.19,0,11.8,.18,7.9,floorMat);
  const rimMat=basic(0x3f5b61,.6);for(const z of [-3.84,3.84])box(root,0,-.08,z,11.5,.012,.018,rimMat);
  let specialize=()=>{};

  if(journey==='pagetable'){
    label(root,'x86-64  /  4 LEVELS  /  4 KiB',0,-.075,-3.74,6.4,.22,'#8ba6ad');
    const va=resource('va',0,.20,-2.75,10.3,.95,blue,'',false);box(va.group,0,0,0,10.3,.12,.95,va.materials[0]);
    const fieldNames=['PML4  0','PDPT  1','PD  504','PT  1','OFFSET  0x234'];const fields=[];
    fieldNames.forEach((name,i)=>{const m=mat(0x334b59);const tile=box(va.group,-4.12+i*2.06,.09,0,1.96,.08,.78,m);fields.push(m);label(va.group,name,tile.position.x,.14,-.07,1.80,.22);label(va.group,i===4?'12 bits':'9 bits',tile.position.x,.14,.23,1.3,.15,'#809ba5');});
    const cpu=resource('cpu',-4.65,.24,-.3,1.65,1.6,blue,'CPU');
    for(const side of [-1,1])for(let i=0;i<7;i++)box(cpu.group,side*.87,.02,-.60+i*.2,.12,.08,.08,mat(gold));
    resource('tlb',-2.30,.24,-.3,1.65,1.6,teal,'TLB');label(root,'MISS',-1.16,.46,-.83,.58,.17,'#d2b17f');
    const tablePositions=[[0,.24,-.65],[2.30,.24,-.65],[4.60,.24,-.65],[4.60,.24,1.65]];
    ['pgd','pud','pmd','pte'].forEach((id,i)=>{
      const [x,y,z]=tablePositions[i],entry=resource(id,x,y,z,1.65,1.55,blue,['PML4','PDPT','PD','PT'][i]);
      for(let row=0;row<3;row++)for(let col=0;col<5;col++)box(entry.group,-.56+col*.28,.19,-.49+row*.20,.20,.018,.085,mat(row===1&&col===(i===2?4:1)?gold:0x435b63));
      label(entry.group,['PGD','PUD','PMD','PTE'][i],0,.19,.51,1.02,.16,'#7c99a3');
    });
    resource('ram',2.30,.24,1.65,1.65,1.55,teal,'PHYSICAL PAGE');
    resource('cache',0,.24,1.65,1.65,1.55,gold,'DATA CACHE');
    const pa=resource('pa',2.3,.14,3.02,5.9,.65,teal,'PA  0x12345000 + 0x234',true);
    label(root,'HIT: cached translation',-2.75,-.07,3.35,3.7,.19,'#698786');
    route('cpu-va',[[-4.65,.46,-1.10],[-4.65,.46,-2.20]],blue,{kind:'address'});
    route('cpu-tlb',[[-3.80,.46,-.3],[-3.13,.46,-.3]],blue);
    route('tlb-miss',[[-1.47,.46,-.3],[-1.0,.46,-.3],[-1.0,.46,-.65]],gold);
    route('tlb-pgd',[[-1.47,.46,-.3],[-1.0,.46,-.3],[-1.0,.46,-.65],[-.83,.46,-.65]],gold);
    route('pgd-pud',[[.83,.46,-.65],[1.47,.46,-.65]],blue);
    route('pud-pmd',[[3.13,.46,-.65],[3.77,.46,-.65]],blue);
    route('pmd-pte',[[4.60,.46,.14],[4.60,.46,.87]],blue);
    route('pte-pa',[[4.60,.46,2.45],[4.60,.46,2.68]],teal);
    route('tlb-fill',[[3.76,.46,1.65],[3.5,.46,1.65],[3.5,.46,2.62],[-2.30,.46,2.62],[-2.30,.46,.55]],teal,{delay:.15});
    route('tlb-hit',[[-2.30,.40,.55],[-2.30,.40,2.48],[2.30,.40,2.48],[2.30,.40,2.45]],teal,{kind:'alternative'});
    route('pa-ram',[[2.30,.46,2.68],[2.30,.46,2.45]],teal);
    route('ram-cache',[[1.47,.46,1.65],[.83,.46,1.65]],teal,{delay:.12});
    route('cache-cpu',[[-.83,.46,1.65],[-4.65,.46,1.65],[-4.65,.46,.55]],blue,{delay:.24});
    specialize=(step,p)=>{fields.forEach((m,i)=>{m.emissive.set(i===(step>=2&&step<=5?step-2:-1)||i===4&&step>=5?blue:0x000000);m.emissiveIntensity=.32;});pa.group.userData.address='0x12345234';pa.group.visible=step>=5;root.userData.translation={virtualAddress:'0x00007f001234',indices:[0,1,504,1],offset:0x234,pageBase:0x12345000,physicalAddress:0x12345234,tlb:'miss',progress:p};};
  }

  if(journey==='pixel'){
    label(root,'GENERIC GRAPHICS  /  ONE FRAGMENT',0,-.075,-3.74,6.5,.22,'#8ba6ad');
    const tri=resource('tri',0,0,0,0,0,blue,'',false),raster=resource('raster',0,0,0,0,0,teal,'',false);
    const vertices=[[-3.80,.28,-1.93],[-5.10,.28,1.82],[-2.35,.28,1.82]],point=[-4.015,.32,1.07];
    const triGeometry=new T.BufferGeometry();triGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));triGeometry.setAttribute('color',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1],3));triGeometry.computeVertexNormals();geometries.add(triGeometry);
    const triMat=basic(0xffffff,.48);triMat.vertexColors=true;tri.group.add(new T.Mesh(triGeometry,triMat));
    const edgeMat=basic(blue,.68);tri.materials=[edgeMat];for(let i=0;i<3;i++)line(tri.group,vertices[i],vertices[(i+1)%3],.019,edgeMat);
    vertices.forEach((v,i)=>{box(tri.group,v[0],v[1]+.04,v[2],.13,.075,.13,basic([red,teal,blue][i]));label(tri.group,'v'+i,v[0]+.17,.36,v[2]-.18,.34,.17);});
    const clipMat=basic(0x526d77,.6);const corners=[[-5.45,.20,-2.3],[-2.0,.20,-2.3],[-2.0,.20,2.28],[-5.45,.20,2.28]];for(let i=0;i<4;i++)line(root,corners[i],corners[(i+1)%4],.012,clipMat);
    label(root,'CLIP / RASTER',-3.73,.22,-2.65,2.6,.20,'#91aab3');
    const gridMat=basic(0x65817f,.26);raster.materials=[gridMat];for(let i=0;i<=10;i++){const x=-5.4+i*.34,z=-2.2+i*.44;line(raster.group,[x,.22,-2.2],[x,.22,2.2],.007,gridMat);line(raster.group,[-5.4,.22,z],[-2,.22,z],.007,gridMat);}
    box(raster.group,...point,.19,.045,.19,basic(teal));label(root,'P',point[0]-.22,.38,point[2]+.28,.27,.20);
    resource('shader',-.5,.24,-.85,1.65,1.50,blue,'FRAGMENT');resource('tex',-.5,.24,1.65,1.65,1.5,gold,'TEXTURE');
    const shaderBars=[];for(let i=0;i<4;i++)shaderBars.push(box(resources.shader.group,-.55+i*.37,.20,-.39,.23,.025,.11,mat(0x6b8490)));
    for(let row=0;row<5;row++)for(let col=0;col<5;col++)box(resources.tex.group,-.57+col*.28,.20,-.47+row*.20,.22,.018,.12,basic((row+col)%2?0x647d78:0xd4ded3));
    resource('depth',2.0,.24,-.85,1.65,1.50,gold,'DEPTH');label(resources.depth.group,'0.4 < 0.7',0,.20,.41,1.30,.20,'#d2b17f');
    box(resources.depth.group,0,.23,-.35,1.15,.035,.15,basic(0x788a9b));const frontDepth=box(resources.depth.group,0,.28,-.10,1.15,.035,.15,basic(teal));
    resource('fb',4.5,.24,-.85,1.85,1.80,teal,'',true);label(resources.fb.group,'FRAMEBUFFER',0,.19,-.65,1.64,.19);
    let fbTarget;for(let row=0;row<8;row++)for(let col=0;col<8;col++){const cell=box(resources.fb.group,-.72+col*.205,.20,-.43+row*.15,.16,.025,.115,basic(0x334b52));if(row===4&&col===3)fbTarget=cell;}
    const screen=resource('pixel',4.5,.08,2.05,1.95,.82,blue,'',false);box(screen.group,0,.72,0,1.95,1.50,.16,mat(0x293b42));box(screen.group,0,.72,.10,1.72,1.20,.035,mat(0x0e2027));
    label(screen.group,'DISPLAY',0,1.68,.12,1.75,.23,'#a2bdc9',true);let screenTarget;
    for(let row=0;row<8;row++)for(let col=0;col<8;col++){const cell=box(screen.group,-.72+col*.205,.20+row*.145,.13,.16,.115,.025,basic(0x31444e));if(row===3&&col===3)screenTarget=cell;}
    route('target-scan',[[3.68,.70,2.23],[5.3,.70,2.23]],blue,{kind:'selection'});
    route('coverage',[vertices[0],[point[0],.33,point[2]],vertices[1]],blue,{kind:'dependency'});
    vertices.forEach((v,i)=>route('weight-'+i,[[v[0],.35,v[2]],[point[0],.35,point[2]]],[red,teal,blue][i],{kind:'dependency',delay:i*.07}));
    route('raster-shader',[[point[0],.46,point[2]],[-1.50,.46,point[2]],[-1.50,.46,-.85],[-1.33,.46,-.85]],teal);
    route('shader-tex',[[-.80,.46,-.06],[-.80,.46,.87]],gold);
    route('tex-shader',[[-.20,.46,.87],[-.20,.46,-.06]],teal,{delay:.15});
    route('shader-depth',[[.33,.46,-.85],[1.17,.46,-.85]],teal);
    route('depth-fb',[[2.83,.46,-.85],[3.57,.46,-.85]],teal);
    route('fb-pixel',[[4.5,.46,.08],[4.5,.46,.74],[4.5,.80,1.90]],teal);
    specialize=(step,p)=>{
      const targetColor=new T.Color().setRGB(.2,.5,.3),dim=new T.Color(0x334b52);fbTarget.material.color.copy(dim).lerp(targetColor,step>6?1:step===6?p:0);screenTarget.material.color.copy(step>=7?targetColor:new T.Color(blue).multiplyScalar(.48));
      frontDepth.scale.x=step===5?.65+.5*p:1.15;shaderBars.forEach((bar,i)=>bar.scale.y=step===3?.02+.06*clamp(p*4-i):.025);
      root.userData.fragment={weights:[.2,.5,.3],framebufferSize:[8,8],targetIndex:35,targetRow:4,targetColumn:3,linearColor:[.2,.5,.3],rgb:[51,128,77],depth:.4,storedDepth:.7,depthPassed:true,framebufferWritten:step>6||step===6&&p>=1,displayed:step>=7,progress:p};
    };
  }

  if(journey==='stacking'){
    label(root,'3D LOGIC STACK  /  CONCEPTUAL CUTAWAY',0,-.075,-3.74,8.0,.22,'#8ba6ad');
    const layers=[['lid',3.47,gold,'LID / CUTAWAY'],['logic-top',2.77,blue,'TOP LOGIC'],['bond',2.19,gold,'HYBRID BOND'],['logic-low',1.61,blue,'LOW LOGIC'],['mem-layer',.95,teal,'MEMORY / CACHE'],['substrate',.24,gold,'SUBSTRATE']];
    layers.forEach(([id,y,accent,title],index)=>{
      const e=resource(id,0,y,0,0,0,accent,'',false);e.baseY=y;e.layerIndex=index;
      if(id==='lid'){box(e.group,0,0,-1.57,7.0,.24,1.32,e.materials[0]);box(e.group,-2.62,0,.25,1.75,.24,2.30,e.materials[0]);}
      else if(id==='logic-top'){box(e.group,-1.35,0,0,3.75,.27,4.25,e.materials[0]);box(e.group,1.73,0,-1.12,2.38,.27,2.02,e.materials[0]);}
      else box(e.group,0,0,0,id==='substrate'?7.4:6.8,id==='bond'?.10:.24,id==='substrate'?5.05:4.55,e.materials[0]);
      label(e.group,title,id==='lid'?0:1.1,.06,2.34,id==='substrate'?5.5:4.3,.21,'#b9ced0',true);
    });
    for(const [x,z]of [[-2.35,-1],[-.65,-1],[1.35,-1.25]])box(resources['logic-top'].group,x,.24,z,1.28,.19,1.25,mat(0x4b6476));
    const cut=resource('cut-core',-2.35,3.03,-1.0,1.25,1.20,red,'',false);box(cut.group,0,0,0,1.15,.10,1.10,cut.materials[0]);
    const crossMat=basic(red,.8);for(const direction of [-1,1]){const cross=box(cut.group,0,.07,0,1.20,.025,.035,crossMat);cross.rotation.y=direction*Math.PI/4;}label(cut.group,'DISABLED',0,.10,0,1.12,.18,'#c9a9a1');
    for(let row=0;row<2;row++)for(let col=0;col<4;col++)box(resources['logic-low'].group,-2.5+col*1.50,.22,-.9+row*1.5,1.08,.18,1.02,mat(col===3?0x668b7e:0x526776));
    for(let row=0;row<4;row++)for(let col=0;col<6;col++)box(resources['mem-layer'].group,-2.6+col*1.04,.18,-1.5+row*.97,.80,.10,.68,mat(0x4c7c75));
    const viaMat=mat(0xb99968,{metalness:.74,roughness:.32});for(let row=0;row<5;row++)for(let col=0;col<7;col++)line(resources.bond.group,[-2.7+col*.9,-.39,-1.6+row*.8],[-2.7+col*.9,.39,-1.6+row*.8],.023,viaMat);
    route('outline',[[-3.55,3.58,-2.25],[-3.55,3.58,2.25],[-3.55,.25,2.25]],gold,{kind:'structure'});
    route('bin-scan',[[-2.90,3.14,-1.48],[-1.80,3.14,-1.48],[-1.80,3.14,-.50]],red,{kind:'selection'});
    route('top-bond',[[-.30,2.93,.60],[-.30,2.30,.60]],blue);
    route('bond-low',[[-.30,2.30,.60],[-.30,1.78,.60]],gold);
    route('low-memory',[[1.75,1.78,.90],[1.75,1.10,.90]],teal);
    route('vertical',[[-.30,2.93,.60],[-.30,1.78,.60]],teal);
    route('lateral',[[-.30,2.93,.60],[3.70,2.93,.60],[3.70,2.93,2.75],[3.70,1.78,2.75],[-.30,1.78,2.75],[-.30,1.78,.60]],gold,{delay:.16});
    route('heat',[[-2.25,1.78,-.60],[-2.25,3.65,-.60],[-2.25,4.17,-.60]],red,{kind:'heat'});
    label(root,'SHORT VERTICAL',-.4,.01,3.18,3.0,.20,'#85b5a7');label(root,'LONG LATERAL',3.2,.01,3.18,2.5,.20,'#bda67e');
    specialize=(step,p)=>{
      layers.forEach(([id],i)=>resources[id].group.position.y=resources[id].baseY+(step===2?(5-i)*.25*p:0));
      cut.group.visible=step===1;cut.group.userData.disabled=step===1;cut.group.userData.physicallyPresent=true;
      if(step===1)cut.materials[0].color.set(0x41474a);
      if(step===7){for(const id of ['logic-top','logic-low'])resources[id].materials[0].emissive.set(red);resources['logic-low'].materials[0].emissiveIntensity=.10+.08*p;}
      root.userData.stack={layerCount:6,disabledCorePhysicallyPresent:true,layerSeparation:step===2?p:0,distanceComparison:'geometric, not measured latency',thermalTradeoff:step===7,progress:p};
    };
  }

  const stepInfo=CONCEPT_STEPS[journey],markers=[];
  const api={root,fitObject:root,markers,stepInfo,
    bounds:new T.Box3(new T.Vector3(-6.0,-.32,-4.0),new T.Vector3(6.0,journey==='stacking'?5.10:2.05,4.0)),
    update(stepIndex,progress,visualPhase=progress){
      const index=Math.max(0,Math.min(stepInfo.length-1,Math.floor(Number(stepIndex)||0))),p=clamp(progress),phase=phaseOf(visualPhase),step=stepInfo[index],wave=.5+.5*Math.sin(phase*Math.PI*2);
      for(const [id,item]of Object.entries(resources)){
        const active=step.active.includes(id);item.group.userData.active=active;if(item.rim)item.rim.opacity=active?.95:.30;
        for(const material of item.materials){
          material.color.copy(item.base).lerp(item.accent,active?.34:.08);
          if(material.emissive){material.emissive.copy(item.accent);material.emissiveIntensity=active?.12+.07*wave:.012;}
          else material.color.lerp(item.accent,active?.24+.16*wave:0);
        }
      }
      let routeIndex=0;
      for(const [id,item]of Object.entries(routes)){
        const active=step.routes.includes(id),f=wrap(phase-item.delay-routeIndex*.035);item.group.userData.active=active;item.material.opacity=active?.82:.12;
        item.material.color.set(active?item.color:0x3d5a60);item.traces.forEach(trace=>{trace.scale.x=trace.scale.z=active?.028:.018;});
        item.pulses.forEach((pulse,i)=>{pulse.visible=active;pulse.position.set(...sample(item.points,wrap(f-i*.15)));});routeIndex++;
        if(journey==='stacking'&&index===2)item.group.visible=false;else item.group.visible=true;
      }
      specialize(index,p,phase);root.updateMatrixWorld(true);
      const status={stepIndex:index,activeResources:step.active.slice(),activeRoutes:step.routes.slice(),progress:p,visualPhase:phase,stage:step.title,complete:p>=1};
      root.userData.step=status;return status;
    },
    dispose(){root.removeFromParent();textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
  };
  api.update(0,0,0);return api;
}
