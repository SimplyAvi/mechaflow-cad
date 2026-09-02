# Cheap Hosting Plan

## Hosting goal

Host MechaFlow CAD as cheaply as possible while preserving a path to cloud compute, collaboration, and paid users.

## Principle

Make the platform cloud-assisted, not cloud-dependent.

The user's computer should handle local CAD work and quick checks when possible.

The cloud should handle:

- Authentication.
- Project metadata.
- Optional file sync.
- Job coordination.
- Optional heavy compute.
- Collaboration.

## Phase 0: documentation only

Cost: near zero.

Use:

- GitHub repository.
- GitHub Pages or another static host.

What this supports:

- Public documentation.
- Roadmap.
- Open-source collaboration.

## Phase 1: cheapest technical demo

Cost target: near zero to low monthly cost.

Architecture:

- Static frontend.
- Local file storage.
- Local FreeCAD worker.
- Local or bring-your-own AI key.
- No always-on simulation server.

Possible hosting:

- GitHub Pages.
- Cloudflare Pages.
- Netlify free tier.
- Vercel free tier.

Advantages:

- Cheap.
- Easy to share.
- Good for early demos.

Limitations:

- User must install local worker.
- No strong collaboration.
- Harder to support different operating systems.

## Phase 2: MVP web service

Cost target: low monthly cost.

Architecture:

- Static frontend.
- Small API server.
- SQLite or small Postgres database.
- Object storage for CAD files.
- Queue workers that can scale to zero or run only on demand.

Possible services:

- Cloudflare Pages for frontend.
- Fly.io, Render, Railway, or Hetzner for API.
- Supabase, Neon, or managed Postgres free/low tier for database.
- Cloudflare R2, Backblaze B2, or S3-compatible storage for files.

Compute plan:

- Run quick analysis locally or in a small worker.
- Queue heavy FEA jobs.
- Use cost warnings before running cloud jobs.
- Cache results by design version, material, and load case.

## Phase 3: commercial platform

Cost target: scales with users.

Add:

- Team accounts.
- Private projects.
- Supplier integrations.
- Paid cloud compute.
- Enterprise controls.
- Audit logs.
- Private component catalogs.

## Compute tiers

### Local compute

Use for:

- CAD edits.
- Simple mass and geometry checks.
- Small FEA jobs.
- Private projects.

### Shared low-cost cloud worker

Use for:

- Importing designs.
- Generating previews.
- Running small reports.

### Paid cloud job

Use for:

- Large meshes.
- Batch material comparisons.
- Assembly simulations.
- Long-running optimization.

## Cost controls

The product should include:

- Job size estimation.
- Expected wait time.
- Expected cost.
- Local versus cloud recommendation.
- User approval before paid compute.
- Caching of previous results.
- Queue limits for free users.

## Recommended first hosting setup

For the first implementation:

1. Host documentation on GitHub.
2. Build the frontend as a static app.
3. Run the FreeCAD worker locally from a developer machine.
4. Use SQLite for local project metadata.
5. Add cloud API only after the demo proves value.

This keeps cost low while still proving the workflow.
