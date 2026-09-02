# Business Model

## Product positioning

MechaFlow CAD can become a bridge between open-source CAD, robotics design, engineering analysis, and manufacturing logistics.

The initial value is not replacing every professional CAD feature.

The initial value is helping users understand and modify robot assemblies faster and more safely.

## Customer segments

### Makers and students

Needs:

- Free or low-cost access.
- Guided examples.
- Open designs.
- 3D-printable outputs.

Possible offer:

- Free community tier.
- Paid cloud analysis credits.
- Education bundles.

### Robotics builders and small teams

Needs:

- Faster design iteration.
- Supplier and manufacturing help.
- Basic engineering reports.
- Open-source extensibility.

Possible offer:

- Low-cost monthly plan.
- Optional simulation credits.
- Paid supplier integrations.

### Automation integrators

Needs:

- Reusable templates.
- Customer-specific designs.
- BOM and quote packages.
- Maintainability analysis.

Possible offer:

- Professional plan.
- Private catalogs.
- Quote packet generation.

### Enterprise engineering teams

Needs:

- Private deployment.
- Company standards.
- Approved suppliers.
- Audit trails.
- Proprietary component libraries.

Possible offer:

- Enterprise license.
- Private cloud or on-premise deployment.
- Support contracts.

## Revenue options

### 1. SaaS subscriptions

Charge per user for:

- Saved projects.
- Collaboration.
- AI assistance.
- Reports.
- Private catalogs.

### 2. Simulation credits

Charge for:

- Cloud FEA.
- Batch optimization.
- Heavy mesh generation.
- Motion analysis.
- Long-running design sweeps.

### 3. Manufacturing marketplace

Generate revenue through:

- Supplier referrals.
- Quote routing.
- Transaction fees.
- Premium supplier placement.

This should remain transparent to users.

### 4. Standards and rule packs

Paid packs could include:

- Company rule packs.
- Industry-specific templates.
- Licensed standards data.
- Robotics gripper design packs.
- Common machine design packs.

### 5. Enterprise support

Offer:

- Private deployment.
- Integration work.
- Custom supplier integrations.
- Internal standards setup.
- Training.

## Open-source strategy

Recommended approach:

- Keep the core schemas, local worker, and reference implementation open source.
- Allow commercial hosted services for collaboration, compute, and supplier integrations.
- Keep paid standards data separate from the open-source code.
- Make local-first operation possible so the project remains useful without a hosted subscription.

## Cost control

The business should avoid expensive always-on compute.

Strategies:

- Static frontend hosting.
- Local CAD workers where possible.
- Bring-your-own AI keys for early users.
- Job queues with explicit cost estimates.
- Spot or batch compute for heavy FEA.
- Cache imported designs and analysis results.

## Risks

### Engineering liability

Risk:

Users may treat advisory outputs as certified engineering approval.

Mitigation:

- Label all analysis assumptions.
- Avoid claiming certification.
- Export reports with assumptions and warnings.
- Support professional review workflows.

### Standards licensing

Risk:

Some engineering standards are not free to redistribute.

Mitigation:

- Use open advisory rules first.
- Add licensed packs later.
- Support user-provided company standards.

### CAD complexity

Risk:

Full CAD systems are very large.

Mitigation:

- Build on FreeCAD.
- Focus on workflows first.
- Avoid building a geometry kernel early.

### Compute cost

Risk:

Cloud simulation can be expensive.

Mitigation:

- Prefer local compute.
- Queue heavy jobs only when needed.
- Show cost before running expensive jobs.

## First commercial wedge

The best first wedge is an open reference design explorer for robotics.

Users can import a robot hand, arm, gripper, or fixture, see an exploded view, modify a part, and get a capability/cost/manufacturing report.

This is easier to explain than a general CAD replacement and proves the core value quickly.
