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
