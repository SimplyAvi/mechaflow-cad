# Workshed progressive CAD walkthrough

This artifact documents the streamlined live app flow introduced for the Workshed / MechaFlow CAD viewport-first experience.

## Core path

1. Open the app. The 3D viewport and the `Progressive CAD flow` strip are dominant.
2. Choose `Create or open` to reveal the start drawer with new prompt, local `.mfcad`, recent project, ready examples, and model tree controls.
3. Choose `Add a sketch block` to place an editable visual primitive in the active assembly.
4. Choose `Extrude and dimension` to reveal the focused CAD tools drawer. Edit units, dimensions, position, material, process, parent joint, visible wiring, and export without exposing analysis or factory panels by default.
5. Choose `Save .mfcad`, then reopen through the same start drawer to verify project-file persistence.
6. Choose `Inspect selected part` to reveal the selected-object drawer with material, cost, source confidence, substitution tools, strength notes, and readiness handoff.

## Progressive secondary reveal

Advanced workspaces are grouped behind the top `Switch advanced workspaces` menu. Analysis, manufacturing, reports, backend contracts, factory/logistics/wiring metadata, source preservation, and coverage guide controls remain reachable but no longer crowd the initial screen.

## Narrow behavior

On narrow screens the same drawers stack below the viewport, so the model remains first and secondary details are reached with explicit summaries instead of side-by-side panels.
