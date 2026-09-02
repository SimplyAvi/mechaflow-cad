import { mockReferenceDesign } from '../data/mockDesign';
import type { ReferenceDesign } from '../types';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const getApiBaseUrl = (): string | undefined => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured ? trimTrailingSlash(configured) : undefined;
};

export async function loadCockpitDesign(designId = mockReferenceDesign.id): Promise<ReferenceDesign> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return mockReferenceDesign;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/reference-designs/${designId}`);
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    return (await response.json()) as ReferenceDesign;
  } catch (error) {
    console.warn('Falling back to bundled MechaFlow CAD mock design data.', error);
    return mockReferenceDesign;
  }
}
