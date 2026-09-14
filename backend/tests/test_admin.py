def test_run_scheduled_requires_secret(client):
    r = client.post("/admin/run-scheduled")
    assert r.status_code == 403


def test_run_scheduled_rejects_wrong_secret(client):
    r = client.post("/admin/run-scheduled", headers={"X-Admin-Secret": "nope"})
    assert r.status_code == 403


def test_run_scheduled_accepts_correct_secret(client):
    r = client.post("/admin/run-scheduled", headers={"X-Admin-Secret": "test-admin-secret"})
    assert r.status_code == 202
    assert "queued_users" in r.json()
