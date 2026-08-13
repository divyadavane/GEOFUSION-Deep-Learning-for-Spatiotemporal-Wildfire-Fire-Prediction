import os
import mlflow

def setup_mlflow(experiment_name: str):
    """
    Sets up MLflow to log to a local ./mlruns directory.
    This avoids needing cloud credentials or W&B API keys.
    """
    # Create local mlruns directory if it doesn't exist
    os.makedirs("mlruns", exist_ok=True)
    
    # Set the tracking URI to a local SQLite DB (filestore is deprecated)
    mlflow.set_tracking_uri(f"sqlite:///{os.path.abspath('mlruns.db')}")
    
    # Create or get the experiment
    experiment = mlflow.get_experiment_by_name(experiment_name)
    if experiment is None:
        experiment_id = mlflow.create_experiment(experiment_name)
    else:
        experiment_id = experiment.experiment_id
        
    mlflow.set_experiment(experiment_name)
    return experiment_id
