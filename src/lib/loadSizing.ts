import { robotArmLoadUpgradeById, robotArmLoadUpgradeCatalog, type RobotArmLoadUpgradeCategory, type RobotArmLoadUpgradeItem } from '../data/robotArmLoadCatalog';
import type { BackendPart, BackendProject, CADPrimitiveShape, Part } from '../types';

export type RobotArmLoadFindingStatus = 'ok' | 'watch' | 'undersized';
export type RobotArmLoadCheckKind = 'payload_capacity' | 'fastener_capacity' | 'actuator_torque' | 'wiring_or_controls';

export interface RobotArmLoadRequirement {
  payloadLb: number;
  assemblySelfWeightLb: number;
  reachMeters: number;
  safetyFactor: number;
}

export interface RobotArmLoadFix {
  upgradeId: string;
  label: string;
  summary: string;
  buttonLabel: string;
  changes: string[];
  assumptions: string[];
}

export interface RobotArmLoadSizingFinding {
  id: string;
  partId: string | null;
  partName: string;
  category: RobotArmLoadUpgradeCategory | 'electronics_or_controls';
  componentRole: string;
  checkKind: RobotArmLoadCheckKind;
  status: RobotArmLoadFindingStatus;
  requiredValue: number;
  ratedValue: number | null;
  unit: 'lb' | 'N-m';
  utilization: number | null;
  reason: string;
  evidence: string;
  fix: RobotArmLoadFix | null;
}

export interface RobotArmLoadSizingResult {
  requirement: RobotArmLoadRequirement;
  workingLoadLb: number;
  designReviewLoadLb: number;
  effectiveShoulderTorqueNm: number;
  summaryStatus: RobotArmLoadFindingStatus;
  undersizedCount: number;
  watchCount: number;
  impactedPartIds: string[];
  assumptions: string[];
  findings: RobotArmLoadSizingFinding[];
}

const LB_TO_NEWTON = 4.44822;
const BASELINE_SAFETY_FACTOR = 2;
const SHOULDER_EFFECTIVE_MOMENT_FACTOR = 0.052;

const round = (value: number, decimals = 1): number => Number(value.toFixed(decimals));

const positive = (value: number | null | undefined, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
);

const textForPart = (part: Part): string => [
  part.id,
  part.name,
  part.subassembly,
  part.purpose,
  part.authoring.primitive,
  part.material,
  part.manufacturingProcess,
].join(' ').toLowerCase();

const numberFromCriterion = (part: Part, criterionId: string, unit: string): number | null => {
  const criterion = part.designCriteria.find((candidate) => candidate.id === criterionId);
  const match = criterion?.value.match(/([0-9]+(?:\.[0-9]+)?)\s*/);
  if (!match || !criterion?.value.toLowerCase().includes(unit.toLowerCase())) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const loadCapacityForPart = (part: Part): number | null => numberFromCriterion(part, 'load-capacity', 'lb');

const actuatorTorqueForPart = (part: Part): number | null => (
  numberFromCriterion(part, 'actuator-torque', 'N-m')
  ?? (textForPart(part).includes('high-torque') || textForPart(part).includes('100 mm') ? 36 : null)
  ?? (textForPart(part).includes('servo') || textForPart(part).includes('actuator') || part.authoring.primitive === 'motor_block' ? 18.5 : null)
);

const estimatePartWeightLb = (part: Part): number => {
  if (part.weightLb != null && Number.isFinite(part.weightLb) && part.weightLb > 0) return part.weightLb;
  const fallbackByPrimitive: Record<CADPrimitiveShape, number> = {
    base_plate: 2.3,
    beam: 0.62,
    cylinder_joint: 0.68,
    bracket: 0.48,
    motor_block: 1.8,
    connector: 0.12,
    electronics: 0.1,
    tool: 0.34,
  };
  return fallbackByPrimitive[part.authoring.primitive];
};

export const estimateAssemblySelfWeightLb = (parts: Part[]): number => round(
  parts.reduce((sum, part) => sum + estimatePartWeightLb(part), 0),
  1,
);

const classifyPart = (part: Part): RobotArmLoadUpgradeCategory | 'electronics_or_controls' => {
  const text = textForPart(part);
  if (part.authoring.primitive === 'electronics' || text.includes('pcb') || text.includes('controller')) return 'electronics_or_controls';
  if (part.authoring.primitive === 'motor_block' || text.includes('servo') || text.includes('actuator') || text.includes('motor')) return 'actuator';
  if (part.authoring.featureRecipe || text.includes('sleeve') || text.includes('coupler') || text.includes('collar') || text.includes('bore')) return 'sleeve_or_coupler';
  if (part.authoring.primitive === 'base_plate' || text.includes('base plate') || text.includes('pedestal')) return 'base_plate';
  if (part.authoring.primitive === 'bracket' || text.includes('bracket') || text.includes('yoke')) return 'bracket';
  if (part.authoring.primitive === 'cylinder_joint' || text.includes('joint') || text.includes('hub') || text.includes('hinge')) return 'hinge_or_joint';
  if (text.includes('finger') || text.includes('gripper') || text.includes('jaw') || text.includes('wrist') || text.includes('tool plate') || text.includes('end effector')) return 'end_effector';
  if (part.authoring.primitive === 'beam' || text.includes('arm link') || text.includes('forearm') || text.includes('upper arm') || text.includes('link')) return 'arm_link';
  return 'bracket';
};

const roleLabel = (category: RobotArmLoadSizingFinding['category']): string => {
  const labels: Record<RobotArmLoadSizingFinding['category'], string> = {
    actuator: 'Motor or servo torque path',
    fastener_set: 'Screws, bolts, and fastener material',
    hinge_or_joint: 'Hinge, bearing, or joint load path',
    sleeve_or_coupler: 'Sleeve or coupler geometry',
    arm_link: 'Arm link bending member',
    bracket: 'Bracket or yoke support',
    base_plate: 'Base plate and anchor reaction',
    end_effector: 'Wrist, bracket, or gripper load path',
    electronics_or_controls: 'Controller and harness current review',
  };
  return labels[category];
};

const roleLoadFactor = (category: RobotArmLoadSizingFinding['category']): number => {
  const factors: Record<RobotArmLoadSizingFinding['category'], number> = {
    actuator: 1,
    fastener_set: 1,
    hinge_or_joint: 1,
    sleeve_or_coupler: 0.95,
    arm_link: 1,
    bracket: 0.92,
    base_plate: 0.7,
    end_effector: 0.85,
    electronics_or_controls: 0.3,
  };
  return factors[category];
};

const defaultCapacityFor = (category: RobotArmLoadSizingFinding['category']): number | null => {
  const defaults: Record<RobotArmLoadSizingFinding['category'], number | null> = {
    actuator: null,
    fastener_set: null,
    hinge_or_joint: 68,
    sleeve_or_coupler: 74,
    arm_link: 66,
    bracket: 76,
    base_plate: 140,
    end_effector: 56,
    electronics_or_controls: null,
  };
  return defaults[category];
};

const statusFromUtilization = (utilization: number | null): RobotArmLoadFindingStatus => {
  if (utilization == null) return 'watch';
  if (utilization > 1) return 'undersized';
  if (utilization >= 0.82) return 'watch';
  return 'ok';
};

const smallestFastenerSize = (fasteners: string[]): number | null => {
  const sizes = fasteners.flatMap((fastener) => {
    const match = fastener.match(/m(\d+)/i);
    return match ? [Number(match[1])] : [];
  }).filter((value) => Number.isFinite(value) && value > 0);
  return sizes.length === 0 ? null : Math.min(...sizes);
};

const fastenerRatedLb = (fasteners: string[]): number | null => {
  const size = smallestFastenerSize(fasteners);
  if (size == null) return null;
  if (size >= 10) return 240;
  if (size >= 8) return 170;
  if (size >= 6) return 112;
  if (size >= 5) return 76;
  if (size >= 4) return 54;
  return 30;
};

const upgradeForCategory = (category: RobotArmLoadSizingFinding['category']): RobotArmLoadUpgradeItem | null => {
  const upgradeIdByCategory: Record<RobotArmLoadSizingFinding['category'], string | null> = {
    actuator: 'upgrade-100mm-high-torque-shoulder-actuator',
    fastener_set: 'upgrade-m8-class-10-9-fastener-set',
    hinge_or_joint: 'upgrade-steel-joint-bracket',
    sleeve_or_coupler: 'upgrade-thick-wall-sleeve-coupler',
    arm_link: 'upgrade-reinforced-aluminum-arm-link',
    bracket: 'upgrade-steel-joint-bracket',
    base_plate: 'upgrade-12mm-steel-base-plate',
    end_effector: 'upgrade-steel-end-effector-bracket',
    electronics_or_controls: null,
  };
  const upgradeId = upgradeIdByCategory[category];
  return upgradeId ? robotArmLoadUpgradeById.get(upgradeId) ?? null : null;
};

const fixFor = (category: RobotArmLoadSizingFinding['category'], status: RobotArmLoadFindingStatus): RobotArmLoadFix | null => {
  if (status === 'ok') return null;
  const upgrade = upgradeForCategory(category);
  if (!upgrade) return null;
  return {
    upgradeId: upgrade.id,
    label: upgrade.name,
    summary: `${upgrade.name} raises the local ${roleLabel(category).toLowerCase()} check to ${upgrade.ratedValue} ${upgrade.unit}.`,
    buttonLabel: status === 'undersized' ? 'Apply deterministic fix' : 'Inspect or apply upgrade',
    changes: upgrade.changes,
    assumptions: upgrade.assumptions,
  };
};

const structuralFindingForPart = (
  part: Part,
  category: RobotArmLoadSizingFinding['category'],
  requirement: RobotArmLoadRequirement,
  workingLoadLb: number,
): RobotArmLoadSizingFinding | null => {
  if (category === 'actuator') {
    const ratedTorqueNm = actuatorTorqueForPart(part);
    const requiredTorqueNm = requirement.reachMeters * workingLoadLb * LB_TO_NEWTON * SHOULDER_EFFECTIVE_MOMENT_FACTOR * requirement.safetyFactor;
    const utilization = ratedTorqueNm == null ? null : requiredTorqueNm / ratedTorqueNm;
    const status = statusFromUtilization(utilization);
    return {
      id: `${part.id}-actuator-torque`,
      partId: part.id,
      partName: part.name,
      category,
      componentRole: roleLabel(category),
      checkKind: 'actuator_torque',
      status,
      requiredValue: round(requiredTorqueNm, 1),
      ratedValue: ratedTorqueNm == null ? null : round(ratedTorqueNm, 1),
      unit: 'N-m',
      utilization: utilization == null ? null : round(utilization, 2),
      reason: `${part.name} must react the payload plus machine self-weight through the shoulder torque path at ${requirement.reachMeters.toFixed(2)} m reach.`,
      evidence: 'Uses local actuator torque metadata when present, otherwise the deterministic 80 mm servo seed. Supplier torque curves and heat rise remain review-required.',
      fix: fixFor(category, status),
    };
  }

  if (category === 'electronics_or_controls') {
    const required = workingLoadLb >= 75 ? 1 : 0.65;
    const rated = 1;
    const utilization = required / rated;
    const status = statusFromUtilization(utilization);
    return {
      id: `${part.id}-control-current-review`,
      partId: part.id,
      partName: part.name,
      category,
      componentRole: roleLabel(category),
      checkKind: 'wiring_or_controls',
      status,
      requiredValue: round(required, 2),
      ratedValue: rated,
      unit: 'lb',
      utilization: round(utilization, 2),
      reason: `${part.name} is not a structural lift member, but a higher payload can increase actuator current and harness heat.`,
      evidence: 'Control electronics remain review-required until current draw, duty cycle, connector ratings, and thermal paths are known.',
      fix: null,
    };
  }

  const safetyMultiplier = Math.max(0.75, requirement.safetyFactor / BASELINE_SAFETY_FACTOR);
  const required = workingLoadLb * roleLoadFactor(category) * safetyMultiplier;
  const rated = loadCapacityForPart(part) ?? defaultCapacityFor(category);
  const utilization = rated == null ? null : required / rated;
  const status = statusFromUtilization(utilization);
  return {
    id: `${part.id}-payload-capacity`,
    partId: part.id,
    partName: part.name,
    category,
    componentRole: roleLabel(category),
    checkKind: 'payload_capacity',
    status,
    requiredValue: round(required, 1),
    ratedValue: rated == null ? null : round(rated, 1),
    unit: 'lb',
    utilization: utilization == null ? null : round(utilization, 2),
    reason: `${part.name} is checked against payload plus machine self-weight using the ${roleLabel(category).toLowerCase()} load factor.`,
    evidence: 'Seed capacity and material/process criteria are deterministic MVP triage values. They are not FEA, standards certification, or supplier warranty data.',
    fix: fixFor(category, status),
  };
};

const fastenerFindingForPart = (
  part: Part,
  category: RobotArmLoadSizingFinding['category'],
  requirement: RobotArmLoadRequirement,
  workingLoadLb: number,
): RobotArmLoadSizingFinding | null => {
  if (part.fasteners.length === 0 || category === 'electronics_or_controls') return null;
  const safetyMultiplier = Math.max(0.75, requirement.safetyFactor / BASELINE_SAFETY_FACTOR);
  const required = workingLoadLb * Math.min(1, roleLoadFactor(category) + 0.08) * safetyMultiplier;
  const rated = fastenerRatedLb(part.fasteners);
  const utilization = rated == null ? null : required / rated;
  const status = statusFromUtilization(utilization);
  if (status === 'ok' && category !== 'actuator') return null;
  const smallestSize = smallestFastenerSize(part.fasteners);
  return {
    id: `${part.id}-fastener-capacity`,
    partId: part.id,
    partName: part.name,
    category: 'fastener_set',
    componentRole: roleLabel('fastener_set'),
    checkKind: 'fastener_capacity',
    status,
    requiredValue: round(required, 1),
    ratedValue: rated == null ? null : round(rated, 1),
    unit: 'lb',
    utilization: utilization == null ? null : round(utilization, 2),
    reason: `${part.name} has ${part.fasteners.join(', ')}. The smallest visible screw family must be reviewed when payload increases.`,
    evidence: smallestSize == null
      ? 'No metric fastener size was parsed from the local seed strings, so this remains editable and review-required.'
      : `Smallest parsed metric fastener is M${smallestSize}. Rating is a deterministic local screen for fastener material and size, not a standards table.`,
    fix: fixFor('fastener_set', status),
  };
};

const sortFindings = (findings: RobotArmLoadSizingFinding[]): RobotArmLoadSizingFinding[] => {
  const statusRank: Record<RobotArmLoadFindingStatus, number> = { undersized: 0, watch: 1, ok: 2 };
  const kindRank: Record<RobotArmLoadCheckKind, number> = { actuator_torque: 0, payload_capacity: 1, fastener_capacity: 2, wiring_or_controls: 3 };
  return [...findings].sort((left, right) => (
    statusRank[left.status] - statusRank[right.status]
    || kindRank[left.checkKind] - kindRank[right.checkKind]
    || (right.utilization ?? 0) - (left.utilization ?? 0)
    || left.partName.localeCompare(right.partName)
  ));
};

export const assessRobotArmLoadRequirement = (
  parts: Part[],
  requirement: RobotArmLoadRequirement,
): RobotArmLoadSizingResult => {
  const payloadLb = positive(requirement.payloadLb, 0);
  const assemblySelfWeightLb = positive(requirement.assemblySelfWeightLb, 0);
  const reachMeters = positive(requirement.reachMeters, 0.65);
  const safetyFactor = positive(requirement.safetyFactor, BASELINE_SAFETY_FACTOR);
  const normalizedRequirement = { payloadLb, assemblySelfWeightLb, reachMeters, safetyFactor };
  const workingLoadLb = round(payloadLb + assemblySelfWeightLb, 1);
  const designReviewLoadLb = round(workingLoadLb * safetyFactor, 1);
  const effectiveShoulderTorqueNm = round(reachMeters * workingLoadLb * LB_TO_NEWTON * SHOULDER_EFFECTIVE_MOMENT_FACTOR * safetyFactor, 1);
  const findings = sortFindings(parts.flatMap((part) => {
    const category = classifyPart(part);
    const structural = structuralFindingForPart(part, category, normalizedRequirement, workingLoadLb);
    const fastener = fastenerFindingForPart(part, category, normalizedRequirement, workingLoadLb);
    return [structural, fastener].filter((finding): finding is RobotArmLoadSizingFinding => finding != null);
  }));
  const undersizedCount = findings.filter((finding) => finding.status === 'undersized').length;
  const watchCount = findings.filter((finding) => finding.status === 'watch').length;
  const impactedPartIds = [...new Set(findings
    .filter((finding) => finding.partId && finding.status !== 'ok')
    .map((finding) => finding.partId as string))];
  const summaryStatus: RobotArmLoadFindingStatus = undersizedCount > 0 ? 'undersized' : watchCount > 0 ? 'watch' : 'ok';

  return {
    requirement: normalizedRequirement,
    workingLoadLb,
    designReviewLoadLb,
    effectiveShoulderTorqueNm,
    summaryStatus,
    undersizedCount,
    watchCount,
    impactedPartIds,
    assumptions: [
      'Requirement load equals target payload plus the visible assembly self-weight estimate before safety-factor review.',
      `Safety factor ${safetyFactor.toFixed(1)} scales the review load. The local catalog assumes ${BASELINE_SAFETY_FACTOR.toFixed(1)} as the baseline unless the user changes it.`,
      'Component checks use deterministic seed capacity, torque, fastener-size, and geometry heuristics for MVP triage only.',
      'This is not FEA, certification, supplier warranty, or a replacement for engineering review.',
    ],
    findings,
  };
};

const upgradedDimension = (currentValue: number | null | undefined, minimumValue: number | null | undefined, scale: number): number | null => {
  const scaled = currentValue != null ? currentValue * scale : 0;
  const nextValue = Math.max(currentValue ?? 0, minimumValue ?? 0, scaled);
  return nextValue > 0 ? round(nextValue, 2) : currentValue ?? null;
};

const toBackendDimensions = (minimum: RobotArmLoadUpgradeItem['minimumDimensionsMm'] = {}, current: BackendPart['dimensions'], scale = 1) => ({
  ...current,
  length_mm: upgradedDimension(current.length_mm, minimum.lengthMm, scale),
  width_mm: upgradedDimension(current.width_mm, minimum.widthMm, scale),
  height_mm: upgradedDimension(current.height_mm, minimum.heightMm, scale),
  diameter_mm: upgradedDimension(current.diameter_mm, minimum.diameterMm, scale),
  thickness_mm: upgradedDimension(current.thickness_mm, minimum.thicknessMm, scale),
});

const manufacturingOptionForUpgrade = (part: BackendPart, upgrade: RobotArmLoadUpgradeItem) => {
  const existing = part.manufacturing_options.find((option) => option.process === upgrade.process);
  if (existing) {
    return {
      ...existing,
      description: `${existing.description} Requirement sizing upgrade path: ${upgrade.name}.`,
      risk_notes: [...new Set([...existing.risk_notes, ...upgrade.assumptions])],
      confidence: upgrade.source.confidence,
    };
  }
  return {
    id: `mfg-${upgrade.id}-${upgrade.process}`,
    process: upgrade.process,
    description: `Catalog-backed requirement sizing option for ${upgrade.name}.`,
    cost: null,
    lead_time_days_min: null,
    lead_time_days_max: null,
    supplier_url: null,
    risk_notes: upgrade.assumptions,
    confidence: upgrade.source.confidence,
  };
};

const upgradedFasteners = (part: BackendPart, upgrade: RobotArmLoadUpgradeItem): string[] => {
  if (!upgrade.fastenerSpec) return part.related_fasteners;
  const prefix = upgrade.fastenerSpec.toLowerCase().startsWith('m10') ? 'm10-10.9' : upgrade.fastenerSpec.toLowerCase().startsWith('m6') ? 'm6-10.9' : 'm8-10.9';
  const count = Math.max(2, part.related_fasteners.length || 4);
  return Array.from({ length: count }, (_, index) => `${prefix}-${part.id}-${index + 1}`);
};

const applyUpgradeToPart = (
  part: BackendPart,
  upgrade: RobotArmLoadUpgradeItem,
  finding: RobotArmLoadSizingFinding,
  requirement: RobotArmLoadRequirement,
): BackendPart => {
  const dimensions = toBackendDimensions(upgrade.minimumDimensionsMm, part.dimensions, upgrade.dimensionScale ?? 1);
  const dimensionMetadata = {
    ...(part.dimensions.metadata ?? {}),
    ...(upgrade.category === 'actuator' ? { nominal_output_torque_nm: upgrade.ratedValue } : {}),
    requirement_sizing_upgrade_id: upgrade.id,
    requirement_sizing_units: upgrade.unit,
  };
  const manufacturingOption = manufacturingOptionForUpgrade(part, upgrade);
  const nextOptions = [
    manufacturingOption,
    ...part.manufacturing_options.filter((option) => option.id !== manufacturingOption.id && option.process !== manufacturingOption.process),
  ];
  const existingDemoCriteria = part.metadata && typeof part.metadata.demo_design_criteria === 'object' && !Array.isArray(part.metadata.demo_design_criteria)
    ? part.metadata.demo_design_criteria as Record<string, unknown>
    : {};
  const nextDemoCriteria = {
    ...existingDemoCriteria,
    ...(upgrade.unit === 'lb' ? { load_capacity_lb: upgrade.ratedValue, load_capacity_status: upgrade.source.confidence } : {}),
    ...(upgrade.unit === 'N-m' ? { actuator_torque_nm: upgrade.ratedValue, actuator_torque_status: upgrade.source.confidence } : {}),
    load_capacity_note: `${upgrade.name} was applied from the deterministic local upgrade catalog for ${requirement.payloadLb} lb payload plus ${requirement.assemblySelfWeightLb} lb self-weight at safety factor ${requirement.safetyFactor}. This remains review-required and not FEA.`,
  };
  const metadata = {
    ...part.metadata,
    preferred_manufacturing_process: upgrade.process,
    demo_design_criteria: nextDemoCriteria,
    requirement_sizing_upgrade: {
      upgrade_id: upgrade.id,
      upgrade_name: upgrade.name,
      finding_id: finding.id,
      finding_status_before_upgrade: finding.status,
      required_value: finding.requiredValue,
      rated_value_after_upgrade: upgrade.ratedValue,
      unit: upgrade.unit,
      requirement,
      source: upgrade.source,
      changes: upgrade.changes,
      assumptions: upgrade.assumptions,
      review_required: true,
    },
  };
  return {
    ...part,
    name: part.name.includes(upgrade.name) ? part.name : `${part.name} - ${upgrade.name}`,
    material_id: upgrade.materialId ?? part.material_id,
    dimensions: { ...dimensions, metadata: dimensionMetadata },
    mass_kg: null,
    manufacturing_options: nextOptions,
    related_fasteners: upgradedFasteners(part, upgrade),
    metadata,
  };
};

export const applyRobotArmLoadFixesToProject = (
  project: BackendProject,
  findings: RobotArmLoadSizingFinding[],
  requirement: RobotArmLoadRequirement,
): BackendProject => {
  const actionable = findings.filter((finding) => finding.fix && finding.partId);
  if (actionable.length === 0) return project;
  const upgradeIds = new Set(actionable.map((finding) => finding.fix!.upgradeId));
  const missing = [...upgradeIds].filter((id) => !robotArmLoadUpgradeById.has(id));
  if (missing.length > 0) return project;
  const findingsByPart = new Map<string, RobotArmLoadSizingFinding[]>();
  for (const finding of actionable) {
    const partFindings = findingsByPart.get(finding.partId!) ?? [];
    partFindings.push(finding);
    findingsByPart.set(finding.partId!, partFindings);
  }
  const next = structuredClone(project) as BackendProject;
  next.assemblies = next.assemblies.map((assembly) => ({
    ...assembly,
    parts: assembly.parts.map((part) => {
      const partFindings = findingsByPart.get(part.id);
      if (!partFindings) return part;
      return partFindings.reduce((currentPart, finding) => {
        const upgrade = robotArmLoadUpgradeById.get(finding.fix!.upgradeId);
        return upgrade ? applyUpgradeToPart(currentPart, upgrade, finding, requirement) : currentPart;
      }, part);
    }),
  }));
  next.updated_at = new Date().toISOString();
  next.metadata = {
    ...(next.metadata ?? {}),
    requirement_sizing_last_result: {
      requirement,
      applied_upgrade_ids: [...upgradeIds],
      review_required: true,
      source_catalog: robotArmLoadUpgradeCatalog.map((item) => item.id),
    },
  };
  return next;
};
