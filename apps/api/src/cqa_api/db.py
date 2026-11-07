"""SQLite WAL access: short transactions, one explicit write lock, Alembic migrations.

Writers open BEGIN IMMEDIATE, so a read-then-write check (lease, revision, budget)
cannot be raced by another writer and cannot hit a deferred lock upgrade failure.
Readers use deferred transactions and keep working during writes under WAL.
"""

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, RowMapping, create_engine, event, text
from sqlalchemy.engine import make_url

MIGRATIONS = Path(__file__).parent / "migrations"


def to_wire_time(value: datetime) -> str:
    """Fixed-width UTC text, so stored timestamps compare correctly as strings."""
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def from_wire_time(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)


def rows(conn: Connection, sql: str, params: Mapping[str, Any] | None = None) -> list[RowMapping]:
    return list(conn.execute(text(sql), dict(params or {})).mappings())


def row(conn: Connection, sql: str, params: Mapping[str, Any] | None = None) -> RowMapping | None:
    return conn.execute(text(sql), dict(params or {})).mappings().first()


def run(conn: Connection, sql: str, params: Mapping[str, Any] | None = None) -> None:
    conn.execute(text(sql), dict(params or {}))


class Database:
    def __init__(self, url: str, *, busy_timeout_ms: int, synchronous: str) -> None:
        parsed = make_url(url)
        if parsed.get_backend_name() != "sqlite" or not parsed.database:
            raise ValueError("CQA_DATABASE_URL must point to a SQLite file")
        self._path = Path(parsed.database)
        self._url = parsed
        self._busy_timeout_ms = busy_timeout_ms
        self._synchronous = synchronous
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self.reader = self._engine("BEGIN")
        self.writer = self._engine("BEGIN IMMEDIATE")

    def _engine(self, begin_statement: str) -> Engine:
        engine = create_engine(
            self._url,
            hide_parameters=True,  # private conversation text must not reach error logs
            connect_args={
                "timeout": self._busy_timeout_ms / 1000,
                "check_same_thread": False,
            },
        )

        @event.listens_for(engine, "connect")
        def configure(dbapi_connection: Any, _record: Any) -> None:
            # Driver autocommit: transaction boundaries are the explicit BEGIN below.
            dbapi_connection.isolation_level = None
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute(f"PRAGMA busy_timeout={int(self._busy_timeout_ms)}")
            cursor.execute(f"PRAGMA synchronous={self._synchronous}")
            cursor.close()

        @event.listens_for(engine, "begin")
        def begin(conn: Connection) -> None:
            conn.exec_driver_sql(begin_statement)

        return engine

    @contextmanager
    def read(self) -> Iterator[Connection]:
        with self.reader.begin() as conn:
            yield conn

    @contextmanager
    def write(self) -> Iterator[Connection]:
        with self.writer.begin() as conn:
            yield conn

    def migrate(self, revision: str = "head") -> None:
        config = Config()
        config.set_main_option("script_location", str(MIGRATIONS))
        with self.writer.begin() as conn:
            config.attributes["connection"] = conn
            command.upgrade(config, revision)

    def current_revision(self) -> str | None:
        with self.reader.begin() as conn:
            exists = row(
                conn, "SELECT 1 AS x FROM sqlite_master WHERE name = 'alembic_version'"
            )
            if exists is None:
                return None
            current = row(conn, "SELECT version_num FROM alembic_version")
            return None if current is None else str(current["version_num"])

    def dispose(self) -> None:
        self.reader.dispose()
        self.writer.dispose()
