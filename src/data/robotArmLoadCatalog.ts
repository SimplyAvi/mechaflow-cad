import type { CADPrimitiveShape } from '../types';

export type RobotArmLoadUpgradeCategory =
  | 'actuator'
  | 'fastener_set'
  | 'hinge_or_joint'
  | 'sleeve_or_coupler'
  | 'arm_link'
  | 'bracket'
  | 'base_plate'
  | 'end_effector';

export interface RobotArmLoadUpgradeItem {
  id: string;
  name: string;
  category: RobotArmLoadUpgradeCategory;
  partTypes: CADPrimitiveShape[];
  unit: 'lb' | 'N-m';
  ratedValue: number;
  materialId: string | null;
  materialName: string;
  process: string;
  dimensionScale?: number;
  minimumDimensionsMm?: Partial<{
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    diameterMm: number;
    thicknessMm: number;
  }>;
  fastenerSpec?: string;
  changes: string[];
  assumptions: string[];
  source: {
    label: string;
    license: string;
    confidence: string;
  };
}

export const robotArmLoadUpgradeCatalog: RobotArmLoadUpgradeItem[] = [
  {
    id: 'upgrade-100mm-high-torque-shoulder-actuator',
    name: 'Integrated 100 mm high-torque shoulder actuator',
    category: 'actuator',
    partTypes: ['motor_block'],
    unit: 'N-m',
    ratedValue: 36,
    materialId: 'mat-servo-actuator-assembly',
    materialName: 'Mixed servo actuator assembly',
    process: 'off_the_shelf',
    minimumDimensionsMm: { lengthMm: 106, widthMm: 100, heightMm: 100, diameterMm: 82 },
    fastenerSpec: 'M6 class 10.9 servo mounting screws on reviewed 80 mm pattern',
    changes: [
      'Select a larger catalog actuator class with higher nominal torque metadata.',
      'Grow the visual motor envelope so assembly clearance is visible before CAD import.',
      'Upgrade servo mounting screws from small M5 hardware to M6 class 10.9 hardware for review.',
    ],
    assumptions: [
      'Nominal actuator torque is a deterministic local catalog estimate, not a supplier curve.',
      'Thermal rise, backlash, controller current, and gearbox life remain review-required.',
    ],
    source: { label: 'Repository-local robot-arm load upgrade fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'upgrade-m8-class-10-9-fastener-set',
    name: 'M8 class 10.9 robot-arm fastener set',
    category: 'fastener_set',
    partTypes: ['base_plate', 'beam', 'cylinder_joint', 'bracket', 'motor_block', 'tool'],
    unit: 'lb',
    ratedValue: 170,
    materialId: null,
    materialName: 'Alloy steel class 10.9 fasteners',
    process: 'off_the_shelf',
    fastenerSpec: 'M8 class 10.9 bolts or shoulder screws with washers and documented preload',
    changes: [
      'Replace undersized M4 or M5 screw callouts with M8 class 10.9 hardware where geometry allows.',
      'Flag edge distance, thread engagement, and preload as review-required before release.',
    ],
    assumptions: [
      'Fastener rating is a local MVP screen for the smallest loaded fastener, not a standards-certified shear calculation.',
    ],
    source: { label: 'Repository-local robot-arm load upgrade fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'upgrade-thick-wall-sleeve-coupler',
    name: 'Thick-wall 96 mm joint sleeve coupler',
    category: 'sleeve_or_coupler',
    partTypes: ['cylinder_joint'],
    unit: 'lb',
    ratedValue: 118,
    materialId: 'mat-aluminum-6061-t6',
    materialName: 'Aluminum 6061-T6',
    process: 'cnc_machining',
    minimumDimensionsMm: { lengthMm: 106, widthMm: 96, heightMm: 62, diameterMm: 96, thicknessMm: 12 },
    fastenerSpec: 'M8 sleeve clamp screws and reviewed bore fit',
    changes: [
      'Increase sleeve outer diameter and wall thickness while retaining the central bore and slot recipe.',
      'Keep the diagonal lightening slots but require stress concentration review around the slot ends.',
    ],
    assumptions: [
      'Sleeve capacity is a local catalog heuristic for triage only.',
      'Bore fit, clamp torque, fatigue, and slot edge distance remain review-required.',
    ],
    source: { label: 'Repository-local guided sleeve load fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'upgrade-reinforced-aluminum-arm-link',
    name: 'Reinforced 52 x 44 mm aluminum arm link',
    category: 'arm_link',
    partTypes: ['beam'],
    unit: 'lb',
    ratedValue: 112,
    materialId: 'mat-aluminum-6061-t6',
    materialName: 'Aluminum 6061-T6',
    process: 'cnc_machining',
    dimensionScale: 1.14,
    minimumDimensionsMm: { widthMm: 52, heightMm: 44, thicknessMm: 9 },
    fastenerSpec: 'M8 shoulder pin or reviewed double-shear joint hardware',
    changes: [
      'Increase link width, height, and wall thickness to make the higher payload visible in the CAD workspace.',
      'Retain CNC machining so the local material and process records remain compatible.',
    ],
    assumptions: [
      'The link capacity is a deterministic quick screen and does not replace FEA or fatigue testing.',
    ],
    source: { label: 'Repository-local robot-arm link upgrade fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'upgrade-steel-joint-bracket',
    name: 'Steel reinforced hinge or bracket set',
    category: 'hinge_or_joint',
    partTypes: ['cylinder_joint', 'bracket'],
    unit: 'lb',
    ratedValue: 125,
    materialId: 'mat-low-carbon-steel',
    materialName: 'Low-carbon steel',
    process: 'cnc_machining',
    dimensionScale: 1.08,
    minimumDimensionsMm: { widthMm: 88, heightMm: 88, thicknessMm: 10 },
    fastenerSpec: 'M8 shoulder screw or dowel pin plus retained cover screws',
    changes: [
      'Switch the hinge or bracket load path to steel and grow wall thickness for the upscaled requirement.',
      'Keep bearing fit, pin retention, and service access on the review-required list.',
    ],
    assumptions: [
      'Steel upgrade increases stiffness but adds weight; actuator torque is recalculated after self-weight changes.',
    ],
    source: { label: 'Repository-local robot-arm joint upgrade fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'upgrade-12mm-steel-base-plate',
    name: '12 mm steel base plate with M10 anchors',
    category: 'base_plate',
    partTypes: ['base_plate'],
    unit: 'lb',
    ratedValue: 210,
    materialId: 'mat-low-carbon-steel',
    materialName: 'Low-carbon steel',
    process: 'cnc_machining',
    minimumDimensionsMm: { lengthMm: 260, widthMm: 210, heightMm: 12, thicknessMm: 12 },
    fastenerSpec: 'M10 bench anchors with tip-over and pull-out review',
    changes: [
      'Increase base footprint and thickness so overturning reaction has an explicit visual upgrade path.',
      'Move anchor review into the requirement sizing notes.',
    ],
    assumptions: [
      'Bench stiffness and anchor pull-out are not solved by this MVP.',
    ],
    source: { label: 'Repository-local robot-arm base upgrade fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'upgrade-steel-end-effector-bracket',
    name: 'Steel end-effector bracket and M6 jaw pins',
    category: 'end_effector',
    partTypes: ['tool', 'bracket'],
    unit: 'lb',
    ratedValue: 104,
    materialId: 'mat-low-carbon-steel',
    materialName: 'Low-carbon steel',
    process: 'sheet_metal',
    dimensionScale: 1.12,
    minimumDimensionsMm: { widthMm: 76, thicknessMm: 8 },
    fastenerSpec: 'M6 jaw pins and M6 tool screws with edge-distance review',
    changes: [
      'Upgrade wrist or gripper bracket material and pin size for the higher payload.',
      'Keep jaw contact, pinch safety, and tool center of gravity as review-required inputs.',
    ],
    assumptions: [
      'End-effector capacity is a local visual sizing estimate, not a certified gripper rating.',
    ],
    source: { label: 'Repository-local end-effector load upgrade fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
];

export const robotArmLoadUpgradeById = new Map(robotArmLoadUpgradeCatalog.map((item) => [item.id, item]));
