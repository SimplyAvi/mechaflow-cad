"""Executable local solver-readiness boundary for MechaFlow CAD.

This module is intentionally conservative. It can run a tiny deterministic
CalculiX fixture when a local CalculiX binary is present, but it does not claim
that fixture as analysis of the selected project part. Project geometry still
needs FreeCAD preparation and Gmsh meshing before real part FEA can be trusted.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .models import (
    AnalysisArtifact,
    AnalysisArtifactKind,
    AnalysisJob,
    AnalysisJobStatus,
    AnalysisJobType,
    LocalSolverExecutionMode,
    LocalSolverReadinessSummary,
    LocalSolverToolAvailability,
    LocalSolverToolStatus,
    Project,
    RecommendationConfidence,
)
from .runners import list_local_solver_tool_statuses
from .services import build_analysis_readiness_preview

LOCAL_SOLVER_FIXTURE_RUNNER_NAME = "local-calculix-fixture-runner"
CALCULIX_FIXTURE_DECK_NAME = "mechaflow_static_fixture"

CALCULIX_FIXTURE_INPUT = """*HEADING
MechaFlow CAD deterministic CalculiX solver-readiness fixture.
Single C3D8 cantilever-like cube. This verifies executable solver plumbing only.
*NODE,NSET=NALL
1,0.,0.,0.
2,10.,0.,0.
3,0.,10.,0.
4,10.,10.,0.
5,0.,0.,10.
6,10.,0.,10.
7,0.,10.,10.
8,10.,10.,10.
*ELEMENT,TYPE=C3D8,ELSET=EALL
1,1,2,4,3,5,6,8,7
*MATERIAL,NAME=STEEL_TEST
*ELASTIC
210000.,0.30
*SOLID SECTION,ELSET=EALL,MATERIAL=STEEL_TEST
*BOUNDARY
1,1,3,0.
3,1,3,0.
5,1,3,0.
7,1,3,0.
*STEP
*STATIC
*CLOAD
2,3,-25.
4,3,-25.
6,3,-25.
8,3,-25.
*NODE PRINT,NSET=NALL
U
*EL PRINT,ELSET=EALL
S
*END STEP
"""


@dataclass(frozen=True)
class FixtureRunArtifacts:
    workdir: Path
    input_deck: Path
    expected_outputs: list[str]


def _calculix_status(statuses: list[LocalSolverToolStatus] | None = None) -> LocalSolverToolStatus:
    available_statuses = statuses if statuses is not None else list_local_solver_tool_statuses()
    status = next((candidate for candidate in available_statuses if candidate.open_source_tool == "CalculiX"), None)
    if status is None:
        raise RuntimeError("CalculiX command boundary is not registered")
    return status


def build_local_solver_readiness_summary(api_prefix: str = "/api") -> LocalSolverReadinessSummary:
    """Build an honest local analysis capability summary."""

    statuses = list_local_solver_tool_statuses()
    missing_tools = [status.open_source_tool for status in statuses if status.availability == LocalSolverToolAvailability.unavailable]
    available_tools = [status.open_source_tool for status in statuses if status.availability == LocalSolverToolAvailability.available]
    calculix_missing = "CalculiX" in missing_tools
    full_stack_missing = missing_tools
    prefix = api_prefix.rstrip("/") or "/api"
    execution_modes = [
        LocalSolverExecutionMode(
            id="pre_solver_package",
            label="Pre-solver readiness package",
            status="available_not_fea",
            summary=(
                "Always available. Packages loads, constraints, material provenance, expected solver files, "
                "and demo screening estimates. Does not run a solver."
            ),
            required_tools=[],
            missing_tools=[],
            review_required=["Not a real FEA result. Use only for input review and worker handoff."],
            endpoints=[f"{prefix}/projects/{{project_id}}/analysis-jobs/pre-solver-runs"],
        ),
        LocalSolverExecutionMode(
            id="calculix_fixture",
            label="CalculiX deterministic fixture run",
            status="solver_unavailable" if calculix_missing else "ready_to_execute",
            summary=(
                "Runs a generated one-element CalculiX static structural fixture to prove the local solver "
                "process, logs, input deck, and output collection boundary. It is not part or assembly FEA."
            ),
            required_tools=["CalculiX"],
            missing_tools=["CalculiX"] if calculix_missing else [],
            review_required=[
                "Fixture result proves only that the local CalculiX boundary executes.",
                "Do not treat fixture stress or displacement as a MechaFlow project result.",
            ],
            endpoints=[f"{prefix}/projects/{{project_id}}/analysis-jobs/solver-readiness-runs"],
        ),
        LocalSolverExecutionMode(
            id="full_part_fea",
            label="Full local part FEA stack",
            status="review_required" if not full_stack_missing else "solver_unavailable",
            summary=(
                "Requires FreeCAD geometry preparation, Gmsh meshing, and CalculiX solving with named regions. "
                "This MVP exposes the boundary and readiness artifacts, but full part FEA is not implemented yet."
            ),
            required_tools=["FreeCAD", "Gmsh", "CalculiX"],
            missing_tools=full_stack_missing,
            review_required=[
                "FreeCAD and Gmsh worker implementation is still required before project geometry can be solved.",
                "Named faces, fixtures, mesh quality, and engineering review are mandatory before release use.",
            ],
            endpoints=[
                f"{prefix}/local-analysis/solver-readiness",
                f"{prefix}/projects/{{project_id}}/analysis-readiness/{{target_id}}",
            ],
        ),
    ]
    status = "ready_to_execute_fixture" if not calculix_missing else "solver_unavailable"
    return LocalSolverReadinessSummary(
        status=status,
        tool_statuses=statuses,
        available_tools=available_tools,
        missing_tools=missing_tools,
        execution_modes=execution_modes,
        install_guidance=[
            status.install_guidance
            for status in statuses
            if status.availability == LocalSolverToolAvailability.unavailable and status.install_guidance
        ],
        summary=(
            "CalculiX is available for the deterministic solver fixture. Full project FEA still needs "
            "FreeCAD and Gmsh workers plus engineering review."
            if not calculix_missing
            else "CalculiX is missing, so no real local solver execution can run. Pre-solver packages remain available."
        ),
        generated_at=datetime.now(timezone.utc),
    )


def _write_fixture_input() -> FixtureRunArtifacts:
    workdir = Path(tempfile.mkdtemp(prefix="mechaflow-calculix-fixture-"))
    input_deck = workdir / f"{CALCULIX_FIXTURE_DECK_NAME}.inp"
    input_deck.write_text(CALCULIX_FIXTURE_INPUT, encoding="utf-8")
    return FixtureRunArtifacts(
        workdir=workdir,
        input_deck=input_deck,
        expected_outputs=[
            f"{CALCULIX_FIXTURE_DECK_NAME}.dat",
            f"{CALCULIX_FIXTURE_DECK_NAME}.frd",
            f"{CALCULIX_FIXTURE_DECK_NAME}.sta",
            f"{CALCULIX_FIXTURE_DECK_NAME}.cvg",
        ],
    )


def _run_calculix(resolved_command: str, workdir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [resolved_command, CALCULIX_FIXTURE_DECK_NAME],
        cwd=workdir,
        capture_output=True,
        check=False,
        text=True,
        timeout=45,
    )


ARTIFACT_RETENTION_DAYS = 7
MAX_ARTIFACT_BUNDLES = 100


def _prepare_artifact_root(artifact_root: Path, reserved_bundles: int = 0) -> None:
    artifact_root.mkdir(parents=True, exist_ok=True)
    cutoff = datetime.now(timezone.utc).timestamp() - ARTIFACT_RETENTION_DAYS * 86400
    bundles = sorted((path for path in artifact_root.iterdir() if path.is_dir()), key=lambda path: path.stat().st_mtime)
    for path in tuple(bundles):
        if path.stat().st_mtime < cutoff:
            shutil.rmtree(path)
    remaining = sorted((path for path in artifact_root.iterdir() if path.is_dir()), key=lambda path: path.stat().st_mtime)
    retained_limit = max(0, MAX_ARTIFACT_BUNDLES - reserved_bundles)
    for path in remaining[:-retained_limit] if retained_limit else remaining:
        shutil.rmtree(path)


def _persist_fixture_files(fixture: FixtureRunArtifacts, artifact_root: Path, job_id: str) -> Path:
    _prepare_artifact_root(artifact_root, reserved_bundles=1)
    destination = artifact_root / job_id
    destination.mkdir()
    for path in fixture.workdir.iterdir():
        if path.is_file():
            shutil.copy2(path, destination / path.name)
    return destination


def _artifact_file_manifest(
    workdir: Path,
    api_prefix: str,
    artifact_id: str,
    expected_outputs: list[str] | None = None,
) -> list[dict[str, Any]]:
    names = {path.name for path in workdir.iterdir() if path.is_file()}
    names.update(expected_outputs or [])
    paths = [workdir / name for name in sorted(names)]
    manifest: list[dict[str, Any]] = []
    for path in paths:
        if path.exists():
            content = path.read_text(encoding="utf-8", errors="replace")
            manifest.append(
                {
                    "name": path.name,
                    "download_url": f"{api_prefix}/analysis-artifacts/{artifact_id}/{path.name}",
                    "bytes": path.stat().st_size,
                    "content_preview": content[:6000],
                }
            )
        else:
            manifest.append(
                {
                    "name": path.name,
                    "missing": True,
                }
            )
    return manifest


def run_calculix_fixture(
    project: Project,
    job: AnalysisJob,
    artifact_root: Path = Path(".mechaflow-artifacts"),
    api_prefix: str = "/api",
) -> AnalysisJob:
    """Run or prepare a deterministic CalculiX fixture job with honest provenance."""

    now = datetime.now(timezone.utc)
    readiness = build_analysis_readiness_preview(project, job.target_id, include_demo_estimates=False)
    statuses = list_local_solver_tool_statuses()
    calculix = _calculix_status(statuses)
    fixture = _write_fixture_input()
    artifact_id = f"artifact-{uuid4()}"
    common_payload: dict[str, Any] = {
        "artifact_contract": "local_calculix_fixture_run_v1",
        "target_context": {
            "project_id": project.id,
            "target_id": readiness.target_id,
            "target_name": readiness.target_name,
            "target_kind": readiness.target_kind,
            "readiness_state": readiness.state.value,
            "readiness_summary": readiness.summary,
        },
        "not_project_fea": True,
        "fixture_scope": (
            "Generated deterministic CalculiX fixture only. Project geometry was not prepared, meshed, or solved."
        ),
        "input_deck_name": fixture.input_deck.name,
        "expected_outputs": fixture.expected_outputs,
        "tool_boundaries": [status.model_dump(mode="json") for status in statuses],
        "review_required": [
            "This fixture is real solver execution only when CalculiX runs successfully.",
            "It is not a part or assembly stress result.",
            "Full project FEA still requires FreeCAD geometry prep, Gmsh mesh generation, named regions, and engineering review.",
        ],
    }

    if calculix.availability != LocalSolverToolAvailability.available or not calculix.resolved_command:
        artifact = AnalysisArtifact(
            id=artifact_id,
            job_id=job.id,
            kind=AnalysisArtifactKind.fea_summary,
            title="CalculiX solver fixture prepared, solver unavailable",
            summary=(
                "Generated a deterministic CalculiX input deck and readiness manifest, but did not run a solve "
                "because CalculiX is not available on PATH."
            ),
            payload={
                **common_payload,
                "result_label": "solver_unavailable_review_required",
                "missing_tools": ["CalculiX"],
                "install_guidance": calculix.install_guidance,
                "file_manifest": _artifact_file_manifest(
                    _persist_fixture_files(fixture, artifact_root, job.id),
                    api_prefix,
                    artifact_id,
                    fixture.expected_outputs,
                ),
                "retention": f"Persisted for {ARTIFACT_RETENTION_DAYS} days, capped at {MAX_ARTIFACT_BUNDLES} bundles.",
            },
            confidence=RecommendationConfidence.unknown,
            generated_by=LOCAL_SOLVER_FIXTURE_RUNNER_NAME,
            created_at=now,
        )
        shutil.rmtree(fixture.workdir)
        return job.model_copy(
            update={
                "status": AnalysisJobStatus.solver_unavailable,
                "artifacts": [*job.artifacts, artifact],
                "result_summary": {
                    **job.result_summary,
                    "message": "CalculiX is unavailable. Fixture input was generated, but no solver was run.",
                    "progress": 100,
                    "runner": LOCAL_SOLVER_FIXTURE_RUNNER_NAME,
                    "trust_label": "pre_solver_input",
                    "review_status": "solver_unavailable_review_required",
                    "readiness_state": readiness.state.value,
                    "artifact_id": artifact.id,
                    "artifact_kind": artifact.kind.value,
                    "missing_tools": ["CalculiX"],
                    "install_guidance": calculix.install_guidance,
                },
                "updated_at": now,
            },
            deep=True,
        )

    try:
        completed = _run_calculix(calculix.resolved_command, fixture.workdir)
        return_code = completed.returncode
        timed_out = False
        stderr = completed.stderr
        stdout = completed.stdout
    except subprocess.TimeoutExpired as exc:
        return_code = None
        timed_out = True
        stderr = str(exc)
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
    except OSError as exc:
        return_code = None
        timed_out = False
        stderr = str(exc)
        stdout = ""

    durable_workdir = _persist_fixture_files(fixture, artifact_root, job.id)
    shutil.rmtree(fixture.workdir)
    file_manifest = _artifact_file_manifest(
        durable_workdir,
        api_prefix,
        artifact_id,
        fixture.expected_outputs,
    )
    produced_outputs = [entry["name"] for entry in file_manifest if not entry.get("missing")]
    expected_outputs = {f"{CALCULIX_FIXTURE_DECK_NAME}.{suffix}" for suffix in ("dat", "frd", "sta")}
    solver_succeeded = return_code == 0 and expected_outputs.issubset(produced_outputs)
    artifact = AnalysisArtifact(
        id=artifact_id,
        job_id=job.id,
        kind=AnalysisArtifactKind.fea_summary,
        title=(
            "CalculiX deterministic fixture completed"
            if solver_succeeded
            else "CalculiX deterministic fixture failed or needs review"
        ),
        summary=(
            "CalculiX ran a generated deterministic static structural fixture. This is real solver execution, "
            "but it is not analysis of the selected project part."
            if solver_succeeded
            else "CalculiX was invoked for the deterministic fixture, but did not complete with expected outputs."
        ),
        payload={
            **common_payload,
            "result_label": "real_solver_fixture_not_project_fea" if solver_succeeded else "solver_failed_review_required",
            "resolved_command": calculix.resolved_command,
            "return_code": return_code,
            "timed_out": timed_out,
            "stdout": stdout[-6000:],
            "stderr": stderr[-6000:],
            "file_manifest": file_manifest,
            "produced_outputs": produced_outputs,
            "retention": f"Persisted for {ARTIFACT_RETENTION_DAYS} days, capped at {MAX_ARTIFACT_BUNDLES} bundles.",
        },
        confidence=RecommendationConfidence.calculated if solver_succeeded else RecommendationConfidence.unknown,
        generated_by=LOCAL_SOLVER_FIXTURE_RUNNER_NAME,
        created_at=now,
    )
    return job.model_copy(
        update={
            "status": AnalysisJobStatus.completed if solver_succeeded else AnalysisJobStatus.failed,
            "artifacts": [*job.artifacts, artifact],
            "result_summary": {
                **job.result_summary,
                "message": artifact.summary,
                "progress": 100,
                "runner": LOCAL_SOLVER_FIXTURE_RUNNER_NAME,
                "trust_label": "solver_result" if solver_succeeded else "pre_solver_input",
                "review_status": "fixture_solver_result_not_project_fea" if solver_succeeded else "solver_failed_review_required",
                "readiness_state": readiness.state.value,
                "artifact_id": artifact.id,
                "artifact_kind": artifact.kind.value,
                "return_code": return_code,
                "timed_out": timed_out,
                "produced_outputs": produced_outputs,
            },
            "updated_at": datetime.now(timezone.utc),
        },
        deep=True,
    )
