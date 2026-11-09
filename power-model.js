// Multiphase buck teaching specimen. Component count/layout is illustrative,
// not a reconstruction of an H100/A100 power schematic or voltage rail.
import { createLabelFactory } from './surface-label.js?v=20261109a';
const L=(zh,en)=>({zh,en});
export function createPowerDetail(T, model='h100', labelFactory=null) {
  const labels=labelFactory||createLabelFactory(T);
  const root=new T.Group();root.name='power-detail';root.visible=false;
  const components={},anchors={},layers=[];
  const geo=new T.BoxGeometry(1,1,1);
  const mats={
    pcb:new T.MeshPhysicalMaterial({color:0x1b4a3a,roughness:.46,metalness:0,clearcoat:.5,clearcoatRoughness:.3}),
    edge:new T.MeshStandardMaterial({color:0x263d30,roughness:.88,metalness:.03}),
    copper:new T.MeshStandardMaterial({color:0xb68250,roughness:.38,metalness:.83}),
    gold:new T.MeshStandardMaterial({color:0xb6a16c,roughness:.35,metalness:.83}),
    silver:new T.MeshStandardMaterial({color:0xbcc1c3,roughness:.36,metalness:.88}),
    black:new T.MeshStandardMaterial({color:0x15191b,roughness:.6,metalness:.04}),
    core:new T.MeshStandardMaterial({color:0x34393b,roughness:.82,metalness:.06}),
    ceramic:new T.MeshStandardMaterial({color:0x9c8a6b,roughness:.68,metalness:0}),
    control:new T.MeshStandardMaterial({color:0x6b8b9b,roughness:.35,metalness:.6}),
    rail:new T.MeshStandardMaterial({color:0x8ba58c,roughness:.35,metalness:.65})
  };
  function group(id,label,description,parent=root,parentId='power-board'){
    const g=new T.Group();g.userData.componentId=id;parent.add(g);
    components[id]={id,label,description,level:'power',parent:parentId,group:g};return g;
  }
  function box(p,x,y,z,w,h,d,m){const a=new T.Mesh(geo,m);a.position.set(x,y,z);a.scale.set(w,h,d);a.castShadow=true;a.receiveShadow=true;p.add(a);return a;}
  function inst(p,list,m,g=geo){const a=new T.InstancedMesh(g,m,list.length),d=new T.Object3D();list.forEach((v,i)=>{d.position.set(v.x||0,v.y||0,v.z||0);d.scale.set(v.w||1,v.h||1,v.d||1);d.rotation.set(v.rx||0,v.ry||0,v.rz||0);d.updateMatrix();a.setMatrixAt(i,d.matrix);});a.castShadow=true;a.receiveShadow=true;p.add(a);return a;}
  function print(p,text,x,y,z,w=3,d=.25,color='rgba(222,228,214,.72)',mono=false){
    const a=labels.label(p,text,x,y,z,w,d,{color,mono,weight:500});a.userData.surfaceText=a.userData.surfaceLabel;return a;
  }
  function track(p,points,width,mat,y=.08){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];box(p,(a[0]+b[0])/2,y,(a[1]+b[1])/2,Math.max(Math.abs(b[0]-a[0]),width),.025,Math.max(Math.abs(b[1]-a[1]),width),mat);}}
  const board=group('power-board',L('多相降压供电','Multiphase buck converter'),L('几相并联的降压电路把输入电压降到 GPU 用的低电压。电感让电流平稳，输出电容稳住电压。','Several buck phases in parallel step the input down to the GPU’s low voltage. Inductors smooth the current; output capacitors hold the voltage steady.'),root,null);
  box(board,0,-.12,0,13,.25,9.2,mats.pcb);box(board,0,-.26,0,13,.035,9.2,mats.edge);
  print(board,L('六相降压 · 示意','Six-phase buck · illustrative'),0,.025,-4.05,4.6,.32,'rgba(222,228,214,.6)');
  const ground=group('power-ground',L('回流参考平面','Return reference plane'),L('电流要走回去才成回路。这层铜给开关电流一条低阻抗的回流路径。','Current needs a way back to close the loop. This copper plane gives switching current a low-impedance return path.'),board);
  box(ground,0,-.275,0,12.82,.025,9.03,mats.silver);
  const input=group('power-input',L('输入电容','Input capacitors'),L('就近给开关的功率级供应脉冲电流，让高频电流回路尽量短，输入电压少抖动。','Supply pulse current right next to the switching stages, keeping the high-frequency loop short and the input voltage steady.'),board);
  const controller=group('power-controller',L('PWM 控制器','PWM controller'),L('给每一相错开时间发出开关信号，并根据电压和电流反馈调整。','Sends staggered switching signals to each phase and adjusts them from voltage and current feedback.'),board);
  const stage=group('power-stage',L('功率级（DrMOS）','Power stages (DrMOS)'),L('每相一个，里面是驱动和开关管，在输入和地之间快速切换。后面接电感和电容做滤波。','One per phase, with a driver and switching transistors that flip between input and ground. The inductor and capacitors after it filter the output.'),board);
  const inductor=group('power-inductor',L('电感（含剖面）','Inductors (one cut open)'),L('铜绕组和磁芯把能量存在磁场里，限制电流变化的速度，让每相电流平稳。第一个电感切开了，能看到绕组。','A copper winding around a magnetic core stores energy and limits how fast current can change, smoothing each phase. The first one is cut open to show the winding.'),board);
  const output=group('power-output',L('输出电容','Output capacitors'),L('吸收各相的纹波，负载突然变化时先顶上。几相错开开关，叠加后的纹波更小。','Absorb each phase’s ripple and cover sudden load changes. Staggering the phases makes the combined ripple smaller.'),board);
  const rail=group('power-rail',L('输出铜排','Output rail'),L('各相的输出汇到一起，经宽铜排送往 GPU。','The phases join here and a wide copper rail carries the total current to the GPU.'),board);
  const feedback=group('power-feedback',L('反馈与控制线','Feedback and control lines'),L('采样线把输出电压和每相电流送回控制器，PWM 线把开关信号送到功率级。','Sense lines bring the output voltage and phase currents back to the controller; PWM lines carry switching signals to the stages.'),board);
  const xs=Array.from({length:6},(_,i)=>-4.75+i*1.9);
  const cin=[],cinEnds=[],cout=[],coutEnds=[],pads=[],pins=[],tiny=[];
  xs.forEach((x,i)=>{
    for(let k=0;k<3;k++){const z=-3.05+k*.3;cin.push({x,y:.16,z,w:.72,h:.25,d:.18});cinEnds.push({x:x-.37,y:.15,z,w:.12,h:.27,d:.2},{x:x+.37,y:.15,z,w:.12,h:.27,d:.2});}
    box(stage,x,.1,-1.83,1.28,.08,1.5,mats.gold);box(stage,x,.32,-1.83,1.05,.4,1.23,mats.black);box(stage,x,.53,-1.83,.79,.015,.91,mats.core);
    print(stage,'Q'+(i+1),x,.548,-1.86,.4,.16,'rgba(200,206,204,.5)',true);
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
      print(inductor,L('剖面','Cutaway'),x,.96,.77,.8,.16,'rgba(220,196,150,.85)');
    }else{
      const shell=new T.Group();shell.name='inductor-shell-'+(i+1);inductor.add(shell);layers.push({group:shell,base:0,factor:.45});
      box(shell,x,.54,.15,1.34,.76,1.34,mats.core);
      box(shell,x,.94,.15,1.15,.03,1.15,mats.black);print(shell,'R22',x,.965,.13,.5,.18,'rgba(190,196,190,.5)',true);
    }
    track(rail,[[x,.92],[x,2.68]],.26,mats.copper,.065);
    for(let k=0;k<4;k++){const z=1.33+k*.3;cout.push({x:x+.52,y:.19,z,w:.24,h:.3,d:.18});coutEnds.push({x:x+.52,y:.19,z:z-.1,w:.26,h:.32,d:.06},{x:x+.52,y:.19,z:z+.1,w:.26,h:.32,d:.06});}
    for(let k=0;k<3;k++){tiny.push({x:x-.6+k*.6,y:.105,z:-.86,w:.18,h:.12,d:.11});}
    track(feedback,[[-5.55,-3.45],[-5.55,-2.8-i*.075],[x-.7,-2.8-i*.075],[x-.7,-1.86]],.032,mats.control,.045);
  });
  inst(input,cin,mats.ceramic);inst(input,cinEnds,mats.silver);inst(output,cout,mats.ceramic);inst(output,coutEnds,mats.silver);inst(stage,pins,mats.silver);inst(board,tiny,mats.ceramic);
  track(rail,[[-5.6,-3.45],[5.6,-3.45]],.23,mats.gold,.055);
  box(rail,0,.12,2.85,11.55,.15,.42,mats.rail);box(rail,0,.11,3.32,11.55,.12,.18,mats.copper);
  print(rail,L('输出 → GPU','Output → GPU'),0,.21,2.84,2.4,.2,'rgba(28,36,30,.8)');
  box(controller,-5.55,.2,-3.43,.83,.32,.82,mats.black);
  const cpins=[];for(let i=0;i<7;i++)for(const sign of [-1,1]){cpins.push({x:-5.55+sign*.46,y:.09,z:-3.76+i*.11,w:.12,h:.08,d:.06});cpins.push({x:-5.88+i*.11,y:.09,z:-3.43+sign*.46,w:.06,h:.08,d:.12});}inst(controller,cpins,mats.silver);
  print(controller,'PWM',-5.55,.37,-3.43,.4,.14,'rgba(190,200,204,.55)',true);
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
