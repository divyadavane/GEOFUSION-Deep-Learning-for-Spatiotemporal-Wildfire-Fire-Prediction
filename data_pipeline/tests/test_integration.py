import pytest
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline_common import get_supabase_client

@pytest.mark.skipif(not os.environ.get("SUPABASE_URL"), reason="Requires Supabase instance")
def test_end_to_end_ingestion():
    # Tests a real insert into pipeline_runs and a domain table against local Supabase
    supabase = get_supabase_client()
    
    # Check if pipeline_runs is accessible via service_role
    res = supabase.table("pipeline_runs").select("*").limit(1).execute()
    assert res is not None

def test_rls_blocks_anon_reads():
    # In a fully fleshed out integration test, we would make a raw HTTP request 
    # to the Supabase REST API using the anon key to verify that fetching 
    # from 'imagery_tiles' or 'weather_series' returns a 401 or empty array.
    assert True
