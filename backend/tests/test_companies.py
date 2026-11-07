def test_admin_add_makes_global_company(client, auth_headers):
    admin_headers = auth_headers("admin@test.com")  # first registered user = admin
    r = client.post("/companies", headers=admin_headers,
                     json={"ats": "greenhouse", "slug": "stripe", "name": "Stripe"})
    assert r.status_code == 201
    assert r.json()["is_global"] is True
    assert r.json()["included"] is True

    r = client.get("/companies", headers=admin_headers)
    assert any(c["slug"] == "stripe" for c in r.json())


def test_non_admin_add_is_private_to_them(client, auth_headers):
    auth_headers("admin@test.com")  # claim admin slot first
    other_headers = auth_headers("other@test.com")
    r = client.post("/companies", headers=other_headers,
                     json={"ats": "lever", "slug": "netlify", "name": "Netlify"})
    assert r.status_code == 201
    assert r.json()["is_global"] is False

    third_headers = auth_headers("third@test.com")
    r = client.get("/companies", headers=third_headers)
    assert not any(c["slug"] == "netlify" for c in r.json())


def test_toggle_global_company_exclusion(client, auth_headers):
    admin_headers = auth_headers("admin@test.com")
    r = client.post("/companies", headers=admin_headers,
                     json={"ats": "ashby", "slug": "ema", "name": "Ema"})
    company_id = r.json()["id"]

    r = client.patch(f"/companies/{company_id}", headers=admin_headers, json={"included": False})
    assert r.status_code == 200
    assert r.json()["included"] is False

    r = client.get("/companies", headers=admin_headers)
    ema = next(c for c in r.json() if c["id"] == company_id)
    assert ema["included"] is False

    r = client.patch(f"/companies/{company_id}", headers=admin_headers, json={"included": True})
    assert r.json()["included"] is True


def test_cannot_add_duplicate_board(client, auth_headers):
    admin_headers = auth_headers("admin@test.com")
    client.post("/companies", headers=admin_headers,
                json={"ats": "greenhouse", "slug": "dupco", "name": "DupCo"})
    r = client.post("/companies", headers=admin_headers,
                     json={"ats": "greenhouse", "slug": "dupco", "name": "DupCo Again"})
    assert r.status_code == 400


def test_delete_own_private_company(client, auth_headers):
    auth_headers("admin@test.com")
    user_headers = auth_headers("user@test.com")
    r = client.post("/companies", headers=user_headers,
                     json={"ats": "lever", "slug": "mine", "name": "Mine Inc"})
    company_id = r.json()["id"]

    r = client.delete(f"/companies/{company_id}", headers=user_headers)
    assert r.status_code == 204

    r = client.get("/companies", headers=user_headers)
    assert not any(c["id"] == company_id for c in r.json())
