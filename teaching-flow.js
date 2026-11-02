// Legible lesson overlays. Dependency ribbons describe a mathematical relation;
// solid buses describe a simplified architectural transfer, never a vendor netlist.
export const FLOW_COLORS = { a: 0x61ddc3, b: 0xefbe78, c: 0x94b9ff, control: 0xadbce7 };
export const FLOW_PHASES = [
  { kind: 'dependency', title: '找到输出', note: 'A、B、C 在 HBM 中；此时只追踪依赖，尚未搬运。' },
  { kind: 'dependency', title: '一行 × 一列', note: '虚线表示数学依赖，输入数据仍在 HBM。' },
  { kind: 'placement', title: '把输出块分给 SM', note: 'CTA 3 的工作被分派到一个 SM；这不是数据传输。' },
  { kind: 'transfer', title: 'HBM → L2 → SM', note: '教学透视显示缓存与 SM，沿着互连搬入第一块数据。' },
  { kind: 'issue', title: '共享内存 → 线程操作数', note: '指令派发与数据搬运是两条不同的路径。' },
  { kind: 'compute', title: '操作数 → MMA → 累加器', note: '展开一个标量内积；真实 MMA 的操作数布局依指令而异。' },
  { kind: 'transfer', title: '复用共享内存，计算下一块', note: '第二轮数据进入 SM，累加器继续保留前一轮结果。' },
  { kind: 'store', title: '累加器 → L2 → HBM', note: '全部 K-tile 完成后，写回输出 C[3,7]。' }
];

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
export function samplePath(points, fraction) {
  if (!points.length) return [0, 0, 0];
  const lengths = points.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - points[i][k])));
  let distance = clamp(fraction) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? distance / lengths[i] : 0;
      return points[i].map((v, k) => v + (points[i + 1][k] - v) * t);
    }
    distance -= lengths[i];
  }
  return points.at(-1).slice();
}
export function pathLength(points) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...p.map((v, k) => v - points[i][k])), 0);
}

export function lessonPresentation(level, stepIndex, model = 'h100') {
  const phase = FLOW_PHASES[Math.max(0, Math.min(7, stepIndex))];
  const result = { ...phase, routes: [], markers: [], xray: ['board', 'package'].includes(level) && [3, 6, 7].includes(stepIndex) };
  if (!['board', 'package', 'die', 'sm', 'hbm'].includes(level)) return result;
  const add = (id, host, stages, points, color = 'a', kind = phase.kind, start = 0) => {
    result.routes.push({ id, host, stages, points, color, kind, start,
      width: level === 'sm' ? .22 : level === 'die' ? .14 : level === 'board' ? .24 : .18,
      dashed: ['dependency', 'placement'].includes(kind) });
  };
  const marker = (id, host, point, label, color, role = 'location', size = [.52, .40]) => {
    result.markers.push({ id, host, point, label, color, role, size });
  };
  const memoryMarkers = (includeOutput = true) => {
    marker('input-a', 'hbm', [-3.75, .84, -2.60], 'A · HBM', 'a', 'source', [1.22, .72]);
    marker('input-b', 'hbm', [-3.75, .84, 0], 'B · HBM', 'b', 'source', [1.22, .72]);
    if (includeOutput) marker('output-c', 'hbm', [3.75, .84, 0], 'C[3,7] · HBM', 'c', 'target', [1.22, .72]);
  };
  const sm = [-1.55, .59, -.89], l2 = [0, .59, -.89];
  if (level === 'hbm') {
    marker('input-a', 'hbm-stack', [-2.7, 3.76, -.70], 'A[3,:]', 'a', 'source', [.80, .55]);
    marker('input-b', 'hbm-stack', [-.65, 3.76, -.70], 'B[:,7]', 'b', 'source', [.80, .55]);
    marker('output-c', 'hbm-stack', [-1.65, 3.76, .90], 'C[3,7]', 'c', 'target', [.90, .55]);
    add('depend-a', 'hbm-stack', ['A row', 'C target'], [[-2.7, 3.81, -.70], [-2.7, 3.81, .90], [-1.65, 3.81, .90]], 'a', 'dependency');
    add('depend-b', 'hbm-stack', ['B column', 'C target'], [[-.65, 3.81, -.70], [-.65, 3.81, .25], [-1.65, 3.81, .25], [-1.65, 3.81, .90]], 'b', 'dependency');
    return result;
  }
  if (level !== 'sm') {
    if (stepIndex <= 1) {
      memoryMarkers();
      add('depend-a', 'package', ['A row in HBM', 'C target in HBM'], [[-3.75, .91, -2.6], [-3.75, .91, -3.85], [3.75, .91, -3.85], [3.75, .91, 0]], 'a', 'dependency');
      add('depend-b', 'package', ['B column in HBM', 'C target in HBM'], [[-3.75, .91, 0], [-3.75, .91, 3.9], [3.75, .91, 3.9], [3.75, .91, 0]], 'b', 'dependency');
    } else if (stepIndex === 2) {
      marker('work-tile', 'gpu-die', [1.5, .61, 2.40], 'CTA 3', 'c', 'work', [.72, .60]);
      marker('assigned-sm', 'gpu-die', sm, '选中的 SM', 'c', 'target', [.32, .45]);
      add('place-cta', 'gpu-die', ['CTA 3', 'selected SM'], [[1.5, .61, 2.4], [0, .61, 2.4], [0, .61, -.89], sm.map((v, i) => i === 1 ? .61 : v)], 'c', 'placement');
    } else if ([3, 6].includes(stepIndex)) {
      memoryMarkers(false);
      marker('cache', 'gpu-die', l2, 'L2', 'a', 'cache', [.30, .55]);
      marker('assigned-sm', 'gpu-die', sm, 'SM / Shared', 'a', 'target', [.32, .45]);
      for (const [i, z] of [[0, -2.6], [1, 0]]) {
        add('hbm-to-edge-' + i, 'package', ['HBM', 'memory controller'], [[-3.75, .88, z], [-2.7, .88, z], [-2.7, .59, z]], i ? 'b' : 'a', 'transfer', i * .06);
        // Two illustrative lanes stay separately readable through the cache.
        // They are a teaching bus, not a claim about physical metal routing.
        const cacheX=i?.12:-.12, targetZ=i?-.75:-1.03;
        add('edge-to-cache-' + i, 'gpu-die', ['memory controller', 'L2', 'SM'], [[-2.7, .59, z], [cacheX, .59, z], [cacheX, .59, targetZ], [-1.55, .59, targetZ]], i ? 'b' : 'a', 'transfer', .18 + i * .06);
      }
    } else if (stepIndex === 7) {
      marker('assigned-sm', 'gpu-die', sm, 'SM · acc = 37', 'c', 'source', [.32, .45]);
      marker('cache', 'gpu-die', l2, 'L2', 'c', 'cache', [.30, .55]);
      marker('output-c', 'hbm', [3.75, .84, 0], 'C[3,7] = 37', 'c', 'target', [1.22, .72]);
      add('store-to-cache', 'gpu-die', ['SM', 'L2', 'memory controller'], [sm, l2, [0, .59, 0], [2.7, .59, 0]], 'c', 'store');
      add('store-to-hbm', 'package', ['memory controller', 'HBM output'], [[2.7, .59, 0], [2.7, .88, 0], [3.75, .88, 0]], 'c', 'store', .24);
    }
    return result;
  }
  const shared = [-4.75, .56, 3.20], lsu = [-4.72, .56, -.70], reg = [-4.72, .56, -2.03], tensor = [-.85, .56, -1.33];
  if ([3, 6].includes(stepIndex)) {
    marker('incoming', 'sm-detail', [4.8, .56, 2.65], model === 'a100' ? '异步搬运' : 'TMA', 'a', 'source', [.6, .28]);
    add('global-to-shared', 'sm-detail', model === 'a100' ? ['L2/interconnect', 'async copy', 'Shared Memory'] : ['L2/interconnect', 'TMA', 'Shared Memory'], [[4.8, .56, 2.65], [0, .56, 2.65], [0, .56, 3.2], shared], 'a', 'transfer');
  }
  marker('shared', 'sm-detail', shared, 'L1 / Shared', 'a', 'source', [.70, .40]);
  marker('operands', 'sm-detail', reg, '操作数 / RF', 'b', stepIndex === 4 ? 'target' : 'operand', [.60, .36]);
  marker('mma', 'sm-detail', tensor, 'Tensor Core', 'c', stepIndex === 4 ? 'location' : 'target', [.65, .58]);
  if ([4, 6].includes(stepIndex)) {
    add('shared-to-lsu', 'sm-detail', ['Shared Memory', 'LD/ST'], [shared, [-5.10, .56, 3.2], [-5.10, .56, -.7], lsu], 'a', 'transfer', stepIndex === 6 ? .16 : 0);
    add('lsu-to-register', 'sm-detail', ['LD/ST', 'Register File'], [lsu, [-5.10, .56, -.7], [-5.10, .56, -2.03], reg], 'b', 'transfer', .20);
    add('issue-control', 'sm-detail', ['Warp Scheduler', 'Dispatch'], [[-2.65, .46, -2.59], [-2.65, .46, -2.36]], 'control', 'control', .05);
  }
  if ([5, 6].includes(stepIndex)) {
    add('register-to-mma', 'sm-detail', ['Register File', 'Tensor Core'], [reg, [-5.1, .56, -2.03], [-5.1, .56, -1.33], tensor], 'b', 'compute', stepIndex === 6 ? .44 : 0);
    add('mma-to-accumulator', 'sm-detail', ['Tensor Core', 'Accumulator registers'], [tensor, [0, .56, -1.33], [0, .56, -2.03], [-.5, .56, -2.03]], 'c', 'compute', .30);
    marker('accumulator', 'sm-detail', [-.5, .56, -2.03], stepIndex === 5 ? 'acc 0 → 19' : 'acc 19 → 37', 'c', 'target', [.65, .32]);
  }
  if (stepIndex === 7) add('store', 'sm-detail', ['Accumulator registers', 'LD/ST', 'L2/interconnect'], [reg, [-5.1, .56, -2.03], [-5.1, .56, -.7], lsu, [-4.72, .56, 2.4], [5.16, .56, 2.4]], 'c', 'store');
  return result;
}

export function routeState(route, progress) {
  const fraction = clamp((clamp(progress) - route.start) / Math.max(.3, 1 - route.start));
  return { fraction, complete: progress >= 1, visible: true,
    // A complete route remains bright, with its endpoint and direction legible.
    opacity: route.dashed ? .70 : .72 + .24 * fraction };
}

// The mathematical lesson and the repeating visual demonstration use separate
// clocks. A visual cycle never changes a result, completion flag or data location.
export function signalCycleState(route, visualPhase = 0) {
  const numericPhase = Number(visualPhase);
  const phase = Number.isFinite(numericPhase) ? Math.max(0, numericPhase) : 0;
  const elapsed = phase - clamp(route.start);
  const logical = route.dashed || ['dependency', 'placement'].includes(route.kind);
  return {
    fraction: elapsed < 0 ? 0 : elapsed - Math.floor(elapsed),
    elapsed, started: elapsed >= 0, mode: logical ? 'emphasis' : 'packet',
    emphasisWindow: Math.max(.06, Math.min(.18, .8 / Math.max(.01, pathLength(route.points))))
  };
}
const cycleDistance = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

export function createTeachingVisuals(T, hardware, presentation) {
  const visuals = [], markerGroups = [];
  const allGroups = [];
  const geometry = new Set(), materials = new Set();
  const unit = new T.BoxGeometry(1, 1, 1); geometry.add(unit);
  const arrowGeometry = new T.BufferGeometry();
  arrowGeometry.setAttribute('position', new T.Float32BufferAttribute([.13,0,0,-.09,0,.09,-.09,0,-.09],3));
  arrowGeometry.computeVertexNormals(); geometry.add(arrowGeometry);
  const tmp = new T.Object3D();
  function mesh(parent, x, y, z, w, h, d, material) {
    const m = new T.Mesh(unit, material); m.position.set(x,y,z); m.scale.set(w,h,d); m.userData.teachingSignal = true; parent.add(m); return m;
  }
  function material(color, opacity=1, options={}) {
    const m = new T.MeshBasicMaterial({ color, transparent: opacity<1, opacity, depthWrite:false, side:T.DoubleSide, ...options }); materials.add(m); return m;
  }
  for (const route of presentation.routes) {
    const host = hardware.components[route.host]?.group; if (!host) continue;
    const group = new T.Group(); group.userData.teachingSignal = true; host.add(group); allGroups.push(group);
    const color = FLOW_COLORS[route.color] || FLOW_COLORS.a;
    // Solid signals render as opaque inlays. Transparent rails could be
    // sorted behind the translucent physical cap or their own dark borders.
    const railMaterial = material(color, route.dashed ? .65 : 1, {depthWrite:!route.dashed,toneMapped:false});
    const underMaterial = material(0x071418, 1, {depthWrite:true,toneMapped:false});
    const emphasisMaterial = route.dashed ? material(new T.Color(color).lerp(new T.Color(0xf0fff5),.34),.91,{toneMapped:false}) : null;
    const dashMeshes=[];let traversed=0;const length=pathLength(route.points);
    for (let i=1; i<route.points.length; i++) {
      const a=route.points[i-1], b=route.points[i], distance=Math.hypot(...b.map((v,k)=>v-a[k])); if(distance<.001)continue;
      const count=route.dashed?Math.max(1,Math.ceil(distance/.44)):1;
      for(let n=0;n<count;n++) {
        const t0=n/count, t1=route.dashed?Math.min(1,(n+.57)/count):1;
        const start=a.map((v,k)=>v+(b[k]-v)*t0), end=a.map((v,k)=>v+(b[k]-v)*t1), centre=start.map((v,k)=>(v+end[k])/2);
        const dims=start.map((v,k)=>Math.max(k===1?.034:route.width,Math.abs(v-end[k])));
        const rail=mesh(group,...centre,...dims,railMaterial);
        if(route.dashed)dashMeshes.push({mesh:rail,fraction:(traversed+(t0+t1)*.5*distance)/length});
        if(!route.dashed)mesh(group,centre[0],centre[1]-.042,centre[2],dims[0]+.075,.016,dims[2]+.075,underMaterial);
      }
      traversed+=distance;
    }
    const count=Math.max(2,Math.floor(length/.8));
    const arrowColor=new T.Color(color).lerp(new T.Color(0xf0fff5),route.dashed?.16:.42);
    const arrowEmphasisColor=new T.Color(color).lerp(new T.Color(0xf0fff5),.72);
    const arrowMaterial=material(0xffffff,1,{depthWrite:true,toneMapped:false}); const arrows=new T.InstancedMesh(arrowGeometry,arrowMaterial,count);
    arrows.userData.teachingSignal=true;
    for(let n=0;n<count;n++) {
      const f=(n+.5)/count,p=samplePath(route.points,f),next=samplePath(route.points,Math.min(1,f+.002));
      tmp.position.set(p[0],p[1]+.035,p[2]);tmp.rotation.set(0,-Math.atan2(next[2]-p[2],next[0]-p[0]),0);
      tmp.scale.setScalar(Math.min(2,route.width/.105*(route.dashed?.90:1.08)));tmp.updateMatrix();arrows.setMatrixAt(n,tmp.matrix);arrows.setColorAt(n,arrowColor);
    }
    group.add(arrows);
    const pulseMaterial=material(0xf1fff5,1);const packets=new T.InstancedMesh(unit,pulseMaterial,4);packets.userData.teachingSignal=true;group.add(packets);
    visuals.push({route,group,railMaterial,arrows,packets,pulseMaterial,dashMeshes,emphasisMaterial,arrowColor,arrowEmphasisColor});
  }
  for (const marker of presentation.markers) {
    const host=hardware.components[marker.host]?.group;if(!host)continue;
    const group=new T.Group();group.userData.teachingSignal=true;host.add(group);allGroups.push(group);
    const color=FLOW_COLORS[marker.color]||FLOW_COLORS.a;
    const fill=material(color,.18), border=material(color,.95);
    const [x,y,z]=marker.point,[w,d]=marker.size;
    mesh(group,x,y,z,w,.025,d,fill);
    for(const side of [-1,1]){
      mesh(group,x+side*w/2,y+.015,z,.035,.04,d+.035,border);
      mesh(group,x,y+.015,z+side*d/2,w+.035,.04,.035,border);
    }
    markerGroups.push({marker,host,group,fill,border});
  }
  return {
    visuals, markers:markerGroups,
    update(progress, visualPhase = progress) {
      for(const item of visuals) {
        const state=routeState(item.route,progress), cycle=signalCycleState(item.route,visualPhase);
        item.cycleState=cycle;item.railMaterial.opacity=item.route.dashed?state.opacity:1;
        // This is a moving reading emphasis on a mathematical/placement path,
        // not a packet. The dashed relation remains visible throughout the scan.
        if(cycle.mode==='emphasis'){
          for(const dash of item.dashMeshes)dash.mesh.material=cycle.started&&cycleDistance(dash.fraction,cycle.fraction)<cycle.emphasisWindow?item.emphasisMaterial:item.railMaterial;
          for(let n=0;n<item.arrows.count;n++){
            const highlighted=cycle.started&&cycleDistance((n+.5)/item.arrows.count,cycle.fraction)<cycle.emphasisWindow;
            item.arrows.setColorAt(n,highlighted?item.arrowEmphasisColor:item.arrowColor);
          }
          if(item.arrows.instanceColor)item.arrows.instanceColor.needsUpdate=true;
        }
        // A short, restrained train repeats along real transfer/control buses.
        // The visual cycle keeps moving after the mathematical step reaches 1.
        const packetCount=pathLength(item.route.points)<1.6?1:3;
        for(let n=0;n<4;n++){
          const travel=cycle.fraction-n*.045, f=travel-Math.floor(travel);
          const p=samplePath(item.route.points,f),next=samplePath(item.route.points,Math.min(1,f+.003));
          tmp.position.set(p[0],p[1]+.045,p[2]);tmp.rotation.set(0,-Math.atan2(next[2]-p[2],next[0]-p[0]),0);
          const show=cycle.mode==='packet'&&cycle.started&&n<packetCount&&(cycle.elapsed>=1||travel>=0);
          const packetLength=Math.min(.30,Math.max(.075,pathLength(item.route.points)*.20));
          tmp.scale.set(show?packetLength:0,show?.055:0,show?item.route.width*1.45:0);tmp.updateMatrix();item.packets.setMatrixAt(n,tmp.matrix);
        }
        item.packets.instanceMatrix.needsUpdate=true;
      }
      for(const item of markerGroups)item.fill.opacity=progress>=1&&item.marker.role==='target'?.45:.22;
    },
    dispose() { allGroups.forEach(g=>g.removeFromParent());geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose()); }
  };
}
