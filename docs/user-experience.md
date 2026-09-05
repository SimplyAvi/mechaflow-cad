# User Experience

## UX principle

The user should not need to know every engineering standard before making a useful design decision.

The interface should explain what is safe, what is risky, what is unknown, and what changed.

## Primary workflow

### 1. Choose a starting point

The user can choose:

- Start from an open reference design.
- Start from a guided template.
- Start from a blank design.
- Import their own CAD files.

The first MVP should prioritize open reference designs.

### 2. Define the task

The system asks for the task the design must perform.

Examples:

- Pick and place a 50 lb object.
- Move a part 1 meter in 2 seconds.
- Hold an object without damaging it.
- Fit wires through a rotating joint.
- Be serviceable without full disassembly.

### 3. Explore animated exploded view

The system shows the full assembly.

The user can:

- Play the exploded-view animation.
- Pause the animation.
- Select a part.
- Select a subassembly.
- Hide or isolate parts.
- See fasteners and dependent parts.
- See wiring paths and connectors.

### 4. Inspect a part

The part panel should show:

- Purpose.
- Material.
- Weight.
- Estimated cost.
- Manufacturing process.
- Related fasteners.
- Related wires.
- Stress risk.
- Replacement difficulty.
- Supplier or fabrication options.

### 5. Modify the part

The user can change:

- Material.
- Thickness.
- Length.
- Hole size.
- Fastener type.
- Manufacturing process.
- Surface treatment.
- Wiring path.

### 6. Preserve the task

The system keeps the original task visible.

Example:

```text
Task: lift 50 lb
Current status: review-required; no worker-supplied payload rating is available
Selected edit: switch aluminum to nylon carbon fiber
Projected result: compare weight, stiffness, yield, heat, manufacturing, cost, and lead-time effects; payload remains review-required
```

### 7. Show options

The system should not only say pass or fail.

It should suggest alternatives:

- Use stronger material.
- Increase thickness.
- Change fastener pattern.
- Add ribbing.
- Reduce reach.
- Use off-the-shelf component.
- Split into replaceable subassembly.

### 8. Generate report

The report should include:

- What changed.
- Why it matters.
- New payload rating.
- Weight change.
- Cost change.
- Manufacturing impact.
- Serviceability impact.
- Wiring impact.
- Risks and unknowns.

## Important screens

### Home dashboard

- Recent projects.
- Open reference design catalog.
- Create/import buttons.
- Example demos.

### Reference design page

- Preview image or 3D viewer.
- License.
- Supported formats.
- BOM availability.
- Complexity estimate.
- Import button.

### Assembly cockpit

- 3D viewer.
- Exploded-view controls.
- Part tree.
- Task panel.
- Analysis status.
- Cost and BOM summary.

### Part inspector

- Part properties.
- Change controls.
- Recommended alternatives.
- Background report history.

### Report view

- Plain-language summary.
- Pass/fail/rated capability.
- Evidence and assumptions.
- Images and plots.
- Export button.

## Interaction style

The interface should be visual first.

Use:

- Exploded views.
- Color-coded part risk.
- Plain-language warnings.
- Cost badges.
- Capability ratings.
- Sliders for geometry changes.
- Comparison cards for material options.

Avoid:

- Hiding critical assumptions.
- Presenting advisory analysis as certification.
- Making users read long standards documents before acting.
- Requiring users to leave the design screen for every lookup.

## Example capability explanation

```text
Original part: aluminum 6061-T6 finger link
Task: lift 50 lb
Result: passes, estimated max payload 68 lb

Changed part: carbon-fiber nylon finger link
Result: does not meet task, estimated max payload 31 lb
Suggestion: increase rib height or switch to steel pin reinforcement

Changed part: steel finger link
Result: estimated max payload 112 lb
Warning: adds 0.7 lb per finger and may require stronger actuator
```
