# User Experience

## UX principle

The user should not need to know every engineering standard before making a useful design decision.

The interface should explain what is safe, what is risky, what is unknown, what changed, and which evidence supports the claim. It must never present advisory analysis, seed data, pre-solver packages, solver fixtures, cloud plans, supplier ranges, or wiring heuristics as certified results.

## Product direction

The current product direction is input-first and 3D-first:

- The app opens directly into an interactive 3D workspace.
- One command line captures design intent before forcing detailed setup.
- CAD-style contextual sidebars keep project paths and selected-part details nearby.
- New, open/import, recent, reference catalog, and ready-example paths are visible but compact.
- Reference images are accepted as local context only.
- Advanced Analysis, Manufacturing, Reports, and Backend surfaces are progressively disclosed through mode buttons.

This direction is implemented in `src/App.tsx` and visually covered by the desktop checklist in [Desktop demo](desktop.md). Screenshot evidence for the redesigned opening state is stored at `docs/screenshots/input-first-opening.png`.

## Primary workflow

### 1. Land in the 3D cockpit

The first screen should show:

- Large interactive robot assembly viewport.
- Design-intent command line.
- Compact left project browser.
- Contextual right inspector.
- Mode rail for Design, Analysis, Manufacturing, Reports, and Backend tools.

The user should be able to orbit, explode, and select before filling out a long form.

### 2. Choose a starting point

The user can choose:

- Start a local prompt concept from design intent.
- Open or import a `.mfcad.json` project file.
- Reopen a recent project.
- Open a repository-local ready example.
- Browse the open reference design catalog.
- Later, import license-cleared CAD files through FreeCAD workers.

The first MVP prioritizes local ready examples and project files. It does not import arbitrary CAD assets into a real CAD pipeline yet.

### 3. Define or preserve the task

The system asks for, extracts, or preserves the task the design must perform.

Examples:

- Pick and place a 50 lb object.
- Move a part 1 meter in 2 seconds.
- Hold an object without damaging it.
- Fit wires through a rotating joint.
- Be serviceable without full disassembly.

Task chips and panels should stay visible during part inspection and edits.

### 4. Add reference images

The user can upload or drag/drop reference photos or images.

MVP copy must be clear:

- Images are local reference metadata.
- They may guide the user's concept and future scoping.
- They are not converted into CAD geometry.
- They do not produce FEA, supplier quotes, or electrical validation.

### 5. Explore the exploded assembly

The user can:

- Play, toggle, or scrub exploded-view state.
- Orbit with yaw and pitch controls.
- Select a part in the visual model.
- Select a part from the model tree.
- See selected-part highlighting.
- Inspect linked wiring, electronics, fasteners, and dependent parts when known.

The MVP visual seed is a robot arm with a wrist gripper. The legacy project id remains `project-open-gripper-demo` for backend and smoke-test compatibility.

### 6. Inspect a part

The part panel should show:

- Purpose.
- Active task role.
- Material.
- Weight or review-required mass.
- Estimated cost range.
- Lead-time range where seeded.
- Manufacturing process.
- Related fasteners.
- Related wires and electronics.
- Stress or stiffness risk where seeded.
- Heat or temperature guidance where seeded.
- Replacement difficulty.
- Source confidence and review status.

### 7. Modify the part

The user can compare or change:

- Material.
- Thickness.
- Length.
- Hole size.
- Fastener type.
- Manufacturing process.
- Surface treatment.
- Wiring path.

Current MVP substitution flow:

1. List only compatible material/process intersections.
2. Preview backend impact without persisting.
3. Show projected BOM, manufacturing, readiness, and report changes.
4. Apply only after a successful preview.
5. Keep unsupported or stale mass, payload, solver, quote, and electrical claims review-required.

### 8. Preserve the task

The system keeps the original task visible.

Example MVP-safe copy:

```text
Task: lift 50 lb
Current status: review-required; no worker-supplied payload rating is available
Selected edit: switch aluminum to nylon carbon fiber
Projected result: compare weight, stiffness, yield, heat, manufacturing, cost, lead-time, and wiring effects; payload remains review-required
```

### 9. Show options

The system should not only say pass or fail.

It should suggest alternatives:

- Use stronger material.
- Increase thickness.
- Change fastener pattern.
- Add ribbing.
- Reduce reach.
- Use an off-the-shelf component.
- Split into a replaceable subassembly.
- Change wiring route, bend radius, or service-loop slack.

### 10. Review progressive analysis tools

Analysis mode should separate current evidence types:

- Selected-target pre-solver readiness.
- Assembly readiness with aggregate gaps, not copied part estimates.
- Local tool availability for FreeCAD, Gmsh, and CalculiX.
- Local pre-solver packages labeled not FEA.
- CalculiX fixture status labeled fixture only.
- Job queue status, local/cloud recommendation, runtime estimate, wait estimate, and cached artifact metadata.
- Full project FEA as unavailable or review-required until real workers exist.

Cloud recommendations should say planning-only until provider configuration, credentials, budget guardrails, and approval exist.

### 11. Review manufacturing, wiring, and reports

Manufacturing mode should show BOM, make-or-buy paths, cost ranges, lead-time ranges, risk notes, wiring, electronics, route review, and harness data.

Reports mode should show advisory reports, evidence provenance, cached report or artifact references, and portable project file export/import.

Backend mode should expose API handoff details for workers without distracting first-time users from the cockpit.

## Important screens

### Opening cockpit

- 3D assembly viewport.
- Command line for design intent.
- Reference image intake.
- Compact project paths.
- Contextual selected-part inspector.
- Mode rail.

### Reference design page or panel

- Preview image or 3D viewer where available.
- License.
- Supported formats.
- BOM availability.
- Complexity estimate.
- Review state.
- Import or open action only when the asset is within the current implementation boundary.

### Assembly cockpit

- 3D viewer.
- Exploded-view controls.
- Part tree.
- Task panel.
- Analysis status.
- Cost and BOM summary.
- Wiring and electronics summary.

### Part inspector

- Part properties.
- Change controls.
- Recommended alternatives.
- Source confidence.
- Background report history.

### Analysis mode

- Selected part or assembly readiness.
- Local tool availability.
- Pre-solver run action.
- Solver-readiness fixture action.
- Queue recommendations.
- Cached artifact and report references.
- Full FEA unavailable or review-required labels.

### Manufacturing mode

- BOM.
- Manufacturing options.
- Make-or-buy hints.
- Cost and lead-time ranges.
- Wiring/electronics review.
- Harness BOM additions.

### Report view

- Plain-language summary.
- Evidence and assumptions.
- What changed.
- Task impact.
- Weight, cost, manufacturing, serviceability, and wiring impact.
- Risks and unknowns.
- Export/import controls.

## Interaction style

The interface should be visual first.

Use:

- Exploded views.
- Color-coded part risk.
- Plain-language warnings.
- Cost range badges.
- Capability status only when supported by evidence.
- Sliders for geometry or exploded-view changes.
- Comparison cards for material options.
- Review-required labels for gaps.
- Tooltips or small evidence notes rather than long startup checklists.

Avoid:

- Hiding critical assumptions.
- Presenting advisory analysis as certification.
- Claiming payload, stress, displacement, safety factor, electrical validity, or exact quotes without real evidence.
- Making users read long standards documents before acting.
- Requiring users to leave the design screen for every lookup.
- Starting the app on backend or integration details that belong behind progressive disclosure.

## Example capability explanation

MVP-safe example:

```text
Original part: aluminum 6061-T6 finger link
Task: lift 50 lb
Current evidence: seeded material guidance and pre-solver inputs only
Result: payload rating review-required; no project solver result is available

Changed part: carbon-fiber nylon finger link
Projected change: lower density, different stiffness, lower heat limit, additive manufacturing path
Result: compare risks and prepare solver inputs; payload remains review-required

Changed part: steel finger link
Projected change: higher density and yield guidance, machining path, actuator and mass risk
Result: may improve strength margin, but actuator torque, heat, fit, and solver review remain required
```

Future solver-backed copy may show numerical payload or safety-factor values only after project geometry, mesh, solver logs, result artifacts, and engineering review are present.
