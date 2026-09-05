import pytest

from mechaflow_api.job_queue import build_cached_artifact_refs, build_cached_report_refs
from mechaflow_api.models import CachedAnalysisReportReference, CachedArtifactStatus
from mechaflow_api.storage import InMemoryProjectStore, ProjectAlreadyExistsError, build_sample_project


def test_in_memory_project_store_seeds_and_copies_projects() -> None:
    sample = build_sample_project()
    store = InMemoryProjectStore(seed_projects=[sample])

    fetched = store.get_project(sample.id)
    assert fetched is not None
    fetched.name = "Mutated outside store"

    assert store.get_project(sample.id).name == "Open gripper task-preserving edit demo"
    assert [project.id for project in store.list_projects()] == [sample.id]


def test_in_memory_project_store_rejects_duplicate_create() -> None:
    sample = build_sample_project()
    store = InMemoryProjectStore(seed_projects=[sample])

    try:
        store.create_project(sample)
    except ProjectAlreadyExistsError as exc:
        assert str(exc) == sample.id
    else:
        raise AssertionError("duplicate project create should fail")


def test_in_memory_project_store_upsert_uses_path_id() -> None:
    sample = build_sample_project()
    sample.id = "client-sent-id"
    store = InMemoryProjectStore()

    stored = store.upsert_project("server-path-id", sample)

    assert stored.id == "server-path-id"
    assert all(
        artifact.job_id == job.id
        for job in stored.analysis_jobs
        for artifact in job.artifacts
    )
    assert store.get_project("server-path-id") is not None


def test_analysis_job_storage_downgrades_stale_artifact_cache_status() -> None:
    sample = build_sample_project()
    source_job = sample.analysis_jobs[0]
    job = source_job.model_copy(update={"cached_artifact_refs": build_cached_artifact_refs(source_job)}, deep=True)

    stored = InMemoryProjectStore(seed_projects=[sample]).update_analysis_job(
        source_job.id,
        lambda _: job,
    )

    assert stored is not None
    assert stored.cached_artifact_refs[0].status == CachedArtifactStatus.metadata_only
    assert stored.cached_artifact_refs[0].stale_reason


def test_analysis_job_storage_rejects_missing_report_cache_reference() -> None:
    sample = build_sample_project()
    source_job = sample.analysis_jobs[0]
    job = source_job.model_copy(update={
        "cached_report_refs": [CachedAnalysisReportReference(
            report_id="missing-report",
            project_id=sample.id,
            title="Missing",
            status="advisory",
            generated_at=source_job.created_at,
        )],
    }, deep=True)

    with pytest.raises(ValueError, match="does not belong to job"):
        InMemoryProjectStore(seed_projects=[sample]).update_analysis_job(source_job.id, lambda _: job)


def test_cached_reports_require_explicit_job_association() -> None:
    sample = build_sample_project()
    job = sample.analysis_jobs[0]

    assert build_cached_report_refs(sample, job) == []


def test_analysis_job_storage_rejects_report_from_another_job() -> None:
    sample = build_sample_project()
    source_job = sample.analysis_jobs[0]
    report = sample.reports[0]
    job = source_job.model_copy(update={
        "cached_report_refs": [CachedAnalysisReportReference(
            report_id=report.id,
            project_id=sample.id,
            title=report.title,
            status=report.status,
            generated_at=report.generated_at,
            derived_from_job_id="other-job",
        )],
    }, deep=True)

    with pytest.raises(ValueError, match="does not belong to job"):
        InMemoryProjectStore(seed_projects=[sample]).update_analysis_job(source_job.id, lambda _: job)
