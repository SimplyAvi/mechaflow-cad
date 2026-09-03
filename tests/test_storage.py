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
    assert store.get_project("server-path-id") is not None
