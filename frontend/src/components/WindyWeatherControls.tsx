'use client';

import React from 'react';

export type WeatherLayerMode = 'risk' | 'wind' | 'temp' | 'humidity';

interface WindyWeatherControlsProps {
  windParticlesEnabled: boolean;
  onToggleWindParticles: (enabled: boolean) => void;
  windSpeedMultiplier: number;
  onChangeSpeedMultiplier: (speed: number) => void;
  windColorScheme: 'wind' | 'fire' | 'thermal';
  onChangeColorScheme: (scheme: 'wind' | 'fire' | 'thermal') => void;
  cellOpacity: number;
  onChangeCellOpacity: (opacity: number) => void;
  activeWeatherLayer: WeatherLayerMode;
  onChangeWeatherLayer: (layer: WeatherLayerMode) => void;
}

export function WindyWeatherControls({
  windParticlesEnabled,
  onToggleWindParticles,
  windSpeedMultiplier,
  onChangeSpeedMultiplier,
  windColorScheme,
  onChangeColorScheme,
  cellOpacity,
  onChangeCellOpacity,
  activeWeatherLayer,
  onChangeWeatherLayer,
}: WindyWeatherControlsProps) {
  return (
    <div className="bg-neutral-900/95 backdrop-blur-2xl border border-neutral-700/80 rounded-2xl p-3.5 shadow-2xl space-y-3 text-neutral-100 font-sans">
      {/* Header with Windy.com branding */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-bold">
            Windy Flow Overlays
          </span>
        </div>
        <button
          onClick={() => onToggleWindParticles(!windParticlesEnabled)}
          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
            windParticlesEnabled
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
          }`}
        >
          <span>{windParticlesEnabled ? '🍃 Wind ON' : '🍃 Wind OFF'}</span>
        </button>
      </div>

      {/* Layer Mode Selector (Windy Style) */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-mono text-neutral-400 uppercase font-semibold">
          Weather Data Mode
        </span>
        <div className="grid grid-cols-2 gap-1.5 text-xs font-medium">
          <button
            onClick={() => onChangeWeatherLayer('risk')}
            className={`px-2.5 py-1.5 rounded-xl border text-left flex items-center gap-1.5 transition ${
              activeWeatherLayer === 'risk'
                ? 'bg-amber-500/25 border-amber-400 text-amber-300 font-bold'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:text-white'
            }`}
          >
            <span>🔥</span>
            <span>Fire Risk Grid</span>
          </button>
          <button
            onClick={() => onChangeWeatherLayer('wind')}
            className={`px-2.5 py-1.5 rounded-xl border text-left flex items-center gap-1.5 transition ${
              activeWeatherLayer === 'wind'
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 font-bold'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:text-white'
            }`}
          >
            <span>💨</span>
            <span>Wind Vectors</span>
          </button>
          <button
            onClick={() => onChangeWeatherLayer('temp')}
            className={`px-2.5 py-1.5 rounded-xl border text-left flex items-center gap-1.5 transition ${
              activeWeatherLayer === 'temp'
                ? 'bg-rose-500/25 border-rose-400 text-rose-300 font-bold'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:text-white'
            }`}
          >
            <span>🌡️</span>
            <span>Temperature</span>
          </button>
          <button
            onClick={() => onChangeWeatherLayer('humidity')}
            className={`px-2.5 py-1.5 rounded-xl border text-left flex items-center gap-1.5 transition ${
              activeWeatherLayer === 'humidity'
                ? 'bg-teal-500/25 border-teal-400 text-teal-300 font-bold'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:text-white'
            }`}
          >
            <span>💧</span>
            <span>Rel. Humidity</span>
          </button>
        </div>
      </div>

      {/* Windy Animated Velocity Legend */}
      {windParticlesEnabled && (
        <div className="space-y-1.5 pt-1 border-t border-neutral-800">
          <div className="flex justify-between items-center text-[10px] font-mono text-neutral-400">
            <span>Wind Speed Scale</span>
            <span className="text-cyan-400 font-bold">km/h</span>
          </div>
          <div className="h-2.5 w-full rounded-md bg-gradient-to-r from-blue-300 via-cyan-400 via-green-400 via-yellow-400 to-pink-500 shadow-inner" />
          <div className="flex justify-between text-[9px] font-mono text-neutral-300 px-0.5">
            <span>0</span>
            <span>15</span>
            <span>30</span>
            <span>45</span>
            <span>60+</span>
          </div>
        </div>
      )}

      {/* Particle Speed & Theme Controls */}
      {windParticlesEnabled && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-800 text-[11px] font-mono">
          <div>
            <label className="text-neutral-400 block mb-1">Flow Velocity:</label>
            <div className="flex gap-1">
              {[0.6, 1.0, 1.6].map((spd) => (
                <button
                  key={spd}
                  onClick={() => onChangeSpeedMultiplier(spd)}
                  className={`flex-1 py-1 rounded-lg border text-center transition font-bold ${
                    windSpeedMultiplier === spd
                      ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">Stream Color:</label>
            <div className="flex gap-1">
              {(['wind', 'fire'] as const).map((scheme) => (
                <button
                  key={scheme}
                  onClick={() => onChangeColorScheme(scheme)}
                  className={`flex-1 py-1 rounded-lg border text-center capitalize transition font-bold ${
                    windColorScheme === scheme
                      ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {scheme}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid Opacity Slider */}
      <div className="space-y-1 pt-1 border-t border-neutral-800">
        <div className="flex justify-between items-center text-[10px] font-mono text-neutral-400">
          <span>Heatmap Transparency</span>
          <span className="text-neutral-200 font-bold">{Math.round(cellOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          value={cellOpacity}
          onChange={(e) => onChangeCellOpacity(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
      </div>
    </div>
  );
}
