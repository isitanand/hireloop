def test_manual_profile_upsert(client, auth_headers, sample_profile):
    """The fallback onboarding path: fill in the profile by hand instead of
    uploading a resume. Must work even with zero profile rows yet (upsert)."""
    headers = auth_headers()
    r = client.get("/profile", headers=headers)
    assert r.status_code == 404

    r = client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    assert r.status_code == 200
    assert r.json()["parsed_json"]["name"] == "Alice"

    updated = dict(sample_profile, years_experience=4)
    r = client.put("/profile", headers=headers, json={"parsed_json": updated})
    assert r.status_code == 200
    assert r.json()["parsed_json"]["years_experience"] == 4

    r = client.get("/profile", headers=headers)
    assert r.status_code == 200
    assert r.json()["parsed_json"]["years_experience"] == 4


def test_resume_upload_rejects_bad_extension(client, auth_headers):
    headers = auth_headers()
    files = {"resume": ("resume.docx", b"whatever", "application/octet-stream")}
    r = client.post("/profile/resume", headers=headers, files=files)
    assert r.status_code == 400


def test_resume_upload_success_is_isolated_from_real_llm(client, auth_headers, sample_profile, monkeypatch):
    """Stubs the provider resolution and jobhunt.llm.build_profile so this
    exercises the route's own wiring (file validation, storage, DB write)
    without depending on network access or a real API key being configured
    in the environment."""
    class _StubProvider:
        name = "stub"

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_StubProvider(), "stub-model"))
    monkeypatch.setattr("app.routers.profile.llm.build_profile", lambda **kwargs: sample_profile)

    headers = auth_headers()
    files = {"resume": ("resume.txt", b"Software engineer resume text", "text/plain")}
    r = client.post("/profile/resume", headers=headers, files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["resume_filename"] == "resume.txt"
    assert body["parsed_json"]["name"] == "Alice"


def test_resume_download_round_trips_the_uploaded_bytes(client, auth_headers, sample_profile, monkeypatch):
    """The uploaded file must be retrievable later, stored in the DB rather
    than on local disk (which doesn't survive a redeploy on hosts with an
    ephemeral filesystem, e.g. Render's free tier)."""
    class _StubProvider:
        name = "stub"

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_StubProvider(), "stub-model"))
    monkeypatch.setattr("app.routers.profile.llm.build_profile", lambda **kwargs: sample_profile)

    headers = auth_headers()
    original_bytes = b"Software engineer resume text, verbatim"
    files = {"resume": ("my_resume.txt", original_bytes, "text/plain")}
    r = client.post("/profile/resume", headers=headers, files=files)
    assert r.status_code == 200

    r = client.get("/profile/resume", headers=headers)
    assert r.status_code == 200
    assert r.content == original_bytes
    assert r.headers["content-type"].startswith("text/plain")
    assert "my_resume.txt" in r.headers["content-disposition"]


def test_resume_download_404_before_any_upload(client, auth_headers):
    headers = auth_headers()
    r = client.get("/profile/resume", headers=headers)
    assert r.status_code == 404


def test_resume_upload_failure_returns_clean_422(client, auth_headers, monkeypatch):
    from jobhunt.providers import LLMError

    class _StubProvider:
        name = "stub"

    def _boom(**kwargs):
        raise LLMError("provider not configured")

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_StubProvider(), "stub-model"))
    monkeypatch.setattr("app.routers.profile.llm.build_profile", _boom)

    headers = auth_headers()
    files = {"resume": ("resume.txt", b"text", "text/plain")}
    r = client.post("/profile/resume", headers=headers, files=files)
    assert r.status_code == 422


class _Named:
    def __init__(self, name):
        self.name = name


def _upload_txt(client, headers):
    files = {"resume": ("resume.txt", b"Software engineer resume text", "text/plain")}
    return client.post("/profile/resume", headers=headers, files=files)


def test_resume_upload_uses_backup_provider_when_primary_is_busy(
    client, auth_headers, sample_profile, monkeypatch,
):
    """The primary (NVIDIA) 503s through every retry; with LLM_BACKUP_PROVIDER
    configured the upload should still succeed on the backup instead of
    sending the user to manual entry."""
    from jobhunt.providers import ProviderBusy

    tried = []

    def build(**kwargs):
        tried.append(kwargs["provider"].name)
        if kwargs["provider"].name == "primary":
            raise ProviderBusy("nvidia HTTP 503: overloaded")
        return sample_profile

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_Named("primary"), "m1"))
    monkeypatch.setattr("app.routers.profile.resolve_backup", lambda stage: (_Named("backup"), "m2"))
    monkeypatch.setattr("app.routers.profile.llm.build_profile", build)

    r = _upload_txt(client, auth_headers())
    assert r.status_code == 200
    assert r.json()["parsed_json"]["name"] == "Alice"
    assert tried == ["primary", "backup"]


def test_resume_upload_busy_with_no_backup_returns_friendly_503(client, auth_headers, monkeypatch):
    """Users must not see NVIDIA's raw error JSON - just that it's busy."""
    from jobhunt.providers import ProviderBusy

    def build(**kwargs):
        raise ProviderBusy('nvidia HTTP 503: {"error":{"message":"Service temporarily overloaded"}}')

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_Named("primary"), "m1"))
    monkeypatch.setattr("app.routers.profile.resolve_backup", lambda stage: None)
    monkeypatch.setattr("app.routers.profile.llm.build_profile", build)

    r = _upload_txt(client, auth_headers())
    assert r.status_code == 503
    assert "busy" in r.json()["detail"]
    assert "nvidia" not in r.json()["detail"]
    assert "overloaded" not in r.json()["detail"]


def test_resume_upload_reports_primary_error_when_backup_fails_too(client, auth_headers, monkeypatch):
    from jobhunt.providers import LLMError

    def build(**kwargs):
        raise LLMError(f"{kwargs['provider'].name} says no")

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_Named("primary"), "m1"))
    monkeypatch.setattr("app.routers.profile.resolve_backup", lambda stage: (_Named("backup"), "m2"))
    monkeypatch.setattr("app.routers.profile.llm.build_profile", build)

    r = _upload_txt(client, auth_headers())
    assert r.status_code == 422
    assert "primary says no" in r.json()["detail"]


def test_resume_upload_survives_a_misconfigured_backup(client, auth_headers, monkeypatch):
    """A typo'd/keyless LLM_BACKUP_PROVIDER must not turn a normal primary
    failure into a different, confusing error - it is logged and skipped."""
    from jobhunt.providers import LLMError

    def bad_backup(stage):
        raise LLMError("GEMINI_API_KEY is not set")

    def build(**kwargs):
        raise LLMError("primary says no")

    monkeypatch.setattr("app.routers.profile.resolve", lambda stage: (_Named("primary"), "m1"))
    monkeypatch.setattr("app.routers.profile.resolve_backup", bad_backup)
    monkeypatch.setattr("app.routers.profile.llm.build_profile", build)

    r = _upload_txt(client, auth_headers())
    assert r.status_code == 422
    assert "primary says no" in r.json()["detail"]
