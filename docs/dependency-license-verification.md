# Dependency License Verification

Every GitHub project, CAD library, hardware reference design, data file, and tool adapter must pass license review before MechaFlow CAD adopts it as a dependency or mirrors its assets.

This checklist is required even when a repository claims to be open source.

## Required review record

For each candidate, record:

- Repository URL.
- Exact commit SHA, release tag, or downloaded artifact hash.
- All license files found at the root and in subdirectories.
- License metadata reported by GitHub or package manifests.
- File types planned for import, such as CAD, STEP, STL, KiCad, WireViz, URDF, images, docs, or code.
- Whether commercial use, redistribution, and modification appear allowed.
- Any reciprocal, attribution, notice, patent, trademark, export, noncommercial, or no-derivatives restrictions.
- Third-party vendored content and submodules.
- Reviewer name and date.

## GitHub review workflow

1. Inspect the root `LICENSE`, `COPYING`, `NOTICE`, `README`, package manifests, and repository license metadata.
2. Search subdirectories for additional license files:

   ```bash
   find . -iname 'license*' -o -iname 'copying*' -o -iname 'notice*'
   ```

3. Check CAD, PCB, image, datasheet, and generated folders for separate notices. Hardware assets sometimes use a different license from code.
4. Inspect submodules and vendored third-party files. Review them independently.
5. Check issue tracker or release notes for licensing disputes if the project is unfamiliar.
6. Confirm that required tools can run locally or in cheap worker containers without paid runtime dependencies.
7. Document the result in the catalog entry or integration decision record.

## Compatibility guidance

- MIT, BSD, Apache-2.0, MPL-2.0, LGPL, GPL, AGPL, and CERN OHL variants can be open source, but obligations differ.
- Strong reciprocal licenses may be acceptable for open hardware references, but the catalog must call out obligations clearly.
- Noncommercial, no-derivatives, source-available-only, personal-use-only, and trial licenses are not acceptable as required runtime dependencies.
- Manufacturer datasheets and engineering standards often permit reading but not redistribution. Link to them and store derived advisory metadata only when permitted.
- If the license does not clearly cover CAD or electronics files, mark the entry `uncertain` and do not mirror assets.

## Adoption gate

A dependency or design may become a required runtime dependency only when:

1. The exact license is known.
2. Required notices can be preserved.
3. Commercial use is allowed or the project explicitly accepts the restriction.
4. Required runtime use is free and open source.
5. Hosting and worker costs fit the cheap-hosting plan.
6. Security review confirms it does not require secrets in code or committed config.

If any answer is unclear, keep the candidate optional or mark it `uncertain` in the catalog. Handoff data, demos, and adapter stubs must carry that uncertainty forward instead of translating it into `ready-for-import` language.
