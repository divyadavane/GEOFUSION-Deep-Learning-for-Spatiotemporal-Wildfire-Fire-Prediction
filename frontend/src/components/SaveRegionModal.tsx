'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface SaveRegionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentViewportBBox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  onRegionSaved?: (savedRegion: { id: string; name: string; bbox: number[] }) => void;
}

const REGION_PRESETS = [
  {
    name: 'Current Map Viewport',
    desc: 'Boundaries currently framed on your active map canvas',
    getBbox: (vp?: [number, number, number, number]) => vp || [-124.0, 38.0, -120.0, 42.0],
  },
  {
    name: 'Mendocino Complex AOI',
    desc: 'Coast range dry chaparral & timber woodland corridor',
    getBbox: () => [-123.5, 39.1, -122.6, 40.2],
  },
  {
    name: 'Shasta-Trinity Mountain Zone',
    desc: 'Northern montane conifer forest & volcanic plateau',
    getBbox: () => [-122.8, 40.4, -121.8, 41.5],
  },
  {
    name: 'Napa-Sonoma Wildland Perimeter',
    desc: 'Coastal foothill interface & high-velocity wind pass',
    getBbox: () => [-122.9, 38.2, -122.1, 38.9],
  },
];

export function SaveRegionModal({
  isOpen,
  onClose,
  currentViewportBBox,
  onRegionSaved,
}: SaveRegionModalProps) {
  const { user, profile, loading: authLoading } = useAuth();

  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [customName, setCustomName] = useState('My Custom Wildfire AOI');
  const [customDescription, setCustomDescription] = useState('High-risk seasonal fuel monitoring zone');
  const [minLon, setMinLon] = useState(currentViewportBBox ? currentViewportBBox[0].toFixed(3) : '-123.500');
  const [minLat, setMinLat] = useState(currentViewportBBox ? currentViewportBBox[1].toFixed(3) : '38.500');
  const [maxLon, setMaxLon] = useState(currentViewportBBox ? currentViewportBBox[2].toFixed(3) : '-121.500');
  const [maxLat, setMaxLat] = useState(currentViewportBBox ? currentViewportBBox[3].toFixed(3) : '40.500');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ id: string; name: string } | null>(null);

  // Close on Escape key press (WCAG 2.1 Keyboard Accessible)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (index: number) => {
    setSelectedPresetIndex(index);
    const preset = REGION_PRESETS[index];
    if (preset) {
      const bbox = preset.getBbox(currentViewportBBox);
      setMinLon(bbox[0].toFixed(3));
      setMinLat(bbox[1].toFixed(3));
      setMaxLon(bbox[2].toFixed(3));
      setMaxLat(bbox[3].toFixed(3));
      if (index > 0) {
        setCustomName(preset.name);
        setCustomDescription(preset.desc);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setSaving(true);
      setErrorMsg(null);

      const w = parseFloat(minLon);
      const s = parseFloat(minLat);
      const e_coord = parseFloat(maxLon);
      const n = parseFloat(maxLat);

      if (isNaN(w) || isNaN(s) || isNaN(e_coord) || isNaN(n)) {
        throw new Error('All coordinates must be valid numbers');
      }

      if (w >= e_coord || s >= n) {
        throw new Error('Bounding box must satisfy: West < East and South < North');
      }

      const bboxArray = [w, s, e_coord, n];

      // Build GeoJSON Polygon geometry for PostGIS
      const polygonGeojson = {
        type: 'Polygon',
        coordinates: [
          [
            [w, s],
            [e_coord, s],
            [e_coord, n],
            [w, n],
            [w, s],
          ],
        ],
      };

      const { data, error } = await supabase
        .from('saved_regions')
        .insert({
          user_id: user.id,
          name: customName.trim() || 'Custom Monitored Region',
          description: customDescription.trim() || null,
          bbox: bboxArray,
          geometry: polygonGeojson,
        })
        .select('id, name, bbox')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setSuccessResult({ id: data.id, name: data.name });
      if (onRegionSaved) {
        onRegionSaved(data);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save region');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-region-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-neutral-100 font-sans max-h-[90vh] overflow-y-auto focus:outline-none">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-5 right-5 p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-lg font-black text-white shadow-lg"
            aria-hidden="true"
          >
            📌
          </div>
          <div>
            <h2 id="save-region-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Save Custom Region / AOI
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
              Persist a named spatial bounding box to your account for rapid multi-model monitoring.
            </p>
          </div>
        </div>

        {/* Unauthenticated Gated State */}
        {!user && !authLoading ? (
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-6 text-center space-y-4">
            <div
              className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold"
              aria-hidden="true"
            >
              🔒
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                Authenticated Viewer Required
              </h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Saving custom geographic perimeters to the <code className="text-amber-300 font-mono">saved_regions</code> table requires an active session protected by Row Level Security (RLS).
              </p>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Link
                href="/login?redirect=/"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Sign In to Save Regions →
              </Link>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs sm:text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : successResult ? (
          /* Success Screen */
          <div role="status" className="bg-neutral-950/80 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4">
            <div
              className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-2xl font-bold"
              aria-hidden="true"
            >
              ✓
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">
                Region Successfully Saved!
              </h3>
              <p className="text-xs text-emerald-300 font-mono">
                &quot;{successResult.name}&quot; persisted to database (ID: {successResult.id.slice(0, 8)}...)
              </p>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Link
                href="/regions"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm transition shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                View in Saved Regions (/regions) →
              </Link>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs sm:text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Authenticated Form */
          <form onSubmit={handleSave} className="space-y-5">
            {/* User session status badge */}
            <div className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs font-mono text-neutral-400">
              <span>
                User: <strong className="text-neutral-200">{user?.email}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {profile?.role || 'authenticated_viewer'}
              </span>
            </div>

            {/* AOI Preset Selector */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold block">
                Choose Perimeter Preset or Custom
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Preset Bounding Boxes">
                {REGION_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(idx)}
                    aria-pressed={selectedPresetIndex === idx}
                    className={`p-3 rounded-xl border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      selectedPresetIndex === idx
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md'
                        : 'bg-neutral-950/60 hover:bg-neutral-800/80 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    <div className="text-xs font-bold">{preset.name}</div>
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5 line-clamp-1">
                      {preset.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name & Description Inputs */}
            <div className="space-y-3">
              <div>
                <label htmlFor="custom-region-name-input" className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold block mb-1">
                  Region Name *
                </label>
                <input
                  id="custom-region-name-input"
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Sonoma Valley Fire Perimeter"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 font-sans"
                />
              </div>

              <div>
                <label htmlFor="custom-region-desc-input" className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold block mb-1">
                  Description / Operational Notes
                </label>
                <input
                  id="custom-region-desc-input"
                  type="text"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="e.g. Dry chaparral & steep ridge monitoring corridor"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 font-sans"
                />
              </div>
            </div>

            {/* Bounding Box Coordinates (EPSG:4326) */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold block">
                Bounding Box Coordinates (EPSG:4326 [W, S, E, N])
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div>
                  <label htmlFor="bbox-min-lon" className="text-[10px] text-neutral-400 block mb-0.5">West (Min Lon)</label>
                  <input
                    id="bbox-min-lon"
                    type="number"
                    step="0.001"
                    value={minLon}
                    onChange={(e) => setMinLon(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="bbox-min-lat" className="text-[10px] text-neutral-400 block mb-0.5">South (Min Lat)</label>
                  <input
                    id="bbox-min-lat"
                    type="number"
                    step="0.001"
                    value={minLat}
                    onChange={(e) => setMinLat(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="bbox-max-lon" className="text-[10px] text-neutral-400 block mb-0.5">East (Max Lon)</label>
                  <input
                    id="bbox-max-lon"
                    type="number"
                    step="0.001"
                    value={maxLon}
                    onChange={(e) => setMaxLon(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="bbox-max-lat" className="text-[10px] text-neutral-400 block mb-0.5">North (Max Lat)</label>
                  <input
                    id="bbox-max-lat"
                    type="number"
                    step="0.001"
                    value={maxLat}
                    onChange={(e) => setMaxLat(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400"
                  />
                </div>
              </div>
            </div>

            {errorMsg && (
              <div role="alert" className="bg-rose-950/60 border border-rose-500/40 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs font-mono">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs sm:text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white text-xs sm:text-sm font-bold transition shadow-lg disabled:opacity-50 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <span>📌 Save Region</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
