"""Local storage boundaries for the MechaFlow CAD API.

The first backend MVP keeps project data in memory while exposing a repository
contract that can later be backed by SQLite for local mode or PostgreSQL for
hosted deployments.
"""

from __future__ import annotations

from typing import Protocol

from .catalog import DEFAULT_ASSEMBLY, DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS, GRIPPER_TASK
from .models import Project


class ProjectStore(Protocol):
    def list_projects(self) -> list[Project]: ...

    def get_project(self, project_id: str) -> Project | None: ...

    def create_project(self, project: Project) -> Project: ...

    def upsert_project(self, project_id: str, project: Project) -> Project: ...


class ProjectAlreadyExistsError(ValueError):
    """Raised when a project create request reuses an existing id."""


class InMemoryProjectStore:
    def __init__(self, seed_projects: list[Project] | None = None) -> None:
        self._projects: dict[str, Project] = {}
        for project in seed_projects or []:
            self._projects[project.id] = project.model_copy(deep=True)

    def list_projects(self) -> list[Project]:
        return [project.model_copy(deep=True) for project in self._projects.values()]

    def get_project(self, project_id: str) -> Project | None:
        project = self._projects.get(project_id)
        return project.model_copy(deep=True) if project else None

    def create_project(self, project: Project) -> Project:
        if project.id in self._projects:
            raise ProjectAlreadyExistsError(project.id)
        self._projects[project.id] = project.model_copy(deep=True)
        return project.model_copy(deep=True)

    def upsert_project(self, project_id: str, project: Project) -> Project:
        stored = project.model_copy(update={"id": project_id}, deep=True)
        self._projects[project_id] = stored
        return stored.model_copy(deep=True)


def build_sample_project() -> Project:
    return Project(
        id="project-open-gripper-demo",
        name="Open gripper task-preserving edit demo",
        description="Local seed project for frontend integration before persistence is added.",
        reference_design_id=DEFAULT_REFERENCE_DESIGNS[0].id,
        active_task=GRIPPER_TASK,
        assemblies=[DEFAULT_ASSEMBLY],
        materials=DEFAULT_MATERIALS,
    )


def build_default_project_store() -> InMemoryProjectStore:
    return InMemoryProjectStore(seed_projects=[build_sample_project()])
