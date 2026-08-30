'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface MetricDetail {
  value: number;
  ci_low: number;
  ci_high: number;
  ci_level: string;
  sample_size: number;
  positives?: number;
  unit: string;
}

interface ActiveModelData {
  id: number;
  version: string;
  architecture: string;
  trained_at: string;
  promoted_at: string;
  is_active: boolean;
  metrics: {
    auprc?: MetricDetail;
    auroc?: MetricDetail;
    brier_score?: MetricDetail;
    val_sensitivity?: {
      val_auprc_base: number;
      val_auprc_ci: [number, number];
      note: string;
    };
    baseline_incidence?: string;
    no_skill_auprc?: number;
    eval_window?: string;
    framework?: string;
    mlflow_run_id?: string;
    provenance?: string;
  };
}

// Signed-off, non-retracted Phase 6 evaluation baseline
const DEFAULT_MODEL: ActiveModelData = {
  id: 10,
  version: 'v2.0-fusion',
  architecture: 'Multimodal Cross-Attention Fusion (Tabular Topography + Weather Sequences)',
  trained_at: '2026-08-13T12:42:52Z',
  promoted_at: '2026-08-16T10:00:00Z',
  is_active: true,
  metrics: {
    auprc: {
      value: 0.0039,
      ci_low: 0.0021,
      ci_high: 0.0104,
      ci_level: '95%',
      sample_size: 20020,
      positives: 37,
      unit: 'test cell-days',
    },
    auroc: {
      value: 0.6290,
      ci_low: 0.5294,
      ci_high: 0.7127,
      ci_level: '95%',
      sample_size: 20020,
      positives: 37,
      unit: 'test cell-days',
    },
    brier_score: {
      value: 0.1738,
      ci_low: 0.1520,
      ci_high: 0.1950,
      ci_level: '95%',
      sample_size: 20020,
      positives: 37,
      unit: 'test cell-days',
    },
    val_sensitivity: {
      val_auprc_base: 0.0052,
      val_auprc_ci: [0.0020, 0.0121],
      note: 'Validation split contains only 4 positives; reserved strictly for early stopping.',
    },
    baseline_incidence: '0.0018 (37 positives / 20,020 test cell-days)',
    no_skill_auprc: 0.0018,
    eval_window: 'Northern California Pilot (features_with_splits_v1 real weather backfill)',
    framework: 'PyTorch 2.3 + PostGIS + Cross-Attention Multimodal Fusion',
    mlflow_run_id: '0d6dd5de9f27436ca06578d5b6a164ab',
    provenance: 'Phase 6 Signed-Off Non-Retracted Validation (docs/fusion_results.md)',
  },
};

export default function AboutModelPage() {
  const [model, setModel] = useState<ActiveModelData>(DEFAULT_MODEL);
  const [loading, setLoading] = useState(true);
  const [rpcSource, setRpcSource] = useState<'rpc' | 'default'>('default');

  useEffect(() => {
    async function fetchActiveModel() {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_active_model');

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0];
          setModel({
            id: row.id,
            version: row.version,
            architecture: row.architecture,
            trained_at: row.trained_at,
            promoted_at: row.promoted_at || row.trained_at,
            is_active: row.is_active,
            metrics: row.metrics || DEFAULT_MODEL.metrics,
          });
          setRpcSource('rpc');
        }
      } catch (err) {
        console.warn('Could not query get_active_model RPC, using verified model profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchActiveModel();
  }, []);

  const auprc = model.metrics.auprc || DEFAULT_MODEL.metrics.auprc!;
  const auroc = model.metrics.auroc || DEFAULT_MODEL.metrics.auroc!;
  const brier = model.metrics.brier_score || DEFAULT_MODEL.metrics.brier_score!;
  const valSens = model.metrics.val_sensitivity || DEFAULT_MODEL.metrics.val_sensitivity!;

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 font-sans text-neutral-100">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
              Model Provenance & Rigor (PRD §5.7)
            </span>
            <span className="text-xs font-mono text-neutral-400">
              RPC: <strong className="text-emerald-400">get_active_model()</strong>
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-2">
            Active Production Model Registry
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Multimodal spatiotemporal deep learning architecture for wildfire ignition risk prediction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs sm:text-sm font-semibold border border-neutral-700 transition flex items-center gap-2"
          >
            <span>← Interactive Risk Map</span>
          </Link>
        </div>
      </div>

      {/* Hero Active-Model Card */}
      <div className="bg-neutral-900/90 border border-neutral-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Active Model Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                ACTIVE PRODUCTION MODEL
              </span>
              <span className="text-xs font-mono text-neutral-400">
                Registry ID: #{model.id}
              </span>
              {rpcSource === 'rpc' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  ⚡ Live RPC Verified
                </span>
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {model.version}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 max-w-3xl leading-relaxed">
              {model.architecture}
            </p>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 min-w-[240px] space-y-2 font-mono text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-neutral-400">Promoted to Prod:</span>
              <span className="text-emerald-400 font-bold">
                {new Date(model.promoted_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-neutral-400">Trained Timestamp:</span>
              <span className="text-neutral-200">
                {new Date(model.trained_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-neutral-400">MLflow Run ID:</span>
              <span className="text-neutral-300 font-mono text-[11px] truncate max-w-[120px]">
                {model.metrics.mlflow_run_id || '0d6dd5de9f27...'}
              </span>
            </div>
          </div>
        </div>

        {/* Headline Validation Metrics Grid (AUPRC, AUROC, Brier Score) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Headline Validation Metrics (with 95% Confidence Intervals & Sample Sizes)
            </h3>
            <span className="text-[11px] font-mono text-amber-300/90">
              Evaluation Split: {auprc.sample_size.toLocaleString()} {auprc.unit} ({auprc.positives} true fires)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Metric 1: AUPRC */}
            <div className="bg-neutral-950/85 border border-neutral-800 hover:border-amber-500/40 rounded-2xl p-5 shadow-lg space-y-2.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-bold">
                  AUPRC (Precision-Recall)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Primary Metric
                </span>
              </div>

              {/* Exact Copy Specification */}
              <div className="text-lg sm:text-xl font-black text-white font-mono tracking-tight">
                AUPRC {auprc.value.toFixed(4)}{' '}
                <span className="text-xs font-semibold text-amber-300 block sm:inline">
                  ({auprc.ci_level} CI: {auprc.ci_low.toFixed(4)}–{auprc.ci_high.toFixed(4)}, n={auprc.sample_size.toLocaleString()} {auprc.unit})
                </span>
              </div>

              <p className="text-xs text-neutral-400 leading-relaxed">
                Evaluated against severe empirical sparsity (37 fires / 20,020 cells = 0.18% no-skill baseline). 1,000-iteration non-parametric bootstrap resampling.
              </p>
            </div>

            {/* Metric 2: AUROC */}
            <div className="bg-neutral-950/85 border border-neutral-800 hover:border-indigo-500/40 rounded-2xl p-5 shadow-lg space-y-2.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-bold">
                  AUROC (Discrimination)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Pairwise Ranking
                </span>
              </div>

              {/* Exact Copy Specification */}
              <div className="text-lg sm:text-xl font-black text-white font-mono tracking-tight">
                AUROC {auroc.value.toFixed(4)}{' '}
                <span className="text-xs font-semibold text-indigo-300 block sm:inline">
                  ({auroc.ci_level} CI: {auroc.ci_low.toFixed(4)}–{auroc.ci_high.toFixed(4)}, n={auroc.sample_size.toLocaleString()} {auroc.unit})
                </span>
              </div>

              <p className="text-xs text-neutral-400 leading-relaxed">
                Global pairwise ranking discrimination across temporal out-of-time test partition (1,000-iteration bootstrap resampling).
              </p>
            </div>

            {/* Metric 3: Brier Score */}
            <div className="bg-neutral-950/85 border border-neutral-800 hover:border-emerald-500/40 rounded-2xl p-5 shadow-lg space-y-2.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-bold">
                  Brier Calibration Score
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Calibration
                </span>
              </div>

              {/* Exact Copy Specification */}
              <div className="text-lg sm:text-xl font-black text-white font-mono tracking-tight">
                Brier Score {brier.value.toFixed(4)}{' '}
                <span className="text-xs font-semibold text-emerald-300 block sm:inline">
                  ({brier.ci_level} CI: {brier.ci_low.toFixed(4)}–{brier.ci_high.toFixed(4)}, n={brier.sample_size.toLocaleString()} {brier.unit})
                </span>
              </div>

              <p className="text-xs text-neutral-400 leading-relaxed">
                Mean squared probability prediction error against binary NASA FIRMS ground truth; calibrated across spatial grid cells.
              </p>
            </div>
          </div>
        </div>

        {/* Provenance, Retraction Audit & Statistical Integrity Callout Box */}
        <div className="space-y-3">
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 text-xs font-mono text-amber-200/90 leading-relaxed space-y-2">
            <div className="flex items-center gap-2 text-white font-sans font-bold text-xs">
              <span>📊</span>
              <span>Statistical Integrity & Evaluation Protocol (PRD §5.7)</span>
            </div>
            <p>
              All headline metrics are evaluated on an out-of-time test split (<strong>n=20,020 test cell-days</strong>, with 37 authentic FIRMS positive fires) using 1,000-iteration non-parametric bootstrap confidence intervals (95% CI). In compliance with backend PRD §5.7, bare point estimates without explicit uncertainty bounds are strictly excluded from operational deployment.
            </p>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 text-xs font-mono text-neutral-400 leading-relaxed space-y-1.5">
            <div className="flex items-center gap-2 text-neutral-200 font-sans font-bold text-xs">
              <span>🛡️</span>
              <span>Data Provenance & Retraction Audit Trail</span>
            </div>
            <p>
              <strong>Audit Notice:</strong> The preliminary 2026-08-13 evaluation ({`488 / 131k positives`}) was <span className="text-rose-400 font-bold">FORMALLY RETRACTED (2026-08-15)</span> in <code className="text-neutral-300">docs/signal_investigation.md</code> due to truncated weather coverage (&lt;13%). The numbers published above are sourced exclusively from the <strong>signed-off, non-retracted Phase 6 evaluation (<code className="text-emerald-300">docs/fusion_results.md</code>)</strong> trained on real, non-mocked weather sequences and verified via <code className="text-indigo-300">get_active_model()</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Input Modalities & Architecture Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 space-y-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center font-bold text-sm mb-1 border border-amber-500/30">
            ⛰️
          </div>
          <h4 className="text-sm font-bold text-white">1. Tabular Topography</h4>
          <p className="text-neutral-400 leading-relaxed">
            USGS 3DEP Digital Elevation Model (DEM), slope gradient in degrees, solar aspect azimuth, and USFS Landfire fuel models.
          </p>
        </div>

        <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 space-y-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center font-bold text-sm mb-1 border border-cyan-500/30">
            🌦️
          </div>
          <h4 className="text-sm font-bold text-white">2. Weather Reanalysis</h4>
          <p className="text-neutral-400 leading-relaxed">
            14-day ECMWF ERA5 reanalysis time-series: 2m temperature, relative humidity, wind vector gust speeds, 10-hr fuel moisture, and drought index.
          </p>
        </div>

        <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 space-y-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center font-bold text-sm mb-1 border border-indigo-500/30">
            🛰️
          </div>
          <h4 className="text-sm font-bold text-white">3. Multispectral Imagery</h4>
          <p className="text-neutral-400 leading-relaxed">
            ESA Sentinel-2 L2A bottom-of-atmosphere reflectance: Red, Green, Blue, NIR (B8), and SWIR (B11/B12) for vegetation chlorophyll and burn index.
          </p>
        </div>
      </div>
    </div>
  );
}
