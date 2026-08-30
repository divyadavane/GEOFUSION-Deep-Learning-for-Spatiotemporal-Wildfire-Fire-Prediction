# Split Strategy

## Methodology: Spatio-Temporal Block Split
To prevent data leakage, we employ a strict spatio-temporal holdout approach:
- **Test Split (Temporal Holdout)**: The final 30% of the timeline is reserved exclusively for testing. This evaluates the model's ability to forecast future events based on past training.
- **Validation Split (Spatial Holdout)**: From the remaining 70% of the timeline, an eastern lon slice is reserved for validation. The nominal boundary was -120.8, but the full grid only spans lon -124.0 to -121.9, so the boundary is dynamically stepped west (in 0.1 increments, capped at -123.0) until the eastern slice contains at least ~20 positive fires (current boundary: lon >= -122.1, 28 positives). This evaluates spatial generalization to unseen geographic blocks while retaining enough positives for a usable metric.
- **Train Split**: All remaining data (earlier 70% of time, west of the val boundary).

## Class Balancing
The export and materialized view contain the FULL unbalanced grid-day population (one row per grid_cell_id / target_date, true has_fire 0/1 label, ~0.37% overall prevalence). NO sampling is applied inside the view. Balancing is applied ONLY at split level:
- **Train** negatives are downsampled to a fixed 1:9 negative:positive ratio (seed 42).
- **Val and Test are NOT downsampled** — they retain true population prevalence.

## Split Balances
### TRAIN
- Total Rows: 4160
- Positive Fire Events: 416
- Class Balance (Positive %): 10.00%

### VAL
- Total Rows: 8950
- Positive Fire Events: 28
- Class Balance (Positive %): 0.31%

### TEST
- Total Rows: 131376
- Positive Fire Events: 488
- Class Balance (Positive %): 0.37%

## Known Limitations
- **No-skill floors differ by split and must NOT be shared.** Compute each split's no-skill AUPRC floor from its own prevalence (positives/total) when interpreting results.

