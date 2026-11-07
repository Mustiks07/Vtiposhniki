"""Targeted control-switch checks; synthetic data, no provider calls."""

from dataclasses import replace

import pytest
from cqa_domain import profile_hash
from cqa_submission.adapter import PreparationError, convert
from cqa_submission.recovery import combine, recovery_ids
from test_submission import CONFIG, dataset, make_item

BACKUP = CONFIG.model_copy(update={"profile_id": "backup-gemini"})


def backup_item(item):
    profile = item.profile.model_copy(
        update={
            "id": BACKUP.profile_id,
            "primary": item.profile.primary.model_copy(update={"model": "requested-alias"}),
        }
    )
    calls = [
        c.model_copy(
            update={
                "call_id": "backup-" + c.call_id,
                "requested": profile.primary,
                "actual": profile.primary.model_copy(update={"model": "reported-gemini"}),
            }
        )
        for c in item.calls
    ]
    artifact = item.evaluation.artifact.model_copy(
        update={
            "calls": calls,
            "identity": item.evaluation.artifact.identity.model_copy(
                update={"profile_hash": profile_hash(profile)}
            ),
        }
    )
    evaluation = item.evaluation.model_copy(
        update={
            "profile_id": profile.id,
            "artifact": artifact,
        }
    )
    return replace(item, profile=profile, evaluation=evaluation, calls=calls)


def recovery_fixture():
    primary, manifest = dataset()
    backup = [
        replace(backup_item(i), state="not_started", evaluation=None, calls=[]) for i in primary
    ]
    primary[7] = make_item(7, partial=True)
    primary[8] = make_item(8, failed=True)
    primary[9] = replace(primary[9], state="not_started", evaluation=None, calls=[])
    backup[8] = backup_item(make_item(8))
    backup[9] = backup_item(make_item(9))
    return primary, backup, manifest


def test_merge_keeps_success_and_semantic_partial_and_reports_actual_models():
    primary, backup, manifest = recovery_fixture()
    before = [i.evaluation.model_dump() if i.evaluation else None for i in primary]
    assert recovery_ids(primary, manifest) == {i.entry.external_id for i in primary[8:]}
    result = combine(primary, backup, CONFIG, BACKUP, manifest)
    assert result.results[:8] == [convert(i, CONFIG) for i in primary[:8]]
    assert result.results[7].status == "error"
    assert [r.status for r in result.results[8:]] == ["ok", "ok"]
    assert "reported-gemini" in result.model.name
    assert "synthetic-model-not-called" in result.model.name
    assert "requested-alias" not in result.model.name
    assert before == [i.evaluation.model_dump() if i.evaluation else None for i in primary]


@pytest.mark.parametrize("state", ["queued", "running", "retry_wait"])
def test_active_primary_blocks_switch(state):
    primary, _, manifest = recovery_fixture()
    primary[8] = replace(primary[8], state=state)
    with pytest.raises(PreparationError, match="wait_for_active_jobs"):
        recovery_ids(primary, manifest)


@pytest.mark.parametrize("index", [0, 7])
def test_recovery_cannot_replace_complete_or_semantic_partial(index):
    primary, backup, manifest = recovery_fixture()
    backup[index] = backup_item(make_item(index))
    with pytest.raises(PreparationError, match="protected_success_or_partial"):
        combine(primary, backup, CONFIG, BACKUP, manifest)


def test_recovery_rejects_wrong_order_and_pinned_rubric():
    primary, backup, manifest = recovery_fixture()
    with pytest.raises(PreparationError, match="recovery_items_do_not_match_manifest"):
        combine(primary, list(reversed(backup)), CONFIG, BACKUP, manifest)
    with pytest.raises(PreparationError, match="mixed_execution_configs"):
        combine(
            primary,
            backup,
            CONFIG,
            BACKUP.model_copy(update={"checklist_version_id": "other"}),
            manifest,
        )


def test_backup_failure_stays_error_and_is_not_retried_until_a_convenient_answer():
    primary, backup, manifest = recovery_fixture()
    backup[8] = replace(backup[8], state="failed", evaluation=None)
    result = combine(primary, backup, CONFIG, BACKUP, manifest)
    assert result.results[8].status == "error"
    assert result.results[9].status == "ok"
