import pytest
from cqa_api.settings import Settings
from pydantic import ValidationError

from conftest import make_settings


def test_embedding_cors_allows_only_configured_origin(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path, cors_origins="https://tenant.crm.example/"))
    headers = {
        "Origin": "https://tenant.crm.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,idempotency-key",
    }
    allowed = client.options("/api/v1/evaluation-batches", headers=headers)
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://tenant.crm.example"
    assert "access-control-allow-credentials" not in allowed.headers
    denied = client.options(
        "/api/v1/evaluation-batches", headers={**headers, "Origin": "https://other.example"}
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
    assert client.get("/api/v1/health").status_code == 200


@pytest.mark.parametrize("origin", ["*", "https://*.example", "https://host.example/path"])
def test_embedding_rejects_unbounded_origins(origin):
    with pytest.raises(ValidationError):
        Settings(cors_origins=origin)
