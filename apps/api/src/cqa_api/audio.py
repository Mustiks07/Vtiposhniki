"""Audio metadata at import time. Streaming is delivered with B3."""

from cqa_contracts.models import AudioMetadata

from .settings import Settings


def initial_audio_metadata(
    settings: Settings, source_url: str | None
) -> tuple[AudioMetadata, list[str]]:
    """Access is never confirmed at import: an expired link does not prove absence."""
    if source_url is None:
        return AudioMetadata(availability="unavailable", alignment_status="unavailable"), []
    return (
        AudioMetadata(availability="unknown", alignment_status="unverified"),
        ["Audio source not confirmed; evaluation uses the text only"],
    )
