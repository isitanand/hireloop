def test_register_and_me(client):
    r = client.post("/auth/register", json={
        "email": "a@test.com", "password": "password123", "name": "Alice"})
    assert r.status_code == 201
    token = r.json()["access_token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "a@test.com"
    assert body["is_admin"] is True  # first registered user becomes admin


def test_second_user_is_not_admin(client):
    client.post("/auth/register", json={"email": "first@test.com", "password": "password123"})
    r = client.post("/auth/register", json={"email": "second@test.com", "password": "password123"})
    token = r.json()["access_token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["is_admin"] is False


def test_duplicate_email_rejected(client):
    client.post("/auth/register", json={"email": "dup@test.com", "password": "password123"})
    r = client.post("/auth/register", json={"email": "dup@test.com", "password": "password123"})
    assert r.status_code == 400


def test_login_wrong_password(client):
    client.post("/auth/register", json={"email": "b@test.com", "password": "password123"})
    r = client.post("/auth/login", json={"email": "b@test.com", "password": "wrong"})
    assert r.status_code == 401


def test_login_correct_password(client):
    client.post("/auth/register", json={"email": "c@test.com", "password": "password123"})
    r = client.post("/auth/login", json={"email": "c@test.com", "password": "password123"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_me_requires_auth(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_update_me(client, auth_headers):
    headers = auth_headers()
    r = client.patch("/auth/me", headers=headers, json={"receive_email": True, "name": "Alice B."})
    assert r.status_code == 200
    assert r.json()["receive_email"] is True
    assert r.json()["name"] == "Alice B."


def test_change_password_wrong_current_rejected(client, auth_headers):
    headers = auth_headers()
    r = client.post("/auth/change-password", headers=headers,
                     json={"current_password": "not-it", "new_password": "newpassword123"})
    assert r.status_code == 400


def test_change_password_then_login_with_new_one(client):
    client.post("/auth/register", json={"email": "pw@test.com", "password": "originalpass1"})
    login = client.post("/auth/login", json={"email": "pw@test.com", "password": "originalpass1"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    r = client.post("/auth/change-password", headers=headers,
                     json={"current_password": "originalpass1", "new_password": "brandnewpass1"})
    assert r.status_code == 204

    # old password no longer works, new one does
    assert client.post("/auth/login", json={"email": "pw@test.com", "password": "originalpass1"}).status_code == 401
    assert client.post("/auth/login", json={"email": "pw@test.com", "password": "brandnewpass1"}).status_code == 200
