import os
import torch
import torch.nn as nn
import torch.optim as optim
import mlflow
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss
from training.mlflow_utils import setup_mlflow
from training.data_loader import get_dataloader, load_split_data
from training.fusion_model_concat import MultimodalFusionConcat

USE_IMAGERY = False

def train_fusion_concat():
    print("Starting Phase 6 Baseline: Late-Fusion (Concatenation)...")

    print("Loading datasets...")
    train_loader = get_dataloader("multimodal", "train", batch_size=32, shuffle=True)
    val_loader   = get_dataloader("multimodal", "val",   batch_size=32, shuffle=False)
    test_loader  = get_dataloader("multimodal", "test",  batch_size=32, shuffle=False)

    _, feature_cols, _ = load_split_data("train")
    tabular_dim = len(feature_cols)

    setup_mlflow("Phase6_Fusion_Concat")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = MultimodalFusionConcat(
        tabular_dim=tabular_dim,
        d_model=64,
        use_imagery=USE_IMAGERY,
    ).to(device)

    train_dataset = train_loader.dataset
    n_pos = int(train_dataset.y.sum())
    n_neg = len(train_dataset.y) - n_pos
    pos_weight_val = n_neg / max(n_pos, 1)
    pos_weight = torch.tensor([pos_weight_val]).to(device)

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)

    epochs = 10

    with mlflow.start_run() as run:
        mlflow.log_params({
            "model": "MultimodalFusionConcat",
            "tabular_dim": tabular_dim,
            "d_model": 64,
            "use_imagery": USE_IMAGERY,
            "lr": 1e-3,
            "epochs": epochs,
            "pos_weight": pos_weight_val,
        })

        for epoch in range(epochs):
            model.train()
            train_loss = 0.0
            n_batches = 0
            for (tab, seq, img), y in train_loader:
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

            model.eval()
            val_preds, val_targets = [], []
            with torch.no_grad():
                for (tab, seq, img), y in val_loader:
                    outputs = model(tab.to(device), seq.to(device))
                    probs = torch.sigmoid(outputs)
                    val_preds.extend(probs.cpu().numpy())
                    val_targets.extend(y.numpy())

            val_auprc = average_precision_score(val_targets, val_preds) if sum(val_targets) > 0 else 0.0
            val_auroc = roc_auc_score(val_targets, val_preds) if sum(val_targets) > 0 else 0.0
            print(f"Epoch {epoch+1}/{epochs} | Loss: {avg_loss:.4f} | Val AUPRC: {val_auprc:.4f} | Val AUROC: {val_auroc:.4f}")
            mlflow.log_metrics({"val_auprc": val_auprc, "val_auroc": val_auroc, "train_loss": avg_loss}, step=epoch)

        os.makedirs("training", exist_ok=True)
        torch.save(model.state_dict(), "training/fusion_model_concat.pt")
        mlflow.log_artifact("training/fusion_model_concat.pt")
        
        print("\nEvaluating on test set...")
        model.eval()
        test_preds, test_targets = [], []
        with torch.no_grad():
            for (tab, seq, img), y in test_loader:
                outputs = model(tab.to(device), seq.to(device))
                probs = torch.sigmoid(outputs)
                test_preds.extend(probs.cpu().numpy())
                test_targets.extend(y.numpy())

        if sum(test_targets) > 0:
            auprc = average_precision_score(test_targets, test_preds)
            auroc = roc_auc_score(test_targets, test_preds)
            brier = brier_score_loss(test_targets, test_preds)
            
            import numpy as np
            n_bootstraps = 1000
            rng = np.random.RandomState(42)
            bootstrapped_auprc = []
            bootstrapped_auroc = []
            for i in range(n_bootstraps):
                indices = rng.randint(0, len(test_preds), len(test_preds))
                if len(np.unique(np.array(test_targets)[indices])) < 2:
                    continue
                bootstrapped_auprc.append(average_precision_score(np.array(test_targets)[indices], np.array(test_preds)[indices]))
                bootstrapped_auroc.append(roc_auc_score(np.array(test_targets)[indices], np.array(test_preds)[indices]))
                
            auprc_ci = (np.percentile(bootstrapped_auprc, 2.5), np.percentile(bootstrapped_auprc, 97.5)) if bootstrapped_auprc else (0,0)
            auroc_ci = (np.percentile(bootstrapped_auroc, 2.5), np.percentile(bootstrapped_auroc, 97.5)) if bootstrapped_auroc else (0,0)
            print(f"Test AUPRC: {auprc:.4f} (95% CI: {auprc_ci[0]:.4f}-{auprc_ci[1]:.4f}) | Test AUROC: {auroc:.4f} (95% CI: {auroc_ci[0]:.4f}-{auroc_ci[1]:.4f}) | Test Brier: {brier:.4f}")
        else:
            auprc = auroc = brier = 0.0
            print(f"Test AUPRC: {auprc:.4f} | Test AUROC: {auroc:.4f} | Test Brier: {brier:.4f}")

        mlflow.log_metrics({"test_auprc": auprc, "test_auroc": auroc, "test_brier": brier})

if __name__ == "__main__":
    train_fusion_concat()
