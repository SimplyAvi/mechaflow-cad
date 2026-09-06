import type { TaskRequirement } from '../types';

export type DesignIntentChipKind = 'payload' | 'dimension' | 'cycle' | 'material' | 'constraint' | 'restriction' | 'intent';

export interface DesignIntentChip {
  id: string;
  kind: DesignIntentChipKind;
  label: string;
  detail: string;
}

const materialTerms = [
  'aluminum',
  'steel',
  'stainless',
  'carbon fiber',
  'carbon-fiber',
  'nylon',
  'polycarbonate',
  'titanium',
  'fr-4',
  'abs',
  'pla',
];

const uniquePush = (chips: DesignIntentChip[], chip: DesignIntentChip) => {
  if (!chips.some((candidate) => candidate.kind === chip.kind && candidate.label.toLowerCase() === chip.label.toLowerCase())) {
    chips.push(chip);
  }
};

const normalizedNumber = (value: string): number => Number.parseFloat(value.replace(/,/g, ''));

export const extractPayloadLb = (text: string): number | null => {
  const beforeValue = /(?:payload|lift|carry|hold|pick)[^\d]{0,18}(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|kg|kilogram|kilograms)\b/i.exec(text);
  const afterValue = /(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|kg|kilogram|kilograms)\b[^.\n,;]{0,18}(?:payload|lift|carry|hold|pick)/i.exec(text);
  const match = beforeValue ?? afterValue;
  if (!match) return null;
  const value = normalizedNumber(match[1]);
  const unit = match[2].toLowerCase();
  return unit.startsWith('kg') || unit.startsWith('kilogram') ? Number((value * 2.20462).toFixed(1)) : value;
};

const toMeters = (value: number, unit: string): number => {
  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit === 'mm') return Number((value / 1000).toFixed(3));
  if (normalizedUnit === 'cm') return Number((value / 100).toFixed(3));
  if (normalizedUnit === 'in' || normalizedUnit === 'inch' || normalizedUnit === 'inches') return Number((value * 0.0254).toFixed(3));
  if (normalizedUnit === 'ft' || normalizedUnit === 'feet') return Number((value * 0.3048).toFixed(3));
  return value;
};

export const extractReachMeters = (text: string): number | null => {
  const beforeValue = /(?:reach|span|arm|travel|workspace)[^\d]{0,18}(\d+(?:\.\d+)?)\s*(mm|cm|m|meter|meters|in|inch|inches|ft|feet)\b/i.exec(text);
  const afterValue = /(\d+(?:\.\d+)?)\s*(mm|cm|m|meter|meters|in|inch|inches|ft|feet)\b[^.\n,;]{0,18}(?:reach|span|arm|travel|workspace)/i.exec(text);
  const match = beforeValue ?? afterValue;
  return match ? toMeters(normalizedNumber(match[1]), match[2]) : null;
};

export const extractCycleSeconds = (text: string): number | null => {
  const beforeValue = /(?:cycle|move|stroke|pick|place|within|in)[^\d]{0,18}(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)\b/i.exec(text);
  const afterValue = /(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)\b[^.\n,;]{0,18}(?:cycle|move|stroke|pick|place)/i.exec(text);
  const match = beforeValue ?? afterValue;
  return match ? normalizedNumber(match[1]) : null;
};

export const extractDesignIntentChips = (text: string): DesignIntentChip[] => {
  const chips: DesignIntentChip[] = [];
  const normalized = text.trim();
  if (!normalized) return chips;

  const payload = extractPayloadLb(normalized);
  if (payload != null) {
    uniquePush(chips, {
      id: 'payload',
      kind: 'payload',
      label: `Payload ${payload} lb`,
      detail: 'Captured as a task target, still review-required until validated.',
    });
  }

  const reach = extractReachMeters(normalized);
  if (reach != null) {
    uniquePush(chips, {
      id: 'reach',
      kind: 'dimension',
      label: `Reach ${reach} m`,
      detail: 'Captured as a workspace or envelope dimension.',
    });
  }

  const cycle = extractCycleSeconds(normalized);
  if (cycle != null) {
    uniquePush(chips, {
      id: 'cycle',
      kind: 'cycle',
      label: `Cycle ${cycle} s`,
      detail: 'Captured as a timing constraint.',
    });
  }

  for (const term of materialTerms) {
    const expression = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (expression.test(normalized)) {
      uniquePush(chips, {
        id: `material-${term.replace(/\W+/g, '-')}`,
        kind: 'material',
        label: term === 'fr-4' ? 'Material FR-4' : `Material ${term.replace(/-/g, ' ')}`,
        detail: 'Captured as a preferred or avoided material cue.',
      });
    }
  }

  if (/\b(fixed|mount|bolt|hole|bearing|clearance|constraint|constrain|service loop|harness|wiring|wire|connector|ip\d{2})\b/i.test(normalized)) {
    uniquePush(chips, {
      id: 'constraint',
      kind: 'constraint',
      label: 'Constraint noted',
      detail: 'Mounting, clearance, wiring, or serviceability language was found.',
    });
  }

  if (/\b(avoid|must not|without|no cloud|local only|under|less than|max(?:imum)?|budget|weight limit|fit within|restriction)\b/i.test(normalized)) {
    uniquePush(chips, {
      id: 'restriction',
      kind: 'restriction',
      label: 'Restriction noted',
      detail: 'The prompt includes a limit or exclusion that should stay visible.',
    });
  }

  if (chips.length === 0) {
    uniquePush(chips, {
      id: 'intent',
      kind: 'intent',
      label: 'Intent captured',
      detail: 'Ready to start a concept workspace from plain language.',
    });
  }

  return chips;
};

export const taskFromDesignIntent = (baseTask: TaskRequirement, text: string): TaskRequirement => {
  const trimmed = text.trim();
  return {
    ...baseTask,
    label: trimmed || baseTask.label,
    targetPayloadLb: extractPayloadLb(trimmed) ?? baseTask.targetPayloadLb,
    cycleTimeSeconds: extractCycleSeconds(trimmed) ?? baseTask.cycleTimeSeconds,
    reachMeters: extractReachMeters(trimmed) ?? baseTask.reachMeters,
    validationMethod: 'Prompt-captured concept target; engineering validation remains review-required.',
  };
};
