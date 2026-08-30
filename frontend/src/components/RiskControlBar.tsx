'use client';

import React from 'react';
import Link from 'next/link';

export interface HorizonDayOption {
  dateStr: string;
  horizonDay: number;
  label: string;
  dayName: string;
  formattedDate: string;
}

export function computeForecastHorizon(): HorizonDayOption[] {
  const base = new Date();
  const list: HorizonDayOption[] = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    list.push({
      dateStr,
      horizonDay: i,
      label: `+${i}d`,
      dayName: days[d.getDay()],
      formattedDate: `${months[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return list;
}

export interface LastRealtimeEvent {
  cellId: number;
  score: number;
  timestamp: string;
  reason?: string;
}

export interface BackendRegionOption {
  region_id: string;
  name: string;
  cell_count: number;
  extent_wkt?: string;
}

export interface SavedRegionOption {
  id: string;
  name: string;
  bbox: number[] | null;
}

interface RiskControlBarProps {
  selectedRegion: string;
  onRegionChange: (region: string) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  horizonDays: HorizonDayOption[];
  loading: boolean;
  source: 'database_rpc' | 'simulated_forecast' | null;
  rpcSignature: string | null;
  realtimeStatus?: string;
  isLivePulsing?: boolean;
  lastRealtimeEvent?: LastRealtimeEvent | null;
  isLiveStreaming?: boolean;
  onToggleLiveStream?: () => void;
  onTriggerLiveEvent?: () => void;
  availableRegions?: BackendRegionOption[];
  savedRegions?: SavedRegionOption[];
}

export function RiskControlBar({
  selectedRegion,
  onRegionChange,
  selectedDate,
  onDateChange,
  horizonDays,
  loading,
  source,
  rpcSignature,
  realtimeStatus = 'SUBSCRIBED',
  isLivePulsing = false,
  lastRealtimeEvent = null,
  isLiveStreaming = true,
  onToggleLiveStream,
  onTriggerLiveEvent,
  availableRegions = [
    {
      region_id: 'northern_california_pilot',
      name: 'Northern California Pilot',
      cell_count: 3200,
    },
  ],
  savedRegions = [],
}: RiskControlBarProps) {
  const minDate = horizonDays[0]?.dateStr;
  const maxDate = horizonDays[horizonDays.length - 1]?.dateStr;

  const currentOption = horizonDays.find((h) => h.dateStr === selectedDate) || horizonDays[0];

  return (
    <section
      aria-label="Wildfire Forecast Controls and Realtime Stream"
      className="bg-neutral-900/95 backdrop-blur-2xl border border-neutral-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 text-neutral-100 font-sans"
    >
      {/* Top Row: Region Selector + Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-neutral-800/80 pb-3.5">
        {/* Left: Region Selection */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <label
            htmlFor="region-select"
            className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-bold whitespace-nowrap"
          >
            Region / Place:
          </label>
          <div className="relative flex-1 max-w-md">
            <select
              id="region-select"
              aria-label="Select geographic monitoring region or custom saved place"
              value={selectedRegion}
              onChange={(e) => onRegionChange(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 hover:border-neutral-600 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 cursor-pointer shadow-inner appearance-none pr-8 transition"
            >
              {/* Dynamic Database-Driven Available Regions */}
              <optgroup label="Available Backend Regions (Database-Driven)">
                {availableRegions.map((r) => (
                  <option key={r.region_id} value={r.region_id}>
                    🌲 {r.name} ({r.cell_count.toLocaleString()} Cells)
                  </option>
                ))}
              </optgroup>

              {savedRegions.length > 0 && (
                <optgroup label="Your Saved Places / AOIs">
                  {savedRegions.map((sr) => (
                    <option key={sr.id} value={`saved_${sr.id}`}>
                      📌 {sr.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]" aria-hidden="true">
              ▼
            </div>
          </div>
        </div>

        {/* Right: Live Realtime Action Controls (Single Line Pill Badges) */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap" role="toolbar" aria-label="Realtime Streaming Controls">
          {/* Live Streaming Toggle */}
          {onToggleLiveStream && (
            <button
              onClick={onToggleLiveStream}
              aria-pressed={isLiveStreaming}
              aria-label={isLiveStreaming ? "Pause continuous real-time model inference stream" : "Start continuous real-time model inference stream"}
              className={`h-9 px-3 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 whitespace-nowrap border focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
                isLiveStreaming
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                  : 'bg-neutral-800/90 hover:bg-neutral-750 text-neutral-300 border-neutral-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveStreaming ? 'bg-emerald-400 animate-ping' : 'bg-neutral-500'
                }`}
                aria-hidden="true"
              />
              <span>{isLiveStreaming ? '⚡ Live Stream (3s)' : '⏸ Stream Paused'}</span>
            </button>
          )}

          {/* Trigger Now Button */}
          {onTriggerLiveEvent && (
            <button
              onClick={onTriggerLiveEvent}
              aria-label="Simulate instant real-time satellite telemetry ingestion burst"
              className="h-9 px-3.5 rounded-xl text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 whitespace-nowrap shadow-sm shadow-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
            >
              <span>⚡ Trigger Now</span>
            </button>
          )}

          {/* WebSocket Status Indicator */}
          <div
            role="status"
            aria-live="polite"
            aria-label={`Supabase WebSocket Status: ${realtimeStatus}`}
            className={`h-9 px-3 rounded-xl text-xs font-mono font-bold border flex items-center gap-2 whitespace-nowrap transition-all duration-300 ${
              isLivePulsing
                ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-md shadow-emerald-500/20 scale-105'
                : 'bg-neutral-950/90 border-neutral-700 text-emerald-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeStatus === 'SUBSCRIBED' ? 'bg-emerald-400' : 'bg-amber-400'
              } ${isLivePulsing ? 'animate-ping' : ''}`}
              aria-hidden="true"
            />
            <span className="tracking-wide">
              {isLivePulsing ? 'Write Received' : 'WebSocket Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Row: Forecast Horizon (1–7 Days Tabs) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-2">
            <span>📅 Forecast Horizon (1–7 Days)</span>
            {loading && (
              <span className="text-xs text-amber-400 animate-pulse font-normal" role="status">
                Updating raster grid...
              </span>
            )}
          </span>
          <span className="text-xs font-mono font-semibold text-amber-300" aria-live="polite">
            Selected: {currentOption.dayName}, {currentOption.formattedDate} ({currentOption.label})
          </span>
        </div>

        {/* 7 Equal Tabs as Radio Group */}
        <div
          role="radiogroup"
          aria-label="Select forecast horizon date"
          className="grid grid-cols-7 gap-1.5 sm:gap-2"
        >
          {horizonDays.map((item) => {
            const isSelected = item.dateStr === selectedDate;
            return (
              <button
                key={item.dateStr}
                role="radio"
                aria-checked={isSelected}
                aria-label={`Forecast for ${item.dayName}, ${item.formattedDate} (${item.label})`}
                onClick={() => onDateChange(item.dateStr)}
                className={`py-2 px-1 rounded-xl transition text-center flex flex-col items-center justify-center border font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
                  isSelected
                    ? 'bg-amber-500 text-neutral-950 font-black border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
                    : 'bg-neutral-950/80 hover:bg-neutral-800/80 text-neutral-300 hover:text-white border-neutral-800'
                }`}
              >
                <span className="text-xs font-bold leading-tight">{item.dayName}</span>
                <span className="text-[11px] font-mono opacity-80 leading-tight mt-0.5">{item.label}</span>
                <span className="text-[10px] font-mono opacity-60 leading-tight hidden sm:block mt-0.5">{item.formattedDate}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Telemetry Log Bar */}
      {lastRealtimeEvent && (
        <div
          role="status"
          aria-live="polite"
          className="bg-neutral-950/90 border border-neutral-800 rounded-xl px-3.5 py-2 flex items-center justify-between gap-3 text-xs font-mono"
        >
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping flex-shrink-0" aria-hidden="true" />
            <span className="text-neutral-400 flex-shrink-0">Latest Telemetry:</span>
            <span className="text-white font-bold flex-shrink-0">Cell #{lastRealtimeEvent.cellId}</span>
            <span className="text-neutral-400 flex-shrink-0">updated risk to</span>
            <span className="text-amber-400 font-extrabold flex-shrink-0">{lastRealtimeEvent.score.toFixed(3)}</span>
            {lastRealtimeEvent.reason && (
              <span className="text-neutral-500 truncate hidden md:inline">({lastRealtimeEvent.reason})</span>
            )}
          </div>
          <span className="text-[10px] text-neutral-400 flex-shrink-0">{lastRealtimeEvent.timestamp}</span>
        </div>
      )}

      {/* Bottom Footer Row: Provenance & Date Picker */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800/80 text-xs font-mono text-neutral-400">
        <div className="flex items-center gap-2 flex-wrap">
          <span>Backend Source:</span>
          {source === 'database_rpc' ? (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
              <span aria-hidden="true">⚡</span>
              <span>Live Database RPC ({rpcSignature || 'get_risk_heatmap'})</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1">
              <span aria-hidden="true">🔮</span>
              <span>Simulated Spatiotemporal Model</span>
            </span>
          )}
          <Link
            href="/about"
            className="text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-2 ml-1"
          >
            📖 Methodology & Uncertainty Limits
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="target-date-picker" className="text-neutral-400">
            Target Horizon Date:
          </label>
          <input
            id="target-date-picker"
            aria-label="Select target forecast horizon date manually"
            type="date"
            min={minDate}
            max={maxDate}
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 hover:border-neutral-600 focus:border-amber-400 rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer shadow-inner"
          />
        </div>
      </div>
    </section>
  );
}
