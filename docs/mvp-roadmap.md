# MVP Roadmap

## MVP thesis

The first MVP should prove that MechaFlow CAD can make an existing open robot design understandable, editable, analyzable, and manufacturable.

## Recommended first demo

Build an open reference design explorer with animated exploded views.

The user should be able to:

1. Open an existing open-source robot design.
2. Watch the assembly explode into selectable parts.
3. Select a part.
4. Understand what that part does.
5. Change material or simple dimensions.
6. Keep the original task active.
7. See whether the changed design still satisfies the task.
8. Get cost, manufacturing, and wiring implications.

## Milestone 1: documentation and repository setup

Deliverables:

- README.
- Product requirements.
- Technical architecture.
- UX documentation.
- Open-source integration list.
- Hosting plan.
- Business model.

## Milestone 2: reference design catalog schema

Deliverables:

- JSON or YAML schema for open reference designs.
- Example catalog entries.
- License field.
- File format field.
- BOM field.
- Source URL field.

## Milestone 3: static visual prototype

Deliverables:

- Browser page showing a sample robot hand or arm.
- Mock animated exploded view.
- Clickable part callouts.
- Part inspector panel.
- Material option cards.
- Capability re-rating mock output.

## Milestone 4: real 3D viewer

Deliverables:

- Load a real glTF, STEP-converted, or mesh-based assembly preview.
- Show parts in a tree.
- Select parts in the viewer.
- Display metadata.

## Milestone 5: FreeCAD worker proof of concept

Deliverables:

- Import a CAD assembly with FreeCAD.
- Extract part metadata where possible.
- Export viewable geometry.
- Generate simple exploded transforms.

## Milestone 6: task-preserving material substitution

Deliverables:

- Define a task, such as lift 50 lb.
- Change material for a selected part.
- Recompute mass and simple strength estimates.
- Show pass/fail or new payload rating.

## Milestone 7: first FEA-backed report

Deliverables:

- Mesh one selected part.
- Apply a load case.
- Run CalculiX.
- Extract stress and displacement.
- Generate a plain-language report.

## Milestone 8: manufacturing and BOM report

Deliverables:

- Generate part list.
- Add simple process recommendations.
- Add rough cost ranges.
- Export quote packet.

## Milestone 9: wiring and electronics pass (complete)

Deliverables:

- Add a simple wire route model.
- Generate a wiring diagram or WireViz output.
- Check bend-radius or clearance rules.
- Link harness items into the BOM.

## Milestone 10: cloud-assisted jobs

Status: complete for the safe local MVP boundary. Cloud execution remains intentionally unconfigured.

Deliverables:

- Job queue.
- Local versus cloud recommendation.
- Job status UI.
- Cached reports.
- Cost and wait-time estimate before paid compute.

The current slice provides deterministic local recommendations, cloud-planning estimates, queue status, and retained local report or artifact references. It does not add a cloud provider, billing, credentials, or remote execution.

## Recommended immediate next task

Define and explicitly approve the future cloud execution boundary, including provider configuration, credentials, budget guardrails, and remote-worker safety requirements.
