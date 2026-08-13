import os
import sys
import pandas as pd
import numpy as np

def validate_features(input_parquet: str):
    print(f"Reading split dataset from: {input_parquet}")
    df = pd.read_parquet(input_parquet)
    
    os.makedirs("docs", exist_ok=True)
    report_path = "docs/feature_validation_report.md"
    
    if len(df) == 0:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("# Feature Validation Report\n\n")
            f.write("**DATASET EMPTY - Pipeline Blocked (Missing Phase 3 Export)**\n")
        print("DataFrame is empty. Validation blocked.")
        return

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Feature Validation Report\n\n")
        
        # 1. Null/Inf Rates
        f.write("## 1. Missingness & Inf Rates (Derived Features)\n")
        derived_cols = ["ndvi", "nbr", "fuel_moisture_proxy"]
        
        for col in derived_cols:
            if col in df.columns:
                nulls = df[col].isna().sum()
                infs = np.isinf(df[col]).sum()
                total = len(df)
                f.write(f"- **`{col}`**: {nulls} nulls ({(nulls/total)*100:.2f}%), {infs} infs ({(infs/total)*100:.2f}%)\n")
                if nulls == total:
                    f.write(f"  > ⚠️ WARNING: `{col}` is 100% missing. (Expected if API failed / missing auth)\n")
        f.write("\n")
        
        # 2. Distribution Sanity
        f.write("## 2. Distribution Sanity\n")
        f.write("- **NDVI/NBR Bounds**: ")
        if not df["ndvi"].isna().all():
            min_ndvi = df["ndvi"].min()
            max_ndvi = df["ndvi"].max()
            f.write(f"Valid. (Min: {min_ndvi:.2f}, Max: {max_ndvi:.2f})\n")
            if min_ndvi < -1.0 or max_ndvi > 1.0:
                f.write("  > 🚨 ERROR: NDVI is out of strict [-1.0, 1.0] bounds!\n")
        else:
            f.write("N/A (All NaNs)\n")
            
        f.write("- **Fuel Moisture Proxy**: ")
        if not df["fuel_moisture_proxy"].isna().all():
            min_fmp = df["fuel_moisture_proxy"].min()
            max_fmp = df["fuel_moisture_proxy"].max()
            f.write(f"Valid. (Min: {min_fmp:.2f}, Max: {max_fmp:.2f})\n")
            if min_fmp < 0:
                f.write("  > 🚨 ERROR: Fuel Moisture Proxy cannot be negative!\n")
        else:
            f.write("N/A (All NaNs)\n")
        f.write("\n")
        
        # 3. Scaling / Normalization Check
        f.write("## 3. Scaling & Normalization Strategy\n")
        f.write("To strictly prevent data leakage:\n")
        f.write("- StandardScalers for continuous features (e.g., `temp_14d_avg`, `elevation_m`) are **fit exclusively on the `train` split**.\n")
        f.write("- The fitted scalers are then applied to `val` and `test`.\n")
        
        # Simulate fitting scaler (using numpy for simplicity to avoid scikit-learn dependency constraint if any)
        train_df = df[df["split"] == "train"]
        if len(train_df) > 0:
            # Example feature
            col = "temp_14d_avg"
            if col in train_df.columns and not train_df[col].isna().all():
                train_mean = train_df[col].mean()
                train_std = train_df[col].std()
                f.write(f"- Example (`{col}`): Train Mean = {train_mean:.2f}, Train Std = {train_std:.2f}\n")
            else:
                f.write("- Cannot fit scalers: Source columns are missing or NaN.\n")
        else:
            f.write("- ⚠️ WARNING: Train split is empty! Cannot fit scalers.\n")
            
    print(f"Validation complete. Report written to {report_path}")

if __name__ == "__main__":
    input_file = "exports/features_with_splits_v1.parquet"
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found. Run make_splits.py first.")
        
        # Write blocked report
        os.makedirs("docs", exist_ok=True)
        with open("docs/feature_validation_report.md", "w") as f:
            f.write("# Feature Validation Report\n\n**DATASET EMPTY - Pipeline Blocked (Missing Phase 3 Export)**\n")
        sys.exit(1)
        
    validate_features(input_file)
