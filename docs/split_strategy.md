# Split Strategy

## Methodology: Spatio-Temporal Block Split
To prevent data leakage, we employ a strict spatio-temporal holdout approach:
- **Test Split (Temporal Holdout)**: The final 20% of the timeline is reserved exclusively for testing. This evaluates the model's ability to forecast future events based on past training.
- **Validation Split (Spatial Holdout)**: From the remaining 80% of the timeline, the easternmost 20% of the grid (Longitude >= -120.8) is reserved for validation. This evaluates spatial generalization to unseen geographic blocks.
- **Train Split**: All remaining data (first 80% of time, western 80% of space).

## Split Balances
### TRAIN
- Total Rows: 119930
- Positive Fire Events: 441
- Class Balance (Positive %): 0.37% if total > 0 else 0%

### VAL
- Total Rows: 1790
- Positive Fire Events: 3
- Class Balance (Positive %): 0.17% if total > 0 else 0%

### TEST
- Total Rows: 131376
- Positive Fire Events: 488
- Class Balance (Positive %): 0.37% if total > 0 else 0%

