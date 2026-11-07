def test_default_filters_are_not_empty(client, auth_headers):
    """An empty include_titles list means 'match every title' in
    jobhunt.prefilter - a confusing first run for a new user, so registration
    seeds sane defaults (mirrors config.yaml's shipped filters)."""
    headers = auth_headers()
    r = client.get("/filters", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["include_titles"]) > 0
    assert len(body["exclude_titles"]) > 0
    assert body["score_threshold"] == 6.0


def test_update_filters_partial(client, auth_headers):
    headers = auth_headers()
    r = client.put("/filters", headers=headers, json={
        "locations": ["bangalore", "remote"], "score_threshold": 7.5,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["locations"] == ["bangalore", "remote"]
    assert body["score_threshold"] == 7.5
    # untouched fields survive a partial update
    assert len(body["include_titles"]) > 0
