"""Isolated temporary databases only. Nothing here touches data/private or the network."""

import asyncio
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from cqa_api.main import create_app
from cqa_api.settings import Settings
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]


def make_settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "mode": "test",
        "evaluator": "test",
        "data_dir": tmp_path,
        "database_url": f"sqlite:///{(tmp_path / 'test.sqlite3').as_posix()}",
        "worker_enabled": False,
        "retry_base_seconds": 0.0,
        "retry_max_seconds": 0.0,
        "dataset_url": None,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def client_factory(tmp_path: Path) -> Iterator[Callable[..., TestClient]]:
    opened: list[TestClient] = []

    def build(settings: Settings | None = None, **app_args) -> TestClient:
        test_client = TestClient(create_app(settings or make_settings(tmp_path), **app_args))
        test_client.__enter__()
        opened.append(test_client)
        return test_client

    yield build
    for test_client in reversed(opened):
        test_client.__exit__(None, None, None)


def drain(client: TestClient) -> int:
    """Process every claimable job, as the managed worker would."""
    return asyncio.run(client.app.state.worker.drain())


def chat_record(external_id: str = "synthetic-1", **overrides) -> dict:
    record = {
        "external_id": external_id,
        "channel": "agent_chat",
        "language": "RU",
        "messages": [
            {"speaker": "client", "text": "Учебный вопрос", "timestamp_original": "00:01"},
            {"speaker": "operator", "text": "Учебный ответ", "timestamp_original": "00:05"},
        ],
    }
    record.update(overrides)
    return record


def import_records(client: TestClient, *records: dict) -> dict:
    response = client.post("/api/v1/imports", json={"source": "json", "records": list(records)})
    assert response.status_code == 201, response.text
    return response.json()


def criterion(criterion_id: str = "c1", **overrides) -> dict:
    value = {
        "id": criterion_id,
        "title": "Учебный критерий",
        "definition": "Синтетическое определение",
        "response_type": "binary",
        "choices": [
            {"id": "yes", "label": "Да", "raw_value": True, "anchor": "Выполнено",
             "score_fraction": "1"},
            {"id": "no", "label": "Нет", "raw_value": False, "anchor": "Не выполнено",
             "score_fraction": "0"},
        ],
        "allow_na": True,
        "na_condition": "Синтетическое условие",
        "channel_instructions": {},
        "evidence_policy": {},
        "requires_reference": False,
        "weight": "10",
    }
    value.update(overrides)
    return value


def checklist_draft(*criteria: dict, title: str = "Учебный чек-лист") -> dict:
    return {"title": title, "criteria": list(criteria) or [criterion()]}


def create_checklist(client: TestClient, *criteria: dict) -> dict:
    response = client.post("/api/v1/checklists", json=checklist_draft(*criteria))
    assert response.status_code == 201, response.text
    return response.json()


def create_batch(
    client: TestClient,
    conversation_ids: list[str],
    version_id: str,
    *,
    key: str = "key-1",
    mode: str = "fresh",
    profile_id: str = "test-synthetic",
):
    return client.post(
        "/api/v1/evaluation-batches",
        headers={"Idempotency-Key": key},
        json={
            "conversation_ids": conversation_ids,
            "checklist_version_id": version_id,
            "profile_id": profile_id,
            "mode": mode,
        },
    )
