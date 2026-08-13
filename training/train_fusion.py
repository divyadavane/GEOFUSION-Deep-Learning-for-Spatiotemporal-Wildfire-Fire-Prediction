"""
train_fusion.py — Phase 6 Multimodal Fusion Training

Phase 6 scope (2026-08-13):
  - Modalities: Tabular features + Weather sequence (LSTM)
  - Imagery: EXCLUDED — imagery_tiles has 0 rows. USE_IMAGERY = False.
  - Data: Real database export via training_export_v1_data (post weather-backfill)
  - Registry: NOT pushed automatically. Use push_registry.py with the MLflow run ID
              AFTER verifying metrics are trustworthy.

Do NOT set USE_IMAGERY = True until:
  1. imagery_tiles table has real Sentinel-2 data
  2. build_features.py compute_imagery_indices() returns non-NaN for > 50% of rows
"""
import os
import torch
import torch.nn as nn
import torch.optim as optim
import mlflow
import psycopg2
import json
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss
from training.mlflow_utils import setup_mlflow
from training.data_loader import get_dataloader, load_split_data
from training.fusion_model import MultimodalFusion

# Phase 6 scope flag — DO NOT set to True until real imagery is available
USE_IMAGERY = False


def train_fusion():
    print("Starting Phase 6: Multimodal Fusion Training (tabular + weather sequence)...")

    # 1. Load Data (will raise ValueError if any split has 0 positives — that is correct)
    print("Loading datasets...")
    train_loader = get_dataloader("multimodal", "train", batch_size=32, shuffle=True)
    val_loader   = get_dataloader("multimodal", "val",   batch_size=32, shuffle=False)
    test_loader  = get_dataloader("multimodal", "test",  batch_size=32, shuffle=False)

    # Get tabular dimension from the actual feature columns
    _, feature_cols, _ = load_split_data("train")
    tabular_dim = len(feature_cols)
    print(f"Tabular features dimension: {tabular_dim}")

    # 2. Setup MLflow
    setup_mlflow("Phase6_Fusion")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = MultimodalFusion(
        tabular_dim=tabular_dim,
        d_model=64,
        nhead=4,
        use_imagery=USE_IMAGERY,
    ).to(device)

    # Positive class weight: ~9:1 expected negative:positive ratio
    train_dataset = train_loader.dataset
    n_pos = int(train_dataset.y.sum())
    n_neg = len(train_dataset.y) - n_pos
    pos_weight_val = n_neg / max(n_pos, 1)
    print(f"Positive class weight (n_neg/n_pos): {pos_weight_val:.2f}")
    pos_weight = torch.tensor([pos_weight_val]).to(device)

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)

    epochs = 10

    with mlflow.start_run() as run:
        mlflow.log_params({
            "model": "MultimodalFusion",
            "tabular_dim": tabular_dim,
            "d_model": 64,
            "nhead": 4,
            "use_imagery": USE_IMAGERY,
            "lr": 1e-3,
            "epochs": epochs,
            "pos_weight": pos_weight_val,
        })

        # 3. Training loop (no break — full epochs)
        for epoch in range(epochs):
            model.train()
            train_loss = 0.0
            n_batches = 0
            for (tab, seq), y in train_loader:
                tab = tab.to(device)
                seq = seq.to(device)
                y   = y.to(device)

                optimizer.zero_grad()
                outputs = model(tab, seq)
                loss = criterion(outputs, y)
                loss.backward()
                optimizer.step()

                train_loss += loss.item()
                n_batches += 1

            avg_loss = train_loss / max(n_batches, 1)

            # Validation
            model.eval()
            val_preds, val_targets = [], []
            with torch.no_grad():
                for (tab, seq), y in val_loader:
                    outputs = model(tab.to(device), seq.to(device))
                    probs = torch.sigmoid(outputs)
                    val_preds.extend(probs.cpu().numpy())
                    val_targets.extend(y.numpy())

            val_auprc = average_precision_score(val_targets, val_preds) if sum(val_targets) > 0 else 0.0
            val_auroc = roc_auc_score(val_targets, val_preds) if sum(val_targets) > 0 else 0.0
            print(f"Epoch {epoch+1}/{epochs} | Loss: {avg_loss:.4f} | Val AUPRC: {val_auprc:.4f} | Val AUROC: {val_auroc:.4f}")
            mlflow.log_metrics({"val_auprc": val_auprc, "val_auroc": val_auroc, "train_loss": avg_loss}, step=epoch)

        # 4. Save model
        os.makedirs("training", exist_ok=True)
        torch.save(model.state_dict(), "training/fusion_model.pt")
        mlflow.log_artifact("training/fusion_model.pt")
        print("Training complete. Model saved to training/fusion_model.pt")

        # 5. Test evaluation (full test set — no break)
        print("\nEvaluating on test set...")
        model.eval()
        test_preds, test_targets = [], []
        with torch.no_grad():
            for (tab, seq), y in test_loader:
                outputs = model(tab.to(device), seq.to(device))
                probs = torch.sigmoid(outputs)
                test_preds.extend(probs.cpu().numpy())
                test_targets.extend(y.numpy())

        if sum(test_targets) > 0:
            auprc = average_precision_score(test_targets, test_preds)
            auroc = roc_auc_score(test_targets, test_preds)
            brier = brier_score_loss(test_targets, test_preds)
        else:
            auprc = auroc = brier = 0.0
            print("WARNING: test split still has 0 positives — check data pipeline.")

        print(f"Test AUPRC: {auprc:.4f} | Test AUROC: {auroc:.4f} | Test Brier: {brier:.4f}")
        mlflow.log_metrics({"test_auprc": auprc, "test_auroc": auroc, "test_brier": brier})

        print(f"\nMLflow Run ID: {run.info.run_id}")
        print("To register this model (after verifying metrics are trustworthy), run:")
        print(f"  python training/push_registry.py \\")
        print(f"    --run-id {run.info.run_id} \\")
        print(f"    --version v2.0-fusion \\")
        print(f"    --architecture 'MultimodalFusion (Tabular+WeatherSeq)'")
        print("\nDo NOT run push_registry.py automatically. Review metrics first.")


if __name__ == "__main__":
    train_fusion()
