# Final UX polish — 2026-11-02

## Workspace behavior

| Workspace | Navigation and controls |
| --- | --- |
| Anatomy | Hardware levels, component selection, isolation, dissection and comparison. |
| Learn | Four journeys and their steps; the model chooser remains available for GEMM. Canvas picking cannot leave the lesson. |

Entering Learn saves the Anatomy level, selected component, isolation, explosion and camera preset. Returning to Anatomy restores that context. Re-entering Learn prepares the current lesson; changing steps or replaying does not overwrite the saved Anatomy context.

Rotation, panning and the three camera presets preserve the lesson and its clock. Arrow shortcuts work while journey, timeline or Continue buttons retain focus; Space and Enter keep native button activation.

## Presentation changes

- Removed the large duplicate model title, LIVE badge and redundant status prose.
- Moved path chips into the inspector, beside the explanation and numeric visualization.
- Moved the SM resource legend into the inspector; its Learn entries are static labels.
- All routes use stationary arrows with a whitening sweep. No packets travel along the routes.
- Kept arithmetic progress separate from the repeating visual clock. Completed results remain fixed; pausing freezes the visual phase.
- Fixed the mobile footer so playback and step navigation remain available.

## Validation

**220 automated checks and HTTP integration passed.**

51 real Chrome check records are saved in [browser-checks.json](browser-checks.json). They cover:

- All 31 lesson stages across the four journeys and all seven Anatomy levels.
- SM selection, isolation and TOP-view round-trip through Learn; HBM at 100% explosion round-trip.
- All three camera presets without changing the lesson clock; canvas clicks and panning within Learn.
- Completed math at progress `1` while the visual cycle exceeded `7`; paused visual phase remained unchanged.
- Layouts at `1024 × 768` and `390 × 844`, with no horizontal overflow.
- Automatic playback through the final two stages: the final result stays at progress `1` and the visual loop continues.
- No console warnings or errors during the tested interactions.

Regression focus: workspace switches must restore their own state; observing a lesson must not trigger component selection or reset arithmetic; visual emphasis must not imply additional computation.

## Browser captures

- [Anatomy board](anatomy-board.jpg)
- [Learn: SM computation](learn-sm.jpg)
- [Mobile layout](mobile.jpg)
