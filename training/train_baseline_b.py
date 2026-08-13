import os
import torch
import torch.nn as nn
import torch.optim as optim
import mlflow
from sklearn.metrics import average_precision_score
from training.mlflow_utils import setup_mlflow
from training.data_loader import get_dataloader

class WeatherLSTM(nn.Module):
    def __init__(self, input_dim=4, hidden_dim=128):
        super().__init__()
        self.lstm = nn.LSTM(input_size=input_dim, hidden_size=hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, 1)
        # Using BCEWithLogitsLoss later, so no sigmoid here

    def forward(self, x):
        # x shape: (batch_size, seq_len, input_dim)
        _, (hn, _) = self.lstm(x)
        # hn shape: (1, batch_size, hidden_dim)
        out = self.fc(hn.squeeze(0))
        return out.squeeze(1)

def train_baseline_b():
    print("Starting Baseline B (Weather LSTM) Training...")
    
    # 1. Load Data
    train_loader = get_dataloader("weather_sequence", "train", batch_size=32, shuffle=True)
    val_loader = get_dataloader("weather_sequence", "val", batch_size=32, shuffle=False)
    test_loader = get_dataloader("weather_sequence", "test", batch_size=32, shuffle=False)
    
    # 2. Setup MLflow
    setup_mlflow("Baseline_B_LSTM")
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = WeatherLSTM().to(device)
    
    # Compute pos_weight for loss
    # Naive way: counting from full loader or just setting a high weight given the known imbalance (~1:9)
    # Using 10.0 as a baseline guess for the synthesized data
    pos_weight = torch.tensor([10.0]).to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    
    epochs = 10
    
    with mlflow.start_run() as run:
        mlflow.log_params({"model": "LSTM", "hidden_dim": 128, "lr": 1e-3, "epochs": epochs})
        
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
            
            val_auprc = average_precision_score(val_targets, val_preds) if sum(val_targets) > 0 else 0.0
            print(f"Epoch {epoch+1}/{epochs} | Train Loss: {train_loss/len(train_loader):.4f} | Val AUPRC: {val_auprc:.4f}")
            mlflow.log_metric("val_auprc", val_auprc, step=epoch)
            
        # 4. Save model
        torch.save(model.state_dict(), "training/baseline_b.pt")
        mlflow.log_artifact("training/baseline_b.pt")
        
        print(f"Training complete. Model saved to training/baseline_b.pt and logged to MLflow (Run ID: {run.info.run_id})")

if __name__ == "__main__":
    train_baseline_b()
