"""Runnable contract scaffold with optional built web assets."""

import os
from pathlib import Path

from cqa_contracts.operations import create_contract_app
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def create_app() -> FastAPI:
    app = create_contract_app()
    web_dist = Path(os.environ.get("CQA_WEB_DIST", "apps/web/dist"))
    if web_dist.is_dir():
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
    return app


app = create_app()
