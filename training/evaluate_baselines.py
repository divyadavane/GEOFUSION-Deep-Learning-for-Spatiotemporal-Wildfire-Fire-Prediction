import os
import torch
import xgboost as xgb
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss
from training.data_loader import get_tabular_data, get_dataloader
from training.train_baseline_b import WeatherLSTM
from training.train_baseline_c import ImageryCNN

def evaluate_models():
    print("Starting Evaluation of All Baselines on Test Set...")
    
    metrics = []

    # ---------------------------------------------------------
    # Evaluate Baseline A: XGBoost
    # ---------------------------------------------------------
    try:
        model_a = xgb.XGBClassifier()
        model_a.load_model("training/baseline_a.json")
        X_test_a, y_test_a, _ = get_tabular_data("test")
        
        preds_a = model_a.predict_proba(X_test_a)[:, 1]
        
        auprc_a = average_precision_score(y_test_a, preds_a)
        auroc_a = roc_auc_score(y_test_a, preds_a)
        brier_a = brier_score_loss(y_test_a, preds_a)
        
        metrics.append({"Model": "Baseline A (XGBoost Tabular)", "AUPRC": auprc_a, "AUROC": auroc_a, "Brier": brier_a})
    except Exception as e:
        print(f"Failed to evaluate Baseline A: {e}")

    # ---------------------------------------------------------
    # Evaluate Baseline B: LSTM
    # ---------------------------------------------------------
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    try:
        model_b = WeatherLSTM().to(device)
        model_b.load_state_dict(torch.load("training/baseline_b.pt", weights_only=True))
        model_b.eval()
        
        test_loader_b = get_dataloader("weather_sequence", "test", batch_size=32, shuffle=False)
        preds_b, y_test_b = [], []
        with torch.no_grad():
            for X_batch, y_batch in test_loader_b:
                outputs = model_b(X_batch.to(device))
                probs = torch.sigmoid(outputs)
                preds_b.extend(probs.cpu().numpy())
                y_test_b.extend(y_batch.numpy())
                
        auprc_b = average_precision_score(y_test_b, preds_b)
        auroc_b = roc_auc_score(y_test_b, preds_b)
        brier_b = brier_score_loss(y_test_b, preds_b)
        
        metrics.append({"Model": "Baseline B (Weather LSTM)", "AUPRC": auprc_b, "AUROC": auroc_b, "Brier": brier_b})
    except Exception as e:
        print(f"Failed to evaluate Baseline B: {e}")

    # ---------------------------------------------------------
    # Evaluate Baseline C: CNN
    # ---------------------------------------------------------
    try:
        model_c = ImageryCNN().to(device)
        model_c.load_state_dict(torch.load("training/baseline_c.pt", weights_only=True))
        model_c.eval()
        
        test_loader_c = get_dataloader("imagery", "test", batch_size=32, shuffle=False)
        preds_c, y_test_c = [], []
        with torch.no_grad():
            for X_batch, y_batch in test_loader_c:
                outputs = model_c(X_batch.to(device))
                probs = torch.sigmoid(outputs)
                preds_c.extend(probs.cpu().numpy())
                y_test_c.extend(y_batch.numpy())
                
        auprc_c = average_precision_score(y_test_c, preds_c)
        auroc_c = roc_auc_score(y_test_c, preds_c)
        brier_c = brier_score_loss(y_test_c, preds_c)
        
        metrics.append({"Model": "Baseline C (Imagery CNN)", "AUPRC": auprc_c, "AUROC": auroc_c, "Brier": brier_c})
    except Exception as e:
        print(f"Failed to evaluate Baseline C: {e}")

    # ---------------------------------------------------------
    # Write Report
    # ---------------------------------------------------------
    os.makedirs("docs", exist_ok=True)
    report_path = "docs/baseline_results.md"
    
    df_metrics = pd.DataFrame(metrics)
    
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Phase 5: Baseline Unimodal Model Results\n\n")
        f.write("This report documents the performance of the three single-modality baselines on the strictly held-out temporal `test` split.\n\n")
        
        f.write("## Metrics\n\n")
        f.write(df_metrics.to_markdown(index=False))
        f.write("\n\n")
        
        f.write("## Context & Sample Sizes\n")
        f.write("- **Class Imbalance**: Approximately 1:9 (Fire vs No Fire) based on the current data generation.\n")
        f.write("- **Baseline C (Imagery) Warning**: Because we are currently using a local mock dataset (due to CLI auth issues), 100% of the imagery loads are simulated as zero-tensors. Therefore, Baseline C's performance is equivalent to random guessing and is NOT a reliable indicator of its true potential.\n\n")
        
        if not df_metrics.empty:
            best_model = df_metrics.loc[df_metrics["AUPRC"].idxmax()]
            f.write("## Conclusion\n")
            f.write(f"The strongest baseline sets the floor for the Phase 6-7 multimodal fusion model.\n")
            f.write(f"**Current best model:** `{best_model['Model']}` with an AUPRC of **{best_model['AUPRC']:.4f}**.\n\n")

    print(f"Evaluation complete. Report written to {report_path}")

    # ---------------------------------------------------------
    # Mock Supabase Registry Push
    # ---------------------------------------------------------
    print("\nAttempting to register models in Supabase `models` table...")
    supabase_url = os.environ.get("SUPABASE_URL")
    if supabase_url:
        print(f"[MOCK POST] -> {supabase_url}/rest/v1/models")
        for m in metrics:
            print(f"  Inserting: {{'model_name': '{m['Model']}', 'auprc': {m['AUPRC']:.4f}, 'auroc': {m['AUROC']:.4f}, 'status': 'completed'}}")
        print("Registration mocked successfully (bypassed actual network request due to missing auth).")
    else:
        print("SUPABASE_URL not set. Skipping registry push.")

if __name__ == "__main__":
    evaluate_models()
