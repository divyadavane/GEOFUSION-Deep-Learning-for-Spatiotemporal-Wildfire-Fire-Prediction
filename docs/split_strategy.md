# Split Strategy

## Methodology: Spatio-Temporal Block Split
To prevent data leakage, we employ a strict spatio-temporal holdout approach:
- **Test Split (Temporal Holdout)**: The final 20% of the timeline is reserved exclusively for testing. This evaluates the model's ability to forecast future events based on past training.
- **Validation Split (Spatial Holdout)**: From the remaining 80% of the timeline, the easternmost 20% of the grid (Longitude >= -120.8) is reserved for validation. This evaluates spatial generalization to unseen geographic blocks.
- **Train Split**: All remaining data (first 80% of time, western 80% of space).

## Split Balances
**DATASET EMPTY - Pipeline Blocked (Missing Phase 3 Export)**
