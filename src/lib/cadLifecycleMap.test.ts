import { describe, expect, it } from 'vitest';
import { buildCadLifecycleExportMap, cadLifecycleMappings } from './cadLifecycleMap';

describe('cadLifecycleMappings', () => {
  it('maps public CAD lifecycle concepts to MechaFlow data and worker boundaries', () => {
    expect(cadLifecycleMappings.map((mapping) => mapping.id)).toEqual([
      'plane-sketch-dimensions',
      'features-history-configurations',
      'materials-hardware-standards',
      'assemblies-mates-bom-drawings',
      'simulation-fea-setup',
    ]);
    expect(cadLifecycleMappings.find((mapping) => mapping.id === 'simulation-fea-setup')?.dataPersistence).toMatch(/analysis_readiness_previews/i);
    expect(cadLifecycleMappings.find((mapping) => mapping.id === 'assemblies-mates-bom-drawings')?.dataPersistence).toMatch(/\.mfcad\.json/i);
  });

  it('exports an honest non-proprietary source note', () => {
    const exportMap = buildCadLifecycleExportMap();
    expect(exportMap.source_note).toMatch(/not SOLIDWORKS compatibility/i);
    expect(exportMap.source_note).toMatch(/does not copy proprietary UI/i);
    expect(exportMap.mappings).toHaveLength(cadLifecycleMappings.length);
  });
});
