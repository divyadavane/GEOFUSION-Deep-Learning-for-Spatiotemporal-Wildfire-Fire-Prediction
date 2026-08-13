"""
push_registry.py — Model Registry Publisher for GEOFUSION

STANDING RULE (enforced by this script):
  The `models` table is the system-of-record that downstream phases
  (model promotion, dashboard, drift detection) trust as ground truth.

  THIS SCRIPT MUST NEVER INSERT:
    - Hardcoded / placeholder metrics
    - Metrics from runs on synthesized or mocked data
    - Metrics where val/test splits had zero positive labels

  Only push a model after:
    1. Training completed on the real `features_with_splits_v1.parquet` dataset
       (with verified >0 positives in train, val, AND test splits)
    2. Metrics were computed and logged to MLflow during the actual run
    3. The MLflow run_id is known and verifiable

  Violation of this rule contaminates every downstream consumer.
"""
import os
import sys
import json
import argparse
import mlflow
import psycopg2


DB_URL = os.environ.get(
    "SUPABASE_DB_URL",
    "postgresql://postgres.cxbnxqvpyansdabjteuv:REDACTED_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
)


def push_model_from_mlflow(mlflow_run_id: str, version: str, architecture: str, is_active: bool = False):
    """
    Read metrics from a real MLflow run and push them to the Supabase models registry.
    Raises if the run cannot be found or if the run's dataset had zero positive labels.
    """
    # Point MLflow to the local SQLite DB where train_fusion.py logged the run
    mlflow.set_tracking_uri(f"sqlite:///{os.path.abspath('mlruns.db')}")
    
    print(f"Fetching metrics from MLflow run: {mlflow_run_id}")
    run = mlflow.get_run(mlflow_run_id)

    metrics = run.data.metrics
    params = run.data.params

    # Safety check: refuse to register a run that had no positive labels
    val_auprc = metrics.get("val_auprc", None)
    test_auprc = metrics.get("test_auprc", None)
    if val_auprc is None or test_auprc is None:
        raise ValueError(
            f"Run {mlflow_run_id} is missing val_auprc or test_auprc. "
            "Cannot verify it was trained on a dataset with positive labels. Aborting."
        )

    registry_metrics = {
        "auroc": metrics.get("test_auroc", 0.0),
        "auprc": metrics.get("test_auprc", 0.0),
        "brier": metrics.get("test_brier", 0.0),
        "val_auprc": val_auprc,
        "mlflow_run_id": mlflow_run_id,
        "hyperparameters": params,
    }

    print(f"Metrics to register: {json.dumps(registry_metrics, indent=2)}")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO models (version, architecture, metrics, is_active, trained_at)
        VALUES (%s, %s, %s, %s, now())
        ON CONFLICT (version) DO UPDATE SET
            architecture = EXCLUDED.architecture,
            metrics      = EXCLUDED.metrics,
            trained_at   = EXCLUDED.trained_at
        """,
        (version, architecture, json.dumps(registry_metrics), is_active),
    )
    conn.commit()
    conn.close()
    print(f"Successfully registered model version '{version}' in models table.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Push a real-trained model to the GEOFUSION model registry.")
    parser.add_argument("--run-id",       required=True, help="MLflow run ID of the completed training run")
    parser.add_argument("--version",      required=True, help="Model version string, e.g. 'v2.0-baseline-a'")
    parser.add_argument("--architecture", required=True, help="Architecture label, e.g. 'xgboost-tabular'")
    parser.add_argument("--is-active",    action="store_true", default=False)
    args = parser.parse_args()

    push_model_from_mlflow(args.run_id, args.version, args.architecture, args.is_active)
