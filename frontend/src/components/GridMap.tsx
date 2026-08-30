'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Map, { NavigationControl, useControl, type MapRef } from 'react-map-gl/maplibre';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import Link from 'next/link';
import { RiskControlBar, computeForecastHorizon, type LastRealtimeEvent, type SavedRegionOption, type BackendRegionOption } from './RiskControlBar';
import { RiskLegend } from './RiskLegend';
import { SaveRegionModal } from './SaveRegionModal';
import type { RiskHeatmapResponse } from '@/app/api/risk-heatmap/route';
import { supabase } from '@/lib/supabase';
import { getRiskColor, getRelativeRiskTier } from '@/lib/riskTiers';

// Sub-component that registers deck.gl overlay cleanly inside react-map-gl
function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// Region Viewport Geometries
const REGION_VIEWPORTS: Record<
  string,
  {
    name: string;
    center: [number, number]; // [longitude, latitude]
    zoom: number;
    bbox: [number, number, number, number];
  }
> = {
  northern_california_pilot: {
    name: 'Northern California Pilot',
    center: [-122.0, 40.0],
    zoom: 6.8,
    bbox: [-124.0, 38.0, -120.0, 42.0],
  },
  sierra_nevada: {
    name: 'Sierra Nevada Foothills',
    center: [-119.6, 38.0],
    zoom: 7.4,
    bbox: [-121.2, 36.5, -118.0, 39.5],
  },
  socal_coastal: {
    name: 'Southern California Coastal',
    center: [-118.5, 33.8],
    zoom: 7.6,
    bbox: [-120.5, 32.5, -116.5, 35.0],
  },
  pacific_northwest: {
    name: 'Pacific Northwest Cascades',
    center: [-122.5, 45.5],
    zoom: 6.8,
    bbox: [-124.5, 43.5, -120.5, 47.5],
  },
  colorado_rockies: {
    name: 'Colorado Rocky Mountains',
    center: [-106.0, 39.5],
    zoom: 7.4,
    bbox: [-107.5, 38.0, -104.5, 41.0],
  },
  arizona_southwest: {
    name: 'Arizona & Southwest Forests',
    center: [-111.5, 35.0],
    zoom: 7.2,
    bbox: [-113.5, 33.5, -109.5, 36.5],
  },
  mediterranean_basin: {
    name: 'Mediterranean Wildfire Pilot',
    center: [22.25, 38.5],
    zoom: 7.0,
    bbox: [20.0, 36.5, 24.5, 40.5],
  },
};

// 100% Free, Public, Zero-API-Key Map Basemap Styles
export const BASEMAP_OPTIONS = {
  satellite: {
    id: 'satellite',
    label: '🛰️ Satellite',
    sublabel: 'ESRI Aerial Imagery',
    style: {
      version: 8 as const,
      sources: {
        'esri-satellite': {
          type: 'raster' as const,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri, Maxar, USDA, USGS',
        },
      },
      layers: [
        {
          id: 'esri-satellite-layer',
          type: 'raster' as const,
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  dark: {
    id: 'dark',
    label: '🌑 Dark Canvas',
    sublabel: 'Borders & City Labels',
    style: {
      version: 8 as const,
      sources: {
        'esri-dark-base': {
          type: 'raster' as const,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri, Garmin, OpenStreetMap',
        },
        'esri-dark-reference': {
          type: 'raster' as const,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'esri-dark-base-layer',
          type: 'raster' as const,
          source: 'esri-dark-base',
          minzoom: 0,
          maxzoom: 16,
        },
        {
          id: 'esri-dark-reference-layer',
          type: 'raster' as const,
          source: 'esri-dark-reference',
          minzoom: 0,
          maxzoom: 16,
        },
      ],
    },
  },
  topo: {
    id: 'topo',
    label: '⛰️ Topo Terrain',
    sublabel: 'Elevation Contours',
    style: {
      version: 8 as const,
      sources: {
        'esri-topo': {
          type: 'raster' as const,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri, USGS, Intermap, IGN',
        },
      },
      layers: [
        {
          id: 'esri-topo-layer',
          type: 'raster' as const,
          source: 'esri-topo',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  osm: {
    id: 'osm',
    label: '🗺️ Streets (OSM)',
    sublabel: 'OpenStreetMap',
    style: {
      version: 8 as const,
      sources: {
        'osm-standard': {
          type: 'raster' as const,
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: 'OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-standard-layer',
          type: 'raster' as const,
          source: 'osm-standard',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
};

export type BasemapKey = keyof typeof BASEMAP_OPTIONS;

export interface GridCellProps {
  id: number;
  risk_score?: number;
  confidence_low?: number;
  confidence_high?: number;
  is_recently_updated?: boolean;
}

interface HoverInfo {
  x: number;
  y: number;
  cellId: number;
  riskScore?: number;
  confLow?: number;
  confHigh?: number;
  coordinate?: [number, number];
}

export function GridMap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapRef = useRef<MapRef>(null);

  // Read Custom AOI parameters from URL redirect
  const customRegionId = searchParams.get('regionId');
  const customRegionName = searchParams.get('name');
  const customRegionBBoxRaw = searchParams.get('bbox');

  // Basemap style selector (Satellite default)
  const [activeBasemap, setActiveBasemap] = useState<BasemapKey>('satellite');

  // Save Region Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // User's saved regions loaded from database
  const [savedRegionsList, setSavedRegionsList] = useState<SavedRegionOption[]>([]);

  // 1–7 day horizon options
  const horizonDays = useMemo(() => computeForecastHorizon(), []);

  // Selection states
  const [selectedRegion, setSelectedRegion] = useState(
    customRegionId ? `saved_${customRegionId}` : 'northern_california_pilot'
  );
  const [selectedDate, setSelectedDate] = useState(horizonDays[0]?.dateStr || '');

  // Data states
  const [rawGeojson, setRawGeojson] = useState<FeatureCollection<Geometry, { id: number }> | null>(null);
  const [heatmapData, setHeatmapData] = useState<RiskHeatmapResponse | null>(null);
  const [gridLoading, setGridLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [gridError, setGridError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  // Realtime Live Stream states
  const [realtimeStatus, setRealtimeStatus] = useState<string>('CONNECTING');
  const [isLivePulsing, setIsLivePulsing] = useState(false);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<LastRealtimeEvent | null>(null);
  const [realtimeEventVersion, setRealtimeEventVersion] = useState(0);
  const [recentUpdatedCellIds, setRecentUpdatedCellIds] = useState<Set<number>>(new Set());

  // Hover tooltip state
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  // Dynamic backend available regions state (data-driven)
  const [availableRegions, setAvailableRegions] = useState<BackendRegionOption[]>([
    {
      region_id: 'northern_california_pilot',
      name: 'Northern California Pilot',
      cell_count: 3200,
    },
  ]);

  // Fetch available regions and user's saved regions on mount
  useEffect(() => {
    async function loadRegions() {
      try {
        // 1. Fetch data-driven backend regions from database
        const res = await fetch('/api/available-regions');
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            setAvailableRegions(list);
          }
        }
      } catch (err) {
        console.warn('Failed to load available backend regions:', err);
      }

      try {
        // 2. Fetch authenticated user's saved custom AOIs
        const { data } = await supabase
          .from('saved_regions')
          .select('id, name, bbox')
          .order('created_at', { ascending: false });

        if (data) {
          setSavedRegionsList(data);
        }
      } catch (err) {
        console.warn('Failed to load saved regions for dropdown:', err);
      }
    }
    loadRegions();
  }, []);

  // Compute active target viewport based on selected region
  const activeViewport = useMemo(() => {
    if (selectedRegion.startsWith('saved_')) {
      const savedId = selectedRegion.replace('saved_', '');
      const found = savedRegionsList.find((s) => s.id === savedId);
      if (found && found.bbox && found.bbox.length === 4) {
        const [w, s, e, n] = found.bbox;
        return {
          name: found.name,
          center: [(w + e) / 2, (s + n) / 2] as [number, number],
          zoom: 8.4,
          bbox: found.bbox as [number, number, number, number],
        };
      }
      if (customRegionBBoxRaw) {
        const parts = customRegionBBoxRaw.split(',').map(Number);
        if (parts.length === 4 && !parts.some(isNaN)) {
          return {
            name: customRegionName || 'Custom AOI',
            center: [(parts[0] + parts[2]) / 2, (parts[1] + parts[3]) / 2] as [number, number],
            zoom: 8.4,
            bbox: [parts[0], parts[1], parts[2], parts[3]] as [number, number, number, number],
          };
        }
      }
    }
    return REGION_VIEWPORTS[selectedRegion] || REGION_VIEWPORTS.northern_california_pilot;
  }, [selectedRegion, savedRegionsList, customRegionBBoxRaw, customRegionName]);

  // Handle Region Change: Fly camera directly to target location and fetch data
  const handleRegionChange = useCallback(
    (newRegionKey: string) => {
      setSelectedRegion(newRegionKey);

      let targetCenter = REGION_VIEWPORTS.northern_california_pilot.center;
      let targetZoom = REGION_VIEWPORTS.northern_california_pilot.zoom;

      if (REGION_VIEWPORTS[newRegionKey]) {
        targetCenter = REGION_VIEWPORTS[newRegionKey].center;
        targetZoom = REGION_VIEWPORTS[newRegionKey].zoom;
      } else if (newRegionKey.startsWith('saved_')) {
        const savedId = newRegionKey.replace('saved_', '');
        const found = savedRegionsList.find((s) => s.id === savedId);
        if (found && found.bbox && found.bbox.length === 4) {
          const [w, s, e, n] = found.bbox;
          targetCenter = [(w + e) / 2, (s + n) / 2];
          targetZoom = 8.4;
        }
      }

      mapRef.current?.flyTo({
        center: targetCenter,
        zoom: targetZoom,
        pitch: 15,
        bearing: 0,
        duration: 1600,
      });
    },
    [savedRegionsList]
  );

  // Re-center on default pilot region button
  const handleRecenter = useCallback(() => {
    handleRegionChange('northern_california_pilot');
  }, [handleRegionChange]);

  // Next day helper for empty-state button
  const handleSelectNextDay = useCallback(() => {
    const currentIndex = horizonDays.findIndex((h) => h.dateStr === selectedDate);
    if (currentIndex >= 0 && currentIndex < horizonDays.length - 1) {
      setSelectedDate(horizonDays[currentIndex + 1].dateStr);
    } else {
      setSelectedDate(horizonDays[0].dateStr);
    }
  }, [horizonDays, selectedDate]);

  // Compute current map bounding box for the save modal
  const getCurrentViewportBBox = useCallback((): [number, number, number, number] => {
    const bounds = mapRef.current?.getBounds();
    if (bounds) {
      return [
        parseFloat(bounds.getWest().toFixed(3)),
        parseFloat(bounds.getSouth().toFixed(3)),
        parseFloat(bounds.getEast().toFixed(3)),
        parseFloat(bounds.getNorth().toFixed(3)),
      ];
    }
    return activeViewport.bbox;
  }, [activeViewport.bbox]);

  // 1. Fetch grid cell geometries dynamically whenever selected region changes
  useEffect(() => {
    let cancelled = false;
    async function fetchGrid() {
      try {
        setGridLoading(true);
        let url = `/api/grid-cells?region=${encodeURIComponent(selectedRegion)}`;
        if (selectedRegion.startsWith('saved_') && activeViewport.bbox) {
          url = `/api/grid-cells?bbox=${activeViewport.bbox.join(',')}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data: FeatureCollection<Geometry, { id: number }> = await res.json();
        if (!cancelled) {
          setRawGeojson(data);
          setGridLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setGridError(err instanceof Error ? err.message : 'Failed to load grid geometries');
          setGridLoading(false);
        }
      }
    }
    fetchGrid();
    return () => {
      cancelled = true;
    };
  }, [selectedRegion, activeViewport.bbox]);

  // 2. Fetch risk heatmap whenever region or date changes
  useEffect(() => {
    let cancelled = false;
    async function fetchHeatmap() {
      if (!selectedDate) return;
      try {
        setRiskLoading(true);
        setRiskError(null);
        const url = `/api/risk-heatmap?region=${encodeURIComponent(selectedRegion)}&date=${encodeURIComponent(selectedDate)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data: RiskHeatmapResponse = await res.json();
        if (!cancelled) {
          setHeatmapData(data);
          setRiskLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setRiskError(err instanceof Error ? err.message : 'Failed to load risk heatmap');
          setRiskLoading(false);
        }
      }
    }
    fetchHeatmap();
    return () => {
      cancelled = true;
    };
  }, [selectedRegion, selectedDate]);

  // 3. Supabase Realtime Subscription on predictions table
  useEffect(() => {
    if (!selectedDate) return;

    const channelName = `realtime-predictions-${selectedRegion}-${selectedDate}`;
    setRealtimeStatus('CONNECTING');

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'predictions',
          filter: `prediction_date=eq.${selectedDate}`,
        },
        (payload) => {
          const newRow = payload.new as {
            grid_cell_id: number;
            risk_score: number;
            confidence_low?: number;
            confidence_high?: number;
            prediction_date: string;
          };

          if (newRow && newRow.grid_cell_id) {
            const cellId = Number(newRow.grid_cell_id);
            const score = Number(newRow.risk_score);
            const confLow = Number(newRow.confidence_low ?? Math.max(0, score - 0.05));
            const confHigh = Number(newRow.confidence_high ?? Math.min(1, score + 0.05));

            setHeatmapData((prev) => {
              if (!prev) return prev;
              const updatedPredictions = {
                ...prev.predictions,
                [cellId]: {
                  risk_score: score,
                  confidence_low: confLow,
                  confidence_high: confHigh,
                },
              };

              const riskValues = Object.values(updatedPredictions).map((p) => p.risk_score);
              const mean_risk = parseFloat((riskValues.reduce((a, b) => a + b, 0) / riskValues.length).toFixed(4));
              const max_risk = Math.max(...riskValues);
              const min_risk = Math.min(...riskValues);
              const high_risk_count = riskValues.filter((r) => r >= 0.6).length;
              const extreme_risk_count = riskValues.filter((r) => r >= 0.8).length;
              const elevated_risk_count = riskValues.filter((r) => r >= 0.4).length;

              return {
                ...prev,
                predictions: updatedPredictions,
                metrics: {
                  mean_risk,
                  max_risk,
                  min_risk,
                  elevated_risk_count,
                  high_risk_count,
                  extreme_risk_count,
                  is_nominal_baseline: elevated_risk_count === 0,
                },
              };
            });

            setRecentUpdatedCellIds((prev) => new Set(prev).add(cellId));
            setTimeout(() => {
              setRecentUpdatedCellIds((prev) => {
                const next = new Set(prev);
                next.delete(cellId);
                return next;
              });
            }, 4000);

            const evt: LastRealtimeEvent = {
              cellId,
              score,
              timestamp: new Date().toLocaleTimeString(),
              reason: 'Database WebSocket Broadcast',
            };
            setLastRealtimeEvent(evt);
            setIsLivePulsing(true);
            setRealtimeEventVersion((v) => v + 1);

            const timer = setTimeout(() => {
              setIsLivePulsing(false);
            }, 2500);

            return () => clearTimeout(timer);
          }
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRegion, selectedDate]);

  // 4. Realtime Continuous Live Simulation Streamer
  const triggerSingleLiveUpdate = useCallback((customReason?: string) => {
    if (!heatmapData || Object.keys(heatmapData.predictions).length === 0) return;

    const cellIds = Object.keys(heatmapData.predictions).map(Number);
    const targetCellId = cellIds[Math.floor(Math.random() * cellIds.length)] || 1;

    const currentScore = heatmapData.predictions[targetCellId]?.risk_score || 0.4;
    const delta = (Math.random() - 0.45) * 0.15;
    const newScore = parseFloat(Math.max(0.05, Math.min(0.96, currentScore + delta)).toFixed(3));
    const confLow = parseFloat(Math.max(0.01, newScore - 0.05).toFixed(3));
    const confHigh = parseFloat(Math.min(0.99, newScore + 0.05).toFixed(3));

    const reasons = [
      'Diablo Wind Gust Shift (42 km/h)',
      '10-hr Fuel Moisture dropped < 7%',
      'Sentinel-2 SWIR Thermal Anomaly',
      'Relative Humidity dropped 14%',
      'ERA5 Ridge Inversion Warming',
    ];
    const reason = customReason || reasons[Math.floor(Math.random() * reasons.length)];

    setHeatmapData((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev.predictions,
        [targetCellId]: {
          risk_score: newScore,
          confidence_low: confLow,
          confidence_high: confHigh,
        },
      };
      const riskValues = Object.values(updated).map((p) => p.risk_score);
      const mean_risk = parseFloat((riskValues.reduce((a, b) => a + b, 0) / riskValues.length).toFixed(4));
      const max_risk = Math.max(...riskValues);
      const min_risk = Math.min(...riskValues);
      const high_risk_count = riskValues.filter((r) => r >= 0.6).length;
      const extreme_risk_count = riskValues.filter((r) => r >= 0.8).length;
      const elevated_risk_count = riskValues.filter((r) => r >= 0.4).length;

      return {
        ...prev,
        predictions: updated,
        metrics: {
          mean_risk,
          max_risk,
          min_risk,
          elevated_risk_count,
          high_risk_count,
          extreme_risk_count,
          is_nominal_baseline: elevated_risk_count === 0,
        },
      };
    });

    setRecentUpdatedCellIds((prev) => new Set(prev).add(targetCellId));
    setTimeout(() => {
      setRecentUpdatedCellIds((prev) => {
        const next = new Set(prev);
        next.delete(targetCellId);
        return next;
      });
    }, 4000);

    const evt: LastRealtimeEvent = {
      cellId: targetCellId,
      score: newScore,
      timestamp: new Date().toLocaleTimeString(),
      reason,
    };
    setLastRealtimeEvent(evt);
    setIsLivePulsing(true);
    setRealtimeEventVersion((v) => v + 1);

    setTimeout(() => {
      setIsLivePulsing(false);
    }, 2000);
  }, [heatmapData]);

  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      triggerSingleLiveUpdate();
    }, 3200);

    return () => clearInterval(interval);
  }, [isLiveStreaming, triggerSingleLiveUpdate]);

  // 5. Merge geometries with predictions
  const enrichedGeojson = useMemo<FeatureCollection<Geometry, GridCellProps> | null>(() => {
    if (!rawGeojson) return null;
    const preds = heatmapData?.predictions || {};

    const features: Feature<Geometry, GridCellProps>[] = rawGeojson.features.map((feat) => {
      const id = feat.properties.id;
      const pred = preds[id];
      const isUpdated = recentUpdatedCellIds.has(id);
      return {
        ...feat,
        properties: {
          id,
          risk_score: pred ? pred.risk_score : undefined,
          confidence_low: pred ? pred.confidence_low : undefined,
          confidence_high: pred ? pred.confidence_high : undefined,
          is_recently_updated: isUpdated,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [rawGeojson, heatmapData, recentUpdatedCellIds, realtimeEventVersion]);

  // Custom AOI Bounding Box GeoJSON Polygon Layer
  const customAOIFeature = useMemo<FeatureCollection<Geometry> | null>(() => {
    if (!activeViewport.bbox) return null;
    const [w, s, e, n] = activeViewport.bbox;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: activeViewport.name },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        },
      ],
    };
  }, [activeViewport]);

  // 6. Build deck.gl layers
  const layers = useMemo(() => {
    const list: GeoJsonLayer[] = [];

    if (enrichedGeojson) {
      list.push(
        new GeoJsonLayer({
          id: `risk-heatmap-layer-${selectedRegion}-${selectedDate}-${activeBasemap}-${realtimeEventVersion}`,
          data: enrichedGeojson,
          filled: true,
          stroked: true,
          getFillColor: (f: Feature<Geometry, GridCellProps>) => getRiskColor(f.properties.risk_score),
          getLineColor: (f: Feature<Geometry, GridCellProps>) =>
            f.properties.is_recently_updated ? [255, 255, 255, 255] : [0, 0, 0, 90],
          getLineWidth: (f: Feature<Geometry, GridCellProps>) =>
            f.properties.is_recently_updated ? 3 : 1,
          lineWidthMinPixels: 0.5,
          lineWidthMaxPixels: 4,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 150],
          updateTriggers: {
            getFillColor: [selectedDate, selectedRegion, heatmapData?.date, heatmapData?.source, realtimeEventVersion],
            getLineColor: [recentUpdatedCellIds, realtimeEventVersion],
            getLineWidth: [recentUpdatedCellIds, realtimeEventVersion],
          },
          onClick: (info) => {
            if (info.object) {
              const props = (info.object as Feature<Geometry, GridCellProps>).properties;
              const scoreParam = props.risk_score !== undefined ? `&risk=${props.risk_score}` : '';
              const lowParam = props.confidence_low !== undefined ? `&conf_low=${props.confidence_low}` : '';
              const highParam = props.confidence_high !== undefined ? `&conf_high=${props.confidence_high}` : '';
              router.push(`/cell/${props.id}?date=${selectedDate}&region=${selectedRegion}${scoreParam}${lowParam}${highParam}`);
            }
          },
          onHover: (info) => {
            if (info.object) {
              const props = (info.object as Feature<Geometry, GridCellProps>).properties;
              setHoverInfo({
                x: info.x,
                y: info.y,
                cellId: props.id,
                riskScore: props.risk_score,
                confLow: props.confidence_low,
                confHigh: props.confidence_high,
                coordinate: info.coordinate as [number, number],
              });
            } else {
              setHoverInfo(null);
            }
          },
        })
      );
    }

    // Add glowing custom AOI perimeter overlay
    if (customAOIFeature && selectedRegion !== 'northern_california_pilot') {
      list.push(
        new GeoJsonLayer({
          id: 'custom-aoi-bounding-box-layer',
          data: customAOIFeature,
          filled: true,
          stroked: true,
          getFillColor: [245, 158, 11, 35],
          getLineColor: [251, 191, 36, 255],
          getLineWidth: 3,
          lineWidthMinPixels: 2.5,
          lineWidthMaxPixels: 6,
          pickable: false,
        })
      );
    }

    return list;
  }, [enrichedGeojson, customAOIFeature, selectedRegion, selectedDate, heatmapData, activeBasemap, recentUpdatedCellIds, realtimeEventVersion, router]);

  const totalCells = enrichedGeojson?.features.length || activeViewport.bbox ? 1600 : 3200;
  const isNominal = heatmapData?.metrics.is_nominal_baseline || false;

  return (
    <div className="grid-map-wrapper relative w-full h-full min-h-[600px] overflow-hidden bg-neutral-950">
      {/* Active Custom Monitored AOI Banner */}
      {selectedRegion !== 'northern_california_pilot' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto animate-in slide-in-from-top-3 fade-in duration-200">
          <div className="bg-gradient-to-r from-amber-950/95 via-neutral-900/95 to-amber-950/95 border border-amber-400 text-amber-200 px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>
                📍 Focused Region / Place: <strong className="text-white text-sm">{activeViewport.name}</strong>
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 hidden sm:inline">
              [{activeViewport.bbox.map((c) => c.toFixed(2)).join(', ')}]
            </span>
            <button
              onClick={handleRecenter}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[11px] font-bold transition border border-neutral-700"
            >
              ✕ Reset to Pilot
            </button>
          </div>
        </div>
      )}

      {/* Floating Control Overlays (Responsive Tablet & Desktop) */}
      <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 z-20 pointer-events-none flex flex-col xl:flex-row gap-3 sm:gap-4 items-start justify-between max-h-[calc(100vh-1.5rem)] overflow-y-auto pointer-events-none scrollbar-none">
        {/* Left Side: Region & Date Forecast Selector with Realtime Live Stream Controls */}
        <div className="w-full xl:max-w-2xl pointer-events-auto shadow-2xl flex-shrink-0">
          <RiskControlBar
            selectedRegion={selectedRegion}
            onRegionChange={handleRegionChange}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            horizonDays={horizonDays}
            loading={riskLoading || gridLoading}
            source={heatmapData?.source || null}
            rpcSignature={heatmapData?.rpc_signature || null}
            realtimeStatus={realtimeStatus}
            isLivePulsing={isLivePulsing}
            lastRealtimeEvent={lastRealtimeEvent}
            isLiveStreaming={isLiveStreaming}
            onToggleLiveStream={() => setIsLiveStreaming((s) => !s)}
            onTriggerLiveEvent={() => triggerSingleLiveUpdate('Manual Live Ingestion Trigger')}
            availableRegions={availableRegions}
            savedRegions={savedRegionsList}
          />
        </div>

        {/* Right Side: Basemap Switcher + Relative Risk Legend in a sleek sidebar */}
        <div className="w-full md:w-[360px] lg:w-[380px] xl:w-[400px] pointer-events-auto space-y-3 shadow-2xl flex-shrink-0">
          <div className="bg-neutral-900/95 backdrop-blur-2xl border border-neutral-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl space-y-2 text-neutral-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Basemap Layer
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsSaveModalOpen(true)}
                  className="min-h-[36px] text-xs font-mono font-bold text-amber-300 hover:text-amber-200 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 transition flex items-center gap-1 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  title="Save current bounding box to your saved regions"
                >
                  <span>📌 Save Region</span>
                </button>
                <button
                  onClick={handleRecenter}
                  className="min-h-[36px] text-xs font-mono font-semibold text-neutral-300 hover:text-white px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                  title="Re-center view on Northern California Pilot Region"
                >
                  <span>🎯 Center</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(BASEMAP_OPTIONS) as BasemapKey[]).map((key) => {
                const opt = BASEMAP_OPTIONS[key];
                const isActive = activeBasemap === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveBasemap(key)}
                    className={`min-h-[44px] p-2.5 rounded-xl transition text-left border flex flex-col justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      isActive
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-md shadow-amber-500/10'
                        : 'bg-neutral-800/80 hover:bg-neutral-800 border-neutral-700/80 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-bold font-sans flex items-center gap-1.5">
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono mt-0.5 truncate">
                      {opt.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <RiskLegend
            metrics={heatmapData?.metrics || null}
            totalCells={totalCells}
            loading={riskLoading}
            onSelectNextDay={handleSelectNextDay}
          />
        </div>
      </div>

      {/* Realtime Live Notification Toast */}
      {isLivePulsing && lastRealtimeEvent && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in slide-in-from-top-4 fade-in duration-200">
          <div className="bg-emerald-950/95 border border-emerald-400 text-emerald-200 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-3 text-xs font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span>
              ⚡ Realtime Write Broadcast: <strong>Cell #{lastRealtimeEvent.cellId}</strong> updated to <strong>{lastRealtimeEvent.score.toFixed(3)}</strong>
            </span>
            <span className="text-[10px] text-emerald-400/70">({lastRealtimeEvent.timestamp})</span>
          </div>
        </div>
      )}

      {/* MapLibre Canvas Container with Active Basemap Style */}
      <div className="absolute inset-0 w-full h-full">
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: activeViewport.center[0],
            latitude: activeViewport.center[1],
            zoom: activeViewport.zoom,
            pitch: 0,
            bearing: 0,
          }}
          mapStyle={BASEMAP_OPTIONS[activeBasemap].style}
          style={{ width: '100%', height: '100%' }}
          attributionControl={{ compact: true }}
        >
          <DeckGLOverlay layers={layers} interleaved={false} />
          <NavigationControl position="bottom-right" />
        </Map>
      </div>

      {/* Interactive Cell Hover Tooltip */}
      {hoverInfo && (
        <div
          className="absolute z-30 pointer-events-none bg-neutral-950/95 border border-neutral-700 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-neutral-100 text-xs font-mono min-w-[250px] transform -translate-x-1/2 -translate-y-full -mt-3 animate-in fade-in duration-100"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2.5">
            <span className="font-bold text-white text-sm flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: hoverInfo.riskScore !== undefined
                    ? `rgb(${getRiskColor(hoverInfo.riskScore)[0]}, ${getRiskColor(hoverInfo.riskScore)[1]}, ${getRiskColor(hoverInfo.riskScore)[2]})`
                    : '#00d2be',
                }}
              />
              Cell #{hoverInfo.cellId}
            </span>
            <span className="text-xs text-neutral-400 font-medium">10km Grid Cell</span>
          </div>

          {hoverInfo.riskScore !== undefined ? (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-neutral-400">Relative Risk Index</span>
                <span
                  className="text-base font-black"
                  style={{
                    color: `rgb(${getRiskColor(hoverInfo.riskScore)[0]}, ${getRiskColor(hoverInfo.riskScore)[1]}, ${getRiskColor(hoverInfo.riskScore)[2]})`,
                  }}
                >
                  {hoverInfo.riskScore.toFixed(3)}
                </span>
              </div>

              <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(2, hoverInfo.riskScore * 100))}%`,
                    backgroundColor: `rgb(${getRiskColor(hoverInfo.riskScore)[0]}, ${getRiskColor(hoverInfo.riskScore)[1]}, ${getRiskColor(hoverInfo.riskScore)[2]})`,
                  }}
                />
              </div>

              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Relative Tier:</span>
                  <span className={`px-2 py-0.5 rounded-md font-bold text-xs border ${getRelativeRiskTier(hoverInfo.riskScore).badgeBg}`}>
                    {getRelativeRiskTier(hoverInfo.riskScore).label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Percentile Rank:</span>
                  <span className="text-neutral-100 font-bold font-mono">
                    {getRelativeRiskTier(hoverInfo.riskScore).percentile}
                  </span>
                </div>
              </div>

              {hoverInfo.confLow !== undefined && hoverInfo.confHigh !== undefined && (
                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1.5 border-t border-neutral-900">
                  <span>Score Range:</span>
                  <span className="text-neutral-200 font-mono font-medium">
                    [{hoverInfo.confLow.toFixed(3)} – {hoverInfo.confHigh.toFixed(3)}]
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">No prediction score loaded</p>
          )}

          <div className="mt-3 pt-2 border-t border-neutral-800 text-xs flex items-center justify-between">
            <span className="text-indigo-400 font-medium">Click cell to inspect →</span>
            <Link
              href="/about"
              className="text-[10px] text-amber-300 hover:text-amber-200 underline font-mono"
            >
              📖 Methodology
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Status / Drilldown Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <div className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-700/70 rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-5 text-sm font-mono">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-[9px] font-black text-white">
              GF
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white leading-tight">
                {activeViewport.name} • {selectedDate}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {isNominal ? (
                  <span className="text-emerald-400 font-bold">✓ Nominal Baseline • 0 Elevated Cells</span>
                ) : (
                  <span>
                    {totalCells.toLocaleString()} Cells • {isLiveStreaming ? '⚡ Continuous Live Stream Active' : 'Realtime Ready'} on {BASEMAP_OPTIONS[activeBasemap].label}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="w-px h-7 bg-neutral-700" />

          <div className="flex gap-2.5">
            <button
              onClick={() => setIsSaveModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs sm:text-sm font-bold border border-amber-500/40 transition flex items-center gap-1.5 shadow-md shadow-amber-500/10"
            >
              <span>📌 Save Region</span>
            </button>
            <button
              onClick={handleRecenter}
              className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs sm:text-sm font-semibold border border-neutral-700 transition flex items-center gap-1"
            >
              <span>{selectedRegion !== 'northern_california_pilot' ? '✕ Reset to Pilot' : '🎯 Center Map'}</span>
            </button>
            <Link
              href={hoverInfo ? `/cell/${hoverInfo.cellId}` : '/cell/103'}
              className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs sm:text-sm font-semibold border border-neutral-700 transition flex items-center gap-1.5"
            >
              <span>{hoverInfo ? `Inspect Cell #${hoverInfo.cellId}` : 'Inspect Cell #103'}</span>
              <span>→</span>
            </Link>
            <Link
              href="/regions"
              className="px-3.5 py-2 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/35 text-indigo-200 text-xs sm:text-sm font-semibold border border-indigo-500/35 transition"
            >
              Saved Regions →
            </Link>
          </div>
        </div>
      </div>

      {/* Save Region / AOI Modal */}
      <SaveRegionModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentViewportBBox={getCurrentViewportBBox()}
      />
    </div>
  );
}
