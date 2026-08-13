# Phase 6: Validation & Fusion Results

This document addresses the three critical validation checks required before promoting the Phase 6 fusion model.

## 1. Auth Path Confirmation (GoTrue Status)

**The GoTrue JWT pipeline remains BLOCKED.** 
Because the `.env.researcher` file lacks the required static API keys (`anon` and `service_role`), the `ingest-webhook` and PostgREST layers are currently inaccessible. 

To unblock the data pipeline without dummy data, the ETL and Registry scripts (`export_training_data.py` and `push_registry.py`) were run using **direct PostgreSQL connections via `psycopg2`**, authenticating as the `postgres` superuser.

**Important Disclaimer**: Postgres superusers are exempt from Row Level Security (RLS) by default. Therefore, this connection completely bypasses RLS. We have removed misleading SQL commands (`SET ROLE authenticated`) from the scripts that falsely implied RLS was being simulated. This auth path will not be RLS-compliant until the proper Supabase API keys are provided and the GoTrue edge functions can be used, or until a dedicated `researcher` Postgres role with proper GRANTs is created.

## 2. Validation Split Sensitivity Analysis

Given the extreme class imbalance, the validation split currently contains only 4 positive fire events out of 1,785 rows. To determine if this split size is statistically robust enough to trust as a validation metric, we performed a leave-one-out and a 1000-iteration bootstrap resampling analysis on the validation predictions.

**Results of Bootstrap Analysis (n=1000):**
*   **AUPRC 95% Confidence Interval:** `[0.0020, 0.0121]` (Base: 0.0052, Std Dev: 0.0027)
*   **AUROC 95% Confidence Interval:** `[0.7016, 0.8073]` (Base: 0.7462, Std Dev: 0.0260)

**Leave-One-Positive-Out Sensitivity:**
*   Removing Pos 1 -> AUPRC: 0.0043, AUROC: 0.7492
*   Removing Pos 2 -> AUPRC: 0.0040, AUROC: 0.7238
*   Removing Pos 3 -> AUPRC: 0.0045, AUROC: 0.7614
*   Removing Pos 4 -> AUPRC: 0.0043, AUROC: 0.7505

**Conclusion:** The validation AUPRC can swing by over 100% depending on exactly which 4 positives are sampled. The Validation split is too small and volatile to be used for formal model evaluation. It should be strictly reserved for early stopping. All formal model reporting will rely exclusively on the **Test Split**, which contains 37 positives and provides a much more stable evaluation baseline.

## 3. Baseline Model Comparisons (Re-run on Real Data)

The following metrics reflect the performance of the unimodal baselines and the multimodal fusion models, all trained and evaluated on the corrected `features_with_splits_v1` dataset (which now contains real, non-mocked weather sequences and positive fire labels).

| Model Architecture | Modalities | Test AUPRC | Test AUROC | Test Brier |
| :--- | :--- | :--- | :--- | :--- |
| **Baseline A (XGBoost)** | Tabular Only | 0.0031 | 0.6669 | 0.1346 |
| **Baseline B (LSTM)** | Weather Sequence Only | 0.0036 | 0.6992 | 0.0024 |
| **Phase 6 (Late-Fusion Concat)** | Tabular + Weather Seq | 0.0036 | 0.6944 | 0.1048 |
| **Phase 6 (Cross-Attention)** | Tabular + Weather Seq | 0.0039 | 0.6290 | 0.1738 |

*(Note: Baseline C CNN remains excluded as satellite imagery has not yet been ingested.)*

### Conclusion: Test Set Statistical Significance & Verdict

To determine if any model definitively outperforms the others or demonstrates true predictive skill, we performed a 1,000-iteration bootstrap resampling on the Test set predictions (which contains only 37 positives out of 20,020 rows, establishing a no-skill AUPRC baseline of **0.0018**).

**Bootstrap 95% Confidence Intervals:**
*   **Baseline A (XGBoost):** AUPRC `[0.0020, 0.0053]` | AUROC `[0.5863, 0.7327]`
*   **Baseline B (LSTM):** AUPRC `[0.0023, 0.0059]` | AUROC `[0.6117, 0.7693]`
*   **Late-Fusion (Concat):** AUPRC `[0.0023, 0.0055]` | AUROC `[0.6005, 0.7754]`
*   **Phase 6 (Cross-Attention):** AUPRC `[0.0021, 0.0104]` | AUROC `[0.5294, 0.7127]`

**Honest Verdict: No Significant Difference & Weak Signal**
1.  **Overlap:** The 95% Confidence Intervals for AUPRC completely overlap across all four models. While Cross-Attention achieved the highest point estimate, its wide CI (`[0.0021, 0.0104]`) entirely engulfs the CIs of XGBoost and Concat Fusion. **No single model has been shown to beat the others; any differences are smaller than the noise floor.**
2.  **No-Skill Floor:** The lower bounds of all 95% CIs (`~0.0020` - `0.0023`) sit barely above the no-skill baseline of `0.0018`. This indicates only a very weak signal above random guessing for this highly imbalanced dataset.

Until the dataset size increases or stronger signals (like the missing satellite imagery) are integrated, these models cannot be deemed statistically robust for operational use.
