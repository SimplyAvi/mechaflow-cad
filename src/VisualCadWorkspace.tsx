import { useMemo, useRef, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import type { AuthoringUnit, Part, PartAuthoringData, PartAuthoringDimensions, WiringRoute } from './types';
import { formatLength, lengthFromMm } from './lib/visualAuthoring';

interface ViewState {
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  panX: number;
  panY: number;
}

interface VisualCadWorkspaceProps {
  parts: Part[];
  wiringRoutes: WiringRoute[];
  selectedPartId: string;
  focusedPartId: string | null;
  units: AuthoringUnit;
  explodePercent: number;
  view: ViewState;
  onViewChange: (view: ViewState) => void;
  onSelectPart: (partId: string) => void;
  onNudgeSelected: (delta: { x: number; y: number; z: number }) => void;
}

interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface BoxFace {
  points: ProjectedPoint[];
  className: string;
}

const SVG_WIDTH = 1080;
const SVG_HEIGHT = 640;
const GRID_EXTENT_MM = 500;
const GRID_STEP_MM = 50;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const pointString = (points: ProjectedPoint[]): string => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

const dimensionValue = (dimensions: PartAuthoringDimensions, primitive: PartAuthoringData['primitive']): number | null => {
  if (primitive === 'cylinder_joint') return dimensions.diameterMm ?? dimensions.widthMm ?? dimensions.lengthMm;
  return dimensions.lengthMm ?? dimensions.widthMm ?? dimensions.diameterMm ?? dimensions.thicknessMm;
};

const partHeight = (part: Part): number => {
  const dimensions = part.authoring.dimensionsMm;
  return dimensions.heightMm ?? dimensions.thicknessMm ?? dimensions.diameterMm ?? 24;
};

const partLabelDimension = (part: Part, units: AuthoringUnit): string => {
  const dimensions = part.authoring.dimensionsMm;
  const primary = dimensionValue(dimensions, part.authoring.primitive);
  const width = dimensions.widthMm ?? dimensions.diameterMm;
  const height = dimensions.heightMm ?? dimensions.thicknessMm ?? dimensions.diameterMm;
  const bits = [
    primary == null ? null : `L ${formatLength(primary, units)}`,
    width == null ? null : `W ${formatLength(width, units)}`,
    height == null ? null : `H ${formatLength(height, units)}`,
  ].filter((item): item is string => item != null);
  return bits.join(' / ') || 'dimensions review required';
};

const rotatePoint = (point: Point3D, rotationDeg: Point3D): Point3D => {
  const rz = toRadians(rotationDeg.z);
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  return {
    x: point.x * cosZ - point.y * sinZ,
    y: point.x * sinZ + point.y * cosZ,
    z: point.z,
  };
};

const primitiveDimensions = (part: Part): { length: number; width: number; height: number } => {
  const dimensions = part.authoring.dimensionsMm;
  const diameter = dimensions.diameterMm ?? dimensions.widthMm ?? dimensions.lengthMm ?? 50;
  if (part.authoring.primitive === 'cylinder_joint') {
    return {
      length: diameter,
      width: diameter,
      height: dimensions.heightMm ?? dimensions.lengthMm ?? diameter,
    };
  }
  return {
    length: dimensions.lengthMm ?? diameter,
    width: dimensions.widthMm ?? diameter,
    height: dimensions.heightMm ?? dimensions.thicknessMm ?? Math.max(12, (dimensions.widthMm ?? 36) * 0.55),
  };
};

const focusOffset = (focused: boolean): Point3D => focused ? { x: 0, y: -36, z: 74 } : { x: 0, y: 0, z: 0 };

const connectorCenter = (part: Part): Point3D => ({
  x: part.authoring.positionMm.x,
  y: part.authoring.positionMm.y,
  z: part.authoring.positionMm.z + partHeight(part) + 18,
});

const routePolyline = (route: WiringRoute, partsById: Map<string, Part>): Point3D[] => {
  const connectedParts = route.connectedParts.map((partId) => partsById.get(partId)).filter((part): part is Part => part != null);
  if (connectedParts.length >= 2) {
    const start = connectorCenter(connectedParts[0]!);
    const end = connectorCenter(connectedParts.at(-1)!);
    const lift = Math.max(42, Math.abs(end.x - start.x) * 0.08 + Math.abs(end.y - start.y) * 0.05);
    return [
      start,
      { x: start.x + (end.x - start.x) * 0.34, y: start.y + 34, z: start.z + lift },
      { x: start.x + (end.x - start.x) * 0.68, y: end.y + 24, z: end.z + lift * 0.8 },
      end,
    ];
  }
  return [];
};

function useProjection(view: ViewState) {
  return (point: Point3D): ProjectedPoint => {
    const yaw = toRadians(view.yawDeg);
    const pitch = toRadians(view.pitchDeg);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const xYaw = point.x * cosYaw - point.y * sinYaw;
    const yYaw = point.x * sinYaw + point.y * cosYaw;
    const zPitch = point.z * Math.cos(pitch) - yYaw * Math.sin(pitch);
    const yPitch = point.z * Math.sin(pitch) + yYaw * Math.cos(pitch);
    const scale = 0.62 * view.zoom;
    return {
      x: SVG_WIDTH / 2 + view.panX + xYaw * scale,
      y: SVG_HEIGHT * 0.72 + view.panY - zPitch * scale + yPitch * scale * 0.24,
      depth: yYaw - point.z * 0.25,
    };
  };
}

function boxFaces(part: Part, explodePercent: number, project: (point: Point3D) => ProjectedPoint, focused: boolean): BoxFace[] {
  const dims = primitiveDimensions(part);
  const explode = explodePercent / 100;
  const offset = focusOffset(focused);
  const center = {
    x: part.authoring.positionMm.x + (part.visual.explodeX ?? 0) * 2.4 * explode + offset.x,
    y: part.authoring.positionMm.y + offset.y,
    z: part.authoring.positionMm.z + (part.visual.explodeY ?? 0) * 1.5 * explode + offset.z,
  };
  const half = { x: dims.length / 2, y: dims.width / 2, z: dims.height / 2 };
  const corners = {
    lbf: { x: -half.x, y: -half.y, z: -half.z },
    rbf: { x: half.x, y: -half.y, z: -half.z },
    rbb: { x: half.x, y: half.y, z: -half.z },
    lbb: { x: -half.x, y: half.y, z: -half.z },
    ltf: { x: -half.x, y: -half.y, z: half.z },
    rtf: { x: half.x, y: -half.y, z: half.z },
    rtb: { x: half.x, y: half.y, z: half.z },
    ltb: { x: -half.x, y: half.y, z: half.z },
  } satisfies Record<string, Point3D>;
  const world = Object.fromEntries(Object.entries(corners).map(([key, point]) => {
    const rotated = rotatePoint(point, part.authoring.rotationDeg);
    return [key, project({ x: center.x + rotated.x, y: center.y + rotated.y, z: center.z + rotated.z })];
  })) as Record<keyof typeof corners, ProjectedPoint>;
  return [
    { points: [world.ltf, world.rtf, world.rtb, world.ltb], className: 'face-top' },
    { points: [world.rtf, world.rbf, world.rbb, world.rtb], className: 'face-side' },
    { points: [world.ltf, world.lbf, world.rbf, world.rtf], className: 'face-front' },
  ];
}

const boundsForPoints = (points: ProjectedPoint[]) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    centerX: xs.reduce((sum, value) => sum + value, 0) / points.length,
    centerY: ys.reduce((sum, value) => sum + value, 0) / points.length,
  };
};

function PrimitiveSurfaceDetails({ part, faces }: { part: Part; faces: BoxFace[] }) {
  const topBounds = boundsForPoints(faces[0]?.points ?? []);
  const width = Math.max(14, topBounds.maxX - topBounds.minX);
  const height = Math.max(10, topBounds.maxY - topBounds.minY);
  if (part.authoring.primitive === 'bracket') {
    return (
      <g className="primitive-surface-details bracket-details" aria-hidden="true">
        <circle cx={topBounds.centerX - width * 0.22} cy={topBounds.centerY} r="5" />
        <circle cx={topBounds.centerX + width * 0.22} cy={topBounds.centerY} r="5" />
        <line x1={topBounds.centerX} y1={topBounds.centerY - height * 0.35} x2={topBounds.centerX} y2={topBounds.centerY + height * 0.35} />
      </g>
    );
  }
  if (part.authoring.primitive === 'motor_block') {
    return (
      <g className="primitive-surface-details motor-details" aria-hidden="true">
        <circle cx={topBounds.centerX} cy={topBounds.centerY} r={Math.max(7, Math.min(width, height) * 0.32)} />
        <line x1={topBounds.centerX - width * 0.28} y1={topBounds.centerY} x2={topBounds.centerX + width * 0.28} y2={topBounds.centerY} />
      </g>
    );
  }
  if (part.authoring.primitive === 'connector') {
    return (
      <g className="primitive-surface-details connector-details" aria-hidden="true">
        {[-0.24, 0, 0.24].map((offset) => <circle key={offset} cx={topBounds.centerX + width * offset} cy={topBounds.centerY} r="3.6" />)}
      </g>
    );
  }
  if (part.authoring.primitive === 'electronics') {
    return (
      <g className="primitive-surface-details electronics-details" aria-hidden="true">
        <rect x={topBounds.centerX - width * 0.22} y={topBounds.centerY - height * 0.2} width={width * 0.44} height={height * 0.4} rx="3" />
        {[-0.34, -0.22, 0.22, 0.34].map((offset) => <circle key={offset} cx={topBounds.centerX + width * offset} cy={topBounds.centerY + height * 0.35} r="2.6" />)}
      </g>
    );
  }
  if (part.authoring.primitive === 'tool') {
    return (
      <g className="primitive-surface-details tool-details" aria-hidden="true">
        <path d={`M ${topBounds.centerX - width * 0.24} ${topBounds.centerY - height * 0.25} L ${topBounds.centerX + width * 0.28} ${topBounds.centerY} L ${topBounds.centerX - width * 0.24} ${topBounds.centerY + height * 0.25} Z`} />
      </g>
    );
  }
  if (part.authoring.primitive === 'base_plate' || part.authoring.primitive === 'beam') {
    return (
      <g className="primitive-surface-details fastener-details" aria-hidden="true">
        <circle cx={topBounds.minX + width * 0.18} cy={topBounds.minY + height * 0.3} r="3.6" />
        <circle cx={topBounds.maxX - width * 0.18} cy={topBounds.maxY - height * 0.3} r="3.6" />
      </g>
    );
  }
  return null;
}

function VisualBox({ part, selected, focused, focusDimmed, explodePercent, project, onSelect }: {
  part: Part;
  selected: boolean;
  focused: boolean;
  focusDimmed: boolean;
  explodePercent: number;
  project: (point: Point3D) => ProjectedPoint;
  onSelect: () => void;
}) {
  const faces = boxFaces(part, explodePercent, project, focused);
  const offset = focusOffset(focused);
  const labelPoint = project({
    x: part.authoring.positionMm.x + (part.visual.explodeX ?? 0) * 2.4 * (explodePercent / 100) + offset.x,
    y: part.authoring.positionMm.y + offset.y,
    z: part.authoring.positionMm.z + partHeight(part) + 18 + (part.visual.explodeY ?? 0) * 1.5 * (explodePercent / 100) + offset.z,
  });
  const style = { '--cad-color': part.authoring.color } as CSSProperties;
  return (
    <g
      aria-label={`Select ${part.name} geometry`}
      className={`cad-primitive primitive-${part.authoring.primitive} risk-${part.stressRisk} ${selected ? 'selected' : ''} ${focused ? 'focused-part' : ''} ${focusDimmed ? 'focus-dimmed' : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      role="button"
      style={style}
      tabIndex={0}
    >
      <title>{`${part.name}: ${part.purpose}`}</title>
      {faces.map((face) => <polygon className={face.className} key={face.className} points={pointString(face.points)} />)}
      <PrimitiveSurfaceDetails faces={faces} part={part} />
      {selected ? <circle className="selected-part-pulse" cx={labelPoint.x} cy={labelPoint.y - 22} r="18" /> : null}
      <text className="cad-part-label" x={labelPoint.x} y={labelPoint.y}>{part.name}</text>
      {selected ? <text className="selected-part-tag" x={labelPoint.x} y={labelPoint.y + 18}>selected - {part.authoring.primitive.replaceAll('_', ' ')}</text> : null}
    </g>
  );
}

function VisualCylinder({ part, selected, focused, focusDimmed, explodePercent, project, onSelect }: {
  part: Part;
  selected: boolean;
  focused: boolean;
  focusDimmed: boolean;
  explodePercent: number;
  project: (point: Point3D) => ProjectedPoint;
  onSelect: () => void;
}) {
  const dims = primitiveDimensions(part);
  const explode = explodePercent / 100;
  const offset = focusOffset(focused);
  const center = {
    x: part.authoring.positionMm.x + (part.visual.explodeX ?? 0) * 2.4 * explode + offset.x,
    y: part.authoring.positionMm.y + offset.y,
    z: part.authoring.positionMm.z + (part.visual.explodeY ?? 0) * 1.5 * explode + offset.z,
  };
  const top = project({ x: center.x, y: center.y, z: center.z + dims.height / 2 });
  const bottom = project({ x: center.x, y: center.y, z: center.z - dims.height / 2 });
  const rimA = project({ x: center.x + dims.width / 2, y: center.y, z: center.z + dims.height / 2 });
  const rimB = project({ x: center.x, y: center.y + dims.width / 2, z: center.z + dims.height / 2 });
  const rx = Math.max(16, Math.abs(rimA.x - top.x));
  const ry = Math.max(8, Math.abs(rimB.y - top.y) * 0.65);
  const style = { '--cad-color': part.authoring.color } as CSSProperties;
  return (
    <g
      aria-label={`Select ${part.name} geometry`}
      className={`cad-primitive primitive-cylinder_joint risk-${part.stressRisk} ${selected ? 'selected' : ''} ${focused ? 'focused-part' : ''} ${focusDimmed ? 'focus-dimmed' : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      role="button"
      style={style}
      tabIndex={0}
    >
      <title>{`${part.name}: ${part.purpose}`}</title>
      <path className="cylinder-wall" d={`M ${top.x - rx} ${top.y} L ${bottom.x - rx} ${bottom.y} Q ${bottom.x} ${bottom.y + ry} ${bottom.x + rx} ${bottom.y} L ${top.x + rx} ${top.y}`} />
      <ellipse className="face-side" cx={bottom.x} cy={bottom.y} rx={rx} ry={ry} />
      <ellipse className="face-top" cx={top.x} cy={top.y} rx={rx} ry={ry} />
      {part.authoring.featureRecipe ? (
        <g className="sleeve-feature-details" aria-hidden="true">
          <ellipse className="sleeve-bore" cx={top.x} cy={top.y} rx={rx * 0.48} ry={ry * 0.48} />
          <line className="slot-cut" x1={top.x - rx * 0.72} y1={top.y - ry * 0.92} x2={top.x + rx * 0.72} y2={top.y + ry * 0.58} />
          <line className="slot-cut secondary" x1={top.x - rx * 0.52} y1={bottom.y - ry * 0.42} x2={top.x + rx * 0.52} y2={bottom.y + ry * 0.68} />
          <ellipse className="chamfer-ring" cx={top.x} cy={top.y} rx={rx * 0.92} ry={ry * 0.92} />
        </g>
      ) : <circle className="pivot-dot" cx={top.x} cy={top.y} r="5" />}
      {selected ? <circle className="selected-part-pulse" cx={top.x} cy={top.y} r={Math.max(18, rx * 0.72)} /> : null}
      <text className="cad-part-label" x={top.x} y={top.y - ry - 10}>{part.name}</text>
      {selected ? <text className="selected-part-tag" x={top.x} y={top.y - ry + 8}>selected - cylinder joint</text> : null}
    </g>
  );
}

function DimensionOverlay({ part, units, project, focused }: { part: Part; units: AuthoringUnit; project: (point: Point3D) => ProjectedPoint; focused: boolean }) {
  const dims = primitiveDimensions(part);
  const offset = focusOffset(focused);
  const center = {
    x: part.authoring.positionMm.x + offset.x,
    y: part.authoring.positionMm.y + offset.y,
    z: part.authoring.positionMm.z + offset.z,
  };
  const half = dims.length / 2;
  const start = project({ x: center.x - half, y: center.y - dims.width / 2 - 28, z: center.z + dims.height / 2 + 10 });
  const end = project({ x: center.x + half, y: center.y - dims.width / 2 - 28, z: center.z + dims.height / 2 + 10 });
  const heightStart = project({ x: center.x + half + 20, y: center.y + dims.width / 2, z: center.z - dims.height / 2 });
  const heightEnd = project({ x: center.x + half + 20, y: center.y + dims.width / 2, z: center.z + dims.height / 2 });
  const label = part.authoring.primitive === 'cylinder_joint'
    ? `Diameter ${formatLength(part.authoring.dimensionsMm.diameterMm ?? dims.width, units)}`
    : `Length ${formatLength(dims.length, units)}`;
  return (
    <g className="dimension-overlay" aria-hidden="true">
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
      <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 8}>{label}</text>
      <line x1={heightStart.x} y1={heightStart.y} x2={heightEnd.x} y2={heightEnd.y} />
      <text x={heightEnd.x + 8} y={heightEnd.y}>Height {formatLength(dims.height, units)}</text>
    </g>
  );
}

function FeatureRecipeOverlay({ part, project, focused, units }: { part: Part; project: (point: Point3D) => ProjectedPoint; focused: boolean; units: AuthoringUnit }) {
  const recipe = part.authoring.featureRecipe;
  if (!recipe) return null;
  const dims = primitiveDimensions(part);
  const editableDimensions = part.authoring.dimensionsMm;
  const outerDiameter = editableDimensions.diameterMm ?? editableDimensions.widthMm ?? dims.width;
  const recipeDimension = (callout: typeof recipe.callouts[number]): number | null => {
    const match = callout.value.match(/[0-9]+(?:\.[0-9]+)?/);
    return match ? Number(match[0]) : null;
  };
  const recipeDimensionById = (id: string, fallback: number): number => {
    const callout = recipe.callouts.find((candidate) => candidate.id === id);
    return callout == null ? fallback : recipeDimension(callout) ?? fallback;
  };
  const recipeOuterDiameter = recipeDimensionById('od', outerDiameter);
  const recipeInnerDiameter = recipeDimensionById('id', outerDiameter);
  const currentBore = Math.max(0, outerDiameter - 2 * (recipeOuterDiameter - recipeInnerDiameter));
  const recipeHeight = recipeDimensionById('height', dims.height);
  const recipeChamfer = recipeDimensionById('chamfer', 0);
  const currentChamfer = recipeHeight > 0 ? recipeChamfer * (dims.height / recipeHeight) : recipeChamfer;
  const calloutValue = (callout: typeof recipe.callouts[number]): string => {
    if (callout.id === 'od') return formatLength(outerDiameter, units);
    if (callout.id === 'id') return formatLength(currentBore, units);
    if (callout.id === 'slot') {
      const slotDimensions = callout.value.match(/[0-9]+(?:\.[0-9]+)?/g)?.slice(0, 2).map(Number) ?? [];
      return slotDimensions.length === 2
        ? `${formatLength(slotDimensions[0]!, units)} x ${formatLength(slotDimensions[1]!, units)}${callout.value.includes(' at ') ? ` at ${callout.value.split(' at ')[1]}` : ''}`
        : callout.value;
    }
    if (callout.id === 'height') return formatLength(dims.height, units);
    if (callout.id === 'chamfer') return formatLength(currentChamfer, units);
    const value = recipeDimension(callout);
    return value == null ? callout.value : formatLength(value, units);
  };
  const offset = focusOffset(focused);
  const center = {
    x: part.authoring.positionMm.x + offset.x,
    y: part.authoring.positionMm.y + offset.y,
    z: part.authoring.positionMm.z + offset.z,
  };
  const planeY = center.y - dims.width / 2 - 44;
  const plane = [
    project({ x: center.x - dims.length * 0.68, y: planeY, z: center.z - dims.height * 0.72 }),
    project({ x: center.x + dims.length * 0.68, y: planeY, z: center.z - dims.height * 0.72 }),
    project({ x: center.x + dims.length * 0.68, y: planeY, z: center.z + dims.height * 0.92 }),
    project({ x: center.x - dims.length * 0.68, y: planeY, z: center.z + dims.height * 0.92 }),
  ];
  const anchor = project({ x: center.x - dims.length * 0.55, y: planeY, z: center.z + dims.height * 1.08 });
  return (
    <g className="feature-recipe-overlay" aria-hidden="true">
      <polygon className="sketch-plane" points={pointString(plane)} />
      <text className="sketch-plane-label" x={anchor.x} y={anchor.y}>{recipe.plane}: sketch profile</text>
      {recipe.callouts.slice(0, 5).map((callout, index) => {
        const targetOffsets = [[-0.4, 0.72], [0.1, 0.18], [0.42, -0.26], [0.66, 0.92], [-0.72, -0.78]] as const;
        const labelOffsets = [[-1.15, 1.08], [-1.05, 0.36], [0.9, -0.5], [0.82, 1.2], [-1.02, -1.08]] as const;
        const [targetX, targetZ] = targetOffsets[index] ?? targetOffsets.at(-1)!;
        const [labelX, labelZ] = labelOffsets[index] ?? labelOffsets.at(-1)!;
        const target = project({
          x: center.x + targetX * dims.length,
          y: planeY,
          z: center.z + targetZ * dims.height,
        });
        const label = project({
          x: center.x + labelX * dims.length,
          y: planeY - 22,
          z: center.z + labelZ * dims.height,
        });
        return (
          <g className={`feature-callout kind-${callout.kind}`} key={callout.id}>
            <line x1={label.x} y1={label.y} x2={target.x} y2={target.y} />
            <text x={label.x} y={label.y}>{callout.label}: {calloutValue(callout)}</text>
          </g>
        );
      })}
    </g>
  );
}

export function VisualCadWorkspace({
  parts,
  wiringRoutes,
  selectedPartId,
  focusedPartId,
  units,
  explodePercent,
  view,
  onViewChange,
  onSelectPart,
  onNudgeSelected,
}: VisualCadWorkspaceProps) {
  const dragRef = useRef<{ x: number; y: number; view: ViewState; mode: 'orbit' | 'pan' } | null>(null);
  const project = useProjection(view);
  const partsById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);
  const selectedPart = partsById.get(selectedPartId) ?? parts[0];
  const effectiveFocusedPartId = focusedPartId && partsById.has(focusedPartId) ? focusedPartId : null;
  const sortedParts = useMemo(() => [...parts].sort((left, right) => {
    const leftDepth = project(left.authoring.positionMm).depth + (left.visual.zIndex ?? 0);
    const rightDepth = project(right.authoring.positionMm).depth + (right.visual.zIndex ?? 0);
    return leftDepth - rightDepth;
  }), [parts, project]);

  const gridLines = [];
  for (let value = -GRID_EXTENT_MM; value <= GRID_EXTENT_MM; value += GRID_STEP_MM) {
    const xStart = project({ x: -GRID_EXTENT_MM, y: value, z: 0 });
    const xEnd = project({ x: GRID_EXTENT_MM, y: value, z: 0 });
    const yStart = project({ x: value, y: -GRID_EXTENT_MM, z: 0 });
    const yEnd = project({ x: value, y: GRID_EXTENT_MM, z: 0 });
    gridLines.push(<line className="cad-grid-line" key={`x-${value}`} x1={xStart.x} y1={xStart.y} x2={xEnd.x} y2={xEnd.y} />);
    gridLines.push(<line className="cad-grid-line" key={`y-${value}`} x1={yStart.x} y1={yStart.y} x2={yEnd.x} y2={yEnd.y} />);
  }

  const axis = {
    x: [project({ x: 0, y: 0, z: 0 }), project({ x: 420, y: 0, z: 0 })],
    y: [project({ x: 0, y: 0, z: 0 }), project({ x: 0, y: 360, z: 0 })],
    z: [project({ x: 0, y: 0, z: 0 }), project({ x: 0, y: 0, z: 260 })],
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const mode = event.shiftKey ? 'pan' : 'orbit';
    dragRef.current = { x: event.clientX, y: event.clientY, view, mode };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (dragRef.current.mode === 'pan') {
      onViewChange({ ...dragRef.current.view, panX: dragRef.current.view.panX + dx, panY: dragRef.current.view.panY + dy });
      return;
    }
    onViewChange({
      ...dragRef.current.view,
      yawDeg: clamp(dragRef.current.view.yawDeg + dx * 0.35, -180, 180),
      pitchDeg: clamp(dragRef.current.view.pitchDeg - dy * 0.22, 8, 68),
    });
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const nextZoom = clamp(view.zoom + (event.deltaY > 0 ? -0.08 : 0.08), 0.55, 1.9);
    onViewChange({ ...view, zoom: nextZoom });
  };

  return (
    <div className="cad-workspace-frame" aria-label="Visual CAD authoring canvas with XYZ grid">
      <div className="canvas-hint-strip">
        <span>XYZ grid</span>
        <span>Drag to orbit</span>
        <span>Shift-drag to pan</span>
        <span>Wheel or slider to zoom</span>
      </div>
      <svg
        aria-label="Visual CAD authoring canvas"
        className="visual-cad-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        role="img"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      >
        <defs>
          <filter id="cad-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" floodColor="#000000" floodOpacity="0.28" stdDeviation="8" />
          </filter>
        </defs>
        <rect className="canvas-backplate" x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} rx="24" />
        <g className="cad-grid">{gridLines}</g>
        <g className="cad-axis-lines" aria-hidden="true">
          <line className="axis-x" x1={axis.x[0].x} y1={axis.x[0].y} x2={axis.x[1].x} y2={axis.x[1].y} />
          <line className="axis-y" x1={axis.y[0].x} y1={axis.y[0].y} x2={axis.y[1].x} y2={axis.y[1].y} />
          <line className="axis-z" x1={axis.z[0].x} y1={axis.z[0].y} x2={axis.z[1].x} y2={axis.z[1].y} />
          <text className="axis-label axis-x-label" x={axis.x[1].x + 10} y={axis.x[1].y}>X</text>
          <text className="axis-label axis-y-label" x={axis.y[1].x + 10} y={axis.y[1].y}>Y</text>
          <text className="axis-label axis-z-label" x={axis.z[1].x + 10} y={axis.z[1].y}>Z</text>
        </g>
        <g className="connection-lines" aria-label="Assembly joints and pivots">
          {parts.map((part) => {
            const parent = part.authoring.parentPartId ? partsById.get(part.authoring.parentPartId) : null;
            if (!parent) return null;
            const start = project(connectorCenter(parent));
            const end = project(connectorCenter(part));
            return (
              <g className={`joint-connection joint-${part.authoring.jointType}`} key={`${part.id}-joint`}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                <circle cx={end.x} cy={end.y} r="6" />
                <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 8}>{part.authoring.jointType}</text>
              </g>
            );
          })}
        </g>
        <g className="wire-routes" aria-label="Visible wiring harness routes">
          {wiringRoutes.map((route, index) => {
            const points = routePolyline(route, partsById).map(project);
            if (points.length < 2) return null;
            return (
              <g className={`wire-route status-${route.reviewStatus}`} key={route.id}>
                <polyline points={pointString(points)} />
                {points.map((point, pointIndex) => <circle key={`${route.id}-${pointIndex}`} cx={point.x} cy={point.y} r={pointIndex === 0 || pointIndex === points.length - 1 ? 5 : 3} />)}
                <text x={points[Math.min(1, points.length - 1)]!.x + 8} y={points[Math.min(1, points.length - 1)]!.y - 8}>{index + 1}. {route.name}</text>
              </g>
            );
          })}
        </g>
        <g className="cad-primitives" filter="url(#cad-soft-shadow)">
          {sortedParts.map((part) => {
            const focused = effectiveFocusedPartId === part.id;
            const focusDimmed = effectiveFocusedPartId != null && !focused;
            return part.authoring.primitive === 'cylinder_joint'
              ? (
                <VisualCylinder
                  explodePercent={explodePercent}
                  focused={focused}
                  focusDimmed={focusDimmed}
                  key={part.id}
                  onSelect={() => onSelectPart(part.id)}
                  part={part}
                  project={project}
                  selected={part.id === selectedPartId}
                />
              )
              : (
                <VisualBox
                  explodePercent={explodePercent}
                  focused={focused}
                  focusDimmed={focusDimmed}
                  key={part.id}
                  onSelect={() => onSelectPart(part.id)}
                  part={part}
                  project={project}
                  selected={part.id === selectedPartId}
                />
              );
          })}
        </g>
        {selectedPart ? <DimensionOverlay focused={effectiveFocusedPartId === selectedPart.id} part={selectedPart} project={project} units={units} /> : null}
        {selectedPart ? <FeatureRecipeOverlay focused={effectiveFocusedPartId === selectedPart.id} part={selectedPart} project={project} units={units} /> : null}
      </svg>
      <div className="canvas-status-row" aria-live="polite">
        <strong>{selectedPart?.name ?? 'No part selected'}</strong>
        <span>{selectedPart ? partLabelDimension(selectedPart, units) : 'Select or create a part to edit geometry.'}</span>
        <span>{parts.length} primitives, {wiringRoutes.length} wire route{wiringRoutes.length === 1 ? '' : 's'}, units {units}</span>
        <div className="canvas-nudge-controls" aria-label="Move selected geometry">
          <button type="button" onClick={() => onNudgeSelected({ x: -10, y: 0, z: 0 })}>X -</button>
          <button type="button" onClick={() => onNudgeSelected({ x: 10, y: 0, z: 0 })}>X +</button>
          <button type="button" onClick={() => onNudgeSelected({ x: 0, y: -10, z: 0 })}>Y -</button>
          <button type="button" onClick={() => onNudgeSelected({ x: 0, y: 10, z: 0 })}>Y +</button>
          <button type="button" onClick={() => onNudgeSelected({ x: 0, y: 0, z: 10 })}>Z +{formatLength(lengthFromMm(10, 'mm'), 'mm')}</button>
        </div>
      </div>
    </div>
  );
}
