# Component selection feedback — 2026-11-02

Selection now emphasizes the actual surfaces of a complete component group, including its instanced parts. It preserves the original hues, textures, metalness, roughness, transparency and depth settings, without bounding boxes or extra geometry.

Hover gives a small neutral lift. Clicking applies a stronger surface lift and soft fill, with a gentle reduction in surrounding brightness. Changes ease over 140 ms; reduced-motion mode applies them immediately. Each mesh uses reusable owned material clones, so components sharing an original material remain independent. Clearing or disabling feedback restores the exact original material references; disposal releases only owned clones.

## Interaction behavior

- Click the selected component again, click empty canvas, or press Escape to clear selection.
- Double-click to enter a component's internal view or focus it. The inspector also provides an explicit entry button.
- Rotation and panning remain gestures rather than selections. Selection checks maximum pointer excursion, including a drag that returns to its starting point; the pan tool and modified drags cannot select components.
- Entering Learn restores neutral materials before the lesson updates its cutaway cover. Returning to Anatomy can restore the saved component context.

## Validation

**230 automated tests and HTTP integration passed.** Tests cover shared-material isolation, complete instanced groups, interpolation and restoration, hidden targets, material arrays, texture ownership, repeated interactions, safe disposal and reduced motion.

Real Chrome QA passed the cases below; the [browser record](browser-checks.json) includes an initial drag attempt whose selection precondition was not established, followed by the verified retry. The console contained no warnings or errors.

Tested cases:

- Hover, select, switch and clear components across all seven hardware scales.
- Select groups with shared source materials, including HBM, VRM and SM resources.
- Isolate and restore a selected component; select parts in exploded HBM views.
- Rotate, pan and drag back to the starting point without changing selection.
- Double-click entry, explicit inspector entry and focus behavior.
- Anatomy → Learn → Anatomy transitions, including the translucent teaching cover.
- Switch H100/A100 while selection feedback is active.
- At 390 × 844, enter a selected module using the inspector button, with no horizontal overflow.

## Browser captures

- [Board selection](board-selected.jpg)
- [SM selection](sm-selected.jpg)
- [HBM selection](hbm-selected.jpg)
