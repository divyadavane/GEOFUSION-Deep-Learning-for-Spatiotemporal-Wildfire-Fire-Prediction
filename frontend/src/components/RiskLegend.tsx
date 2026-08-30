'use client';

import React, { useState } from 'react';

export interface RiskBandDefinition {
  range: string;
  percentile: string;
  label: string;
  sublabel: string;
  color: string;
  badgeBg: string;
  border: string;
}

export const RISK_BANDS: RiskBandDefinition[] = [
  {
    range: '0.00 – 0.20',
    percentile: '0th – 20th %ile',
    label: 'Baseline Background',
    sublabel: 'Regional Floor • Lowest Relative Vulnerability',
    color: '#10b981',
    badgeBg: 'bg-emerald-500/20 text-emerald-300',
    border: 'border-emerald-500/30',
  },
  {
    range: '0.20 – 0.40',
    percentile: '20th – 40th %ile',
    label: 'Low Relative Index',
    sublabel: 'Below Regional Median',
    color: '#84cc16',
    badgeBg: 'bg-lime-500/20 text-lime-300',
    border: 'border-lime-500/30',
  },
  {
    range: '0.40 – 0.60',
    percentile: '40th – 60th %ile',
    label: 'Moderate Relative Index',
    sublabel: 'Domain Median Relative Risk',
    color: '#eab308',
    badgeBg: 'bg-yellow-500/20 text-yellow-300',
    border: 'border-yellow-500/30',
  },
  {
    range: '0.60 – 0.80',
    percentile: '60th – 80th %ile',
    label: 'Elevated Relative Vulnerability',
    sublabel: 'Top Quintile Relative Exposure',
    color: '#f97316',
    badgeBg: 'bg-orange-500/20 text-orange-300',
    border: 'border-orange-500/30',
  },
  {
    range: '0.80 – 1.00',
    percentile: 'Top Decile (>80th %ile)',
    label: 'Severe / Peak Anomaly',
    sublabel: 'Highest Regional Vulnerability Hotspot',
    color: '#a855f7',
    badgeBg: 'bg-purple-500/20 text-purple-300',
    border: 'border-purple-500/30',
  },
];

interface RiskMetrics {
  mean_risk: number;
  max_risk: number;
  min_risk: number;
  elevated_risk_count?: number;
  high_risk_count: number;
  extreme_risk_count: number;
  is_nominal_baseline?: boolean;
}

interface RiskLegendProps {
  metrics: RiskMetrics | null;
  totalCells: number;
  loading: boolean;
  onSelectNextDay?: () => void;
}

export function RiskLegend({ metrics, totalCells, loading, onSelectNextDay }: RiskLegendProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isNominal = metrics ? (metrics.is_nominal_baseline ?? (metrics.high_risk_count === 0 && metrics.max_risk < 0.35)) : false;

  const highRiskPct = metrics && totalCells > 0
    ? ((metrics.high_risk_count / totalCells) * 100).toFixed(1)
    : '0';

  const meanRiskPct = metrics
    ? (metrics.mean_risk * 100).toFixed(1)
    : '--';

  return (
    <section
      aria-label="Wildfire Risk Index Legend and Percentile Rankings"
      className="bg-neutral-900/90 backdrop-blur-2xl border border-neutral-700/70 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3.5 text-neutral-100 font-sans"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-emerald-500 via-amber-500 via-orange-500 to-purple-600"
              aria-hidden="true"
            />
            Relative Risk Index
          </span>
          <p className="text-xs text-neutral-300 font-medium mt-0.5">
            Spatiotemporal Percentile Ranking
          </p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          aria-controls="banded-tiers-panel"
          className="text-xs font-mono font-semibold text-indigo-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        >
          {showDetails ? 'Simple View' : 'Banded Tiers'}
        </button>
      </div>

      {/* Nominal Empty-State Banner */}
      {isNominal && !loading && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-300 space-y-2 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-bold text-emerald-200">
              No Elevated-Risk Cells Detected for This Date
            </span>
          </div>
          <p className="text-xs text-emerald-300/90 leading-relaxed font-mono">
            All {totalCells.toLocaleString()} cells are within nominal baseline background conditions (0th–20th percentile). Given natural wildfire sparsity (~0.18% base rate), calm days are an expected, normal operational state.
          </p>
          {onSelectNextDay && (
            <button
              onClick={onSelectNextDay}
              className="mt-1 text-xs font-bold text-emerald-300 hover:text-white underline underline-offset-4 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span>Explore subsequent forecast days</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}

      {/* Continuous Gradient Color Bar with Percentile Ticks (WCAG Colorblind Safe Multi-Hue) */}
      <div className="space-y-2">
        <div
          className="relative"
          role="img"
          aria-label="Colorblind-safe risk gradient: from baseline green (0%) through ochre yellow (50%) to peak violet-purple (100%)"
        >
          <div className="h-3.5 w-full rounded-xl bg-gradient-to-r from-emerald-500 via-lime-500 via-yellow-400 via-orange-500 via-rose-500 to-purple-600 shadow-inner" />
          <div className="absolute inset-0 flex justify-between pointer-events-none px-0.5" aria-hidden="true">
            <div className="w-0.5 h-3.5 bg-neutral-950/40" />
            <div className="w-0.5 h-3.5 bg-neutral-950/40" />
            <div className="w-0.5 h-3.5 bg-neutral-950/40" />
            <div className="w-0.5 h-3.5 bg-neutral-950/40" />
            <div className="w-0.5 h-3.5 bg-neutral-950/40" />
          </div>
        </div>

        {/* Percentile Labels */}
        <div
          className="flex justify-between text-[11px] font-mono text-neutral-300 px-0.5 font-medium"
          aria-label="Percentile markers: P0 Base, P20, P50 Median, P80, P95+ Peak"
        >
          <span className="text-emerald-400 font-bold">P0 (Base)</span>
          <span className="text-lime-400">P20</span>
          <span className="text-yellow-400 font-bold">P50 (Median)</span>
          <span className="text-orange-400">P80</span>
          <span className="text-purple-400 font-bold">P95+ (Peak)</span>
        </div>
      </div>

      {/* Banded Tiers Breakdown */}
      {showDetails && (
        <div
          id="banded-tiers-panel"
          className="space-y-2 pt-2 border-t border-neutral-800 animate-in fade-in duration-150"
          role="region"
          aria-label="Detailed Risk Tier Classifications"
        >
          {RISK_BANDS.map((band) => (
            <div
              key={band.range}
              className={`p-2.5 rounded-xl bg-neutral-800/70 border ${band.border} flex items-center justify-between text-xs font-mono`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: band.color }}
                  aria-hidden="true"
                />
                <div>
                  <p className="font-bold text-white text-xs leading-tight">{band.label}</p>
                  <p className="text-[11px] text-neutral-400 leading-tight mt-0.5">{band.sublabel}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${band.badgeBg}`}>
                  {band.percentile}
                </span>
                <p className="text-[11px] text-neutral-400 mt-1">Index: {band.range}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calibration & Class Imbalance Scientific Disclaimer Note */}
      <div className="p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed font-mono">
        <span className="text-amber-400 font-bold">Calibration Context: </span>
        Due to extreme natural fire imbalance (~0.18% base incidence rate), scores represent relative percentile ranking across the pilot domain rather than absolute uncalibrated event probabilities.
      </div>

      {/* Summary Metrics Row */}
      {metrics && !loading && (
        <div
          className="grid grid-cols-4 gap-2 pt-1 border-t border-neutral-800 text-center font-mono"
          role="status"
          aria-live="polite"
          aria-label={`Current Metrics: Mean Risk ${meanRiskPct}%, Peak Risk ${(metrics.max_risk * 100).toFixed(1)}%, Top Decile Cells ${metrics.high_risk_count}`}
        >
          <div className="bg-neutral-800/60 rounded-xl p-2 border border-neutral-700/60">
            <p className="text-[10px] font-mono text-neutral-400 uppercase font-semibold">Mean</p>
            <p className="text-sm font-black text-amber-300 mt-0.5">{meanRiskPct}%</p>
          </div>
          <div className="bg-neutral-800/60 rounded-xl p-2 border border-neutral-700/60">
            <p className="text-[10px] font-mono text-neutral-400 uppercase font-semibold">Peak Cell</p>
            <p className="text-sm font-black text-purple-300 mt-0.5">{(metrics.max_risk * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-neutral-800/60 rounded-xl p-2 border border-neutral-700/60">
            <p className="text-[10px] font-mono text-neutral-400 uppercase font-semibold">Top Decile</p>
            <p className="text-sm font-black text-orange-300 mt-0.5">{metrics.high_risk_count} <span className="text-[10px] font-normal text-neutral-400">({highRiskPct}%)</span></p>
          </div>
          <div className="bg-neutral-800/60 rounded-xl p-2 border border-neutral-700/60">
            <p className="text-[10px] font-mono text-neutral-400 uppercase font-semibold">Base Rate</p>
            <p className="text-sm font-black text-cyan-300 mt-0.5">0.18%</p>
          </div>
        </div>
      )}
    </section>
  );
}
