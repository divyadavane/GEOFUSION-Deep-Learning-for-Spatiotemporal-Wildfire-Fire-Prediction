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
    
    # Exclude metadata and strings from tabular features
    exclude_cols = ["grid_cell_id", "region", "cell_geom", "target_date", "latest_imagery_path", "split", "has_fire", "land_cover_class", "fuel_type"]
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

class ImageryDataset(Dataset):
    """
    For Baseline C (CNN)
    Mocks image loading since we don't have the actual TIFFs downloaded locally
    and the S3 paths require requester-pays AWS auth.
    Always returns a dummy tensor (3, 224, 224) to allow the model architecture to run.
    """
    def __init__(self, split_name: str):
        self.df = pd.read_parquet("exports/features_with_splits_v1.parquet")
        self.df = self.df[self.df["split"] == split_name].copy()
        self.y = self.df["has_fire"].values
        
    def __len__(self):
        return len(self.df)
        
    def __getitem__(self, idx):
        # We simulate a missing image by yielding a tensor of zeros.
        # In a real scenario with PyTorch Rasterio datasets, we would attempt to open the STAC URL.
        # We know the STAC paths in our mock dataset are fake strings, so we yield random noise
        # (Using zeros causes BatchNormalization to output NaNs due to zero variance)
        img_tensor = torch.randn((3, 224, 224), dtype=torch.float32) * 0.01
        target = np.float32(self.y[idx])
        
        return img_tensor, torch.tensor(target)

def get_dataloader(dataset_type: str, split_name: str, batch_size: int = 32, shuffle: bool = False):
    """
    Returns a PyTorch DataLoader for the specified dataset type and split.
    """
    if dataset_type == "weather_sequence":
        dataset = WeatherSequenceDataset(split_name)
    elif dataset_type == "imagery":
        dataset = ImageryDataset(split_name)
    else:
        raise ValueError("Invalid dataset_type. Choose 'weather_sequence' or 'imagery'.")
        
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle)
