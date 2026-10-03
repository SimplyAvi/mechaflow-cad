import type { BackendMoneyRange, CADPrimitiveShape } from '../types';

export type LocalPartMatchConfidence = 'high' | 'medium' | 'low';

export interface LocalPartCatalogItem {
  id: string;
  name: string;
  aliases: string[];
  partType: string;
  primitive: CADPrimitiveShape;
  category: string;
  assemblyRole: string;
  description: string;
  defaultMaterialId: string;
  materialSummary: string;
  manufacturing: {
    process: string;
    description: string;
    cost: BackendMoneyRange;
    leadTimeDaysMin: number;
    leadTimeDaysMax: number;
    riskNotes: string[];
    confidence: string;
  };
  defaultDimensionsMm: {
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    diameterMm: number | null;
    thicknessMm: number | null;
  };
  color: string;
  keywords: string[];
  criteria: string[];
  featureRecipe?: {
    id: string;
    name: string;
    plane: string;
    profile: string;
    history: Array<{ id: string; label: string; value: string; kind: 'sketch' | 'extrude' | 'cut' | 'finish' | 'placement' }>;
    callouts: Array<{ id: string; label: string; value: string; kind: 'sketch' | 'extrude' | 'cut' | 'finish' | 'placement' }>;
  };
  source: {
    label: string;
    license: string;
    confidence: string;
  };
}

export interface LocalPartCatalogMatch {
  item: LocalPartCatalogItem;
  score: number;
  confidence: LocalPartMatchConfidence;
  matchedTerms: string[];
  reasoning: string;
}

const synonymTokens: Record<string, string[]> = {
  actuator: ['motor', 'servo', 'drive', 'joint'],
  servo: ['actuator', 'motor', 'encoder', 'drive'],
  motor: ['actuator', 'servo', 'drive'],
  joint: ['pivot', 'bearing', 'hub', 'actuator'],
  link: ['arm', 'beam', 'span'],
  arm: ['link', 'beam', 'forearm', 'upper'],
  bracket: ['mount', 'support', 'yoke'],
  base: ['pedestal', 'plate', 'foundation'],
  plate: ['base', 'adapter', 'mount'],
  gripper: ['jaw', 'tool', 'end', 'effector'],
  harness: ['wire', 'connector', 'cable'],
  sleeve: ['coupler', 'collar', 'tube', 'bushing'],
  coupler: ['sleeve', 'collar', 'connector', 'shaft'],
  collar: ['sleeve', 'coupler', 'ring'],
  bore: ['hole', 'inner', 'diameter'],
  slot: ['slots', 'cut', 'lightening'],
  slots: ['slot', 'cuts', 'lightening'],
  round: ['cylindrical', 'sleeve', 'coupler'],
};

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const tokensFor = (value: string): string[] => normalize(value).split(/\s+/).filter((token) => token.length > 1);

const expandedQueryTokens = (query: string): Set<string> => {
  const tokens = new Set(tokensFor(query));
  for (const token of [...tokens]) {
    for (const synonym of synonymTokens[token] ?? []) tokens.add(synonym);
  }
  return tokens;
};

const catalogText = (item: LocalPartCatalogItem): string => [
  item.name,
  item.partType,
  item.primitive,
  item.category,
  item.assemblyRole,
  item.description,
  item.materialSummary,
  item.manufacturing.process,
  item.manufacturing.description,
  ...item.aliases,
  ...item.keywords,
  ...item.criteria,
].join(' ');

const confidenceFor = (score: number): LocalPartMatchConfidence => {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
};

export const localRobotArmPartCatalog: LocalPartCatalogItem[] = [
  {
    id: 'catalog-lightened-joint-sleeve-coupler',
    name: 'Lightened joint sleeve coupler with diagonal slots',
    aliases: ['round arm connector', 'joint sleeve', 'motor coupler', 'cylindrical sleeve', 'bored collar', 'lightweight sleeve with diagonal slots'],
    partType: 'sketch-first sleeve coupler',
    primitive: 'cylinder_joint',
    category: 'robot-arm joint sleeve',
    assemblyRole: 'Fits between the shoulder servo output and arm link as a manufacturable sleeve with a central bore and lightening slots.',
    description: 'SolidWorks-inspired sleeve or coupler recipe with concentric sketch circles, extruded tube body, diagonal rounded slot cuts, and chamfer callouts.',
    defaultMaterialId: 'mat-aluminum-6061-t6',
    materialSummary: 'Aluminum 6061-T6 seed properties for a CNC sleeve or coupler that needs bore fit, slot edge, and fatigue review.',
    manufacturing: {
      process: 'cnc_machining',
      description: 'CNC turn or mill sleeve, bore the center, cut diagonal rounded slots, then chamfer edges after tolerance review.',
      cost: { currency: 'USD', min: 54, max: 168, confidence: 'estimated_from_heuristic' },
      leadTimeDaysMin: 4,
      leadTimeDaysMax: 12,
      riskNotes: ['Bore tolerance, slot stress concentration, chamfer size, and coupling torque path remain review-required.'],
      confidence: 'estimated_from_heuristic',
    },
    defaultDimensionsMm: { lengthMm: 96, widthMm: 86, heightMm: 54, diameterMm: 86, thicknessMm: 8 },
    color: '#22d3ee',
    keywords: ['sleeve', 'coupler', 'collar', 'round', 'cylindrical', 'bore', 'inner', 'outer', 'diameter', 'diagonal', 'slot', 'slots', 'cut', 'chamfer', 'lightweight', 'connector'],
    criteria: ['Outer diameter, inner bore, wall thickness, slot length, slot angle, and chamfer are editable recipe dimensions.', 'Diagonal slots need edge-distance and stress concentration review.', 'Bore fit and torque transfer require named CAD faces before solver or supplier release.'],
    featureRecipe: {
      id: 'recipe-lightened-joint-sleeve-coupler',
      name: 'Sketch, extrude, slot-cut, chamfer sleeve',
      plane: 'Front plane',
      profile: 'Concentric outer circle and central bore with in-viewport OD, ID, wall, and height dimensions',
      history: [
        { id: 'sketch-profile', label: 'Sketch profile', value: 'OD 86 mm, ID 42 mm, wall 8 mm', kind: 'sketch' },
        { id: 'extrude-tube', label: 'Extrude tube', value: '54 mm sleeve height', kind: 'extrude' },
        { id: 'cut-slots', label: 'Cut diagonal slots', value: '2 x rounded slots, 48 mm long at 32 deg', kind: 'cut' },
        { id: 'finish-chamfer', label: 'Chamfer edges', value: '2 mm edge break placeholder', kind: 'finish' },
        { id: 'place-assembly', label: 'Place in assembly', value: 'Shoulder servo to upper arm link', kind: 'placement' },
      ],
      callouts: [
        { id: 'od', label: 'Outer diameter', value: '86 mm', kind: 'sketch' },
        { id: 'id', label: 'Central bore', value: '42 mm', kind: 'sketch' },
        { id: 'slot', label: 'Diagonal rounded slot', value: '48 mm x 14 mm at 32 deg', kind: 'cut' },
        { id: 'height', label: 'Extrude height', value: '54 mm', kind: 'extrude' },
        { id: 'chamfer', label: 'Chamfer', value: '2 mm', kind: 'finish' },
      ],
    },
    source: { label: 'Repository-local guided CAD recipe fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'catalog-shoulder-servo-actuator-80mm',
    name: 'Integrated 80 mm shoulder servo actuator',
    aliases: ['joint motor', 'servo actuator', 'shoulder motor', 'robot arm motor', 'harmonic drive actuator'],
    partType: 'servo actuator',
    primitive: 'motor_block',
    category: 'off-the-shelf joint actuator',
    assemblyRole: 'Bolts beside the shoulder yoke and drives the first robot arm axis while the controller and harness remain visible.',
    description: 'Compact off-the-shelf rotary actuator proxy with motor, gearbox, encoder, and mounting face metadata for visual layout.',
    defaultMaterialId: 'mat-servo-actuator-assembly',
    materialSummary: 'Mixed aluminum housing, steel shaft, copper windings, and electronics represented as an off-the-shelf actuator assembly.',
    manufacturing: {
      process: 'off_the_shelf',
      description: 'Buy matched servo actuator package with torque curve, encoder, and mounting pattern review before release.',
      cost: { currency: 'USD', min: 145, max: 420, confidence: 'estimated_from_heuristic' },
      leadTimeDaysMin: 3,
      leadTimeDaysMax: 21,
      riskNotes: ['Torque curve, thermal rise, gearbox backlash, mounting bolts, and controller compatibility remain review-required.'],
      confidence: 'estimated_from_heuristic',
    },
    defaultDimensionsMm: { lengthMm: 86, widthMm: 80, heightMm: 80, diameterMm: 64, thicknessMm: null },
    color: '#fb7185',
    keywords: ['servo', 'motor', 'actuator', 'joint', 'drive', 'encoder', 'torque', 'shoulder'],
    criteria: ['Torque and heat require a supplier curve.', 'Mounting pattern must be checked against the yoke.', 'Harness bend and service loop stay review-required.'],
    source: { label: 'Repository-local robot-arm part fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'catalog-pocketed-aluminum-arm-link-285mm',
    name: 'Pocketed aluminum arm link, 285 mm',
    aliases: ['arm link', 'upper arm', 'link beam', 'robot arm segment', 'forearm link'],
    partType: 'load-bearing arm link',
    primitive: 'beam',
    category: 'load-bearing link',
    assemblyRole: 'Spans between a revolute joint pair and carries bending load across the preserved reach target.',
    description: 'Machined rectangular arm segment with rib and pin-hole metadata for the visual CAD workspace.',
    defaultMaterialId: 'mat-aluminum-6061-t6',
    materialSummary: 'Aluminum 6061-T6 seed properties for stiffness, mass, and CNC review.',
    manufacturing: {
      process: 'cnc_machining',
      description: 'CNC pocketed arm link with pin holes and rib depth left for CAD review.',
      cost: { currency: 'USD', min: 70, max: 210, confidence: 'estimated_from_heuristic' },
      leadTimeDaysMin: 3,
      leadTimeDaysMax: 10,
      riskNotes: ['Rib depth, edge distance, bearing fits, and fatigue life are not solved by the visual MVP.'],
      confidence: 'estimated_from_heuristic',
    },
    defaultDimensionsMm: { lengthMm: 285, widthMm: 42, heightMm: 36, diameterMm: null, thicknessMm: 6 },
    color: '#60a5fa',
    keywords: ['arm', 'link', 'beam', 'segment', 'forearm', 'upper', 'load', 'bearing'],
    criteria: ['Deflection at reach needs FEA or test evidence.', 'Pin holes need named CAD faces before solver handoff.', 'Material substitution must preserve the active task.'],
    source: { label: 'Repository-local robot-arm part fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'catalog-revolute-bearing-joint-hub-74mm',
    name: 'Revolute bearing joint hub, 74 mm',
    aliases: ['joint hub', 'elbow joint', 'bearing joint', 'rotating joint', 'pivot hub'],
    partType: 'revolute joint',
    primitive: 'cylinder_joint',
    category: 'rotating joint hub',
    assemblyRole: 'Sits between arm links to carry bending moment and expose the pivot axis for selection.',
    description: 'Cylindrical joint proxy with bearing bore and cover metadata for arm assembly layout.',
    defaultMaterialId: 'mat-aluminum-6061-t6',
    materialSummary: 'Aluminum 6061-T6 joint hub seed with bearing bore review.',
    manufacturing: {
      process: 'cnc_machining',
      description: 'CNC hub with bearing pocket, pin retention, and cover clearance review.',
      cost: { currency: 'USD', min: 62, max: 180, confidence: 'estimated_from_heuristic' },
      leadTimeDaysMin: 3,
      leadTimeDaysMax: 10,
      riskNotes: ['Bearing fit, set-screw retention, and dynamic shock loads require engineering review.'],
      confidence: 'estimated_from_heuristic',
    },
    defaultDimensionsMm: { lengthMm: 88, widthMm: 74, heightMm: 74, diameterMm: 74, thicknessMm: 8 },
    color: '#a78bfa',
    keywords: ['joint', 'hub', 'bearing', 'pivot', 'revolute', 'elbow', 'axis'],
    criteria: ['Bearing contact pressure is not solved.', 'Fixture and contact regions need CAD naming.', 'Actuator torque path must be reviewed.'],
    source: { label: 'Repository-local robot-arm part fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'catalog-sheet-metal-gripper-bracket',
    name: 'Sheet metal gripper bracket',
    aliases: ['gripper bracket', 'tool bracket', 'end effector bracket', 'wrist bracket', 'mounting bracket'],
    partType: 'mounting bracket',
    primitive: 'bracket',
    category: 'tool mounting bracket',
    assemblyRole: 'Adapts wrist tooling or sensors to the end effector while keeping fasteners serviceable.',
    description: 'Bent bracket proxy with hole pattern and flange dimensions for visual part authoring.',
    defaultMaterialId: 'mat-low-carbon-steel',
    materialSummary: 'Low-carbon steel seed for sheet-metal stiffness and bend review.',
    manufacturing: {
      process: 'sheet_metal',
      description: 'Laser cut and bent bracket with bend allowance and hole edge distance review.',
      cost: { currency: 'USD', min: 18, max: 58, confidence: 'estimated_from_heuristic' },
      leadTimeDaysMin: 3,
      leadTimeDaysMax: 9,
      riskNotes: ['Bend radius, fastener edge distance, and tool access are review-required.'],
      confidence: 'estimated_from_heuristic',
    },
    defaultDimensionsMm: { lengthMm: 88, widthMm: 54, heightMm: 74, diameterMm: null, thicknessMm: 4 },
    color: '#f59e0b',
    keywords: ['bracket', 'mount', 'gripper', 'tool', 'wrist', 'sheet', 'metal', 'support'],
    criteria: ['Bend allowance and tolerances require fabrication review.', 'Fastener access should stay visible in the assembly.', 'Payload path is review-required until solved.'],
    source: { label: 'Repository-local robot-arm part fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
  {
    id: 'catalog-cnc-base-pedestal-plate',
    name: 'CNC steel base pedestal plate',
    aliases: ['base plate', 'pedestal plate', 'robot base', 'mounting plate', 'fixed base'],
    partType: 'base plate',
    primitive: 'base_plate',
    category: 'fixed base',
    assemblyRole: 'Anchors the robot arm to the bench and reacts shoulder torque and tip-over loads.',
    description: 'Heavy steel base plate proxy with anchor pattern metadata for the robot-arm demo.',
    defaultMaterialId: 'mat-low-carbon-steel',
    materialSummary: 'Low-carbon steel seed chosen for stiffness and mass in a bench-mounted base.',
    manufacturing: {
      process: 'cnc_machining',
      description: 'CNC cut or waterjet base plate with drilled and deburred mounting pattern.',
      cost: { currency: 'USD', min: 42, max: 130, confidence: 'estimated_from_heuristic' },
      leadTimeDaysMin: 3,
      leadTimeDaysMax: 10,
      riskNotes: ['Anchor pull-out, bench stiffness, and tip-over checks remain review-required.'],
      confidence: 'estimated_from_heuristic',
    },
    defaultDimensionsMm: { lengthMm: 220, widthMm: 180, heightMm: 10, diameterMm: null, thicknessMm: 10 },
    color: '#64748b',
    keywords: ['base', 'plate', 'pedestal', 'anchor', 'bench', 'mounting', 'foundation'],
    criteria: ['Anchor bolt pattern and bench stiffness need review.', 'Mass is a seed estimate until CAD worker recalculates it.', 'Keep controller and harness access serviceable.'],
    source: { label: 'Repository-local robot-arm part fixture', license: 'MIT local demo seed', confidence: 'estimated_from_heuristic' },
  },
];

export const matchLocalPartCatalog = (
  query: string,
  catalog: LocalPartCatalogItem[] = localRobotArmPartCatalog,
  limit = 3,
): LocalPartCatalogMatch[] => {
  const normalizedQuery = normalize(query);
  const queryTokens = expandedQueryTokens(query);
  const hasQuery = normalizedQuery.length > 0;

  return catalog
    .map((item) => {
      const itemTokens = new Set(tokensFor(catalogText(item)));
      const matchedTokens = [...queryTokens].filter((token) => itemTokens.has(token));
      const phraseMatches = [...item.aliases, item.name, item.partType, item.category]
        .map((phrase) => normalize(phrase))
        .filter((phrase) => hasQuery && phrase.length > 0 && normalizedQuery.includes(phrase));
      const rawScore = matchedTokens.length * 6 + phraseMatches.length * 14;
      const score = rawScore === 0 ? 18 : Math.min(96, 28 + rawScore * 3);
      const matchedTerms = [...new Set([...phraseMatches, ...matchedTokens])].slice(0, 8);
      const confidence = confidenceFor(score);
      const reasoning = rawScore === 0
        ? 'No strong local catalog term matched. Use this as an editable starter and confirm the part type, material, and dimensions.'
        : `Matched ${matchedTerms.join(', ')} against ${item.partType}, role, aliases, and process metadata.`;
      return { item, score, confidence, matchedTerms, reasoning };
    })
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, limit);
};
