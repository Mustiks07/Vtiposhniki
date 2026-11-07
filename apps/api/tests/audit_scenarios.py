"""Offline collaborators for the audio/accounting regressions and their real-browser server.

Only the external organizer/media responses and evaluator are synthetic. The import,
queue, callback ledger, export, HTTP audio proxy and web app are the production code.
"""

import io
import os
import wave
from decimal import Decimal
from pathlib import Path

import httpx
from conftest import make_settings
from cqa_api.main import create_app
from cqa_contracts.testing import SyntheticEvaluator
from helpers import call_event, contract_error, spend
from test_api_audio import ALLOWED, organizer_payload, public_resolver


class PricedRetry:
    """A simulated failed 0.50 USD call followed by a simulated 0.25 USD success."""

    def __init__(self, first_cost=Decimal("0.50")):
        self.first_cost = first_cost
        self.started = set()

    async def __call__(self, conversation, checklist, profile, corpus, budget, observer):
        if budget.logical_job_id not in self.started:
            self.started.add(budget.logical_job_id)
            start = call_event(budget)
            await observer(start)
            await observer(
                call_event(
                    budget,
                    "call_finished",
                    call_id=start.call_id,
                    usage=spend(),
                    cost=self.first_cost,
                    outcome="failed",
                )
            )
            raise contract_error(retryable=True)
        finished = []

        async def priced(event):
            if event.event == "call_finished":
                record = event.record.model_copy(update={"cost": Decimal("0.25"), "usage": spend()})
                finished.append(record)
                event = event.model_copy(update={"record": record})
            return await observer(event)

        artifact = await SyntheticEvaluator(app_mode="test")(
            conversation,
            checklist,
            profile,
            corpus,
            budget,
            priced,
        )
        return artifact.model_copy(
            update={
                "calls": finished,
                "limitations": [
                    "test_evaluator",
                    "Искусственные цены для проверки учёта. Реальных AI-вызовов не было.",
                ],
            }
        )


def create_audit_app():
    """Explicit Playwright-only server, with its own database and no network transports."""
    if os.environ.get("CQA_MODE") != "test" or os.environ.get("CQA_EVALUATOR") != "test":
        raise RuntimeError("Audit scenarios require explicit test mode")
    settings = make_settings(
        Path(os.environ["CQA_DATA_DIR"]),
        worker_enabled=True,
        dataset_url="https://organizer.invalid/d",
        audio_allowed_hosts=ALLOWED,
    )
    wav = io.BytesIO()
    with wave.open(wav, "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(8000)
        recording.writeframes(b"\x00\x00" * 8000)
    flaky_requests = 0

    def organizer(request):
        group = request.url.params["group_id"]
        sources = {
            "audio-initial": ("initial", "working.wav"),
            "audio-late-without": ("late", None),
            "audio-late-with": ("late", "working.wav"),
            "audio-retry": ("retry", "flaky.wav"),
        }
        external_id, filename = sources[group]
        url = f"https://{ALLOWED}/{filename}?signature=TEST-ONLY" if filename else None
        return httpx.Response(200, json=organizer_payload(url, external_id))

    def media(request):
        nonlocal flaky_requests
        if request.url.path == "/flaky.wav":
            flaky_requests += 1
            if flaky_requests == 1:
                return httpx.Response(503)
        return httpx.Response(200, content=wav.getvalue(), headers={"content-type": "audio/wav"})

    return create_app(
        settings,
        evaluator=PricedRetry(),
        organizer_transport=httpx.MockTransport(organizer),
        audio_transport=httpx.MockTransport(media),
        host_resolver=public_resolver,
    )
