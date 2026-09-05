"""Analysis job queue orchestration helpers.

This module keeps local/cloud execution guidance deterministic and honest. It
never starts paid cloud compute and never treats cloud planning estimates as a
quote or billing signal.
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timezone
from typing import Callable, Iterable

from .adapters import choose_adapter, get_adapter_for_job
from .models import (
    AnalysisArtifact,
    AnalysisExecutionRecommendationStatus,
    AnalysisExecutionTarget,
    AnalysisExecutionTargetRecommendation,
    AnalysisEstimateRange,
    AnalysisJob,
    AnalysisJobQueue,
    AnalysisJobRequest,
    AnalysisJobStatus,
    AnalysisJobType,
    AnalysisReadinessState,
    AnalysisReport,
    CachedAnalysisArtifactReference,
    CachedAnalysisReportReference,
    CachedArtifactStatus,
    EstimateBasis,
    LocalSolverToolAvailability,
    LocalSolverToolStatus,
    Project,
    RecommendationConfidence,
    ReportStatus,
)
from .services import PartNotFoundError, build_analysis_readiness_preview

LOCAL_SOLVER_TOOLS = {"FreeCAD", "Gmsh", "CalculiX"}
STRUCTURAL_JOB_TYPES = {
    AnalysisJobType.run_fea,
    AnalysisJobType.rerate_payload_capability,
    AnalysisJobType.quick_load_heuristic,
}
PRESOLVER_LOCAL_RUNNERS = {"local-pre-solver-runner", "local-calculix-fixture-runner"}
UNCONFIGURED_CLOUD_NOTICE = (
    "Cloud execution is unavailable until a captain configures a provider, credentials, budget guardrails, "
    "artifact egress rules, and explicit user approval. Values here are planning estimates only."
)


def _estimate_range(
    label: str,
    minimum: float | None,
    maximum: float | None,
    unit: str,
    basis: EstimateBasis,
    notice: str,
    confidence: RecommendationConfidence = RecommendationConfidence.heuristic,
) -> AnalysisEstimateRange:
    return AnalysisEstimateRange(
        label=label,
        min=None if minimum is None else round(max(0, minimum), 2),
        max=None if maximum is None else round(max(0, maximum), 2),
        unit=unit,
        basis=basis,
        confidence=confidence,
        notice=notice,
    )


def _target_part_count(project: Project, target_id: str) -> int:
    if target_id == project.id or target_id == project.reference_design_id:
        return max(1, sum(len(assembly.parts) for assembly in project.assemblies))
    for assembly in project.assemblies:
        if assembly.id == target_id:
            return len(assembly.parts)
        if any(part.id == target_id for part in assembly.parts):
            return 1
        if any(route.id == target_id for route in assembly.wiring_routes):
            return 1
    return 0


def _complexity_score(project: Project, request: AnalysisJobRequest) -> float:
    part_count = _target_part_count(project, request.target_id)
    target_factor = max(1, part_count)
    input_summary = request.input_summary if isinstance(request.input_summary, dict) else {}
    load_count = len(input_summary.get("load_case_ids", [])) if isinstance(input_summary.get("load_case_ids"), list) else 0
    constraint_count = len(input_summary.get("constraint_ids", [])) if isinstance(input_summary.get("constraint_ids"), list) else 0
    job_factor = 3 if request.job_type == AnalysisJobType.run_fea else 2 if request.job_type in STRUCTURAL_JOB_TYPES else 1
    return float(target_factor * job_factor + load_count + constraint_count)


def _readiness_review(project: Project, request: AnalysisJobRequest) -> tuple[AnalysisReadinessState | None, list[str]]:
    if request.job_type not in STRUCTURAL_JOB_TYPES:
        return None, []
    try:
        preview = build_analysis_readiness_preview(project, request.target_id, include_demo_estimates=False)
    except PartNotFoundError:
        return None, ["Analysis target is missing from the project."]
    blocking = list(preview.review_required)
    if preview.state == AnalysisReadinessState.blocked_missing_inputs:
        blocking.append("Readiness state is blocked_missing_inputs, so neither local nor cloud solving should start.")
    elif preview.state == AnalysisReadinessState.review_required:
        blocking.append("Readiness state is review_required and needs engineering review before solving.")
    return preview.state, blocking


def _missing_solver_tools(tool_statuses: Iterable[LocalSolverToolStatus], required: set[str]) -> list[str]:
    return sorted(
        status.open_source_tool
        for status in tool_statuses
        if status.open_source_tool in required and status.availability == LocalSolverToolAvailability.unavailable
    )


def build_execution_target_recommendation(
    project: Project,
    request: AnalysisJobRequest,
    tool_statuses: list[LocalSolverToolStatus],
    adapter_name: str | None = None,
) -> AnalysisExecutionTargetRecommendation:
    """Recommend a safe execution target without invoking local or cloud tools."""

    request = request.model_copy(update={"project_id": project.id}, deep=True)
    default_adapter = choose_adapter(request)
    synthetic_job = AnalysisJob(
        id="job-recommendation-preview",
        job_type=request.job_type,
        status=AnalysisJobStatus.queued,
        target_id=request.target_id,
        project_id=project.id,
        adapter_name=adapter_name or (default_adapter.status.name if default_adapter else "unassigned"),
        local_compute_preferred=request.local_compute_preferred,
        input_summary=request.input_summary,
    )
    adapter = get_adapter_for_job(synthetic_job)
    complexity = _complexity_score(project, request)
    readiness_state, review_required = _readiness_review(project, request)
    required_tools: set[str] = set()
    if request.job_type == AnalysisJobType.run_fea:
        required_tools = set(LOCAL_SOLVER_TOOLS)
    elif request.job_type in {AnalysisJobType.rerate_payload_capability}:
        required_tools = {"CalculiX"}
    elif request.job_type in {AnalysisJobType.quick_load_heuristic}:
        required_tools = set() if synthetic_job.adapter_name in PRESOLVER_LOCAL_RUNNERS else {"CalculiX"}
    elif adapter and adapter.status.open_source_candidate:
        candidate = adapter.status.open_source_candidate.lower()
        if "freecad" in candidate:
            required_tools = {"FreeCAD"}
        elif "gmsh" in candidate:
            required_tools = {"Gmsh"}
        elif "calculix" in candidate:
            required_tools = {"CalculiX"}
    missing_tools = _missing_solver_tools(tool_statuses, required_tools)
    target_is_known = _target_part_count(project, request.target_id) > 0 or request.target_id == project.id
    base_runtime = 2 if request.job_type == AnalysisJobType.quick_load_heuristic else 6
    expected_runtime = max(base_runtime, complexity * (8 if request.job_type == AnalysisJobType.run_fea else 2))
    expected_runtime = min(expected_runtime, 240)
    reasons: list[str] = [
        f"Deterministic model complexity score {complexity:g} from target part count and requested job type.",
    ]
    if adapter is not None:
        reasons.append(f"Adapter {adapter.status.name} supports {request.job_type.value} and queues to {adapter.status.queue_name}.")
    if readiness_state is not None:
        reasons.append(f"Analysis readiness state is {readiness_state.value}.")
    if missing_tools:
        reasons.append(f"Local solver stack is incomplete: {', '.join(missing_tools)} missing.")
    if not request.local_compute_preferred:
        reasons.append("User did not prefer local compute, so cloud is considered only as a disabled planning option.")

    if not target_is_known:
        unavailable_estimate = _estimate_range(
            "unavailable",
            None,
            None,
            "unavailable",
            EstimateBasis.unavailable,
            "No execution estimate is available for an unknown project target.",
        )
        return AnalysisExecutionTargetRecommendation(
            recommended_target=AnalysisExecutionTarget.unavailable,
            status=AnalysisExecutionRecommendationStatus.unavailable,
            summary="No execution target is available until the analysis target is corrected.",
            reasons=[*reasons, "The requested project target does not exist."],
            missing_local_tools=missing_tools,
            review_required=[*review_required, "Select an existing project target before execution."],
            model_complexity_score=complexity,
            expected_runtime_minutes=unavailable_estimate,
            cost_estimate=unavailable_estimate,
            wait_time_estimate=unavailable_estimate,
            cloud_execution_available=False,
            cloud_configuration_required=True,
            cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
        )

    if synthetic_job.adapter_name == "local-pre-solver-runner":
        return AnalysisExecutionTargetRecommendation(
            recommended_target=AnalysisExecutionTarget.local,
            status=(
                AnalysisExecutionRecommendationStatus.review_required
                if review_required
                else AnalysisExecutionRecommendationStatus.ready
            ),
            summary="Local pre-solver packaging is recommended. It produces cached review artifacts without running CAD, meshing, solver, or cloud compute.",
            reasons=[*reasons, "The pre-solver runner is safe to run locally because it only packages metadata and demo screening estimates."],
            missing_local_tools=[],
            review_required=review_required,
            model_complexity_score=complexity,
            expected_runtime_minutes=_estimate_range(
                "local pre-solver runtime estimate",
                1,
                max(3, min(12, complexity)),
                "minutes",
                EstimateBasis.deterministic_local_heuristic,
                "Estimate covers metadata packaging only; it is not FEA runtime.",
            ),
            cost_estimate=_estimate_range(
                "local pre-solver cost estimate",
                0,
                0,
                "USD",
                EstimateBasis.deterministic_local_heuristic,
                "Local pre-solver packaging uses the desktop machine. This is not paid compute.",
            ),
            wait_time_estimate=_estimate_range(
                "local queue wait estimate",
                0,
                2,
                "minutes",
                EstimateBasis.deterministic_local_heuristic,
                "Assumes a single local queue in the desktop MVP.",
            ),
            cloud_execution_available=False,
            cloud_configuration_required=True,
            cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
        )

    if synthetic_job.adapter_name == "local-calculix-fixture-runner":
        if missing_tools:
            return AnalysisExecutionTargetRecommendation(
                recommended_target=AnalysisExecutionTarget.unavailable,
                status=AnalysisExecutionRecommendationStatus.review_required,
                summary="Local CalculiX fixture execution is unavailable until CalculiX is installed; the MVP can still prepare input-deck artifacts.",
                reasons=[*reasons, "The fixture runner is a local boundary only and does not fall back to cloud."],
                missing_local_tools=missing_tools,
                review_required=[*review_required, "Install CalculiX before real fixture execution."],
                model_complexity_score=complexity,
                expected_runtime_minutes=_estimate_range(
                    "fixture runtime after install",
                    1,
                    3,
                    "minutes",
                    EstimateBasis.deterministic_local_heuristic,
                    "Estimate applies only after CalculiX is installed locally.",
                ),
                cost_estimate=_estimate_range(
                    "local fixture cost estimate",
                    0,
                    0,
                    "USD",
                    EstimateBasis.deterministic_local_heuristic,
                    "Local fixture uses the desktop machine. This is not paid compute.",
                ),
                wait_time_estimate=_estimate_range(
                    "unavailable until CalculiX install",
                    None,
                    None,
                    "minutes",
                    EstimateBasis.unavailable,
                    "No wait-time estimate is current while the required local solver is missing.",
                ),
                cloud_execution_available=False,
                cloud_configuration_required=True,
                cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
            )
        return AnalysisExecutionTargetRecommendation(
            recommended_target=AnalysisExecutionTarget.local,
            status=AnalysisExecutionRecommendationStatus.review_required,
            summary="Local CalculiX fixture is available, but it verifies solver plumbing only and is not project FEA.",
            reasons=[*reasons, "CalculiX is available for the deterministic local fixture boundary."],
            missing_local_tools=[],
            review_required=[*review_required, "Fixture stress or displacement must not be treated as a project result."],
            model_complexity_score=complexity,
            expected_runtime_minutes=_estimate_range(
                "local fixture runtime estimate",
                1,
                3,
                "minutes",
                EstimateBasis.deterministic_local_heuristic,
                "Estimate covers the deterministic fixture only, not project FEA.",
            ),
            cost_estimate=_estimate_range(
                "local fixture cost estimate",
                0,
                0,
                "USD",
                EstimateBasis.deterministic_local_heuristic,
                "Local fixture uses the desktop machine. This is not paid compute.",
            ),
            wait_time_estimate=_estimate_range(
                "local fixture queue wait estimate",
                0,
                2,
                "minutes",
                EstimateBasis.deterministic_local_heuristic,
                "Assumes a single local fixture run in the desktop MVP.",
            ),
            cloud_execution_available=False,
            cloud_configuration_required=True,
            cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
        )

    unavailable_estimate = _estimate_range(
        "unavailable",
        None,
        None,
        "unavailable",
        EstimateBasis.unavailable,
        "No execution estimate is available for an unsupported or invalid target.",
    )
    if adapter is None or not target_is_known:
        return AnalysisExecutionTargetRecommendation(
            recommended_target=AnalysisExecutionTarget.unavailable,
            status=AnalysisExecutionRecommendationStatus.unavailable,
            summary="No execution target is available for this job until the adapter and target are corrected.",
            reasons=[*reasons, "No supported adapter or project target is available."],
            missing_local_tools=missing_tools,
            review_required=review_required,
            model_complexity_score=complexity,
            expected_runtime_minutes=unavailable_estimate,
            cost_estimate=unavailable_estimate,
            wait_time_estimate=unavailable_estimate,
            cloud_execution_available=False,
            cloud_configuration_required=True,
            cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
        )

    if review_required and request.job_type in STRUCTURAL_JOB_TYPES:
        return AnalysisExecutionTargetRecommendation(
            recommended_target=AnalysisExecutionTarget.unavailable,
            status=AnalysisExecutionRecommendationStatus.review_required,
            summary="Review required before any local or cloud project FEA can be recommended.",
            reasons=[*reasons, "Missing or review-required inputs take precedence over speed or cost."],
            missing_local_tools=missing_tools,
            review_required=review_required,
            model_complexity_score=complexity,
            expected_runtime_minutes=_estimate_range(
                "blocked until review",
                expected_runtime,
                expected_runtime * 1.5,
                "minutes",
                EstimateBasis.deterministic_local_heuristic,
                "Runtime is a local planning heuristic after review blockers are cleared.",
            ),
            cost_estimate=_estimate_range(
                "unavailable until review",
                None,
                None,
                "USD",
                EstimateBasis.unavailable,
                "No paid quote is available and cloud execution is not configured.",
            ),
            wait_time_estimate=_estimate_range(
                "blocked until review",
                None,
                None,
                "minutes",
                EstimateBasis.unavailable,
                "Wait time is unavailable until missing CAD, material, load, or fixture inputs are reviewed.",
            ),
            cloud_execution_available=False,
            cloud_configuration_required=True,
            cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
        )

    if (
        missing_tools
        or expected_runtime > 90
        or not request.local_compute_preferred
        or (request.job_type in STRUCTURAL_JOB_TYPES and synthetic_job.adapter_name not in PRESOLVER_LOCAL_RUNNERS)
    ):
        cloud_min = max(3, expected_runtime * 0.2)
        cloud_max = max(cloud_min + 5, expected_runtime * 0.5)
        return AnalysisExecutionTargetRecommendation(
            recommended_target=AnalysisExecutionTarget.cloud_recommended_when_configured,
            status=AnalysisExecutionRecommendationStatus.review_required,
            summary="Cloud planning is recommended only after configuration because local execution is slow, incomplete, or not preferred.",
            reasons=[*reasons, "Cloud execution remains unavailable in this MVP and cannot start from this UI."],
            missing_local_tools=missing_tools,
            review_required=[
                *review_required,
                "Cloud provider, budget limit, artifact handling, and explicit approval must be configured before remote execution.",
            ],
            model_complexity_score=complexity,
            expected_runtime_minutes=_estimate_range(
                "local runtime planning estimate",
                expected_runtime,
                expected_runtime * 1.4,
                "minutes",
                EstimateBasis.deterministic_local_heuristic,
                "Estimate is based on target complexity only; no benchmark or paid compute was run.",
            ),
            cost_estimate=_estimate_range(
                "cloud planning cost estimate, not a quote",
                complexity * 0.35,
                complexity * 1.25 + 2,
                "USD",
                EstimateBasis.cloud_planning_estimate,
                "Planning estimate only. This is not real billing, a supplier quote, or a compute-provider price.",
            ),
            wait_time_estimate=_estimate_range(
                "cloud planning wait estimate",
                cloud_min,
                cloud_max,
                "minutes",
                EstimateBasis.cloud_planning_estimate,
                "Cloud wait estimate is hypothetical until a provider and queue are configured.",
            ),
            cloud_execution_available=False,
            cloud_configuration_required=True,
            cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
        )

    return AnalysisExecutionTargetRecommendation(
        recommended_target=AnalysisExecutionTarget.local,
        status=AnalysisExecutionRecommendationStatus.ready,
        summary="Local execution is the conservative recommendation for this queued analysis job.",
        reasons=[*reasons, "Required local tools are available or this job only needs the safe local pre-solver boundary."],
        missing_local_tools=[],
        review_required=review_required,
        model_complexity_score=complexity,
        expected_runtime_minutes=_estimate_range(
            "local runtime planning estimate",
            expected_runtime,
            expected_runtime * 1.35,
            "minutes",
            EstimateBasis.deterministic_local_heuristic,
            "Estimate is deterministic from project complexity and does not guarantee wall-clock runtime.",
        ),
        cost_estimate=_estimate_range(
            "local compute cost estimate",
            0,
            0,
            "USD",
            EstimateBasis.deterministic_local_heuristic,
            "Local runs use the user's machine in this MVP. This is not a paid compute quote.",
        ),
        wait_time_estimate=_estimate_range(
            "local queue wait estimate",
            0,
            max(1, min(15, math.ceil(complexity))),
            "minutes",
            EstimateBasis.deterministic_local_heuristic,
            "Wait estimate assumes one local desktop job queue and no background worker congestion telemetry.",
        ),
        cloud_execution_available=False,
        cloud_configuration_required=True,
        cloud_notice=UNCONFIGURED_CLOUD_NOTICE,
    )


def _manifest_download_urls(artifact: AnalysisArtifact) -> list[str]:
    manifest = artifact.payload.get("file_manifest", [])
    if not isinstance(manifest, list):
        return []
    urls = []
    for item in manifest:
        if not isinstance(item, dict) or item.get("missing"):
            continue
        download_url = item.get("download_url")
        name = item.get("name")
        if (
            isinstance(download_url, str)
            and isinstance(name, str)
            and name not in {".", ".."}
            and "/" not in name
            and "\\" not in name
            and download_url == f"/api/analysis-artifacts/{artifact.id}/{name}"
        ):
            urls.append(download_url)
    return urls


def _artifact_cache_status(
    artifact: AnalysisArtifact,
    artifact_file_exists: Callable[[AnalysisArtifact, str], bool] | None = None,
) -> tuple[CachedArtifactStatus, str | None]:
    if "file_manifest" not in artifact.payload:
        return CachedArtifactStatus.metadata_only, "Artifact metadata is cached, but no downloadable local files are attached."
    manifest = artifact.payload["file_manifest"]
    if not isinstance(manifest, list):
        return CachedArtifactStatus.stale_missing_files, "Artifact file manifest is malformed."
    if not manifest:
        return CachedArtifactStatus.metadata_only, "Artifact metadata is cached, but no downloadable local files are attached."
    produced = [item for item in manifest if isinstance(item, dict) and not item.get("missing")]
    if not produced:
        return CachedArtifactStatus.stale_missing_files, "Artifact manifest has no currently downloadable files."
    if any(
        not isinstance(item.get("name"), str)
        or not item["name"].strip()
        or item["name"] in {".", ".."}
        or "/" in item["name"]
        or "\\" in item["name"]
        or any(ord(char) < 32 or ord(char) == 127 for char in item["name"])
        for item in produced
    ):
        return CachedArtifactStatus.stale_missing_files, "Artifact manifest contains an unsafe file name."
    if len(_manifest_download_urls(artifact)) != len(produced):
        return CachedArtifactStatus.stale_missing_files, "Artifact manifest download URLs do not match the current artifact boundary."
    if artifact_file_exists is None or any(not artifact_file_exists(artifact, item["name"]) for item in produced):
        return CachedArtifactStatus.stale_missing_files, "Retained artifact files cannot be confirmed at the local storage boundary."
    return CachedArtifactStatus.current, None


def build_cached_artifact_refs(
    job: AnalysisJob,
    artifact_file_exists: Callable[[AnalysisArtifact, str], bool] | None = None,
) -> list[CachedAnalysisArtifactReference]:
    refs = []
    for artifact in job.artifacts:
        status, stale_reason = _artifact_cache_status(artifact, artifact_file_exists)
        refs.append(CachedAnalysisArtifactReference(
            artifact_id=artifact.id,
            job_id=job.id,
            project_id=job.project_id,
            kind=artifact.kind,
            title=artifact.title,
            status=status,
            generated_by=artifact.generated_by,
            generated_at=artifact.created_at,
            download_urls=_manifest_download_urls(artifact),
            summary=artifact.summary,
            stale_reason=stale_reason,
        ))
    return refs


def build_cached_report_refs(project: Project, job: AnalysisJob) -> list[CachedAnalysisReportReference]:
    report_id = job.result_summary.get("report_id")
    if not isinstance(report_id, str) or not report_id:
        return []
    refs = []
    for report in project.reports:
        if report.id != report_id:
            continue
        refs.append(CachedAnalysisReportReference(
            report_id=report.id,
            project_id=project.id,
            title=report.title,
            status=report.status,
            generated_at=report.generated_at,
            derived_from_job_id=job.id if report_id == report.id else None,
            current=report.status != ReportStatus.superseded,
            summary=report.summary,
        ))
    return refs[:3]


def _status_for_recommendation(
    status: AnalysisJobStatus,
    recommendation: AnalysisExecutionTargetRecommendation,
) -> AnalysisJobStatus:
    if status != AnalysisJobStatus.queued:
        return status
    if recommendation.status == AnalysisExecutionRecommendationStatus.review_required:
        return AnalysisJobStatus.review_required
    if recommendation.status == AnalysisExecutionRecommendationStatus.unavailable:
        return (
            AnalysisJobStatus.solver_unavailable
            if recommendation.missing_local_tools
            else AnalysisJobStatus.review_required
        )
    return status


def enrich_analysis_job_for_queue(
    project: Project,
    job: AnalysisJob,
    tool_statuses: list[LocalSolverToolStatus],
    artifact_file_exists: Callable[[AnalysisArtifact, str], bool] | None = None,
) -> AnalysisJob:
    request = AnalysisJobRequest(
        job_type=job.job_type,
        target_id=job.target_id,
        project_id=project.id,
        local_compute_preferred=job.local_compute_preferred,
        input_summary=job.input_summary,
    )
    recommendation = build_execution_target_recommendation(project, request, tool_statuses, adapter_name=job.adapter_name)
    return job.model_copy(
        update={
            "status": _status_for_recommendation(job.status, recommendation),
            "recommendation": recommendation,
            "cached_artifact_refs": build_cached_artifact_refs(job, artifact_file_exists),
            "cached_report_refs": build_cached_report_refs(project, job),
        },
        deep=True,
    )


def build_analysis_job_queue(
    project: Project,
    tool_statuses: list[LocalSolverToolStatus],
    artifact_file_exists: Callable[[AnalysisArtifact, str], bool] | None = None,
) -> AnalysisJobQueue:
    jobs = [enrich_analysis_job_for_queue(project, job, tool_statuses, artifact_file_exists) for job in project.analysis_jobs]
    counts = Counter(job.status.value for job in jobs)
    local_ready_count = sum(
        1
        for job in jobs
        if job.recommendation
        and job.recommendation.recommended_target == AnalysisExecutionTarget.local
        and job.recommendation.status == AnalysisExecutionRecommendationStatus.ready
    )
    cloud_planning_count = sum(1 for job in jobs if job.recommendation and job.recommendation.recommended_target == AnalysisExecutionTarget.cloud_recommended_when_configured)
    review_required_count = sum(1 for job in jobs if job.recommendation and job.recommendation.status == AnalysisExecutionRecommendationStatus.review_required)
    unavailable_count = sum(1 for job in jobs if job.recommendation and job.recommendation.status == AnalysisExecutionRecommendationStatus.unavailable)
    return AnalysisJobQueue(
        project_id=project.id,
        jobs=jobs,
        status_counts=dict(counts),
        local_ready_count=local_ready_count,
        cloud_planning_count=cloud_planning_count,
        review_required_count=review_required_count,
        unavailable_count=unavailable_count,
        summary=(
            f"{len(jobs)} analysis job{'s' if len(jobs) != 1 else ''}: {local_ready_count} local-ready, "
            f"{cloud_planning_count} cloud-planning only, {review_required_count} review-required."
        ),
    )


def normalize_cached_references(
    project_id: str,
    job: AnalysisJob,
    reports: Iterable[AnalysisReport],
    artifact_file_exists: Callable[[AnalysisArtifact, str], bool] | None = None,
) -> AnalysisJob:
    artifact_by_id = {artifact.id: artifact for artifact in job.artifacts}
    reports = list(reports)
    for artifact in job.artifacts:
        manifest = artifact.payload.get("file_manifest", [])
        if "file_manifest" in artifact.payload and not isinstance(manifest, list):
            raise ValueError(f"analysis artifact {artifact.id!r} has malformed file_manifest")
        for item in manifest if isinstance(manifest, list) else []:
            if not isinstance(item, dict):
                raise ValueError(f"analysis artifact {artifact.id!r} has malformed file_manifest item")
            name = item.get("name")
            download_url = item.get("download_url")
            if (
                not isinstance(name, str)
                or not name.strip()
                or name in {".", ".."}
                or "/" in name
                or "\\" in name
                or any(ord(char) < 32 or ord(char) == 127 for char in name)
            ):
                raise ValueError(f"analysis artifact {artifact.id!r} has a file reference without a stable name")
            if download_url is not None and download_url != f"/api/analysis-artifacts/{artifact.id}/{name}":
                raise ValueError(f"analysis artifact {artifact.id!r} has stale or impossible download_url metadata")
    normalized_artifact_refs = []
    for ref in job.cached_artifact_refs:
        artifact = artifact_by_id.get(ref.artifact_id)
        if artifact is None:
            raise ValueError(f"cached artifact reference {ref.artifact_id!r} is not attached to job {job.id!r}")
        if ref.job_id != job.id or ref.project_id != project_id or ref.kind != artifact.kind:
            raise ValueError(f"cached artifact reference {ref.artifact_id!r} does not match its current job")
        status, stale_reason = _artifact_cache_status(artifact, artifact_file_exists)
        normalized_artifact_refs.append(ref.model_copy(update={
            "project_id": project_id,
            "job_id": job.id,
            "kind": artifact.kind,
            "title": artifact.title,
            "status": status,
            "generated_by": artifact.generated_by,
            "generated_at": artifact.created_at,
            "download_urls": _manifest_download_urls(artifact),
            "summary": artifact.summary,
            "stale_reason": stale_reason,
        }, deep=True))
    reports_by_id = {report.id: report for report in reports}
    report_id = job.result_summary.get("report_id")
    if report_id is not None:
        if not isinstance(report_id, str) or report_id not in reports_by_id:
            raise ValueError(f"analysis job {job.id!r} references a missing report")
    normalized_report_refs = []
    for ref in job.cached_report_refs:
        if ref.project_id != project_id:
            raise ValueError(f"cached report reference {ref.report_id!r} belongs to another project")
        if ref.derived_from_job_id != job.id:
            raise ValueError(f"cached report reference {ref.report_id!r} does not belong to job {job.id!r}")
        report = reports_by_id.get(ref.report_id)
        if report is None:
            raise ValueError(f"cached report reference {ref.report_id!r} does not exist in project {project_id!r}")
        normalized_report_refs.append(ref.model_copy(update={
            "project_id": project_id,
            "title": report.title,
            "status": report.status,
            "generated_at": report.generated_at,
            "current": report.status != ReportStatus.superseded,
            "summary": report.summary,
        }, deep=True))
    return job.model_copy(update={
        "cached_artifact_refs": normalized_artifact_refs,
        "cached_report_refs": normalized_report_refs,
    }, deep=True)


def validate_cached_references(project_id: str, job: AnalysisJob, reports: Iterable[AnalysisReport] = ()) -> None:
    normalize_cached_references(project_id, job, reports)
