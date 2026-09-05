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
    ElectronicsComponent,
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
    WireSegment,
    WiringRuleSet,
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
            max_service_temp_c=150,
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
        properties=MaterialProperties(
            density_kg_m3=1150,
            elastic_modulus_gpa=7.5,
            yield_strength_mpa=70,
            heat_deflection_temp_c=120,
        ),
        compatible_processes=[ManufacturingProcess.additive_fdm, ManufacturingProcess.additive_sls],
        cost=MoneyRange(min=8, max=20, confidence=RecommendationConfidence.heuristic),
        confidence=RecommendationConfidence.heuristic,
        notes=["Print orientation and moisture conditioning strongly affect strength."],
    ),
    Material(
        id="mat-low-carbon-steel",
        name="Low-carbon steel",
        family="steel",
        properties=MaterialProperties(
            density_kg_m3=7850,
            elastic_modulus_gpa=200,
            yield_strength_mpa=250,
            max_service_temp_c=250,
        ),
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
            heat_deflection_temp_c=55,
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
            heat_deflection_temp_c=70,
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
        properties=MaterialProperties(
            density_kg_m3=1850,
            elastic_modulus_gpa=22,
            poisson_ratio=0.13,
            max_service_temp_c=130,
        ),
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


DEFAULT_ELECTRONICS_COMPONENTS = [
    ElectronicsComponent(
        id="ec-controller-pcb",
        name="Controller PCB and IO headers",
        component_type="pcb",
        mounted_part_id="part-controller-pcb",
        connector_ids=["conn-controller-finger", "conn-controller"],
        bom_item_ids=["bom-controller-pcb"],
        notes=["KiCad board placement is a seed placeholder and needs ECAD review."],
        confidence=RecommendationConfidence.heuristic,
    ),
    ElectronicsComponent(
        id="ec-finger-force-sensor",
        name="Finger force sensor",
        component_type="sensor",
        mounted_part_id="part-finger-link",
        connector_ids=["conn-finger"],
        bom_item_ids=["bom-finger-force-sensor"],
        notes=["Sensor electrical load and attachment are review-required."],
        confidence=RecommendationConfidence.heuristic,
    ),
    ElectronicsComponent(
        id="ec-palm-pass-through",
        name="Palm harness pass-through",
        component_type="connector",
        mounted_part_id="part-palm-plate",
        connector_ids=["conn-palm-main"],
        bom_item_ids=["bom-palm-grommet"],
        notes=["Mechanical edge protection is represented as a harness BOM item only."],
        confidence=RecommendationConfidence.heuristic,
    ),
]

DEFAULT_WIRE_SEGMENTS = [
    WireSegment(
        id="wire-finger-sensor-lead",
        name="4-conductor silicone sensor lead",
        conductor_count=4,
        wire_gauge_awg=26,
        length_mm=180,
        signal_or_power="finger force sensor signal",
        color="blue",
        from_endpoint={"connector_id": "conn-controller-finger", "part_id": "part-controller-pcb", "role": "source"},
        to_endpoint={"connector_id": "conn-finger", "part_id": "part-finger-link", "role": "sink"},
        bom_item_id="bom-wire-finger-sensor-lead",
        notes=["Length is a route estimate, not a manufactured harness drawing."],
        confidence=RecommendationConfidence.heuristic,
    ),
    WireSegment(
        id="wire-main-palm-harness",
        name="8-conductor main palm harness",
        conductor_count=8,
        wire_gauge_awg=24,
        length_mm=120,
        signal_or_power="low-voltage tool IO",
        color="black",
        from_endpoint={"connector_id": "conn-controller", "part_id": "part-controller-pcb", "role": "source"},
        to_endpoint={"connector_id": "conn-palm-main", "part_id": "part-palm-plate", "role": "service_disconnect"},
        bom_item_id="bom-wire-main-palm-harness",
        notes=["Current rating and voltage drop are review-required."],
        confidence=RecommendationConfidence.heuristic,
    ),
]

DEFAULT_WIRING_RULES = [
    WiringRuleSet(
        id="rule-mvp-gripper-harness",
        name="MVP gripper harness heuristic",
        required_clearance_min_mm=2,
        required_bend_radius_min_mm=15,
        required_service_loop_min_mm=25,
        evidence_basis="heuristic",
        notes=[
            "Screening threshold only. Replace with manufacturer cable data and CAD sweep before release.",
        ],
    )
]


DEFAULT_ASSEMBLY = Assembly(
    id="asm-open-gripper-demo",
    name="Open gripper demo assembly",
    root_node_id="node-root",
    nodes=[
        AssemblyNode(
            id="node-root",
            name="Gripper root",
            assembly_id="asm-open-gripper-demo",
            part_ids=["part-palm-plate", "part-actuator-bracket", "part-controller-pcb"],
            child_assembly_ids=["asm-finger"],
        ),
        AssemblyNode(
            id="node-finger",
            name="Finger subassembly",
            assembly_id="asm-open-gripper-demo",
            part_id="part-finger-link",
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
            metadata={
                "service_minutes": 10,
                "demo_design_criteria": {
                    "load_capacity_lb": 58,
                    "load_capacity_status": "estimated_from_heuristic",
                    "load_capacity_note": (
                        "Seeded quick-check limit for the demo finger link. This is not FEA and needs review "
                        "before the 50 lb task is trusted."
                    ),
                },
            },
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
            metadata={
                "preferred_manufacturing_process": "cnc_machining",
                "demo_design_criteria": {
                    "load_capacity_lb": 75,
                    "load_capacity_status": "estimated_from_heuristic",
                    "load_capacity_note": (
                        "Seeded support capacity for visual triage. Fastener pull-out and wrist adapter loads "
                        "still need engineering review."
                    ),
                },
            },
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
            metadata={
                "demo_design_criteria": {
                    "load_capacity_lb": 62,
                    "load_capacity_status": "estimated_from_heuristic",
                    "load_capacity_note": (
                        "Seeded bracket reaction-load capacity for the local demo only. Bend radius, fatigue, "
                        "and actuator mounting loads are not solved."
                    ),
                },
            },
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
            metadata={
                "demo_design_criteria": {
                    "load_capacity_lb": None,
                    "load_capacity_status": "review-required",
                    "load_capacity_note": (
                        "The PCB is not a load-bearing part in this seed assembly. Board support and connector "
                        "loads need review."
                    ),
                },
            },
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
                component_id="ec-controller-pcb",
                gender="board",
                pin_labels=["5V", "GND", "SIG+", "SIG-"],
                voltage_rating_v=24,
                current_rating_a=1,
            ),
            to_connector=Connector(
                id="conn-finger",
                name="Finger sensor connector",
                pin_count=4,
                part_id="part-finger-link",
                component_id="ec-finger-force-sensor",
                gender="receptacle",
                pin_labels=["5V", "GND", "SIG+", "SIG-"],
                voltage_rating_v=24,
                current_rating_a=1,
            ),
            endpoints=[
                {"connector_id": "conn-controller-finger", "part_id": "part-controller-pcb", "role": "source"},
                {"connector_id": "conn-finger", "part_id": "part-finger-link", "role": "sink"},
            ],
            path_points_mm=[Vector3(x=0, y=0, z=0), Vector3(x=40, y=8, z=5), Vector3(x=95, y=10, z=4)],
            wire_segment_ids=["wire-finger-sensor-lead"],
            electronics_component_ids=["ec-controller-pcb", "ec-finger-force-sensor"],
            bend_radius_min_mm=12,
            clearance_min_mm=2,
            service_loop_mm=18,
            rule_set_id="rule-mvp-gripper-harness",
            harness_bom=["bom-wire-finger-sensor-lead"],
            diagram_ref="wireviz://open-gripper/finger-sensor",
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
                component_id="ec-controller-pcb",
                gender="board",
                pin_labels=["24V", "GND", "IO1", "IO2", "IO3", "IO4", "SCL", "SDA"],
                voltage_rating_v=24,
                current_rating_a=2,
            ),
            to_connector=Connector(
                id="conn-palm-main",
                name="Palm pass-through",
                pin_count=8,
                part_id="part-palm-plate",
                component_id="ec-palm-pass-through",
                gender="inline",
                pin_labels=["24V", "GND", "IO1", "IO2", "IO3", "IO4", "SCL", "SDA"],
                voltage_rating_v=24,
                current_rating_a=2,
            ),
            endpoints=[
                {"connector_id": "conn-controller", "part_id": "part-controller-pcb", "role": "source"},
                {"connector_id": "conn-palm-main", "part_id": "part-palm-plate", "role": "service_disconnect"},
            ],
            path_points_mm=[Vector3(x=0, y=0, z=0), Vector3(x=25, y=20, z=4), Vector3(x=60, y=25, z=6)],
            wire_segment_ids=["wire-main-palm-harness"],
            electronics_component_ids=["ec-controller-pcb", "ec-palm-pass-through"],
            bend_radius_min_mm=20,
            clearance_min_mm=3,
            service_loop_mm=35,
            rule_set_id="rule-mvp-gripper-harness",
            harness_bom=["bom-wire-main-palm-harness", "bom-palm-grommet"],
            diagram_ref="wireviz://open-gripper/main-palm-harness",
            risk_notes=["Board keep-outs and service-loop clearance need a geometry worker check."],
            confidence=RecommendationConfidence.heuristic,
        ),
    ],
    assembly_structure_confidence=RecommendationConfidence.heuristic,
)

DEFAULT_FINGER_ASSEMBLY = Assembly(
    id="asm-finger",
    name="Finger subassembly",
    root_node_id="node-finger-assembly",
    nodes=[
        AssemblyNode(
            id="node-finger-assembly",
            name="Finger subassembly visual",
            assembly_id="asm-finger",
            part_id="part-finger-link",
            exploded_transform={"translation_mm": {"x": 80, "y": 0, "z": 0}},
        )
    ],
)


DEFAULT_REFERENCE_DESIGNS = [
    ReferenceDesign(
        id="ref-open-gripper-demo",
        name="MechaFlow open gripper demo",
        source_url="https://github.com/SimplyAvi/mechaflow-cad",
        license="MIT",
        supported_file_formats=[CADFileFormat.step, CADFileFormat.freecad, CADFileFormat.gltf],
        cad_files=["gripper.step", "gripper.FCStd"],
        assembly_files=["assembly.json"],
        drawings=["finger-link.pdf"],
        bom_items=[
            BOMItem(id="bom-m4-shoulder", name="M4 shoulder screw", quantity=4),
            BOMItem(id="bom-m4-locknut", name="M4 locknut", quantity=4),
        ],
        electronics_files=["finger-sensor.kicad_pcb", "open-gripper-harness.yml"],
        manufacturing_notes=["Use as an API shape example until a real permissively licensed design is imported."],
        known_limitations=["No geometry file is bundled in this repository yet.", "Analysis results are advisory stub data."],
        example_tasks=DEFAULT_TASKS,
        source=SourceAttribution(
            label="MechaFlow CAD repository",
            url="https://github.com/SimplyAvi/mechaflow-cad",
            license="MIT",
        ),
    )
]
