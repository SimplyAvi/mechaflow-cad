"""Seed catalog data for local development.

The first backend foundation exposes structured concepts without requiring heavy
CAD tools to be installed. These entries are small examples for frontend and API
integration work, not authoritative engineering data.
"""

from __future__ import annotations

from .models import (
    Assembly,
    AssemblyNode,
    BOMItem,
    CADFileFormat,
    Connector,
    ManufacturingOption,
    ManufacturingProcess,
    Material,
    MaterialProperties,
    MoneyRange,
    Part,
    PartDimensions,
    RecommendationConfidence,
    ReferenceDesign,
    SourceAttribution,
    TaskKind,
    TaskRequirement,
    Vector3,
    WiringRoute,
)


DEFAULT_MATERIALS = [
    Material(
        id="mat-aluminum-6061-t6",
        name="Aluminum 6061-T6",
        family="aluminum",
        properties=MaterialProperties(
            density_kg_m3=2700,
            elastic_modulus_gpa=68.9,
            yield_strength_mpa=276,
            ultimate_strength_mpa=310,
            poisson_ratio=0.33,
        ),
        compatible_processes=[ManufacturingProcess.cnc_machining, ManufacturingProcess.sheet_metal],
        cost=MoneyRange(min=3, max=8, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Representative starter value. Replace with sourced material database before engineering use."],
    ),
    Material(
        id="mat-carbon-fiber-nylon",
        name="Carbon-fiber reinforced nylon",
        family="polymer_composite",
        properties=MaterialProperties(density_kg_m3=1150, elastic_modulus_gpa=7.5, yield_strength_mpa=70),
        compatible_processes=[ManufacturingProcess.additive_fdm, ManufacturingProcess.additive_sls],
        cost=MoneyRange(min=8, max=20, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Print orientation and moisture conditioning strongly affect strength."],
    ),
    Material(
        id="mat-low-carbon-steel",
        name="Low-carbon steel",
        family="steel",
        properties=MaterialProperties(density_kg_m3=7850, elastic_modulus_gpa=200, yield_strength_mpa=250),
        compatible_processes=[ManufacturingProcess.cnc_machining, ManufacturingProcess.sheet_metal],
        cost=MoneyRange(min=1, max=4, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Adds weight but can improve stiffness and wear resistance."],
    ),
    Material(
        id="mat-pla-generic",
        name="Generic PLA printed polymer",
        family="polymer",
        properties=MaterialProperties(
            density_kg_m3=1240,
            elastic_modulus_gpa=2.0,
            yield_strength_mpa=45,
            ultimate_strength_mpa=60,
            poisson_ratio=0.36,
        ),
        compatible_processes=[ManufacturingProcess.additive_fdm],
        cost=MoneyRange(min=1, max=3, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Print settings, orientation, moisture, and temperature control real properties."],
    ),
    Material(
        id="mat-petg-generic",
        name="Generic PETG printed polymer",
        family="polymer",
        properties=MaterialProperties(
            density_kg_m3=1270,
            elastic_modulus_gpa=2.1,
            yield_strength_mpa=40,
            ultimate_strength_mpa=50,
            poisson_ratio=0.38,
        ),
        compatible_processes=[ManufacturingProcess.additive_fdm],
        cost=MoneyRange(min=2, max=5, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Use supplier data or coupon tests before load-bearing analysis."],
    ),
    Material(
        id="mat-fr4-generic",
        name="Generic FR-4 PCB laminate",
        family="electronics_substrate",
        properties=MaterialProperties(density_kg_m3=1850, elastic_modulus_gpa=22, poisson_ratio=0.13),
        compatible_processes=[ManufacturingProcess.pcb_fabrication],
        cost=MoneyRange(min=2, max=8, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Board stack-up and laminate vendor data are required for structural or thermal analysis."],
    ),
]


GRIPPER_TASK = TaskRequirement(
    id="task-lift-50lb",
    kind=TaskKind.lift_payload,
    description="Pick and place a 50 lb object with advisory safety-factor tracking.",
    target_value=50,
    unit="lb",
    safety_factor_min=2.0,
    validation_method="heuristic",
    assumptions=["Static payload approximation until FEA and actuator models are wired."],
)
REACH_TASK = TaskRequirement(
    id="task-reach-envelope",
    kind=TaskKind.reach,
    description="Reach the target work envelope without changing the wrist interface.",
    target_value=0.6,
    unit="m",
    validation_method="heuristic",
)
WIRE_CLEARANCE_TASK = TaskRequirement(
    id="task-wire-clearance",
    kind=TaskKind.wiring_clearance,
    description="Maintain wiring clearance and bend radius through the gripper assembly.",
    target_value=2,
    unit="mm",
    validation_method="review",
)
MANUFACTURING_SUBSTITUTION_TASK = TaskRequirement(
    id="task-manufacturing-substitution",
    kind=TaskKind.serviceability,
    description="Compare manufacturing substitutions without losing service access.",
    validation_method="review",
)
DEFAULT_TASKS = [GRIPPER_TASK, REACH_TASK, WIRE_CLEARANCE_TASK, MANUFACTURING_SUBSTITUTION_TASK]


DEFAULT_ASSEMBLY = Assembly(
    id="asm-open-gripper-demo",
    name="Open gripper demo assembly",
    root_node_id="node-root",
    nodes=[
        AssemblyNode(
            id="node-root",
            name="Gripper root",
            part_ids=["part-palm-plate", "part-actuator-bracket", "part-controller-pcb"],
            child_assembly_ids=["node-finger"],
        ),
        AssemblyNode(
            id="node-finger",
            name="Finger subassembly",
            part_ids=["part-finger-link"],
            exploded_transform={"translation_mm": {"x": 80, "y": 0, "z": 0}},
        ),
    ],
    parts=[
        Part(
            id="part-finger-link",
            name="Finger link",
            category="load-bearing link",
            purpose="Transfers gripping load from actuator linkage to contact pad.",
            material_id="mat-aluminum-6061-t6",
            dimensions=PartDimensions(
                length_mm=140,
                width_mm=22,
                thickness_mm=6,
                metadata={"pin_hole_diameter_mm": 4},
            ),
            mass_kg=0.11,
            manufacturing_options=[
                ManufacturingOption(
                    id="mfg-finger-cnc",
                    process=ManufacturingProcess.cnc_machining,
                    description="2.5D CNC machined plate with deburred edges.",
                    cost=MoneyRange(min=25, max=80, confidence=RecommendationConfidence.heuristic),
                    lead_time_days_min=3,
                    lead_time_days_max=10,
                    risk_notes=["Best current fit for the preserved 50 lb payload task."],
                ),
                ManufacturingOption(
                    id="mfg-finger-print",
                    process=ManufacturingProcess.additive_fdm,
                    description="Prototype print for fit checks only unless re-rated.",
                    cost=MoneyRange(min=3, max=12, confidence=RecommendationConfidence.heuristic),
                    lead_time_days_min=1,
                    lead_time_days_max=3,
                    risk_notes=["Layer direction can make payload rating much lower."],
                ),
            ],
            related_fasteners=["M4 shoulder screw", "M4 locknut"],
            wiring_route_ids=["route-finger-sensor"],
            source_file="gripper.step#finger-link",
            metadata={"service_minutes": 10},
        ),
        Part(
            id="part-palm-plate",
            name="Palm plate",
            category="base plate",
            purpose="Supports finger pivots and mounts to the robot wrist adapter.",
            material_id="mat-aluminum-6061-t6",
            dimensions=PartDimensions(length_mm=120, width_mm=90, thickness_mm=8),
            mass_kg=0.24,
            manufacturing_options=[
                ManufacturingOption(
                    id="mfg-palm-cnc",
                    process=ManufacturingProcess.cnc_machining,
                    description="CNC plate with wrist adapter holes and dowel locations.",
                    cost=MoneyRange(min=45, max=120, confidence=RecommendationConfidence.heuristic),
                    lead_time_days_min=4,
                    lead_time_days_max=10,
                    risk_notes=["Cable pass-through requires a clearance review."],
                )
            ],
            related_fasteners=["M6 ISO 9409 screw", "dowel pin"],
            wiring_route_ids=["route-main-harness"],
            source_file="gripper.step#palm-plate",
            metadata={"preferred_manufacturing_process": "cnc_machining"},
        ),
        Part(
            id="part-actuator-bracket",
            name="Actuator bracket",
            category="mounting bracket",
            purpose="Locates the linear actuator and resists reaction loads from the gripper stroke.",
            material_id="mat-low-carbon-steel",
            dimensions=PartDimensions(length_mm=70, width_mm=45, thickness_mm=4),
            mass_kg=0.18,
            manufacturing_options=[
                ManufacturingOption(
                    id="mfg-bracket-sheet",
                    process=ManufacturingProcess.sheet_metal,
                    description="Laser cut and bent low-carbon steel bracket.",
                    cost=MoneyRange(min=18, max=48, confidence=RecommendationConfidence.heuristic),
                    lead_time_days_min=3,
                    lead_time_days_max=8,
                    risk_notes=["Bend tolerance can shift actuator alignment."],
                )
            ],
            related_fasteners=["M5 rail screw", "M3 motor mount screw"],
            source_file="gripper.step#actuator-bracket",
        ),
        Part(
            id="part-controller-pcb",
            name="Controller PCB placeholder",
            category="electronics",
            purpose="Provides connector metadata for PCB clearance and harness routing handoff.",
            material_id="mat-fr4-generic",
            dimensions=PartDimensions(length_mm=65, width_mm=45, thickness_mm=1.6),
            mass_kg=0.04,
            manufacturing_options=[
                ManufacturingOption(
                    id="mfg-controller-pcb",
                    process=ManufacturingProcess.pcb_fabrication,
                    description="Prototype PCB fabrication for fit and connector placement review.",
                    cost=MoneyRange(min=10, max=40, confidence=RecommendationConfidence.heuristic),
                    lead_time_days_min=5,
                    lead_time_days_max=12,
                )
            ],
            wiring_route_ids=["route-finger-sensor", "route-main-harness"],
        ),
    ],
    wiring_routes=[
        WiringRoute(
            id="route-finger-sensor",
            name="Finger force sensor lead",
            from_connector=Connector(
                id="conn-controller-finger",
                name="Controller finger-sensor connector",
                pin_count=4,
                part_id="part-controller-pcb",
            ),
            to_connector=Connector(id="conn-finger", name="Finger sensor connector", pin_count=4, part_id="part-finger-link"),
            path_points_mm=[Vector3(x=0, y=0, z=0), Vector3(x=40, y=8, z=5), Vector3(x=95, y=10, z=4)],
            bend_radius_min_mm=12,
            clearance_min_mm=2,
            risk_notes=["Clearance needs a geometry check after exploded-view extraction is real."],
            confidence=RecommendationConfidence.heuristic,
        ),
        WiringRoute(
            id="route-main-harness",
            name="Main palm harness",
            from_connector=Connector(
                id="conn-controller",
                name="Controller PCB harness connector",
                pin_count=8,
                part_id="part-controller-pcb",
            ),
            to_connector=Connector(id="conn-palm-main", name="Palm pass-through", pin_count=8, part_id="part-palm-plate"),
            path_points_mm=[Vector3(x=0, y=0, z=0), Vector3(x=25, y=20, z=4), Vector3(x=60, y=25, z=6)],
            bend_radius_min_mm=20,
            clearance_min_mm=3,
            risk_notes=["Board keep-outs and service-loop clearance need a geometry worker check."],
            confidence=RecommendationConfidence.heuristic,
        ),
    ],
    assembly_structure_confidence=RecommendationConfidence.heuristic,
)


DEFAULT_REFERENCE_DESIGNS = [
    ReferenceDesign(
        id="ref-open-gripper-demo",
        name="Open robotics gripper starter",
        source_url="https://github.com/mechaflow-cad/example-open-gripper",
        license="MIT placeholder for demo metadata",
        supported_file_formats=[CADFileFormat.step, CADFileFormat.freecad, CADFileFormat.gltf],
        cad_files=["gripper.step", "gripper.FCStd"],
        assembly_files=["assembly.json"],
        drawings=["finger-link.pdf"],
        bom_items=[
            BOMItem(id="bom-m4-shoulder", name="M4 shoulder screw", quantity=4),
            BOMItem(id="bom-m4-locknut", name="M4 locknut", quantity=4),
        ],
        electronics_files=["finger-sensor.kicad_pcb"],
        manufacturing_notes=["Use as an API shape example until a real permissively licensed design is imported."],
        known_limitations=["No geometry file is bundled in this repository yet.", "Analysis results are advisory stub data."],
        example_tasks=DEFAULT_TASKS,
        source=SourceAttribution(label="MechaFlow CAD seed data", license="MIT"),
    )
]
