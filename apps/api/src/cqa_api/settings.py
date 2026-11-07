"""Server configuration. Values come from the environment or a private local .env."""

from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CQA_", extra="ignore")

    mode: Literal["production", "test"] = "production"
    evaluator: Literal["production", "test"] = "production"
    test_scenario: Literal["complete", "partial", "failed"] = "complete"

    data_dir: Path = Path("data/private")
    database_url: str = "sqlite:///data/private/cqa.sqlite3"
    config_dir: Path | None = None  # default: <data_dir>/config
    seed_original_checklist: bool = True
    dataset_url: SecretStr | None = None

    import_max_bytes: int = 10_485_760
    import_max_records: int = 1000
    organizer_timeout_seconds: float = 30.0

    audio_allowed_hosts: str = ""
    audio_max_bytes: int = 209_715_200
    audio_timeout_seconds: float = 30.0

    sqlite_busy_timeout_ms: int = 5000
    sqlite_synchronous: Literal["FULL", "NORMAL"] = "FULL"

    worker_enabled: bool = True
    worker_concurrency: int = 2
    worker_poll_seconds: float = 0.5
    lease_seconds: float = 60.0
    deadline_grace_seconds: float = 10.0
    retry_base_seconds: float = 5.0
    retry_max_seconds: float = 60.0

    @field_validator("dataset_url", mode="before")
    @classmethod
    def empty_is_absent(cls, value: object) -> object:
        return None if value == "" else value

    @property
    def effective_config_dir(self) -> Path:
        return self.config_dir if self.config_dir is not None else self.data_dir / "config"

    @property
    def audio_hosts(self) -> frozenset[str]:
        hosts = (host.strip().lower() for host in self.audio_allowed_hosts.split(","))
        return frozenset(host for host in hosts if host)


def load_settings() -> Settings:
    """Read the private .env so provider keys reach os.environ, without overriding it."""
    load_dotenv(Path(".env"), override=False)
    return Settings()
