"""Alembic environment: always driven programmatically through Database.migrate."""

from alembic import context

connection = context.config.attributes["connection"]
context.configure(connection=connection)
with context.begin_transaction():
    context.run_migrations()
