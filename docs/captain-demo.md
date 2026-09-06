# Captain demo

This checklist is the captain-facing proof path for MechaFlow CAD visual part selection and CAD-style authoring. It complements [Desktop demo](desktop.md) and should stay aligned with the automated `npm run captain:smoke` path.

## Visual part-selection proof

1. Launch with `npm start` and confirm the app opens directly into the robot-arm CAD workspace.
2. In the canvas, click a concrete arm part, for example `Upper arm link`, `Shoulder yoke joint`, `Forearm link`, or `Parallel gripper jaw link`.
3. Confirm the selected part is unmistakable in three places: the canvas highlight and selected tag, the model tree active row, and the selected-part detail card anchored under the canvas.
4. Use keyboard focus on a canvas part and press Enter or Space. Confirm it selects the same part as a mouse click.
5. Read the selected-part detail card without opening the far-right inspector. It should show part name, purpose, primitive or role, material, process, dimensions, weight or review-required mass, cost or review-required cost, stress or capability state, source confidence, and review-required warnings.

## Criteria and rationale proof

For the selected part, confirm the card and inspector explain:

- Why the selected material or process is present in the seed data.
- Payload and reach task thresholds, safety-factor guidance when seeded, stiffness or yield guidance, and heat or temperature limits when available.
- Explicit load cases, constraints, manufacturing criteria, and wiring or serviceability criteria.
- Which values are demo estimates, heuristics, seeded guidance, unknown, or review-required.
- That visible primitives are MVP project metadata, not imported manufacturing CAD, real FEA, exact electrical validation, or supplier quotes.

## CAD authoring proof

1. Use the canvas CAD tool palette to add a beam, joint, bracket, motor, connector, electronics block, or tool plate.
2. Confirm the new primitive appears in the canvas and model tree, is selected automatically, and can be renamed with the selected-part label field.
3. Edit length, width, height, XYZ position, and Z rotation. Confirm the canvas dimensions and selected-part detail card update.
4. Connect the selected primitive to a parent part and choose a joint type. Confirm a visible joint marker appears in the canvas.
5. Route a visible wire to another part. Confirm the cyan route appears in the canvas, the route list updates, and the route remains labeled review-required for real electrical and CAD checks.
6. Export the `.mfcad.json` project, import it again, and confirm the new label, dimensions, parent or joint metadata, and visible wiring survive the round trip.

## Evidence path

Repo-compatible screenshot evidence for this surface lives in `docs/screenshots/visual-cad-authoring-mvp.png` and `docs/screenshots/visual-cad-authoring-tools.png`. Update those files only through the same local validation-compatible screenshot capture path used for the visual CAD docs, and keep this checklist in sync with `docs/desktop.md`.
