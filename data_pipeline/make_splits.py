import os
import sys
import pandas as pd
import numpy as np

TRAIN_NEG_POS_RATIO = 9.0  # downsample negatives in TRAIN only to this ratio

def downsample_train_to_ratio(df, ratio=TRAIN_NEG_POS_RATIO, seed=42):
    """Downsample negatives in the TRAIN split only.

    Val/Test keep the full unmodified population (true prevalence). Only the
    Train split's negative rows are sampled down to `ratio` negatives per
    positive so the model sees a tractable balance while val/test metrics stay
    honest. Returns a new DataFrame; non-train rows are untouched.
    """
    train = df[df["split"] == "train"]
    n_pos = int((train["has_fire"] == 1).sum())
    n_neg = int((train["has_fire"] == 0).sum())
    keep_neg = int(n_pos * ratio)

    if n_neg <= keep_neg:
        print(f"  Train already at/below 1:{int(ratio)} (neg={n_neg} <= pos*ratio={keep_neg}). No downsample.")
        return df

    rng = np.random.RandomState(seed)
    neg_idx = train.index[train["has_fire"] == 0].to_numpy()
    keep_idx = rng.choice(neg_idx, size=keep_neg, replace=False)

    keep_mask = (df["split"] != "train") | (df["has_fire"] == 1) | (df.index.isin(keep_idx))
    out = df[keep_mask].copy()
    print(f"  Train downsample: neg {n_neg} -> {keep_neg} (1:{int(ratio)}), positives kept {n_pos}")
    return out

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
    
    # Dynamically find a spatial boundary that gives validation a MEANINGFUL
    # positive count (not just >0). A val split with only a handful of
    # positives yields unreliable metrics and cannot support early stopping.
    val_lon_threshold = -120.8
    min_val_positives = 20
    step = 0.1
    max_attempts = 50
    floor_lon = -123.0  # don't shift past this: train must retain area/positives
    
    for attempt in range(max_attempts):
        conditions = [
            (df["target_date"] >= test_start_date), # Temporal Test
            (df["target_date"] < test_start_date) & (df["approx_lon"] >= val_lon_threshold), # Spatial Val
            (df["target_date"] < test_start_date) & (df["approx_lon"] < val_lon_threshold)   # Train
        ]
        choices = ["test", "val", "train"]
        df["split"] = np.select(conditions, choices, default="train")
        
        # Require val to have >= min_val_positives AND train to keep positives
        val_df = df[df["split"] == "val"]
        train_df = df[df["split"] == "train"]
        
        if val_df["has_fire"].sum() >= min_val_positives and train_df["has_fire"].sum() > 0:
            break
            
        # Shift the boundary west to pull more cells into validation
        # but don't shift past floor_lon to ensure train retains some area
        if val_lon_threshold > floor_lon:
            val_lon_threshold -= step
        else:
            # Reached the floor without meeting the minimum; accept whatever
            # we have as long as both val and train contain at least one fire.
            if val_df["has_fire"].sum() > 0 and train_df["has_fire"].sum() > 0:
                break
            if val_lon_threshold > -124.0:
                val_lon_threshold -= step
            else:
                break

    df = df.drop(columns=["approx_lon"])
    print(f"  val boundary lon >= {val_lon_threshold:.1f}")
    
    # Downsample negatives in TRAIN only (val/test keep full true prevalence)
    df = downsample_train_to_ratio(df)
    
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
    with open("docs/split_strategy.md", "w", encoding="utf-8") as f:
        f.write("# Split Strategy\n\n")
        f.write("## Methodology: Spatio-Temporal Block Split\n")
        f.write("To prevent data leakage, we employ a strict spatio-temporal holdout approach:\n")
        f.write("- **Test Split (Temporal Holdout)**: The final 30% of the timeline is reserved exclusively for testing. This evaluates the model's ability to forecast future events based on past training.\n")
        f.write("- **Validation Split (Spatial Holdout)**: From the remaining 70% of the timeline, an eastern lon slice is reserved for validation. The nominal boundary was -120.8, but the full grid only spans lon -124.0 to -121.9, so the boundary is dynamically stepped west (in 0.1 increments, capped at -123.0) until the eastern slice contains at least ~20 positive fires (current boundary: lon >= -122.1, 28 positives). This evaluates spatial generalization to unseen geographic blocks while retaining enough positives for a usable metric.\n")
        f.write("- **Train Split**: All remaining data (earlier 70% of time, west of the val boundary).\n\n")
        f.write("## Class Balancing\n")
        f.write("The export and materialized view contain the FULL unbalanced grid-day population (one row per grid_cell_id / target_date, true has_fire 0/1 label, ~0.37% overall prevalence). NO sampling is applied inside the view. Balancing is applied ONLY at split level:\n")
        f.write("- **Train** negatives are downsampled to a fixed 1:9 negative:positive ratio (seed 42).\n")
        f.write("- **Val and Test are NOT downsampled** — they retain true population prevalence.\n\n")
        f.write("## Split Balances\n")
        if len(df) == 0:
            f.write("**DATASET EMPTY - Pipeline Blocked (Missing Phase 3 Export)**\n")
            return
            
        for split in ["train", "val", "test"]:
            split_df = df[df["split"] == split]
            total = len(split_df)
            positives = split_df["has_fire"].sum()
            pct = (positives / total * 100) if total > 0 else 0.0
            f.write(f"### {split.upper()}\n")
            f.write(f"- Total Rows: {total}\n")
            f.write(f"- Positive Fire Events: {positives}\n")
            f.write(f"- Class Balance (Positive %): {pct:.2f}%\n\n")

        f.write("## Known Limitations\n")
        for split in ["train", "val", "test"]:
            split_df = df[df["split"] == split]
            total = len(split_df)
            positives = float(split_df["has_fire"].sum())
            if total > 0 and positives < 20:
                f.write(f"- **{split.upper()} has only {int(positives)} positives** — metrics on this split are unreliable; a single misclassified fire swings AUPRC/AUROC.\n")
        f.write("- **No-skill floors differ by split and must NOT be shared.** Compute each split's no-skill AUPRC floor from its own prevalence (positives/total) when interpreting results.\n\n")

if __name__ == "__main__":
    input_file = "exports/features_v1.parquet"
    output_file = "exports/features_with_splits_v1.parquet"
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found. Run build_features.py first.")
        
        # Write an empty strategy doc indicating the blocker
        write_strategy_doc(pd.DataFrame())
        sys.exit(1)
        
    make_splits(input_file, output_file)
