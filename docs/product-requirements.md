# Product Requirements

## Product name

MechaFlow CAD

## Mission

Make robotics and automation design more accessible by connecting open mechanical designs, CAD editing, engineering analysis, electronics planning, manufacturing logistics, and AI-guided decision support in one workflow.

## Target users

Initial users:

- Robotics builders who want to modify existing designs safely.
- Engineers who want a faster concept-to-analysis workflow.
- Makers who want open designs with guided manufacturing options.
- Students learning mechanical design, electronics, and simulation.

Later users:

- Small manufacturers.
- Automation integrators.
- Enterprise engineering teams.
- Research labs.

## Primary user story

A user opens a free and open robot hand or gripper design.

The system shows an animated exploded view of the full assembly.

The user selects one part, sees what it does, sees material and manufacturing options, and modifies the part.

The system keeps the original task active, such as lifting 50 lb, and re-checks whether the modified design can still perform the task.

## Required capabilities

### Open reference design catalog

The platform should maintain a catalog of open reference designs.

Each entry should include:

- Name
- Source URL
- License
- Supported file formats
- CAD files
- Assembly files
- Drawings when available
- BOM when available
- Electronics files when available
- Manufacturing notes when available
- Known limitations

### Animated exploded views

The platform should create exploded views for assemblies.

The exploded view should:

- Separate parts and subassemblies visually.
- Animate the separation.
- Keep labels attached to parts.
- Allow selecting any part.
- Allow drilling into subassemblies.
- Show part purpose, material, cost, weight, and related fasteners.

### Task-preserving design edits

The platform should preserve the design task during editing.

Example tasks:

- Lift 50 lb.
- Reach 1 meter.
- Complete a pick-and-place cycle in 2 seconds.
- Fit inside a given envelope.
- Survive a target number of cycles.
- Avoid full disassembly during maintenance.

When a part changes, the system should re-check the task instead of treating the edit as isolated geometry.

### Capability re-rating

The platform should rate the modified design against the task.

Example outputs:

- Approved for 50 lb with a 2.0 safety factor.
- Likely limited to 25 lb due to stress in the finger link.
- Could support 100 lb with the stronger material, but actuator torque becomes the new limit.
- Geometry change passes strength but causes a wiring clearance issue.

### Standards-aware design suggestions

The platform should suggest standard holes, fasteners, fits, clearances, edge distances, and tolerances where data is available.

The system must distinguish:

- Open advisory rules.
- Manufacturer-specific recommendations.
- Licensed authoritative standards.
- User-configured company standards.

### Finite element analysis

The platform should support background FEA checks for selected parts and assemblies.

Initial FEA should cover:

- Static structural analysis.
- Cantilever-style loads.
- Stress concentration around holes.
- Material comparison.
- Factor of safety.
- Displacement.
- Failure point visualization.

### Electronics and wiring

The platform should support electronics-aware mechanical design.

Required workflows:

- Import or link KiCad PCB designs.
- Route wires or harness paths through assemblies.
- Check clearance and bend-radius constraints.
- Suggest service loops and strain relief.
- Generate wiring diagrams and harness BOMs.

### Manufacturing and logistics

The platform should suggest how to make or buy each part.

Options should include:

- Off-the-shelf part sourcing.
- 3D printing.
- CNC machining.
- Sheet metal.
- PCB fabrication.
- Wire harness production.

Each option should include cost range, lead time when available, supplier links, and risk notes.

### Maintainability

The platform should flag difficult-to-service designs.

It should suggest:

- Modular subassemblies.
- Access panels.
- Standard fasteners.
- Replaceable wear parts.
- Avoiding buried components that fail often.

## Non-goals for the first MVP

- Replacing professional CAD systems completely.
- Certifying safety-critical designs.
- Providing licensed engineering standards for free.
- Full high-fidelity dynamic robot simulation.
- Fully automatic manufacturing order placement.

## Success criteria for the MVP

The MVP succeeds if a user can:

1. Open an existing free/open robot assembly.
2. View an animated exploded assembly.
3. Select a part.
4. Change material or dimensions.
5. See updated payload capability and risks.
6. Receive a simple FEA-backed or heuristic-backed report.
7. See manufacturing and cost options.
