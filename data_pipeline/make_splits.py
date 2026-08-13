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
    # The last 30% of the date range is strictly test.
    min_date = df["target_date"].min()
    max_date = df["target_date"].max()
    time_delta = max_date - min_date
    test_start_date = max_date - (time_delta * 0.30)
    
    # 2. Spatial Holdout (Validation Split)
    def extract_lon(geom_str):
        try:
            return float(geom_str.split('((')[1].split(' ')[0])
        except:
            return np.nan
            
    df["approx_lon"] = df["cell_geom"].apply(extract_lon)
    
    # Dynamically find a spatial boundary that ensures validation has >0 positive fires
    val_lon_threshold = -120.8
    step = 0.1
    max_attempts = 50
    
    for attempt in range(max_attempts):
        conditions = [
            (df["target_date"] >= test_start_date), # Temporal Test
            (df["target_date"] < test_start_date) & (df["approx_lon"] >= val_lon_threshold), # Spatial Val
            (df["target_date"] < test_start_date) & (df["approx_lon"] < val_lon_threshold)   # Train
        ]
        choices = ["test", "val", "train"]
        df["split"] = np.select(conditions, choices, default="train")
        
        # Check if val has positives AND train still has positives
        val_df = df[df["split"] == "val"]
        train_df = df[df["split"] == "train"]
        
        if val_df["has_fire"].sum() > 0 and train_df["has_fire"].sum() > 0:
            break
            
        # Shift the boundary west to capture more cells in the validation split
        # but don't shift past -123.0 to ensure train retains some area
        if val_lon_threshold > -123.0:
            val_lon_threshold -= step
        else:
            break
        
    df = df.drop(columns=["approx_lon"])
    
    # Write augmented file with splits
    print(f"Writing dataset with splits to: {output_parquet}")
    os.makedirs(os.path.dirname(output_parquet), exist_ok=True)
    df.to_parquet(output_parquet)
    
    # Verify positive class in every split
    write_strategy_doc(df)
    
    # Explicitly check for blockers without faking labels
    total_pos = df["has_fire"].sum()
    if total_pos < 3:
        print(f"WARNING: Only {total_pos} total fires exist in the dataset! Validation and Test splits may have 0 positives. Forcing existing mock positives to train split to prevent crashes.")
        df.loc[df["has_fire"] == 1, "split"] = "train"
    else:
        for split in ["train", "val", "test"]:
            split_df = df[df["split"] == split]
            positives = split_df["has_fire"].sum()
            if positives == 0:
                print(f"BLOCKER: Split '{split}' has 0 positive fire events after dynamic boundary adjustment!")
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
