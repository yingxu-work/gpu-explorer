# GPU Explorer — CPU/GPU expansion proposal (v0 notes, 2026-11-01)

Status: PROPOSAL ONLY. Nothing in this file is a promised feature.
It records ideas added during the v0 pass, for Braddy to approve, cut, or reorder.

## Why expand beyond GPU-only

The original concept already compares architectures, but its journeys are
GPU-compute centred. Braddy's inspiration is broader: Geekerwan-style
animated explainers that make CPU, memory and stacking understandable to
a general audience — e.g. how a CPU memory page-table cache works, and
how a Kirin chip stacks logic. A CPU/GPU product should therefore let
the same question travel across CPU and GPU: where does the data live,
who moves it, what waits, and what does a different organisation buy you?

## Proposed scope (not yet built, except v0)

- CPU journeys (proposal): page-table + TLB walk (built in v0 as a
  teaching flow), cache hierarchy and why a miss costs, branch/data
  dependency stalls in plain language, and a memory-order / coherence
  sketch only if it can be kept honest at teaching-model level.
- Stacking journeys (proposal): 2D cross-section diagrams of logic
  stacking — what sits on what, what the interconnect carries, what
  gets hotter / harder to cool. Use flat 2D sections, not a heavy 3D
  scene, so it stays light and screenshot-testable.
- Model coverage (proposal, teaching models only): H100, A100,
  RTX 5090, AMD MI300X, Apple A20 Pro, Qualcomm Snapdragon mobile SoC.
  Every model card must say which numbers are simplified and which
  claims still need a cited source. Do not present teaching simplifications
  as datasheet specs, and do not present animation timing as measured
  performance.

## Ideas added in v0 (already in the skeleton, small on purpose)

1. Step / pause / resume as the primary interaction, borrowed from the
   bbycroft.net/llm pattern: one operation at a time, explanation
   alongside the diagram, and the user — not an autoplay video — controls
   the pace. Text fetch of that site returns almost no content (it is a
   JS app), so this is based on its documented step-through behaviour,
   not on a claimed live-browser interaction.
2. View switching preserves context: structure / work / data / timeline
   change emphasis, never the step, model, journey or selection.
3. Model switching preserves the current question: change the chip
   mid-journey and the same step is re-explained for that model.
4. Shareable state in the URL hash (journey, model, view, step,
   selection), so a讲解 path can be sent as a link.
5. Performance budget: static files, no backend, no GPU, no WebGL by
   default. Total v0 payload is a few tens of KB. This is deliberate:
   Muse's browser environment previously failed with page_busy on heavy
   3D sites, so 3D is reserved for cases where spatial stacking is the
   lesson itself — and even then it must degrade to a 2D section.

## Ideas proposed for later (not built)

- Predict-then-play: ask "which lane runs? / which level hits?" before
  playing the step, then reveal and explain.
- Same-question comparison view: two models side by side on one step.
- A "why this organisation?" panel per step: the tradeoff, not just
  the mechanism (e.g. shared memory reuse vs. occupancy, TLB size vs.
  miss cost, stacking density vs. heat).
- A small, honest "design your own" sandbox with explicit rules and
  no fake performance scores.

## v0 hosting (gpuserver, localhost only)

- App directory on gpuserver: ~/gpu-explorer-v0/
- Port: 18910, bound to 127.0.0.1 only. Not public, no auth is needed
  precisely because it is not exposed.
- Start: see start.sh / stop.sh in the app directory (run on gpuserver).
- View via SSH tunnel (two hops, because gpuserver is behind work):
  on work, forward gpuserver's port, then from your laptop forward
  work's port — details in the app's HOSTING.md. Do not bind 0.0.0.0
  without Braddy explicitly asking for a public, authenticated setup.
