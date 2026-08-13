"""
fusion_model.py — Multimodal Fusion Architecture for GEOFUSION

Phase 6 scope clarification (2026-08-13):
  imagery_tiles has 0 rows in the database. Real satellite imagery is NOT available.
  Phase 6 therefore proceeds on 2 modalities: tabular features + weather sequence (LSTM).
  The imagery (CNN) branch is retained in the architecture for when real imagery is ingested,
  but forward() must NOT be called with torch.randn mock tensors — doing so produces
  semantically meaningless cross-attention weights and contaminates the registry.

  Set use_imagery=True only when imagery_tiles has real data AND compute_imagery_indices()
  in build_features.py returns non-NaN NDVI/NBR values.
"""
import torch
import torch.nn as nn
import torchvision.models as models


class MultimodalFusion(nn.Module):
    def __init__(
        self,
        tabular_dim: int,
        d_model: int = 64,
        nhead: int = 4,
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

        # 3. Imagery Encoder (CNN) — EfficientNet-B0
        # Retained in architecture for future use; not used in Phase 6 (imagery_tiles = 0 rows).
        if use_imagery:
            self.cnn = models.efficientnet_b0(weights=None)
            num_ftrs = self.cnn.classifier[1].in_features
            self.cnn.classifier[1] = nn.Identity()
            self.img_proj = nn.Linear(num_ftrs, d_model)

        # 4. Fusion Layer (Self-Attention over active modalities)
        self.transformer_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,
            batch_first=True,
        )

        # 5. Output head
        self.fc = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Linear(d_model // 2, 1),
        )

    def forward(self, tab, seq, img=None):
        """
        Args:
            tab: (batch, tabular_dim) — real tabular features
            seq: (batch, 14, 4)       — real 14-day weather sequences
            img: (batch, 3, H, W)     — real imagery (only if use_imagery=True)
        """
        tab_emb = self.tab_proj(tab)                    # (batch, d_model)

        _, (hn, _) = self.lstm(seq)
        seq_emb = self.seq_proj(hn.squeeze(0))          # (batch, d_model)

        if self.use_imagery:
            if img is None:
                raise ValueError("use_imagery=True but no imagery tensor supplied.")
            img_features = self.cnn(img)
            img_emb = self.img_proj(img_features)       # (batch, d_model)
            modalities = [tab_emb, seq_emb, img_emb]
        else:
            modalities = [tab_emb, seq_emb]

        # Stack modalities: (batch, n_modalities, d_model)
        x = torch.stack(modalities, dim=1)

        # Self-attention across modalities
        fused = self.transformer_layer(x)               # (batch, n_modalities, d_model)
        fused_mean = fused.mean(dim=1)                  # (batch, d_model)

        logits = self.fc(fused_mean)                    # (batch, 1)
        return logits.squeeze(1)

