import os
import httpx
import pytest
import uuid
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xyz.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "your-anon-key")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key")

REST_URL = f"{SUPABASE_URL}/rest/v1"
AUTH_URL = f"{SUPABASE_URL}/auth/v1"

@pytest.fixture(scope="session")
def service_client():
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    return httpx.Client(base_url=REST_URL, headers=headers)

@pytest.fixture(scope="session")
def auth_client():
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    return httpx.Client(base_url=AUTH_URL, headers=headers)

def create_and_elevate_user(auth_client, service_client, role_name):
    # 1. Sign up a dummy user
    email = f"test_{role_name}_{uuid.uuid4()}@example.com"
    password = "testpassword123"
    
    resp = auth_client.post("/signup", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Failed to signup user: {resp.text}"
    
    data = resp.json()
    user_id = data.get("user", {}).get("id")
    access_token = data.get("access_token")
    
    # 2. Elevate role via service_role to the profile table
    resp_elevate = service_client.patch(
        f"/profiles?id=eq.{user_id}",
        json={"role": role_name}
    )
    assert resp_elevate.status_code == 200, f"Failed to elevate user {user_id}: {resp_elevate.text}"
    
    return {
        "id": user_id,
        "email": email,
        "access_token": access_token
    }

@pytest.fixture(scope="session")
def test_users(auth_client, service_client):
    users = {}
    roles = ["authenticated_viewer", "researcher", "admin"]
    
    for role in roles:
        try:
            users[role] = create_and_elevate_user(auth_client, service_client, role)
        except Exception as e:
            logger.error(f"Error creating user {role}: {e}")
    
    # Add anon user (no auth)
    users["anon"] = {"access_token": SUPABASE_ANON_KEY} # fallback for headers
    
    yield users
    
    # Teardown (Requires Admin API which is not standard PostgREST)
    # The safest way without Admin API is to delete from auth.users using service_role via PostgREST if exposed, 
    # but auth.users is often not exposed to PostgREST. 
    # For now, we will leave them, or if `auth.users` is queryable via service_role PostgREST:
    # Actually, we can delete their profile, which cascades? 
    # Foreign key is usually auth.users(id) cascade delete profiles, not vice versa.
    # We will log the created users to allow manual cleanup if necessary.
    logger.info("Test session teardown: test users were created.")
    logger.info(users)

def get_client_for_role(test_users, role):
    token = test_users[role]["access_token"]
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    return httpx.Client(base_url=REST_URL, headers=headers)

# --- TESTS ---

def test_anon_access(test_users):
    client = get_client_for_role(test_users, "anon")
    
    # Allowed
    assert client.get("/grid_cells?limit=1").status_code == 200
    assert client.get("/static_features?limit=1").status_code == 200
    assert client.get("/predictions?limit=1").status_code == 200
    
    # Denied (Adversarial)
    resp = client.get("/imagery_tiles?limit=1")
    assert resp.status_code in [401, 403, 404, 42501], "Anon should not read imagery_tiles" # RLS returns empty list (200) sometimes if table exists but policy denies, wait PostgREST returns 200 with [] if RLS denies SELECT!
    # Wait, PostgREST returns 200 [] when RLS denies SELECT. Let's assert it returns empty.
    if resp.status_code == 200:
        assert len(resp.json()) == 0
        
    assert len(client.get("/weather_series?limit=1").json()) == 0
    assert len(client.get("/fire_events?limit=1").json()) == 0
    assert len(client.get("/models?limit=1").json()) == 0
    
    # RPC Allowed
    resp = client.post("/rpc/get_risk_heatmap", json={"p_region": "california", "p_date": "2026-08-01"})
    assert resp.status_code == 200
    
    # RPC Allowed but returns nulls for weather
    resp = client.post("/rpc/get_cell_timeseries", json={"p_grid_cell_id": 1, "p_start": "2026-01-01", "p_end": "2026-01-02"})
    assert resp.status_code == 200
    
    # RPC Denied/Empty (Adversarial)
    resp = client.post("/rpc/get_pipeline_health")
    if resp.status_code == 200:
        assert len(resp.json()) == 0

    # Denied Write
    resp = client.post("/predictions", json={"grid_cell_id": 1, "model_id": 1, "prediction_date": "2026-08-01", "risk_score": 0.5})
    assert resp.status_code in [401, 403, 42501]

def test_viewer_access(test_users):
    client = get_client_for_role(test_users, "authenticated_viewer")
    
    assert client.get("/grid_cells?limit=1").status_code == 200
    
    # Denied Read
    resp = client.get("/imagery_tiles?limit=1")
    if resp.status_code == 200:
        assert len(resp.json()) == 0
        
    # Timeseries Weather should be null
    resp = client.post("/rpc/get_cell_timeseries", json={"p_grid_cell_id": 1, "p_start": "2026-01-01", "p_end": "2026-01-02"})
    assert resp.status_code == 200
    if len(resp.json()) > 0:
        assert resp.json()[0].get("temperature_c") is None

def test_researcher_access(test_users):
    client = get_client_for_role(test_users, "researcher")
    
    # Allowed Read on restricted
    assert client.get("/imagery_tiles?limit=1").status_code == 200
    assert client.get("/weather_series?limit=1").status_code == 200
    assert client.get("/models?limit=1").status_code == 200
    
    # Adversarial Write on models
    resp = client.patch("/models?id=eq.1", json={"is_active": True})
    assert resp.status_code in [401, 403, 404, 42501]

def test_admin_access(test_users):
    client = get_client_for_role(test_users, "admin")
    # Allowed Delete
    resp = client.delete("/imagery_tiles?id=eq.-1")
    assert resp.status_code in [200, 204]

def test_service_role_access(service_client):
    # Allowed Write on models
    resp = service_client.post("/models", json={"version": "test-1.0", "architecture": "test", "is_active": False})
    assert resp.status_code == 201
    
    if resp.status_code == 201:
        # Cleanup
        model_id = resp.json()[0]["id"]
        service_client.delete(f"/models?id=eq.{model_id}")
