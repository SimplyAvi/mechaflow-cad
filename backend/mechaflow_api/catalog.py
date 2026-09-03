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


DEFAULT_ASSEMBLY = Assembly(
    id="asm-open-gripper-demo",
    name="Open gripper demo assembly",
    root_node_id="node-root",
    nodes=[
        AssemblyNode(
            id="node-root",
            name="Gripper root",
            part_ids=["part-finger-link", "part-palm-plate", "part-actuator-bracket"],
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
            dimensions=PartDimensions(length_mm=140, width_mm=22, thickness_mm=6),
            mass_kg=0.11,
            manufacturing_options=[
                ManufacturingOption(
                    id="mfg-finger-cnc",
                    process=ManufacturingProcess.cnc_machining,
                    description="2.5D CNC machined plate with deburred edges.",
                    cost=MoneyRange(min=25, max=80, confidence=RecommendationConfidence.heuristic),
                    lead_time_days_min=3,
                    lead_time_days_max=10,
                ),
                ManufacturingOption(
                    id="mfg-finger-print",
                    process=ManufacturingProcess.additive_fdm,
                    description="Prototype print for fit checks only unless re-rated.",
                    cost=MoneyRange(min=3, max=12, confidence=RecommendationConfidence.heuristic),
                    risk_notes=["Layer direction can make payload rating much lower."],
                ),
            ],
            related_fasteners=["M4 shoulder screw", "M4 locknut"],
            wiring_route_ids=["route-finger-sensor"],
        ),
        Part(
            id="part-palm-plate",
            name="Palm plate",
            category="base plate",
            purpose="Supports finger pivots and mounts to robot wrist adapter.",
            material_id="mat-aluminum-6061-t6",
            dimensions=PartDimensions(length_mm=120, width_mm=90, thickness_mm=8),
            mass_kg=0.24,
        ),
        Part(
            id="part-actuator-bracket",
            name="Actuator bracket",
            category="mounting bracket",
            purpose="Locates linear actuator and resists reaction loads.",
            material_id="mat-low-carbon-steel",
            dimensions=PartDimensions(length_mm=70, width_mm=45, thickness_mm=4),
            mass_kg=0.18,
        ),
    ],
    wiring_routes=[
        WiringRoute(
            id="route-finger-sensor",
            name="Finger force sensor lead",
            from_connector=Connector(id="conn-palm", name="Palm harness connector", pin_count=4, part_id="part-palm-plate"),
            to_connector=Connector(id="conn-finger", name="Finger sensor connector", pin_count=4, part_id="part-finger-link"),
            path_points_mm=[Vector3(x=0, y=0, z=0), Vector3(x=40, y=8, z=5), Vector3(x=95, y=10, z=4)],
            bend_radius_min_mm=12,
            clearance_min_mm=2,
            risk_notes=["Clearance needs a geometry check after exploded-view extraction is real."],
            confidence=RecommendationConfidence.heuristic,
        )
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
        example_tasks=[GRIPPER_TASK],
        source=SourceAttribution(label="MechaFlow CAD seed data", license="MIT"),
    )
]
