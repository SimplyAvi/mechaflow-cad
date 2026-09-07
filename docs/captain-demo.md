# Captain demo

This checklist is the captain-facing proof path for MechaFlow CAD visual part selection and CAD-style authoring. It complements [Desktop demo](desktop.md) and should stay aligned with the automated `npm run captain:smoke` path.

## Visual part-selection proof

1. Launch with `npm start` and confirm the app opens directly into the robot-arm CAD workspace.
2. In the canvas, click a concrete arm part, for example `Upper arm link`, `Shoulder yoke joint`, `Forearm link`, or `Parallel gripper jaw link`.
3. Confirm the selected part is unmistakable in the canvas highlight and selected tag, the viewport-anchored editor, the Project drawer model tree active row, and the Review drawer selected-part detail card.
4. Use keyboard focus on a canvas part and press Enter or Space. Confirm it selects the same part as a mouse click.
5. Read the clickable on-model annotation card, synchronized left inspector, and viewport-anchored editor without scrolling away from the model. The working plane itself should show selected size, constraints/features, hole placement, fastener fit, material/process, assembly relation, drawing/export evidence, and load/FEA context. The synchronized left inspector should show the selected annotation's definition state, value provenance, editable controls, downstream impacts, and reviewable fixes. The viewport editor should show editable dimensions, sketch plane/profile/extrude/cut state, hole and fastener controls, material/process controls, a machinist drawing preview, and an FEA-input preview. Use the full-canvas action bar to open only the relevant Project, Tools, Load, Drawing/FEA, Assembly, Command, or Review pop-out.
6. Read the selected-part detail card without opening the far-right inspector. It should show part name, purpose, primitive or role, material, process, dimensions, weight or review-required mass, cost or review-required cost, stress or capability state, source confidence, and review-required warnings.

## Criteria and rationale proof

For the selected part, confirm the card and inspector explain:

- Why the selected material or process is present in the seed data.
- Payload and reach task thresholds, safety-factor guidance when seeded, stiffness or yield guidance, and heat or temperature limits when available.
- Explicit load cases, constraints, manufacturing criteria, and wiring or serviceability criteria.
- Which values are demo estimates, heuristics, seeded guidance, unknown, or review-required.
- That visible primitives are MVP project metadata, not imported manufacturing CAD, real FEA, exact electrical validation, or supplier quotes.

## Guided CAD authoring proof

1. In the Guided part studio, type an approximate description such as `lightweight sleeve with diagonal slots` or `round arm connector`.
2. Confirm the flow reads like a sketch-first CAD recipe: Describe or choose role, Sketch profile, Dimension in viewport, Add feature steps, Match local catalog, Place in assembly.
3. Confirm the sleeve or coupler recipe shows the front plane, concentric outer and inner bore dimensions, tube extrude height, diagonal rounded slot cuts, chamfer callout, and assembly placement intent.
4. Place the matched part in the assembly. Confirm the rendered part appears as selectable geometry with bore, slot, chamfer, dimensions, feature history, material or process, catalog reasoning, and assembly link in the selected-part card.
5. Use the canvas CAD tool palette to add a beam, joint, bracket, motor, connector, electronics block, or tool plate.
6. Confirm the new primitive appears in the canvas and model tree, is selected automatically, and can be renamed with the selected-part label field.
7. Edit length, width, height or diameter from either the on-canvas dimension annotation or the viewport-anchored inspector. Confirm the canvas dimensions, synchronized left inspector, drawing preview, FEA-input preview, and selected-part detail card update without navigating away from the model.
8. Pick a sketch plane, choose a 2D profile, set extrude depth or cut state, add revolve, chamfer, or fillet metadata when relevant, and apply the example centered hole 2 in from the bottom. Confirm the selected screw or bolt sets the clearance hole size and the hole callout appears on the rendered profile.
9. Toggle Focus selected. Confirm the selected part lifts out, neighboring parts dim, and a focused dimension overlay remains readable.
10. Connect the selected primitive to a parent part and choose a joint type. Confirm a visible joint marker appears in the canvas.
11. Route a visible wire to another part. Confirm the cyan route appears in the canvas, the route list updates, and the route remains labeled review-required for real electrical and CAD checks.
12. Export the `.mfcad.json` project, import it again, and confirm the new label, dimensions, parent or joint metadata, recipe metadata, viewport sketch state, hole/fastener metadata, drawing/FEA preview extension, and visible wiring survive the round trip.

## Requirements-driven resizing proof

1. In Design mode, open Requirement sizing triage.
2. Confirm the panel states the deterministic MVP boundary: target payload plus assembly self-weight, safety factor, local catalog estimates, and review-required uncertainty.
3. Confirm the 50 lb requirement shows working load, review load, effective shoulder torque, watch items, and highlighted affected parts in the viewport.
4. Click `Set demo target to 75 lb` and confirm the active task, selected-part card, and component findings update.
5. Confirm undersized or affected items include actuator torque, hinges or joints, sleeves or couplers when present, arm links, brackets or end-effector parts, and screws or fasteners.
6. Apply one deterministic fix or `Apply all deterministic fixes` and confirm the selected part updates with local upgrade catalog metadata, larger fastener callouts, stronger material or geometry, or a stronger actuator class.
7. Confirm remaining warnings still say review-required and do not claim FEA, certification, supplier warranty, or production release approval.

## Local catalog matching proof

1. In the deterministic local catalog panel, type an unknown description such as `80 mm shoulder joint motor`, `servo thing`, `round arm connector`, `pocketed aluminum arm link`, or `sheet metal gripper bracket`.
2. Confirm ranked matches appear without a network call and show confidence, dimensions in millimeters, material, process, caveats, and recipe information when available.
3. Apply the match to the selected primitive or add it to the active assembly. Confirm the selected-part detail card shows the catalog match, XYZ placement, assembly handoff metadata, dimensions, and review-required criteria.
4. Export and reimport the project. Confirm the `local_catalog_match` and `feature_recipe` metadata are still present in the portable `.mfcad.json` payload.

## Evidence path

Repo-compatible screenshot evidence for this surface lives in `docs/screenshots/visual-cad-authoring-mvp.png` and `docs/screenshots/visual-cad-authoring-tools.png`. Update those files only through the same local validation-compatible screenshot capture path used for the visual CAD docs, and keep this checklist in sync with `docs/desktop.md`.
