import os
import sys
import pandas as pd
import numpy as np

def make_splits(input_parquet: str, output_parquet: str):
    print(f"Reading augmented features from: {input_parquet}")
    df = pd.read_parquet(input_parquet)
    
    if len(df) == 0:
        print("DataFrame is empty. Writing empty split strategy doc and exiting.")
        df["split"] = pd.Series(dtype="string")
        df.to_parquet(output_parquet)
        write_strategy_doc(df)
        return df

    # Ensure target_date is datetime
    df["target_date"] = pd.to_datetime(df["target_date"])
    
    # Sort by date
    df = df.sort_values("target_date")
    
    # 1. Temporal Holdout (Test Split)
    # The last 20% of the date range is strictly test.
    min_date = df["target_date"].min()
    max_date = df["target_date"].max()
    time_delta = max_date - min_date
    test_start_date = max_date - (time_delta * 0.20)
    
    # 2. Spatial Holdout (Validation Split)
    # We will hold out a spatial block. Assuming coordinates can be parsed from cell_geom or we
    # have region strings. If cell_geom is WKT (e.g. POLYGON((...))), we extract an approximate centroid.
    # For a robust block, let's say longitude > threshold is validation.
    # Since we defined Northern California as approx [-124, 38] to [-120, 42],
    # let's use the easternmost 20% of the grid as the spatial validation block.
    # Extracting longitude from WKT string is brittle, but since we built it as 'POLYGON((X Y, ...))':
    def extract_lon(geom_str):
        try:
            # simple parse, gets first coordinate X
            return float(geom_str.split('((')[1].split(' ')[0])
        except:
            return np.nan
            
    df["approx_lon"] = df["cell_geom"].apply(extract_lon)
    
    # Validation block: longitudes > -120.8 (the eastern 20% of the [-124 to -120] range)
    val_lon_threshold = -120.8
    
    # Assign splits
    conditions = [
        (df["target_date"] >= test_start_date), # Temporal Test
        (df["target_date"] < test_start_date) & (df["approx_lon"] >= val_lon_threshold), # Spatial Val
        (df["target_date"] < test_start_date) & (df["approx_lon"] < val_lon_threshold)   # Train
    ]
    choices = ["test", "val", "train"]
    df["split"] = np.select(conditions, choices, default="train")
    
    # Drop temp column
    df = df.drop(columns=["approx_lon"])
    
    # Write augmented file with splits
    print(f"Writing dataset with splits to: {output_parquet}")
    os.makedirs(os.path.dirname(output_parquet), exist_ok=True)
    df.to_parquet(output_parquet)
    
    # Verify positive class in every split
    write_strategy_doc(df)
    
    # Explicitly check for blockers
    for split in ["train", "val", "test"]:
        split_df = df[df["split"] == split]
        positives = split_df["has_fire"].sum()
        if positives == 0:
            print(f"BLOCKER: Split '{split}' has 0 positive fire events! Adjust split boundaries.")
            sys.exit(1)
            
    return df

def write_strategy_doc(df):
    os.makedirs("docs", exist_ok=True)
    with open("docs/split_strategy.md", "w") as f:
        f.write("# Split Strategy\n\n")
        f.write("## Methodology: Spatio-Temporal Block Split\n")
        f.write("To prevent data leakage, we employ a strict spatio-temporal holdout approach:\n")
        f.write("- **Test Split (Temporal Holdout)**: The final 20% of the timeline is reserved exclusively for testing. This evaluates the model's ability to forecast future events based on past training.\n")
        f.write("- **Validation Split (Spatial Holdout)**: From the remaining 80% of the timeline, the easternmost 20% of the grid (Longitude >= -120.8) is reserved for validation. This evaluates spatial generalization to unseen geographic blocks.\n")
        f.write("- **Train Split**: All remaining data (first 80% of time, western 80% of space).\n\n")
        
        f.write("## Split Balances\n")
        if len(df) == 0:
            f.write("**DATASET EMPTY - Pipeline Blocked (Missing Phase 3 Export)**\n")
            return
            
        for split in ["train", "val", "test"]:
            split_df = df[df["split"] == split]
            total = len(split_df)
            positives = split_df["has_fire"].sum()
            f.write(f"### {split.upper()}\n")
            f.write(f"- Total Rows: {total}\n")
            f.write(f"- Positive Fire Events: {positives}\n")
            f.write(f"- Class Balance (Positive %): {(positives/total)*100:.2f}% if total > 0 else 0%\n\n")

if __name__ == "__main__":
    input_file = "exports/features_v1.parquet"
    output_file = "exports/features_with_splits_v1.parquet"
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found. Run build_features.py first.")
        
        # Write an empty strategy doc indicating the blocker
        write_strategy_doc(pd.DataFrame())
        sys.exit(1)
        
    make_splits(input_file, output_file)
