// UI orchestration. Physical geometry and numeric teaching remain separate modules.
(function () {
  'use strict';
  const S = window.GpuExplorerState;
  const state = S.decodeState(location.hash);
  const params = new URLSearchParams(location.hash.slice(1));
  const $ = id => document.getElementById(id);
  const LEVELS = ['board','package','die','sm'];
  const LEVEL_NAMES = {board:'SXM 模组',package:'芯片封装',die:'GPU Die',sm:'SM'};
  const TITLES = {gemm:'一次矩阵乘法',pagetable:'一次地址翻译',pixel:'一个像素的旅程',stacking:'芯片为什么堆起来'};
  const SPECS = {
    h100:{name:'H100',arch:'HOPPER',year:2022,sm:132,l2:'50MB',hbm:'HBM3',capacity:'80GB',shared:'228KB',bandwidth:'3.35 TB/s'},
    a100:{name:'A100',arch:'AMPERE',year:2020,sm:108,l2:'40MB',hbm:'HBM2e',capacity:'80GB',shared:'164KB',bandwidth:'2.039 TB/s'}
  };
  // Shipping SXM 80GB variants only. Old shared links remain readable via the state module.
  if (!SPECS[state.model]) state.model='h100';
  if (!SPECS[state.compareModel]) state.compareModel=null;
  let level=LEVELS.includes(params.get('level'))?params.get('level'):'board';
  let mode=params.get('mode')==='explore'?'explore':'learn';
  let labels=true,isolated=false,physicalSelection=params.get('part')||null;
  let progress=0,motion=true,lastFrame=0,completedAt=0,explodeAuto=false,explodePhase=0,toastTimer;
  let lastContentKey='',lastTreeKey='',appliedLevel=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let explode=Math.max(0,Math.min(1,(Number(params.get('x'))||0)/100));
  const LESSONS = [
    {k:'THE OUTPUT',title:'先选一个结果。',body:'矩阵乘法会产生很多数字。我们先盯住 C 的第 3 行、第 7 列：这个数究竟从哪里来？下面的矩阵下标从 0 开始。',hardware:'输入矩阵 A、B 和输出 C 存放在 HBM 显存中。先看整块模组，再沿着数据走进去。',level:'board'},
    {k:'FOLLOW THE DEPENDENCIES',title:'一行，乘上一列。',body:'C[3,7] 只依赖 A 的第 3 行和 B 的第 7 列。沿着相同的 k 取出一对数，相乘，再把 8 个乘积加起来。点击下面的乘积，可以追踪它的两个输入。',hardware:'A 和 B 是显存中的两片数据，不是两块独立芯片。封装中的五组 HBM 为 GPU 提供数据。',level:'package'},
    {k:'DIVIDE THE WORK',title:'把大问题，切成小块。',body:'真实内核把 C 划成多个输出 tile，分给 thread block。这里把 K=8 的归约维拆成两轮，每轮取 4 项；最终得到同一个内积。',hardware:'多个 block 分发到不同 SM。一个 block 只在一个 SM 内执行；本图的阵列显示这些计算资源。',level:'die'},
    {k:'MOVE THE DATA',title:'先搬近，再反复用。',body:'把第一轮需要的 A、B 数据从 HBM 经过缓存层级搬入 SM 的 Shared Memory。同一个 tile 能被多个线程复用，减少重复访问显存。',hardware:'Shared Memory 在每个 SM 内部，HBM 在裸片外。亮起的路线表示搬运方向；并不表示绕过 L2 的直连。',level:'package'},
    {k:'A WARP OF THREADS',title:'32 个线程，一起协作。',body:'一个 warp 包含 32 个线程，执行同一条指令流。真实 tiled GEMM 会让线程协作加载和计算输出片段；下面的 lane 图说明组织方式，不是 Tensor Core 的逐 lane 映射。',hardware:'进入一个 SM：调度器发射 warp 指令，线程使用寄存器保存操作数与累加器。',level:'sm'},
    {k:'MULTIPLY & ACCUMULATE',title:'乘起来，累加进去。',body:'先看第一轮的 4 个乘积：2、3、6、8。累加器从 0 变成 19。真实 Tensor Core MMA 同时更新一个矩阵片段，这个标量内积帮助我们看清数学。',hardware:'规整矩阵计算可使用 Tensor Core；结果片段保留在寄存器中。本动画不模拟某条 MMA 指令的周期或线程寄存器布局。',level:'sm'},
    {k:'REUSE & SYNCHRONIZE',title:'换一块，接着算。',body:'第一轮结束，累加器保持 19。同步后复用 Shared Memory，载入第二轮的 4 项：4、2、6、6。再加 18，得到 37。',hardware:'同步保证不会覆盖其他线程还在使用的共享数据。实际优化内核可采用异步搬运和双缓冲来重叠搬运与计算。',level:'sm'},
    {k:'WRITE IT BACK',title:'37，回到显存。',body:'两轮 K-tile 都已处理。把寄存器中的累加结果写入 C[3,7]；其他输出元素用相同的内积定义、以并行分块的方式计算。',hardware:'存储指令经缓存层级写回 C 的显存地址。你现在可以回看任意一步，或换 A100 对照同一过程。',level:'package'}
  ];
  const GENERIC_NOTES={pagetable:'通用 x86-64 四级页表实验；数值动画说明 CPU 地址翻译。左侧 GPU 实物仅供独立解剖，不表示 H100 含 CPU 核。',pixel:'通用图形管线实验；右侧追踪一个像素。H100 不是显示显卡，左侧实物不表示其具有显示输出。',stacking:'概念性的逻辑堆叠剖面；不是 H100 的层叠结构。H100 的 HBM 是堆叠存储器，GPU 逻辑裸片并不按本剖面上下堆叠。'};
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2500);}
  function scene(){return window.GpuExplorer3D;}
  function syncHash(){const q=new URLSearchParams(S.encodeState(state));q.set('level',level);q.set('mode',mode);if(explode)q.set('x',Math.round(explode*100));if(physicalSelection)q.set('part',physicalSelection);history.replaceState(null,'','#'+q.toString());}
  function setLevel(next,manual){if(!LEVELS.includes(next))return;level=next;if(scene())scene().setLevel(next);appliedLevel=next;if(manual)$('follow-camera').checked=false;renderCrumb();syncHash();}
  function renderCrumb(){document.body.dataset.level=level;const crumb=$('crumb');crumb.replaceChildren();LEVELS.slice(0,LEVELS.indexOf(level)+1).forEach((l,i)=>{if(i){const sep=document.createElement('span');sep.textContent='›';crumb.append(sep);}const b=document.createElement('button');b.textContent=LEVEL_NAMES[l];b.onclick=()=>setLevel(l,true);crumb.append(b);});document.querySelectorAll('[data-level]').forEach(b=>{b.classList.toggle('active',b.dataset.level===level);b.setAttribute('aria-pressed',String(b.dataset.level===level));});}
  function selectCard(info){if(!info)return;physicalSelection=info.id;$('selection-card').hidden=false;$('component-name').textContent=info.label;$('component-detail').textContent=info.description||info.detail||'';document.querySelectorAll('[data-component]').forEach(b=>b.classList.toggle('active',b.dataset.component===info.id));syncHash();}
  function renderTree(){if(!scene()||!scene().getComponents)return;const list=scene().getComponents();const key=state.model+list.map(c=>c.id).join();if(lastTreeKey===key)return;lastTreeKey=key;const tree=$('component-tree');tree.replaceChildren();list.filter(c=>['pcb','gpu-die','hbm','power','interposer','tensor','smem'].includes(c.id)).forEach(c=>{const b=document.createElement('button');b.textContent=c.label;b.dataset.component=c.id;b.onclick=()=>{physicalSelection=c.id;scene().selectComponent(c.id);selectCard(c);};tree.append(b);});}
  function renderCompare(){const cmp=state.compareModel;$('compare-select').value=cmp||'';$('compare-diagram').hidden=!cmp;if(!cmp)return;const a=SPECS[state.model],b=SPECS[cmp];$('compare-model-name').textContent=a.name+' × '+b.name;$('compare-model-note').textContent='同为 SXM 80GB 版本 · 公开规格对照';const table=document.createElement('table');const rows=[['',a.name,b.name],['架构',a.arch,b.arch],['可用 SM',a.sm,b.sm],['L2 缓存',a.l2,b.l2],['显存',a.hbm,b.hbm],['每 SM 共享内存上限',a.shared,b.shared]];rows.forEach((r,i)=>{const tr=table.insertRow();r.forEach(v=>{const c=document.createElement(i?'td':'th');c.textContent=v;tr.append(c);});});$('compare-facts').replaceChildren(table);$('compare-step-note').textContent=state.journey==='gemm'?'内积定义和结果不变；资源组织、指令与搬运机制不同。':'数值实验的结果不随左侧实物型号改变。';}
  function renderPrediction(){const p=S.getPredict(state.journey,state.stepIndex);$('predict-details').hidden=!p;const box=$('predict');box.replaceChildren();if(!p)return;const h=document.createElement('h4');h.textContent=p.q;box.append(h);const made=S.predictionMade(state);p.options.forEach((opt,i)=>{const b=document.createElement('button');b.textContent=opt;b.className='pred-opt'+(made===i?(i===p.answer?' correct':' wrong'):'');b.disabled=made===p.answer;b.onclick=()=>{S.predict(state,i);renderPrediction();};box.append(b);});if(made!==undefined){const feedback=document.createElement('p');feedback.className='pred-feedback';feedback.textContent=made===p.answer?p.explain:'再想一下：'+p.explain;box.append(feedback);}}
  function renderBlocks(){const bl=$('block-list');const focusedBlockId=document.activeElement?.dataset?.nodeId;bl.replaceChildren();S.currentJourney(state).nodes.forEach(n=>{const b=document.createElement('button');b.textContent=n.label;b.dataset.nodeId=n.id;b.setAttribute('aria-pressed',String(state.selected===n.id));b.classList.toggle('active',state.selected===n.id);b.onclick=()=>window.__gpuExplorerOnSelect(n.id);bl.append(b);});if(focusedBlockId)bl.querySelector('[data-node-id="'+focusedBlockId+'"]')?.focus({preventScroll:true});}
  function render(){
    const journey=S.currentJourney(state),step=S.currentStep(state),spec=SPECS[state.model];
    document.body.dataset.mode=mode;$('learn-content').hidden=mode!=='learn';$('explore-content').hidden=mode!=='explore';$('inspector-label').textContent=mode==='learn'?'GUIDED WALKTHROUGH':'HARDWARE ANATOMY';
    document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
    document.querySelectorAll('[data-journey]').forEach(b=>{b.classList.toggle('active',b.dataset.journey===state.journey);b.setAttribute('aria-pressed',String(b.dataset.journey===state.journey));});
    $('model-select').value=state.model;$('model-meta').textContent='NVIDIA '+spec.arch+' · '+spec.year;$('stat-sm').textContent=spec.sm;$('stat-memory-type').textContent=spec.hbm+' 显存';
    $('main-model-name').textContent='NVIDIA · '+spec.arch+' ARCHITECTURE';$('hero-title').textContent=level==='sm'?'Inside an SM':spec.name;$('hero-subtitle').textContent=level==='board'?'从一块模组，走进一次计算。':level==='sm'?'功能组织示意 · 非晶体管版图':'封装实物重建 / 内部结构示意';
    $('step-counter').textContent=mode==='explore'?String(LEVELS.indexOf(level)+1).padStart(2,'0')+' / 04':String(state.stepIndex+1).padStart(2,'0')+' / '+String(journey.steps.length).padStart(2,'0');
    const lesson=state.journey==='gemm'?LESSONS[state.stepIndex]:null;
    $('chapter-kicker').textContent=String(state.stepIndex+1).padStart(2,'0')+' — '+(lesson?lesson.k:{pagetable:'ADDRESS TRANSLATION',pixel:'THE GRAPHICS PIPELINE',stacking:'THROUGH THE LAYERS'}[state.journey]);
    $('step-title').textContent=lesson?lesson.title:step.title;$('step-body').textContent=lesson?lesson.body:step.body;$('fact').textContent=state.journey==='gemm'&&state.stepIndex===7?'C[3,7] = 19 + 18 = 37':step.trace||'';
    $('hardware-note').textContent=lesson?lesson.hardware:GENERIC_NOTES[state.journey];$('journey-gloss').textContent=journey.gloss||'';$('journey-caveat').textContent=GENERIC_NOTES[state.journey]||'小矩阵用于解释数学；SM 内部与数据路线为结构示意，动画时间不代表真实延迟。';
    $('follow-camera').closest('label').hidden=state.journey!=='gemm';
    $('prev-btn').disabled=S.isAtStart(state);$('next-btn').disabled=S.isAtEnd(state);$('next-btn').innerHTML=S.isAtEnd(state)?'本次计算完成 <span>✓</span>':'继续 <span>→</span>';
    $('play-btn').textContent=state.playing?'Ⅱ':'▷';$('play-btn').setAttribute('aria-label',state.playing?'暂停自动播放':'自动播放全部步骤');$('play-status').textContent=state.playing?'自动播放中 · 点击暂停':'每一步，都可以停下来。';$('timeline-title').textContent=TITLES[state.journey];
    const chip=S.currentStepChip(state);$('phase-gloss').textContent=chip?chip.gloss:'';$('progress-fill').style.width=(state.stepIndex+1)/journey.steps.length*100+'%';
    const ov=$('overview'),focusedStep=document.activeElement?.dataset?.step;ov.replaceChildren();(S.STEP_CHIPS[state.journey]||[]).forEach((c,i)=>{const b=document.createElement('button');b.className='ov-step'+(i===state.stepIndex?' active':'')+(i<state.stepIndex?' done':'');b.dataset.step=i;b.setAttribute('aria-label','第'+(i+1)+'步：'+c.label);if(i===state.stepIndex)b.setAttribute('aria-current','step');const num=document.createElement('span');num.textContent=String(i+1).padStart(2,'0');b.append(num,document.createTextNode(c.label));b.onclick=()=>go(i);ov.append(b);});if(focusedStep!==undefined)ov.querySelector('[data-step="'+focusedStep+'"]')?.focus({preventScroll:true});
    const key=state.journey+':'+state.stepIndex+':'+state.model;
    window.GpuExplorerLab?.render($('journey-lab'),state,step,progress);if(key!==lastContentKey){$('code-panel').textContent=step.code.join('\n');renderPrediction();lastContentKey=key;}
    state.stepProgress=progress;if(scene()){scene().update(journey,step,state);if(appliedLevel!==level){scene().setLevel(level);appliedLevel=level;}$('scene-loading').hidden=true;renderTree();}
    renderCrumb();renderBlocks();renderCompare();syncHash();
  }
  function startSegment(follow=true){progress=reduced?1:0;motion=!reduced;completedAt=0;physicalSelection=null;state.selected=null;$('selection-card').hidden=true;document.querySelector('.inspector-scroll').scrollTop=0;isolated=false;$('isolate-btn').setAttribute('aria-pressed','false');$('isolate-btn').classList.remove('active');scene()?.isolateSelected(false);scene()?.clearSelection?.();if(follow&&mode==='learn'&&state.journey==='gemm'&&$('follow-camera').checked){level=LESSONS[state.stepIndex].level;appliedLevel=null;}render();updateMotionButton();}
  function go(i){state.playing=false;S.goto(state,i);startSegment();}
  function updateMotionButton(){$('motion-btn').textContent=motion?'Ⅱ 暂停动画':'▷ 继续动画';$('motion-btn').setAttribute('aria-label',motion?'暂停当前步骤动画':'继续当前步骤动画');}
  function changeMode(next){mode=next;state.playing=false;if(mode==='explore'){motion=false;}render();updateMotionButton();}
  function applyExplode(v){explode=Math.max(0,Math.min(1,v));window.__gpuExplorerExplode=explode;$('explode-slider').value=Math.round(explode*100);$('explode-value').innerHTML=Math.round(explode*100)+'<span>%</span>';scene()?.setExplode(explode);syncHash();}
  function resetCamera(){explodeAuto=false;applyExplode(0);isolated=false;physicalSelection=null;$('selection-card').hidden=true;$('isolate-btn').classList.remove('active');$('isolate-btn').setAttribute('aria-pressed','false');scene()?.resetView();level=scene()?.getLevel?.()||'board';appliedLevel=level;render();}
  function focusSelected(){if(!physicalSelection&&!state.selected){toast('先点击模型或部件目录，选择要查看的部件。');return;}scene()?.focusSelected();}
  function isolateSelected(){if(!physicalSelection&&!state.selected){toast('先选择一个部件，再把它单独拿出来看。');return;}isolated=!isolated;scene()?.isolateSelected(isolated);$('isolate-btn').classList.toggle('active',isolated);$('isolate-btn').setAttribute('aria-pressed',String(isolated));}
  window.__gpuExplorerRender=render;
  window.__gpuExplorerOnSelect=id=>{S.select(state,id);const n=S.currentJourney(state).nodes.find(n=>n.id===id);render();if(n)selectCard({id,label:n.label,description:n.detail});};
  window.__gpuExplorerMoveSelection=dir=>{S.selectNext(state,dir);window.__gpuExplorerOnSelect(state.selected);};
  window.addEventListener('gpu-component-select',e=>selectCard(e.detail));
  window.addEventListener('gpu-isolation-change',e=>{isolated=!!e.detail.isolated;$('isolate-btn').classList.toggle('active',isolated);$('isolate-btn').setAttribute('aria-pressed',String(isolated));if(e.detail.selected===null){physicalSelection=null;state.selected=null;$('selection-card').hidden=true;syncHash();}});
  window.addEventListener('gpu-scene-error',e=>{$('scene-loading').hidden=true;document.querySelector('.scene-status').textContent='3D UNAVAILABLE';$('diagram').dataset.error=e.detail.message;});
  window.addEventListener('gpu-level-change',e=>{if(LEVELS.includes(e.detail.level)){level=e.detail.level;appliedLevel=level;renderCrumb();$('hero-title').textContent=level==='sm'?'Inside an SM':SPECS[state.model].name;syncHash();}});
  window.addEventListener('gpu-scene-ready',()=>{appliedLevel=null;lastTreeKey='';render();applyExplode(explode);if(physicalSelection)scene()?.selectComponent(physicalSelection);});
  document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{setLevel(b.dataset.level,true);render();});
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>changeMode(b.dataset.mode));
  document.querySelectorAll('[data-journey]').forEach(b=>b.onclick=()=>{mode='learn';state.playing=false;S.setJourney(state,b.dataset.journey);startSegment();});
  document.querySelectorAll('[data-cam]').forEach(b=>b.onclick=()=>{scene()?.setCamera(b.dataset.cam);document.querySelectorAll('[data-cam]').forEach(x=>x.classList.toggle('active',x===b));});
  $('model-select').onchange=e=>{S.setModel(state,e.target.value);physicalSelection=null;lastTreeKey='';appliedLevel=null;$('selection-card').hidden=true;render();};
  $('compare-select').onchange=e=>{if(e.target.value===state.model){toast('请选择另一颗 GPU 进行对照。');e.target.value=state.compareModel||'';return;}S.setCompare(state,e.target.value||null);render();};
  $('compare-close').onclick=()=>{S.setCompare(state,null);render();};
  $('prev-btn').onclick=()=>go(state.stepIndex-1);$('next-btn').onclick=()=>go(state.stepIndex+1);
  $('reset-btn').onclick=()=>{state.playing=false;S.reset(state);startSegment();};
  $('play-btn').onclick=()=>{mode='learn';state.playing=!state.playing;if(state.playing){if(S.isAtEnd(state)){S.goto(state,0);state.playing=true;startSegment();}else if(progress>=1){progress=0;completedAt=0;}motion=true;}else motion=false;render();updateMotionButton();};
  $('replay-btn').onclick=()=>{progress=0;motion=true;completedAt=0;updateMotionButton();};
  $('motion-btn').onclick=()=>{if(progress>=1)progress=0;motion=!motion;if(!motion)state.playing=false;completedAt=0;updateMotionButton();render();};
  $('explode-slider').oninput=e=>{explodeAuto=false;$('explode-auto-btn').textContent='▷';applyExplode(Number(e.target.value)/100);};
  $('explode-auto-btn').onclick=()=>{explodeAuto=!explodeAuto;if(explodeAuto)explodePhase=explode>=.98?2.7:explode*2.7;$('explode-auto-btn').textContent=explodeAuto?'Ⅱ':'▷';};
  $('labels-btn').onclick=()=>{labels=!labels;scene()?.setLabels(labels);$('labels-btn').classList.toggle('active',labels);$('labels-btn').setAttribute('aria-pressed',String(labels));};
  $('focus-btn').onclick=focusSelected;$('isolate-btn').onclick=isolateSelected;$('home-btn').onclick=resetCamera;
  $('selection-close').onclick=()=>{$('selection-card').hidden=true;};
  $('fullscreen-btn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('diagram').requestFullscreen();}catch(e){toast('此浏览器暂不支持全屏；可以用滚轮缩放。');}};
  $('start-walkthrough').onclick=()=>{mode='learn';S.setJourney(state,'gemm');startSegment();};
  $('help-btn').onclick=()=>$('help-dialog').showModal();$('sources-btn').onclick=()=>$('sources-dialog').showModal();$('help-sources').onclick=()=>{$('help-dialog').close();$('sources-dialog').showModal();};
  document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('block-list').addEventListener('keydown',e=>{const buttons=[...$('block-list').querySelectorAll('button')],i=buttons.indexOf(e.target);if(i<0)return;let idx;if(['ArrowRight','ArrowDown'].includes(e.key))idx=(i+1)%buttons.length;else if(['ArrowLeft','ArrowUp'].includes(e.key))idx=(i-1+buttons.length)%buttons.length;else if(e.key==='Home')idx=0;else if(e.key==='End')idx=buttons.length-1;else return;e.preventDefault();e.stopPropagation();buttons[idx].focus();});
  document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.target.closest('input,select,textarea,button,summary'))return;if(e.key.startsWith('Arrow')&&e.target.closest('.scene3d'))return;if(e.key==='ArrowRight'){e.preventDefault();go(state.stepIndex+1);}else if(e.key==='ArrowLeft'){e.preventDefault();go(state.stepIndex-1);}else if(e.key===' '){e.preventDefault();$('play-btn').click();}else if(!e.target.closest('.scene3d')){if(e.key.toLowerCase()==='f')focusSelected();if(e.key.toLowerCase()==='i')isolateSelected();if(e.key.toLowerCase()==='r')resetCamera();}});
  window.addEventListener('hashchange',()=>{Object.assign(state,S.decodeState(location.hash));if(!SPECS[state.model])state.model='h100';const q=new URLSearchParams(location.hash.slice(1));level=LEVELS.includes(q.get('level'))?q.get('level'):'board';mode=q.get('mode')==='explore'?'explore':'learn';appliedLevel=null;startSegment(false);});
  function frame(now){const dt=lastFrame?Math.min(now-lastFrame,100):0;lastFrame=now;const speed=Number($('speed-select').value)||1;if(mode==='learn'&&motion&&progress<1){progress=Math.min(1,progress+dt*speed/5200);if(progress>=1){completedAt=now;if(!state.playing){motion=false;updateMotionButton();}}}window.__gpuExplorerStepProgress=progress;state.stepProgress=progress;window.GpuExplorerLab?.setProgress($('journey-lab'),progress);scene()?.setProgress?.(progress);$('journey-lab').dataset.progress=progress.toFixed(3);if(state.playing&&progress>=1&&completedAt&&now-completedAt>1100/speed){if(S.isAtEnd(state)){state.playing=false;motion=false;render();updateMotionButton();}else{S.next(state);startSegment();}}if(explodeAuto){explodePhase+=dt/1000;const t=explodePhase;applyExplode(t<2.7?t/2.7:t<3.8?1:t<6.5?1-(t-3.8)/2.7:0);if(t>=6.5){explodeAuto=false;$('explode-auto-btn').textContent='▷';}}requestAnimationFrame(frame);}
  render();applyExplode(explode);updateMotionButton();requestAnimationFrame(frame);
})();
