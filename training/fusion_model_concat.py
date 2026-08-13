import torch
import torch.nn as nn
import torchvision.models as models


class MultimodalFusionConcat(nn.Module):
    def __init__(
        self,
        tabular_dim: int,
        d_model: int = 64,
        hidden_dim_lstm: int = 64,
        use_imagery: bool = False,
    ):
        super().__init__()
        self.use_imagery = use_imagery
        self.n_modalities = 3 if use_imagery else 2

        # 1. Tabular Encoder
        self.tab_proj = nn.Sequential(
            nn.Linear(tabular_dim, d_model),
            nn.ReLU(),
            nn.Linear(d_model, d_model),
        )

        # 2. Sequential Encoder (LSTM over 14-day weather)
        self.lstm = nn.LSTM(input_size=4, hidden_size=hidden_dim_lstm, batch_first=True)
        self.seq_proj = nn.Linear(hidden_dim_lstm, d_model)

        # 3. Imagery Encoder (CNN)
        if use_imagery:
            self.cnn = models.efficientnet_b0(weights=None)
            num_ftrs = self.cnn.classifier[1].in_features
            self.cnn.classifier[1] = nn.Identity()
            self.img_proj = nn.Linear(num_ftrs, d_model)

        # 4. Fusion Layer (Concatenation + MLP)
        concat_dim = d_model * self.n_modalities
        self.fc = nn.Sequential(
            nn.Linear(concat_dim, d_model),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Linear(d_model // 2, 1),
        )

    def forward(self, tab, seq, img=None):
        tab_emb = self.tab_proj(tab)                    # (batch, d_model)

        _, (hn, _) = self.lstm(seq)
        seq_emb = self.seq_proj(hn.squeeze(0))          # (batch, d_model)

        if self.use_imagery:
            if img is None:
                raise ValueError("use_imagery=True but no imagery tensor supplied.")
            img_features = self.cnn(img)
            img_emb = self.img_proj(img_features)       # (batch, d_model)
            fused = torch.cat([tab_emb, seq_emb, img_emb], dim=1)
        else:
            fused = torch.cat([tab_emb, seq_emb], dim=1) # (batch, d_model * 2)

        logits = self.fc(fused)                         # (batch, 1)
        return logits.squeeze(1)
