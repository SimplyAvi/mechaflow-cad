# Data and Standards Strategy

## Principle

The system should help users follow good engineering practice without pretending that every recommendation is legally certified.

## Standards categories

### Open advisory rules

These are rules derived from open references, engineering handbooks where allowed, manufacturer recommendations, and project-specific heuristics.

Examples:

- Basic clearance guidance.
- Common fastener sizing suggestions.
- Conservative safety factor prompts.
- 3D printing design heuristics.
- Generic bend-radius warnings.

These can be useful in an open-source product.

They should be labeled as advisory.

### Manufacturer data

These are rules or values from supplier catalogs and manufacturer datasheets.

Examples:

- Fastener dimensions.
- Bearing load ratings.
- Motor torque curves.
- Cable bend radius.
- Material datasheets.

The system should store source URLs and dates.

### Licensed authoritative standards

Some standards from ISO, ASME, ANSI, IEC, UL, and similar organizations are copyrighted or licensed.

The platform should not redistribute these without permission.

Instead, it should support:

- Paid standards packs.
- Customer-provided rule packs.
- Company internal standards.
- Links to standards rather than copied protected text.

### Company rule packs

Enterprise users may want custom rules.

Examples:

- Approved materials.
- Approved vendors.
- Preferred fasteners.
- Minimum safety factors.
- Manufacturing process limits.
- Maintenance access requirements.

## Material database

Initial fields:

- Name.
- Density.
- Elastic modulus.
- Yield strength.
- Ultimate strength.
- Poisson ratio.
- Thermal properties when available.
- Cost range.
- Manufacturing compatibility.
- Source and confidence.

## Part catalog database

Initial fields:

- Part name.
- Category.
- Supplier.
- Part number.
- CAD model URL.
- Price range.
- Lead time.
- Datasheet URL.
- Load rating.
- Weight.
- License or terms.

## Reference design catalog

Initial fields:

- Design name.
- Source URL.
- License.
- File formats.
- Included CAD files.
- Included electronics files.
- Included BOM.
- Assembly structure confidence.
- Known manufacturing process.
- Example tasks.

## Recommendation confidence

Every recommendation should include a confidence level.

Suggested levels:

- Verified from authoritative source.
- Verified from manufacturer data.
- Calculated from user inputs.
- Estimated from heuristic.
- Unknown or needs review.

## Report language

Avoid saying:

- Certified.
- Guaranteed.
- Code compliant.
- Safe for production.

Unless the project has verified authority to say it.

Prefer:

- Estimated.
- Advisory.
- Requires engineering review.
- Based on available data.
- Based on the selected assumptions.

## Open-source requirement

The first implementation should use open-source software where possible.

If a paid or closed source service is added, it should be optional and replaceable.
