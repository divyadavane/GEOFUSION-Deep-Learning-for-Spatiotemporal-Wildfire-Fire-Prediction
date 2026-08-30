import os
import json
import logging
from datetime import datetime
from supabase import create_client, Client
from tenacity import retry, wait_exponential, stop_after_attempt

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def get_db_url(port: str | None = None) -> str:
    """Build the Postgres connection string from environment variables.

    The password is ALWAYS read from the SUPABASE_DB_PASSWORD environment
    variable at runtime. Never hardcode a password; if the variable is unset
    the caller gets a clear error instead of a connection to a guessed URL.

    `port` overrides the default port for callers that need a specific pooler
    mode (e.g. session mode on 5432 instead of transaction mode on 6543). An
    explicit SUPABASE_DB_PORT env var always wins.
    """
    password = os.environ.get("SUPABASE_DB_PASSWORD")
    if not password:
        raise ValueError(
            "SUPABASE_DB_PASSWORD is not set in the environment. "
            "Set it (e.g. in your shell) before running scripts that connect to Postgres."
        )
    user = os.environ.get("SUPABASE_DB_USER", "postgres.cxbnxqvpyansdabjteuv")
    host = os.environ.get("SUPABASE_DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com")
    port = os.environ.get("SUPABASE_DB_PORT") or port or "6543"
    dbname = os.environ.get("SUPABASE_DB_NAME", "postgres")
    from urllib.parse import quote
    return f"postgresql://{user}:{quote(password, safe='')}@{host}:{port}/{dbname}"

def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)

@retry(wait=wait_exponential(multiplier=1, min=4, max=10), stop=stop_after_attempt(5))
def upsert_with_retry(supabase: Client, table: str, data: dict | list):
    """Upsert data into Supabase with exponential backoff retry."""
    response = supabase.table(table).upsert(data).execute()
    return response.data

class PipelineRunLogger:
    """Helper to create and update pipeline_runs records."""
    def __init__(self, pipeline_name: str, source: str):
        self.supabase = get_supabase_client()
        self.pipeline_name = pipeline_name
        self.source = source
        self.run_id = None

    def start(self, details: dict = None):
        logger.info(f"Starting pipeline run: {self.pipeline_name} for source {self.source}")
        data = {
            "pipeline_name": self.pipeline_name,
            "source": self.source,
            "status": "running",
            "details": details or {}
        }
        res = self.supabase.table("pipeline_runs").insert(data).execute()
        if res.data:
            self.run_id = res.data[0]["id"]
        return self.run_id

    def finish(self, status: str, rows_written: int = 0, error_message: str = None):
        if not self.run_id:
            logger.warning("Pipeline run finished but no run_id exists.")
            return

        logger.info(f"Finishing pipeline run {self.run_id} with status {status}")
        data = {
            "finished_at": datetime.utcnow().isoformat(),
            "status": status,
            "rows_written": rows_written,
        }
        if error_message:
            data["error_message"] = error_message

        self.supabase.table("pipeline_runs").update(data).eq("id", self.run_id).execute()
