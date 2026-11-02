// Multiphase buck teaching specimen. Component count/layout is illustrative,
// not a reconstruction of an H100/A100 power schematic or voltage rail.
export function createPowerDetail(T, model='h100') {
  const root=new T.Group();root.name='power-detail';root.visible=false;
  const components={},anchors={},layers=[];
  const geo=new T.BoxGeometry(1,1,1);
  const mats={
    pcb:new T.MeshStandardMaterial({color:0x214c3d,roughness:.72,metalness:.06}),
    edge:new T.MeshStandardMaterial({color:0x263d30,roughness:.88,metalness:.03}),
    copper:new T.MeshStandardMaterial({color:0xb68250,roughness:.38,metalness:.83}),
    gold:new T.MeshStandardMaterial({color:0xb6a16c,roughness:.35,metalness:.83}),
    silver:new T.MeshStandardMaterial({color:0xbac2bf,roughness:.28,metalness:.87}),
    black:new T.MeshStandardMaterial({color:0x1b2528,roughness:.75,metalness:.06}),
    core:new T.MeshStandardMaterial({color:0x49504c,roughness:.86,metalness:.08}),
    ceramic:new T.MeshStandardMaterial({color:0xb8b19a,roughness:.62,metalness:.12}),
    control:new T.MeshStandardMaterial({color:0x6b8b9b,roughness:.35,metalness:.6}),
    rail:new T.MeshStandardMaterial({color:0x8ba58c,roughness:.35,metalness:.65})
  };
  function group(id,label,description,parent=root,parentId='power-board'){
    const g=new T.Group();g.userData.componentId=id;parent.add(g);
    components[id]={id,label,description,level:'power',parent:parentId,group:g};return g;
  }
  function box(p,x,y,z,w,h,d,m){const a=new T.Mesh(geo,m);a.position.set(x,y,z);a.scale.set(w,h,d);a.castShadow=true;a.receiveShadow=true;p.add(a);return a;}
  function inst(p,list,m,g=geo){const a=new T.InstancedMesh(g,m,list.length),d=new T.Object3D();list.forEach((v,i)=>{d.position.set(v.x||0,v.y||0,v.z||0);d.scale.set(v.w||1,v.h||1,v.d||1);d.rotation.set(v.rx||0,v.ry||0,v.rz||0);d.updateMatrix();a.setMatrixAt(i,d.matrix);});a.castShadow=true;a.receiveShadow=true;p.add(a);return a;}
  function print(p,text,x,y,z,w=3,d=.25,color='#bdcbbd'){
    // Match texture pixels to the physical surface. A fixed 8:1 texture made
    // short package marks look wide and long board legends unnaturally thin.
    const aspect=w/d,c=document.createElement('canvas');c.height=Math.max(32,Math.min(128,Math.round(2048/aspect)));c.width=Math.round(c.height*aspect);
    const q=c.getContext('2d');let fontPixels=c.height*.68;
    q.font=`500 ${fontPixels}px monospace`;
    const measure=()=>q.measureText?.(text)?.width??text.length*fontPixels*.61;
    fontPixels*=Math.min(1,c.width*.92/measure());q.font=`500 ${fontPixels}px monospace`;
    q.fillStyle=color;q.textAlign='center';q.textBaseline='middle';q.fillText(text,c.width/2,c.height/2);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    const m=new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2});
    const a=new T.Mesh(new T.PlaneGeometry(w,d),m);a.rotation.x=-Math.PI/2;a.position.set(x,y,z);
    a.userData.surfaceText={text,canvasAspect:c.width/c.height,worldAspect:aspect,fontPixels,canvasWidth:c.width,canvasHeight:c.height,textWidthPixels:measure()};p.add(a);return a;
  }
  function track(p,points,width,mat,y=.08){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];box(p,(a[0]+b[0])/2,y,(a[1]+b[1])/2,Math.max(Math.abs(b[0]-a[0]),width),.025,Math.max(Math.abs(b[1]-a[1]),width),mat);}}
  const board=group('power-board','多相降压供电板','并联功率级将输入电源转换为 GPU 所需供电；电感平滑电流，输出电容稳定电压。',root,null);
  box(board,0,-.12,0,13,.25,9.2,mats.pcb);box(board,0,-.26,0,13,.035,9.2,mats.edge);
  print(board,'MULTIPHASE BUCK / POWER DELIVERY',0,.025,-4.05,8.2,.42);
  print(board,'POWER STAGES  /  INDUCTORS  /  OUTPUT FILTER',0,.026,4.12,9.6,.25,'#86a08c');
  const ground=group('power-ground','回流参考平面','开关电流沿 PCB 回流网络形成闭合回路。导电参考平面提供低阻抗回流路径，与正向供电网络共同传输电能。',board);
  box(ground,0,-.275,0,12.82,.025,9.03,mats.silver);
  const input=group('power-input','输入去耦电容','输入电容为开关功率级提供局部脉动电流，缩短高频电流回路，并减小输入电源的电压波动。',board);
  const controller=group('power-controller','PWM 控制器','控制器按相位错开发出 PWM，通过电压与电流反馈调节各相，协调功率级的开关时序。',board);
  const stage=group('power-stage','集成功率级 / DrMOS','每相功率级包含驱动与开关晶体管，交替连接输入和回流路径；功率级之后由电感和输出电容滤波。',board);
  const inductor=group('power-inductor','电感与磁芯剖面','铜绕组与磁芯储存磁场能量，限制电流变化，使各相的输出电流更加平滑。剖面可观察绕组围绕磁芯的连接。',board);
  const output=group('power-output','输出去耦电容','并联输出电容承接各相纹波并响应负载变化。多相电流在共同输出节点叠加，交错相位可降低总纹波。',board);
  const rail=group('power-rail','公共输出铜排','各相电感的输出汇入同一供电节点，通过宽铜排将合并后的电流送向 GPU 负载。',board);
  const feedback=group('power-feedback','反馈与相位控制','采样线路将输出电压与各相电流送回控制器；PWM 线路把调节后的开关时序送到功率级。',board);
  const xs=Array.from({length:6},(_,i)=>-4.75+i*1.9);
  const cin=[],cinEnds=[],cout=[],coutEnds=[],pads=[],pins=[],tiny=[];
  xs.forEach((x,i)=>{
    for(let k=0;k<3;k++){const z=-3.05+k*.3;cin.push({x,y:.16,z,w:.72,h:.25,d:.18});cinEnds.push({x:x-.37,y:.15,z,w:.12,h:.27,d:.2},{x:x+.37,y:.15,z,w:.12,h:.27,d:.2});}
    box(stage,x,.1,-1.83,1.28,.08,1.5,mats.gold);box(stage,x,.32,-1.83,1.05,.4,1.23,mats.black);box(stage,x,.53,-1.83,.79,.015,.91,mats.core);
    print(stage,'P'+(i+1),x,.548,-1.86,.62,.22,'#c3cbc7');
    for(let k=0;k<6;k++){pins.push({x:x-.59,y:.12,z:-2.36+k*.21,w:.12,h:.1,d:.12},{x:x+.59,y:.12,z:-2.36+k*.21,w:.12,h:.1,d:.12});}
    track(rail,[[x,-3.43],[x,-2.56]],.14,mats.copper,.055);
    track(rail,[[x,-1.1],[x,-.63]],.24,mats.copper,.07);
    // Separate end terminations rather than a single conducting plate under
    // the whole inductor. The dark seating layer reads as molded insulation.
    box(inductor,x,.11,.15,1.3,.1,1.34,mats.black);
    box(inductor,x,.11,-.51,1.45,.12,.17,mats.silver);box(inductor,x,.11,.81,1.45,.12,.17,mats.silver);
    if(i===0){
      const winding=new T.Group();winding.name='opened-inductor-coil';inductor.add(winding);layers.push({group:winding,base:0,factor:.35});
      // One helical winding around an insulated center leg; each turn meets
      // the next. Separate closed copper rings would depict shorted turns.
      // This opened magnetic assembly remains an illustrative construction.
      box(inductor,x,.52,.62,1.34,.72,.22,mats.core);box(inductor,x-.52,.52,.13,.27,.72,1.15,mats.core);box(inductor,x+.52,.52,.13,.27,.72,1.15,mats.core);
      box(inductor,x,.48,.12,.44,.65,.5,mats.core);
      for(let n=0;n<5;n++){
        const points=Array.from({length:25},(_,k)=>{
          const a=k/24*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
          return new T.Vector3(x+.305*Math.sign(c)*Math.sqrt(Math.abs(c)),.23+(n+k/24)*.09,.11+.34*Math.sign(s)*Math.sqrt(Math.abs(s)));
        });
        const coil=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),96,.035,8,false),mats.copper);
        coil.userData.windingTurn=n;coil.castShadow=true;coil.receiveShadow=true;winding.add(coil);
      }
      print(inductor,'CUTAWAY',x,.96,.77,1.2,.18,'#d3b78c');
    }else{
      const shell=new T.Group();shell.name='inductor-shell-'+(i+1);inductor.add(shell);layers.push({group:shell,base:0,factor:.45});
      box(shell,x,.54,.15,1.34,.76,1.34,mats.core);
      box(shell,x,.94,.15,1.15,.03,1.15,mats.black);print(shell,'L'+(i+1),x,.965,.13,.8,.29,'#c2c6be');
    }
    track(rail,[[x,.92],[x,2.68]],.26,mats.copper,.065);
    for(let k=0;k<4;k++){const z=1.33+k*.3;cout.push({x:x+.52,y:.19,z,w:.24,h:.3,d:.18});coutEnds.push({x:x+.52,y:.19,z:z-.1,w:.26,h:.32,d:.06},{x:x+.52,y:.19,z:z+.1,w:.26,h:.32,d:.06});}
    for(let k=0;k<3;k++){tiny.push({x:x-.6+k*.6,y:.105,z:-.86,w:.18,h:.12,d:.11});}
    track(feedback,[[-5.55,-3.45],[-5.55,-2.8-i*.075],[x-.7,-2.8-i*.075],[x-.7,-1.86]],.032,mats.control,.045);
  });
  inst(input,cin,mats.ceramic);inst(input,cinEnds,mats.silver);inst(output,cout,mats.ceramic);inst(output,coutEnds,mats.silver);inst(stage,pins,mats.silver);inst(board,tiny,mats.ceramic);
  track(rail,[[-5.6,-3.45],[5.6,-3.45]],.23,mats.gold,.055);
  box(rail,0,.12,2.85,11.55,.15,.42,mats.rail);box(rail,0,.11,3.32,11.55,.12,.18,mats.copper);
  print(rail,'COMMON OUTPUT → LOAD',0,.21,2.84,4.3,.23,'#e0e4d6');
  box(controller,-5.55,.2,-3.43,.83,.32,.82,mats.black);
  const cpins=[];for(let i=0;i<7;i++)for(const sign of [-1,1]){cpins.push({x:-5.55+sign*.46,y:.09,z:-3.76+i*.11,w:.12,h:.08,d:.06});cpins.push({x:-5.88+i*.11,y:.09,z:-3.43+sign*.46,w:.06,h:.08,d:.12});}inst(controller,cpins,mats.silver);
  print(controller,'PWM',-5.55,.37,-3.43,.63,.18,'#b1c4cd');
  track(feedback,[[5.75,2.85],[5.95,2.85],[5.95,-3.7],[-5.55,-3.7]],.035,mats.control,.04);
  const holes=[];for(const x of [-6.02,6.02])for(const z of [-4.12,4.12])holes.push({x,y:.045,z,w:.18,h:.04,d:.18});inst(board,holes,mats.silver,new T.CylinderGeometry(1,1,1,16));
  const anchorValues={
    'power-board':[0,-.1,0],'power-ground':[5.9,-.27,3.8],'power-input':[-2.85,.35,-2.75], 'power-controller':[-5.55,.4,-3.43],
    'power-stage':[.95,.55,-1.83],'power-inductor':[-4.75,.9,.15], 'power-output':[3.37,.4,1.8],
    'power-rail':[0,.3,2.85],'power-feedback':[5.95,.12,-.4]
  };for(const [id,p]of Object.entries(anchorValues))anchors[id]=new T.Vector3(...p);
  function setExplode(t){t=Math.max(0,Math.min(1,Number(t)||0));for(const a of layers)a.group.position.y=a.base+t*a.factor;}
  root.updateMatrixWorld(true);
  return {root,components,anchors,setExplode,materials:mats,phaseCount:6,
    bounds:new T.Box3().setFromObject(root),
    paths:[{kind:'power',stages:['power-input','power-stage','power-inductor','power-output','power-rail']},{kind:'control',stages:['power-controller','power-feedback','power-stage']}],
    specification:{kind:'multiphase-buck',illustrative:true,phaseCount:6,model},
    sources:['https://www.ti.com/document-viewer/lit/html/SSZTC61/GUID-0C11D72C-F6B3-479F-81D7-D5EFA802CA64']};
}
