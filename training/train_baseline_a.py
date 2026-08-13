import os
import xgboost as xgb
import mlflow
from sklearn.metrics import average_precision_score
from training.mlflow_utils import setup_mlflow
from training.data_loader import get_tabular_data

def train_baseline_a():
    print("Starting Baseline A (XGBoost Tabular) Training...")
    
    # 1. Load Data
    X_train, y_train, feature_cols = get_tabular_data("train")
    X_val, y_val, _ = get_tabular_data("val")
    X_test, y_test, _ = get_tabular_data("test")
    
    print(f"Train size: {X_train.shape}, Val size: {X_val.shape}, Test size: {X_test.shape}")
    
    # 2. Setup MLflow
    setup_mlflow("Baseline_A_XGBoost")
    
    # Calculate scale_pos_weight to handle class imbalance
    num_neg = (y_train == 0).sum()
    num_pos = (y_train == 1).sum()
    scale_pos_weight = num_neg / num_pos if num_pos > 0 else 1.0
    print(f"Class imbalance handling: scale_pos_weight = {scale_pos_weight:.2f}")

    params = {
        "objective": "binary:logistic",
        "eval_metric": "aucpr", # Optimize for AUPRC
        "max_depth": 4,
        "learning_rate": 0.1,
        "n_estimators": 100,
        "scale_pos_weight": scale_pos_weight,
        "early_stopping_rounds": 10
    }

    with mlflow.start_run() as run:
        mlflow.log_params(params)
        
        model = xgb.XGBClassifier(**params)
        
        # 3. Train with early stopping on validation set
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False
        )
        
        # 4. Evaluate on Test (just to log to mlflow immediately, though evaluate_baselines does it comprehensively)
        y_pred_prob = model.predict_proba(X_test)[:, 1]
        test_auprc = average_precision_score(y_test, y_pred_prob)
        
        mlflow.log_metric("test_auprc", test_auprc)
        mlflow.xgboost.log_model(model, "xgboost-model")
        
        # Save a hardcoded local file for evaluate_baselines.py to easily pick up
        model.save_model("training/baseline_a.json")
        
        print(f"Training complete. Test AUPRC: {test_auprc:.4f}")
        print(f"Model saved to training/baseline_a.json and logged to MLflow (Run ID: {run.info.run_id})")

if __name__ == "__main__":
    train_baseline_a()
