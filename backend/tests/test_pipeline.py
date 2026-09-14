"""Pipeline tests run in mock+keyword mode - fixtures instead of real ATS
network calls (jobhunt.mock.fetch_all_mock), keyword_screen instead of a
real LLM call. Same no-network, no-API-key philosophy as the repo's
existing `tests/` suite; see conftest.py's module docstring.
"""
from __future__ import annotations

import time

from app import models
from app.services.pipeline_service import run_pipeline_for_user


def _run_mock(db_session, user, scorer="keyword"):
    run_log = models.RunLog(user_id=user.id, status="running", scorer=scorer)
    db_session.add(run_log)
    db_session.commit()
    db_session.refresh(run_log)
    run_pipeline_for_user(db_session, user, run_log, scorer=scorer, send_email=False, use_mock=True)
    return run_log


def test_run_requires_profile(client, auth_headers, db_session):
    headers = auth_headers()
    r = client.post("/pipeline/run", headers=headers, json={"scorer": "keyword"})
    assert r.status_code == 400


def test_mock_pipeline_scores_and_shortlists(client, auth_headers, db_session, sample_profile):
    headers = auth_headers()
    client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    client.put("/filters", headers=headers, json={"locations": [], "score_threshold": 0})

    user = db_session.query(models.User).filter_by(email="alice@test.com").first()
    run_log = _run_mock(db_session, user)

    assert run_log.status == "done"
    assert run_log.scanned > 0
    assert run_log.passed_filters > 0
    assert run_log.shortlisted > 0

    r = client.get("/jobs", headers=headers)
    assert r.status_code == 200
    jobs = r.json()
    assert len(jobs) == run_log.candidates
    assert any(j["status"] == "shortlisted" for j in jobs)
    # keyword stub always tags its reason so a shipped digest is never
    # mistaken for a real AI-scored one
    assert all("keyword stub" in (j["reason"] or "") for j in jobs)


def test_second_run_does_not_resurface_seen_jobs(client, auth_headers, db_session, sample_profile):
    headers = auth_headers()
    client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    client.put("/filters", headers=headers, json={"locations": [], "score_threshold": 0})
    user = db_session.query(models.User).filter_by(email="alice@test.com").first()

    first = _run_mock(db_session, user)
    assert first.candidates > 0

    second = _run_mock(db_session, user)
    assert second.candidates == 0  # every mock job was already seen in run 1


def test_mark_applied_and_stats_and_csv(client, auth_headers, db_session, sample_profile):
    headers = auth_headers()
    client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    client.put("/filters", headers=headers, json={"locations": [], "score_threshold": 0})
    user = db_session.query(models.User).filter_by(email="alice@test.com").first()
    _run_mock(db_session, user)

    jobs = client.get("/jobs", headers=headers).json()
    assert jobs
    job_id = jobs[0]["job_id"]

    r = client.patch(f"/jobs/{job_id}", headers=headers, json={"status": "applied"})
    assert r.status_code == 200
    assert r.json()["status"] == "applied"
    assert r.json()["applied_at"] is not None

    stats = client.get("/jobs/stats", headers=headers).json()
    assert stats["applied"] == 1
    assert stats["tracked"] == len(jobs)

    csv_resp = client.get("/jobs/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert job_id in csv_resp.text


def test_clear_history_keeps_real_applications(client, auth_headers, db_session, sample_profile):
    """Clear history is scoped to the AI's own not-yet-acted-on recommendations
    (new/shortlisted/dismissed) - it must never touch a job the user actually
    applied to, interviewed for, or got an offer on, no matter how the button
    is worded on the frontend."""
    headers = auth_headers()
    client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    client.put("/filters", headers=headers, json={"locations": [], "score_threshold": 0})
    user = db_session.query(models.User).filter_by(email="alice@test.com").first()
    _run_mock(db_session, user)

    jobs = client.get("/jobs", headers=headers).json()
    assert len(jobs) >= 2
    applied_job_id = jobs[0]["job_id"]
    client.patch(f"/jobs/{applied_job_id}", headers=headers, json={"status": "applied"})

    preview = client.get("/jobs/history/preview", headers=headers).json()
    assert preview["clearable"] == len(jobs) - 1
    assert preview["runs"] == 1

    r = client.delete("/jobs/history", headers=headers)
    assert r.status_code == 200
    assert r.json()["clearable"] == len(jobs) - 1
    assert r.json()["runs"] == 1

    remaining = client.get("/jobs", headers=headers).json()
    assert len(remaining) == 1
    assert remaining[0]["job_id"] == applied_job_id
    assert remaining[0]["status"] == "applied"

    # RunLog history (the Search activity / Analytics data) is cleared too -
    # it's what the dashboard actually shows as "scan history", so leaving
    # it behind would make the action look like it did nothing.
    assert client.get("/pipeline/runs", headers=headers).json() == []


def test_unknown_job_id_404(client, auth_headers):
    headers = auth_headers()
    r = client.get("/jobs/does-not-exist", headers=headers)
    assert r.status_code == 404


def test_run_via_http_with_stubbed_fetch(client, auth_headers, sample_profile, monkeypatch):
    """End-to-end through the real HTTP route (not the service function
    directly): POST /pipeline/run -> background task -> GET /pipeline/runs/
    {id}. jobhunt.fetch.fetch_all is monkeypatched so this never touches the
    network, but everything else - the route, the background task wiring,
    the DB writes - is exercised for real."""
    from jobhunt.fetch import Job as PipelineJob

    def _fake_fetch_all(companies, sleep=0.25):
        return [PipelineJob(
            job_id="greenhouse:testco:1", ats="greenhouse", company="TestCo",
            title="Software Engineer", location="Bangalore, India",
            url="https://example.com/1", description="Go, Kubernetes, distributed systems.",
        )]

    monkeypatch.setattr("app.services.pipeline_service.fetch_all", _fake_fetch_all)

    admin_headers = auth_headers("admin@test.com")
    client.post("/companies", headers=admin_headers,
                json={"ats": "greenhouse", "slug": "testco", "name": "TestCo"})
    client.put("/profile", headers=admin_headers, json={"parsed_json": sample_profile})
    client.put("/filters", headers=admin_headers, json={"locations": [], "score_threshold": 0})

    r = client.post("/pipeline/run", headers=admin_headers, json={"scorer": "keyword"})
    assert r.status_code == 202
    run_id = r.json()["id"]

    # TestClient runs BackgroundTasks synchronously as part of handling the
    # request, but poll briefly as a safety margin rather than assume that.
    run = None
    for _ in range(20):
        run = client.get(f"/pipeline/runs/{run_id}", headers=admin_headers).json()
        if run["status"] != "running":
            break
        time.sleep(0.1)
    assert run["status"] == "done", run
    assert run["shortlisted"] >= 1

    jobs = client.get("/jobs", headers=admin_headers).json()
    assert any(j["job_id"] == "greenhouse:testco:1" for j in jobs)


def test_failed_screen_batch_is_retried_next_run(client, auth_headers, db_session, sample_profile, monkeypatch):
    """A job whose screen batch fails (e.g. a transient LLM 503) is persisted
    with score=None instead of being dropped, and must come back as a
    candidate on the *next* run so it eventually gets a real score - not be
    silently excluded forever by the same "already seen" dedupe that
    protects genuinely-screened jobs from being rescored for no reason."""
    from jobhunt.fetch import Job as PipelineJob

    def _fake_fetch_all(companies, sleep=0.25):
        return [
            PipelineJob(job_id="greenhouse:testco:1", ats="greenhouse", company="TestCo",
                        title="Software Engineer", location="Bangalore, India",
                        url="https://example.com/1", description="Go, Kubernetes."),
            PipelineJob(job_id="greenhouse:testco:2", ats="greenhouse", company="TestCo",
                        title="Backend Engineer", location="Bangalore, India",
                        url="https://example.com/2", description="Python, Django."),
        ]
    monkeypatch.setattr("app.services.pipeline_service.fetch_all", _fake_fetch_all)

    calls = {"n": 0}

    def _fake_screen(jobs, profile, **kwargs):
        calls["n"] += 1
        for j in jobs:
            if calls["n"] == 1 and j.job_id.endswith(":1"):
                continue  # simulate job 1's batch failing this call - left unscored
            j.score, j.reason = 8.0, f"scored on call {calls['n']}"
        return jobs
    monkeypatch.setattr("app.services.pipeline_service.llm.screen", _fake_screen)

    def _fake_draft(jobs, profile, **kwargs):
        for j in jobs:
            j.draft = {"fit_summary": "stub", "tailored_bullets": [], "gaps": [],
                       "cover_note": "", "questions_to_ask": []}
        return jobs
    monkeypatch.setattr("app.services.pipeline_service.llm.draft", _fake_draft)

    headers = auth_headers()
    client.post("/companies", headers=headers, json={"ats": "greenhouse", "slug": "testco", "name": "TestCo"})
    client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    client.put("/filters", headers=headers, json={"locations": [], "score_threshold": 0})
    user = db_session.query(models.User).filter_by(email="alice@test.com").first()

    def _run():
        run_log = models.RunLog(user_id=user.id, status="running", scorer="llm")
        db_session.add(run_log)
        db_session.commit()
        db_session.refresh(run_log)
        run_pipeline_for_user(db_session, user, run_log, scorer="llm", send_email=False, use_mock=False)
        return run_log

    first = _run()
    assert first.candidates == 2  # both fetched for the first time

    rows = {r.job_id: r for r in db_session.query(models.UserJob).filter_by(user_id=user.id).all()}
    assert rows["greenhouse:testco:1"].score is None
    assert rows["greenhouse:testco:1"].status == "new"
    assert rows["greenhouse:testco:2"].score == 8.0

    second = _run()
    assert second.candidates == 1  # only the still-unscored job comes back

    db_session.expire_all()
    rows = {r.job_id: r for r in db_session.query(models.UserJob).filter_by(user_id=user.id).all()}
    assert rows["greenhouse:testco:1"].score == 8.0  # retried and scored
    assert rows["greenhouse:testco:2"].score == 8.0  # untouched, not rescored


def test_cannot_start_second_run_while_one_in_progress(client, auth_headers, db_session, sample_profile):
    headers = auth_headers()
    client.put("/profile", headers=headers, json={"parsed_json": sample_profile})
    user = db_session.query(models.User).filter_by(email="alice@test.com").first()
    db_session.add(models.RunLog(user_id=user.id, status="running", scorer="keyword"))
    db_session.commit()

    r = client.post("/pipeline/run", headers=headers, json={"scorer": "keyword"})
    assert r.status_code == 409
