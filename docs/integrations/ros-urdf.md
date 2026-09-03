# ROS and URDF Adapter

## Purpose

Use ROS 2, URDF, and Xacro data to connect CAD assemblies with robot kinematics, link metadata, joint limits, and motion-aware checks.

## Initial capabilities

- Import URDF and Xacro link and joint structure.
- Map robot links to FreeCAD part or subassembly IDs.
- Export simplified URDF from a license-cleared assembly.
- Seed reach envelope and cable sweep checks.

## Inputs

- URDF, Xacro, STL, DAE, and mesh package references.
- Joint limits and mimic joint metadata.
- Tool frames and task target poses.
- Optional ROS package path mapping.

## Outputs

- Link and joint JSON.
- Reach envelope report.
- CAD-to-URDF mapping table.
- Warnings for missing mass, inertia, collision, or license data.

## Implementation notes

- Robot description files may have a different license from CAD assets. Review separately.
- Keep ROS execution optional for early catalog browsing.
- Do not require a running ROS graph for static URDF parsing.

## Stub

See `RosUrdfAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
