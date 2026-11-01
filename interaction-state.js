// One presentation state machine for both anatomy and the walkthrough.
// Domain state (journey, model, step) remains in state.js.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GpuExplorerInteraction = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const LEVELS = ['board', 'package', 'die', 'sm'];
  const GEMM_LEVELS = ['board', 'package', 'die', 'package', 'sm', 'sm', 'sm', 'package'];
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  function guideLevel(context) {
    return context.journey === 'gemm' ? GEMM_LEVELS[context.stepIndex] || 'board' : 'board';
  }
  function enterGuide(ui, context, playback) {
    return {
      ...ui, mode: 'learn', level: guideLevel(context), selection: null,
      isolated: false, explode: 0, explodeAuto: false, explodePhase: 0,
      progress: context.reducedMotion ? 1 : 0, dwell: 0,
      playback: playback === 'sequence' ? 'sequence' : context.reducedMotion ? 'paused' : 'step',
      cameraPreset: 'three-quarter', guideRevision: ui.guideRevision + 1,
      advanceRequested: false
    };
  }
  function explore(ui) {
    return { ...ui, mode: 'explore', playback: 'paused', dwell: 0,
      explodeAuto: false, advanceRequested: false };
  }
  function create(options = {}, context = {}) {
    const ui = {
      mode: 'explore', level: LEVELS.includes(options.level) ? options.level : 'board',
      selection: typeof options.selection === 'string' ? options.selection : null,
      isolated: false, explode: clamp(options.explode), explodeAuto: false, explodePhase: 0,
      progress: context.reducedMotion ? 1 : 0, playback: 'paused', dwell: 0,
      cameraPreset: 'three-quarter', guideRevision: 0, advanceRequested: false
    };
    return options.mode === 'explore' ? ui : enterGuide(ui, context, 'step');
  }
  function transition(current, event, context = {}) {
    let ui = { ...current, advanceRequested: false };
    switch (event.type) {
      case 'ENTER_GUIDE': return enterGuide(ui, context, event.playback);
      case 'ENTER_EXPLORE': return explore(ui);
      case 'LEVEL':
        ui = explore(ui);
        return { ...ui, level: LEVELS.includes(event.level) ? event.level : ui.level,
          selection: null, isolated: false, cameraPreset: 'three-quarter',
          explode: event.level === 'sm' ? 0 : ui.explode };
      case 'SELECT':
        ui = explore(ui);
        return { ...ui, selection: event.id || null,
          isolated: event.id && event.id === ui.selection ? ui.isolated : false,
          level: LEVELS.includes(event.level) ? event.level : ui.level };
      case 'ISOLATE':
        ui = explore(ui);
        return { ...ui, isolated: !!ui.selection &&
          (event.value === undefined ? !ui.isolated : !!event.value) };
      case 'CAMERA':
        return { ...explore(ui), cameraPreset: event.preset || 'three-quarter' };
      case 'NAVIGATE': return { ...explore(ui), cameraPreset: 'free' };
      case 'EXPLODE_SET':
        ui = explore(ui);
        if (ui.level === 'sm') ui = { ...ui, level: 'package', selection: null,
          isolated: false, cameraPreset: 'three-quarter' };
        return { ...ui, explode: clamp(event.value) };
      case 'EXPLODE_TOGGLE': {
        const wasRunning = ui.explodeAuto;
        ui = explore(ui);
        if (ui.level === 'sm') ui = { ...ui, level: 'package', selection: null,
          isolated: false, cameraPreset: 'three-quarter' };
        return { ...ui, explodeAuto: !wasRunning,
          explodePhase: ui.explode >= .98 ? 2.7 : ui.explode * 2.7 };
      }
      case 'EXPLORE_RESET':
        return { ...explore(ui), explode: 0, explodePhase: 0, isolated: false,
          selection: null, cameraPreset: 'three-quarter' };
      case 'PAUSE': return { ...ui, playback: 'paused', dwell: 0, explodeAuto: false };
      case 'RESUME_SEQUENCE':
        if (ui.mode !== 'learn') return enterGuide(ui, context, 'sequence');
        return { ...ui, playback: 'sequence', dwell: 0 };
      case 'MOTION_TOGGLE':
        if (ui.mode !== 'learn' || ui.progress >= 1) return enterGuide(ui, context, 'step');
        return { ...ui, playback: ui.playback === 'paused' ? 'step' : 'paused', dwell: 0 };
      case 'SCENE_LEVEL':
        return LEVELS.includes(event.level) ? { ...ui, level: event.level,
          isolated: event.level === ui.level ? ui.isolated : false,
          explode: event.level === 'sm' ? 0 : ui.explode } : ui;
      case 'SCENE_ISOLATION':
        return { ...ui, isolated: ui.mode === 'explore' && !!event.value,
          selection: event.clear ? null : ui.selection };
      case 'TICK': {
        const dt = Math.max(0, Math.min(250, Number(event.dt) || 0));
        const speed = Math.max(.5, Math.min(2, Number(context.speed) || 1));
        if (ui.mode === 'explore') {
          if (ui.explodeAuto) {
            ui.explodePhase += dt / 1000;
            const t = ui.explodePhase;
            ui.explode = clamp(t < 2.7 ? t / 2.7 : t < 3.8 ? 1 : t < 6.5 ? 1 - (t - 3.8) / 2.7 : 0);
            if (t >= 6.5) ui.explodeAuto = false;
          }
          return ui;
        }
        if (ui.playback === 'paused') return ui;
        const wasComplete = ui.progress >= 1;
        ui.progress = context.reducedMotion ? 1 : clamp(ui.progress + dt * speed / 5200);
        if (ui.progress >= 1) {
          if (ui.playback === 'step') ui.playback = 'paused';
          else {
            if (wasComplete) ui.dwell += dt * speed;
            if (ui.dwell >= 1100) {
              if (context.atEnd) ui.playback = 'paused';
              else ui.advanceRequested = true;
            }
          }
        }
        return ui;
      }
      default: return ui;
    }
  }
  return { LEVELS, GEMM_LEVELS, guideLevel, create, transition };
});
