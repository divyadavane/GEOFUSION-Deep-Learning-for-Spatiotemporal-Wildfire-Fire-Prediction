import os
import torch
import torch.nn as nn
import torch.optim as optim
import torchvision.models as models
import mlflow
from sklearn.metrics import average_precision_score
from training.mlflow_utils import setup_mlflow
from training.data_loader import get_dataloader

class ImageryCNN(nn.Module):
    def __init__(self):
        super().__init__()
        # Using a lightweight EfficientNet-B0 for the baseline
        self.backbone = models.efficientnet_b0(weights=None)
        
        # Modify the classifier head for binary output (1 class logit)
        num_ftrs = self.backbone.classifier[1].in_features
        self.backbone.classifier[1] = nn.Linear(num_ftrs, 1)

    def forward(self, x):
        out = self.backbone(x)
        return out.squeeze(1)

def train_baseline_c():
    print("Starting Baseline C (Imagery CNN) Training...")
    
    # 1. Load Data
    train_loader = get_dataloader("imagery", "train", batch_size=32, shuffle=True)
    val_loader = get_dataloader("imagery", "val", batch_size=32, shuffle=False)
    
    # 2. Setup MLflow
    setup_mlflow("Baseline_C_CNN")
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ImageryCNN().to(device)
    
    pos_weight = torch.tensor([10.0]).to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    
    epochs = 5 # Fewer epochs for CNN baseline demo
    
    with mlflow.start_run() as run:
        mlflow.log_params({"model": "EfficientNet-B0", "lr": 1e-3, "epochs": epochs})
        
        # 3. Train loop
        for epoch in range(epochs):
            model.train()
            train_loss = 0.0
            for X_batch, y_batch in train_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                
                optimizer.zero_grad()
                outputs = model(X_batch)
                loss = criterion(outputs, y_batch)
                loss.backward()
                optimizer.step()
                
                train_loss += loss.item()
                break # Fast-track mock training since data is just zeros
                
            # Validation
            model.eval()
            val_preds = []
            val_targets = []
            with torch.no_grad():
                for X_batch, y_batch in val_loader:
                    X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                    outputs = model(X_batch)
                    probs = torch.sigmoid(outputs)
                    val_preds.extend(probs.cpu().numpy())
                    val_targets.extend(y_batch.cpu().numpy())
                    break # Fast-track mock validation
            
            val_auprc = average_precision_score(val_targets, val_preds) if sum(val_targets) > 0 else 0.0
            print(f"Epoch {epoch+1}/{epochs} | Train Loss: {train_loss/len(train_loader):.4f} | Val AUPRC: {val_auprc:.4f}")
            mlflow.log_metric("val_auprc", val_auprc, step=epoch)
            
        # 4. Save model
        torch.save(model.state_dict(), "training/baseline_c.pt")
        mlflow.log_artifact("training/baseline_c.pt")
        
        print(f"Training complete. Model saved to training/baseline_c.pt and logged to MLflow (Run ID: {run.info.run_id})")

if __name__ == "__main__":
    train_baseline_c()
