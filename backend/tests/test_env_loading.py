"""The .env loader: edits apply on every (re)start, while real environment variables still win."""

import os

from config.settings import _FROM_DOTENV, load_env_file


def test_reload_picks_up_edited_env_values(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    for k in ("OPPORA_T_ID", "OPPORA_T_REAL", "OPPORA_T_GONE", _FROM_DOTENV):
        monkeypatch.delenv(k, raising=False)

    # First start: the key is empty in .env (what runserver's reloader process saw).
    env.write_text("OPPORA_T_ID=\nOPPORA_T_GONE=x\n")
    load_env_file(env)
    assert os.environ["OPPORA_T_ID"] == ""

    # The user fills it in; the reloaded child inherits the old environment and loads again.
    env.write_text("OPPORA_T_ID=filled-in\nOPPORA_T_REAL=from-file\n")
    monkeypatch.setenv("OPPORA_T_REAL", "from-real-environment")
    load_env_file(env)
    assert os.environ["OPPORA_T_ID"] == "filled-in"  # the edit applies
    assert os.environ["OPPORA_T_REAL"] == "from-real-environment"  # real env vars still win
    assert "OPPORA_T_GONE" not in os.environ  # removed from .env → removed


def test_runserver_watches_the_env_file(settings):
    from django.utils.autoreload import StatReloader

    from core.apps import watch_env_file

    reloader = StatReloader()
    watch_env_file(reloader)  # must not raise: a broken hook stops runserver from starting
    assert settings.ENV_FILE in reloader.extra_files
