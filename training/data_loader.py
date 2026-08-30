import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

def load_split_data(split_name: str):
    """
    Loads tabular data for a specific split from the exported Parquet file.
    Returns: df, feature_cols, target_col
    """
    df = pd.read_parquet("exports/features_with_splits_v1.parquet")
    df = df[df["split"] == split_name].copy()
    
    # Exclude metadata, strings, and the JSON sequence array from tabular features
    exclude_cols = [
        "grid_cell_id", "region", "cell_geom", "target_date", 
        "latest_imagery_path", "split", "has_fire", "land_cover_class", 
        "fuel_type", "weather_14d_sequence"
    ]
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    
    # Fill any remaining NaNs with 0 (e.g. if imagery was missing for NDVI)
    df[feature_cols] = df[feature_cols].fillna(0)
    
    return df, feature_cols, "has_fire"

def get_tabular_data(split_name: str):
    """
    For Baseline A (XGBoost)
    """
    df, feature_cols, target_col = load_split_data(split_name)
    X = df[feature_cols].values
    y = df[target_col].values
    return X, y, feature_cols

class WeatherSequenceDataset(Dataset):
    """
    For Baseline B (LSTM)
    Mocks a 14-day sequence by distributing the 14-day average across 14 timesteps with noise,
    since Phase 3 only exported the averages to the tabular dataset.
    """
    def __init__(self, split_name: str):
        self.df, self.feature_cols, self.target_col = load_split_data(split_name)
        
        # We extract the specific weather sequence column
        self.weather_seqs = self.df["weather_14d_sequence"].values
        self.y = self.df[self.target_col].values
        
    def __len__(self):
        return len(self.df)
        
    def __getitem__(self, idx):
        seq_str = self.weather_seqs[idx]
        seq = np.zeros((14, 4), dtype=np.float32)
        try:
            if isinstance(seq_str, str):
                import json
                seq_data = json.loads(seq_str)
            else:
                seq_data = seq_str # already parsed?
                
            if seq_data is not None:
                for t in range(min(14, len(seq_data))):
                    item = seq_data[t]
                    seq[t, 0] = float(item.get("temperature_c", 0))
                    seq[t, 1] = float(item.get("humidity_pct", 0))
                    seq[t, 2] = float(item.get("wind_speed_ms", 0))
                    seq[t, 3] = float(item.get("precip_mm", 0))
        except Exception:
            pass
            
        target = np.float32(self.y[idx])
        return torch.tensor(seq), torch.tensor(target)

import rasterio
import torchvision.transforms as T
from PIL import Image

def get_image_transform():
    return T.Compose([
        T.ToPILImage(),
        T.Resize((224, 224)),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

class ImageryDataset(Dataset):
    """
    For Baseline C (CNN) using local cached Sentinel-2 imagery.
    """
    def __init__(self, split_name: str):
        self.df, self.feature_cols, self.target_col = load_split_data(split_name)
        self.image_paths = self.df.get("local_imagery_path", pd.Series([None] * len(self.df))).values
        self.y = self.df[self.target_col].values
        self.transform = get_image_transform()

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        path = self.image_paths[idx]
        target = torch.tensor(self.y[idx], dtype=torch.float32)
        
        if pd.isna(path):
            img_tensor = torch.zeros((3, 224, 224), dtype=torch.float32)
            return img_tensor, target
            
        try:
            with rasterio.open(path) as src:
                img_data = src.read() # [3, H, W]
                # convert to [H, W, 3] for ToPILImage
                img_data = np.transpose(img_data, (1, 2, 0))
                img_tensor = self.transform(img_data)
        except Exception:
            img_tensor = torch.zeros((3, 224, 224), dtype=torch.float32)
            
        return img_tensor, target

class MultimodalDataset(Dataset):
    """
    Phase 6 fusion dataset: Tabular + Weather Sequence + Sentinel-2 Imagery.
    Returns: (X_tab, X_seq, X_img), y
    """
    def __init__(self, split_name: str):
        self.df, self.feature_cols, self.target_col = load_split_data(split_name)
        self.X_tab = self.df[self.feature_cols].values.astype(np.float32)
        self.weather_seqs = self.df["weather_14d_sequence"].values
        self.image_paths = self.df.get("local_imagery_path", pd.Series([None]*len(self.df))).values
        self.y = self.df[self.target_col].values
        self.transform = get_image_transform()

        n_pos = int(np.sum(self.y))
        if n_pos == 0:
            raise ValueError(
                f"Split '{split_name}' has ZERO positive fire labels. "
                "Re-run the weather backfill and re-export before training."
            )
        print(f"  {split_name}: {len(self.df)} rows, {n_pos} positives ({100*n_pos/len(self.df):.2f}%)")

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        # 1. Tabular
        tab = torch.tensor(self.X_tab[idx], dtype=torch.float32)

        # 2. Sequential (LSTM)
        seq_str = self.weather_seqs[idx]
        seq = np.zeros((14, 4), dtype=np.float32)
        try:
            if isinstance(seq_str, str):
                import json
                seq_data = json.loads(seq_str)
            else:
                seq_data = seq_str

            if seq_data is not None:
                for t in range(min(14, len(seq_data))):
                    item = seq_data[t]
                    if isinstance(item, list):
                        seq[t, 0] = float(item[0])  # temperature_c
                        seq[t, 1] = float(item[1])  # humidity_pct
                        seq[t, 2] = float(item[2])  # wind_speed_ms
                        seq[t, 3] = float(item[3])  # precip_mm
                    else:
                        seq[t, 0] = float(item.get("temperature_c", 0))
                        seq[t, 1] = float(item.get("humidity_pct", 0))
                        seq[t, 2] = float(item.get("wind_speed_ms", 0))
                        seq[t, 3] = float(item.get("precip_mm", 0))
        except Exception:
            pass
        seq_tensor = torch.tensor(seq, dtype=torch.float32)

        # 3. Imagery (CNN)
        path = self.image_paths[idx]
        if pd.isna(path):
            img_tensor = torch.zeros((3, 224, 224), dtype=torch.float32)
        else:
            try:
                with rasterio.open(path) as src:
                    img_data = src.read() # [3, H, W]
                    img_data = np.transpose(img_data, (1, 2, 0)) # [H, W, 3]
                    img_tensor = self.transform(img_data)
            except Exception:
                img_tensor = torch.zeros((3, 224, 224), dtype=torch.float32)
                
        target = torch.tensor(self.y[idx], dtype=torch.float32)
        
        return (tab, seq_tensor, img_tensor), target

def get_dataloader(dataset_type: str, split_name: str, batch_size: int = 32, shuffle: bool = False):
    """
    Returns a PyTorch DataLoader for the specified dataset type and split.
    """
    if dataset_type == "weather_sequence":
        dataset = WeatherSequenceDataset(split_name)
    elif dataset_type == "imagery":
        dataset = ImageryDataset(split_name)
    elif dataset_type == "multimodal":
        dataset = MultimodalDataset(split_name)
    else:
        raise ValueError("Invalid dataset_type. Choose 'weather_sequence', 'imagery', or 'multimodal'.")

    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle, num_workers=2, pin_memory=True)
