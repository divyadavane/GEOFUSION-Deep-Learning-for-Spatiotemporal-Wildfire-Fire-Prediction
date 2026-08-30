'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getRelativeRiskTier, getRiskColor } from '@/lib/riskTiers';
import type { RiskHeatmapResponse } from '@/app/api/risk-heatmap/route';
import Link from 'next/link';

interface SavedRegionItem {
  id: string;
  name: string;
  description: string | null;
  bbox: number[] | null;
  created_at: string;
  updated_at?: string;
}

// Bounding Box SVG Preview Thumbnail Component
function RegionBBoxThumbnail({
  bbox,
  tierColor = '#f59e0b',
}: {
  bbox: number[] | null;
  tierColor?: string;
}) {
  const domain = { minLon: -124.0, maxLon: -120.0, minLat: 38.0, maxLat: 42.0 };
  const width = 160;
  const height = 120;

  const project = useCallback((lon: number, lat: number) => {
    const x = ((lon - domain.minLon) / (domain.maxLon - domain.minLon)) * width;
    const y = height - ((lat - domain.minLat) / (domain.maxLat - domain.minLat)) * height;
    return { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) };
  }, [domain.minLon, domain.maxLon, domain.minLat, domain.maxLat]);

  if (!bbox || bbox.length < 4) {
    return (
      <div className="w-40 h-28 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-[10px] font-mono text-neutral-500">
        No BBox Data
      </div>
    );
  }

  const [w, s, e, n] = bbox;
  const pTopLeft = project(w, n);
  const pBottomRight = project(e, s);

  const rectWidth = Math.max(12, pBottomRight.x - pTopLeft.x);
  const rectHeight = Math.max(10, pBottomRight.y - pTopLeft.y);

  return (
    <div className="relative w-40 h-28 rounded-xl bg-neutral-950/90 border border-neutral-800 overflow-hidden shadow-inner flex-shrink-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <defs>
          <pattern id="grid-pattern" width="16" height="12" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 12" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid-pattern)" />

        <path
          d="M 10 10 Q 35 45 45 75 T 70 115"
          fill="none"
          stroke="rgba(56, 189, 248, 0.25)"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />

        <rect
          x="2"
          y="2"
          width={width - 4}
          height={height - 4}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          rx="4"
        />

        <rect
          x={pTopLeft.x}
          y={pTopLeft.y}
          width={rectWidth}
          height={rectHeight}
          fill={tierColor}
          fillOpacity="0.25"
          stroke={tierColor}
          strokeWidth="2"
          rx="2"
          className="animate-pulse"
        />

        <circle
          cx={pTopLeft.x + rectWidth / 2}
          cy={pTopLeft.y + rectHeight / 2}
          r="2.5"
          fill="#ffffff"
        />
      </svg>

      <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between text-[8px] font-mono text-neutral-400 bg-neutral-900/90 px-1.5 py-0.5 rounded border border-neutral-800 backdrop-blur-sm">
        <span>{w.toFixed(1)}°W</span>
        <span>{n.toFixed(1)}°N</span>
      </div>
    </div>
  );
}

// Compute summarized risk level for a saved region's bounding box
function computeRegionRiskSummary(
  bbox: number[] | null,
  predictions: Record<number, { risk_score: number; confidence_low?: number; confidence_high?: number }>
) {
  if (!bbox || bbox.length < 4 || Object.keys(predictions).length === 0) {
    return {
      cellCount: 0,
      meanRisk: 0.18,
      maxRisk: 0.25,
      elevatedCount: 0,
      tier: getRelativeRiskTier(0.18),
    };
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const matchingScores: number[] = [];

  for (let cellId = 1; cellId <= 3200; cellId++) {
    const idx = cellId - 1;
    const col = idx % 40;
    const row = Math.floor(idx / 40);

    const centerLon = -124.0 + (col + 0.5) * 0.1;
    const centerLat = 38.0 + (row + 0.5) * 0.05;

    if (
      centerLon >= minLon &&
      centerLon <= maxLon &&
      centerLat >= minLat &&
      centerLat <= maxLat
    ) {
      const pred = predictions[cellId];
      if (pred) {
        matchingScores.push(pred.risk_score);
      }
    }
  }

  if (matchingScores.length === 0) {
    return {
      cellCount: 0,
      meanRisk: 0.15,
      maxRisk: 0.15,
      elevatedCount: 0,
      tier: getRelativeRiskTier(0.15),
    };
  }

  const meanRisk = parseFloat((matchingScores.reduce((a, b) => a + b, 0) / matchingScores.length).toFixed(3));
  const maxRisk = Math.max(...matchingScores);
  const elevatedCount = matchingScores.filter((s) => s >= 0.40).length;

  return {
    cellCount: matchingScores.length,
    meanRisk,
    maxRisk,
    elevatedCount,
    tier: getRelativeRiskTier(maxRisk),
  };
}

export default function SavedRegionsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [regions, setRegions] = useState<SavedRegionItem[]>([]);
  const [heatmapData, setHeatmapData] = useState<RiskHeatmapResponse | null>(null);
  const [loadingRegions, setLoadingRegions] = useState(true);

  // Rename states
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [renameFeedback, setRenameFeedback] = useState<string | null>(null);

  // Delete Confirmation Modal state
  const [regionToDelete, setRegionToDelete] = useState<SavedRegionItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSavedRegions = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingRegions(true);
      const { data, error } = await supabase
        .from('saved_regions')
        .select('id, name, description, bbox, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRegions(data);
      }
    } catch (err) {
      console.error('Error fetching saved regions:', err);
    } finally {
      setLoadingRegions(false);
    }
  }, [user]);

  useEffect(() => {
    async function fetchHeatmap() {
      try {
        const res = await fetch('/api/risk-heatmap?region=northern_california_pilot');
        if (res.ok) {
          const data: RiskHeatmapResponse = await res.json();
          setHeatmapData(data);
        }
      } catch (err) {
        console.error('Error fetching heatmap for region summary:', err);
      }
    }
    fetchHeatmap();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/regions');
    } else if (user) {
      fetchSavedRegions();
    }
  }, [user, authLoading, router, fetchSavedRegions]);

  const startEditing = (region: SavedRegionItem) => {
    setEditingRegionId(region.id);
    setEditNameValue(region.name);
  };

  const cancelEditing = () => {
    setEditingRegionId(null);
    setEditNameValue('');
  };

  const handleSaveRename = async (regionId: string) => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;

    try {
      setSavingRename(true);
      const { error } = await supabase
        .from('saved_regions')
        .update({
          name: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', regionId);

      if (error) {
        throw new Error(error.message);
      }

      setRegions((prev) =>
        prev.map((r) => (r.id === regionId ? { ...r, name: trimmed, updated_at: new Date().toISOString() } : r))
      );
      setEditingRegionId(null);
      setRenameFeedback(`Renamed to "${trimmed}"`);
      setTimeout(() => setRenameFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to rename region:', err);
      alert(err instanceof Error ? err.message : 'Failed to rename region');
    } finally {
      setSavingRename(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!regionToDelete) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('saved_regions')
        .delete()
        .eq('id', regionToDelete.id);

      if (error) {
        throw new Error(error.message);
      }

      setRegions((prev) => prev.filter((r) => r.id !== regionToDelete.id));
      setRegionToDelete(null);
    } catch (err) {
      console.error('Failed to delete region:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete region');
    } finally {
      setDeleting(false);
    }
  };

  const predictions = useMemo(() => heatmapData?.predictions || {}, [heatmapData]);

  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-neutral-400 font-mono">Verifying authenticated session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-3 border border-amber-500/20 font-bold text-sm">
            🔒
          </div>
          <h2 className="text-lg font-bold text-white">Authentication Required</h2>
          <p className="text-xs text-neutral-400 mt-1 mb-6">
            You must be signed in to view and manage your saved monitoring regions.
          </p>
          <Link
            href="/login?redirect=/regions"
            className="inline-block w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl transition"
          >
            Go to Sign In →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
              User Monitored Perimeters
            </span>
            <span className="text-xs font-mono text-neutral-400">
              Role: <strong className="text-emerald-400">{profile?.role || 'authenticated_viewer'}</strong>
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mt-2">
            Saved Geographic Regions
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Persisted AOI bounding boxes and spatial perimeters scoped to <span className="text-neutral-200 font-mono font-bold">{user.email}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs sm:text-sm font-semibold border border-neutral-700 transition flex items-center gap-2"
          >
            <span>← Back to Risk Map</span>
          </Link>
        </div>
      </div>

      {/* Rename Feedback Toast */}
      {renameFeedback && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 px-4 py-2 rounded-2xl text-xs font-mono flex items-center gap-2 animate-in fade-in duration-150">
          <span>✓</span>
          <span>{renameFeedback}</span>
        </div>
      )}

      {/* Regions Grid */}
      {loadingRegions ? (
        <div className="py-12 text-center text-xs font-mono text-neutral-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading saved regions from database...
        </div>
      ) : regions.length === 0 ? (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-neutral-800 border border-neutral-700 text-neutral-400 flex items-center justify-center mx-auto text-2xl font-bold">
            📌
          </div>
          <h3 className="text-lg font-bold text-white">No Saved Regions Yet</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            You haven&apos;t saved any custom bounding boxes yet. Open the interactive map and click &quot;📌 Save Region&quot; to bookmark any area of interest.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs sm:text-sm transition"
          >
            Open Interactive Map →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
            <span>{regions.length} Saved Monitoring Perimeters</span>
            <span>Forecast Date: {heatmapData?.date || '2026-08-31'}</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {regions.map((reg) => {
              const summary = computeRegionRiskSummary(reg.bbox, predictions);
              const maxRiskColorRgb = getRiskColor(summary.maxRisk);
              const maxRiskCss = `rgb(${maxRiskColorRgb[0]}, ${maxRiskColorRgb[1]}, ${maxRiskColorRgb[2]})`;
              const isEditing = editingRegionId === reg.id;
              const bboxQuery = reg.bbox && reg.bbox.length === 4 ? `&bbox=${reg.bbox.join(',')}` : '';

              return (
                <div
                  key={reg.id}
                  className="bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700/90 rounded-3xl p-5 sm:p-6 shadow-2xl transition flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                >
                  {/* Left: Thumbnail & Region Name / Metadata / Rename Input */}
                  <div className="flex items-start gap-5 flex-1 w-full md:w-auto">
                    <RegionBBoxThumbnail bbox={reg.bbox} tierColor={summary.tier.color} />

                    <div className="space-y-2 flex-1 min-w-0">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveRename(reg.id);
                          }}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="text"
                            required
                            autoFocus
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            className="bg-neutral-950 border border-amber-400 rounded-xl px-3 py-1.5 text-sm font-bold text-white focus:outline-none flex-1 min-w-[200px]"
                          />
                          <button
                            type="submit"
                            disabled={savingRename}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs font-mono transition disabled:opacity-50"
                          >
                            {savingRename ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono text-xs transition"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                            {reg.name}
                          </h2>
                          <button
                            onClick={() => startEditing(reg)}
                            className="text-[11px] font-mono text-neutral-400 hover:text-amber-300 px-2 py-0.5 rounded-md bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 transition"
                            title="Rename this region"
                          >
                            ✏️ Rename
                          </button>
                          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold border ${summary.tier.badgeBg}`}>
                            {summary.tier.label}
                          </span>
                        </div>
                      )}

                      {reg.description && (
                        <p className="text-xs sm:text-sm text-neutral-400 max-w-xl leading-relaxed">
                          {reg.description}
                        </p>
                      )}

                      {reg.bbox && reg.bbox.length === 4 && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-neutral-400">
                          <span>AOI BBox: [{reg.bbox[0].toFixed(2)}°, {reg.bbox[1].toFixed(2)}°] to [{reg.bbox[2].toFixed(2)}°, {reg.bbox[3].toFixed(2)}°]</span>
                          <span>•</span>
                          <span>Grid Extent: <strong className="text-white">{summary.cellCount} Cells</strong> (~{summary.cellCount * 100} km²)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Region Risk Metrics Summary & Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-neutral-800">
                    <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 min-w-[200px] space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between items-baseline">
                        <span className="text-neutral-400">Peak Risk Index:</span>
                        <span className="text-sm font-black" style={{ color: maxRiskCss }}>
                          {summary.maxRisk.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-neutral-400">AOI Mean Risk:</span>
                        <span className="text-neutral-200 font-bold">
                          {summary.meanRisk.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-neutral-400">Elevated Hotspots:</span>
                        <span className="text-amber-400 font-bold">
                          {summary.elevatedCount} Cells
                        </span>
                      </div>
                    </div>

                    {/* Direct Redirect to Custom Grid Map View */}
                    <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                      <Link
                        href={`/?regionId=${reg.id}&name=${encodeURIComponent(reg.name)}${bboxQuery}`}
                        className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold font-mono text-xs text-center transition shadow-lg flex items-center justify-center gap-1.5"
                      >
                        <span>🎯 Focus Map</span>
                        <span>→</span>
                      </Link>
                      <button
                        onClick={() => setRegionToDelete(reg)}
                        className="px-3 py-1.5 rounded-xl bg-neutral-850 hover:bg-rose-950/80 text-neutral-400 hover:text-rose-300 font-mono text-xs transition border border-neutral-700 hover:border-rose-500/40"
                        title="Delete saved region"
                      >
                        🗑️ Delete AOI
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stylized Delete Confirmation Dialog */}
      {regionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-neutral-100 font-sans">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-lg font-bold">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirm Region Deletion
                </h3>
                <p className="text-xs text-neutral-400">
                  This action permanently removes this AOI from your account.
                </p>
              </div>
            </div>

            <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 space-y-1 text-xs font-mono">
              <p className="text-neutral-400">Target Perimeter:</p>
              <p className="text-white font-bold text-sm truncate">{regionToDelete.name}</p>
              {regionToDelete.bbox && (
                <p className="text-neutral-500 text-[11px] pt-1">
                  BBox: [{regionToDelete.bbox.map((b) => b.toFixed(2)).join(', ')}]
                </p>
              )}
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Are you sure you want to delete this monitored region? This action will update the database immediately and cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRegionToDelete(null)}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs sm:text-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold transition shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Region</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
