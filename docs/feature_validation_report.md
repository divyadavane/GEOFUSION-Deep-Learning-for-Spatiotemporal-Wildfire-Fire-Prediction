# Feature Validation Report

## 1. Missingness & Inf Rates (Derived Features)
- **`ndvi`**: 480 nulls (100.00%), 0 infs (0.00%)
  > ⚠️ WARNING: `ndvi` is 100% missing. (Expected if API failed / missing auth)
- **`nbr`**: 480 nulls (100.00%), 0 infs (0.00%)
  > ⚠️ WARNING: `nbr` is 100% missing. (Expected if API failed / missing auth)
- **`fuel_moisture_proxy`**: 0 nulls (0.00%), 0 infs (0.00%)

## 2. Distribution Sanity
- **NDVI/NBR Bounds**: N/A (All NaNs)
- **Fuel Moisture Proxy**: Valid. (Min: 0.01, Max: 1.80)

## 3. Scaling & Normalization Strategy
To strictly prevent data leakage:
- StandardScalers for continuous features (e.g., `temp_14d_avg`, `elevation_m`) are **fit exclusively on the `train` split**.
- The fitted scalers are then applied to `val` and `test`.
- Example (`temp_14d_avg`): Train Mean = 24.65, Train Std = 5.31
