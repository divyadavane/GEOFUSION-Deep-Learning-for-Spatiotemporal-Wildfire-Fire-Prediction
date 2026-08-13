# Phase 5: Baseline Unimodal Model Results

This report documents the performance of the three single-modality baselines on the strictly held-out temporal `test` split.

## Metrics

| Model                        |      AUPRC |    AUROC |      Brier |
|:-----------------------------|-----------:|---------:|-----------:|
| Baseline A (XGBoost Tabular) | 0.0030909  | 0.666865 | 0.134616   |
| Baseline B (Weather LSTM)    | 0.00359367 | 0.699167 | 0.00244628 |

## Context & Sample Sizes
- **Class Imbalance**: Approximately 1:9 (Fire vs No Fire) based on the current data generation.
- **Baseline C (Imagery) Warning**: Because we are currently using a local mock dataset (due to CLI auth issues), 100% of the imagery loads are simulated as zero-tensors. Therefore, Baseline C's performance is equivalent to random guessing and is NOT a reliable indicator of its true potential.

## Conclusion
The strongest baseline sets the floor for the Phase 6-7 multimodal fusion model.
**Current best model:** `Baseline B (Weather LSTM)` with an AUPRC of **0.0036**.

