import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const BATCH_SIZE = 1000;

export const REGION_CONFIGS: Record<
  string,
  {
    name: string;
    bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
    cols: number;
    rows: number;
    center: [number, number];
    zoom: number;
  }
> = {
  northern_california_pilot: {
    name: 'Northern California Pilot',
    bbox: [-124.0, 38.0, -120.0, 42.0],
    cols: 40,
    rows: 80,
    center: [-122.0, 40.0],
    zoom: 6.8,
  },
  sierra_nevada: {
    name: 'Sierra Nevada Foothills',
    bbox: [-121.2, 36.5, -118.0, 39.5],
    cols: 40,
    rows: 40,
    center: [-119.6, 38.0],
    zoom: 7.4,
  },
  socal_coastal: {
    name: 'Southern California Coastal',
    bbox: [-120.5, 32.5, -116.5, 35.0],
    cols: 40,
    rows: 30,
    center: [-118.5, 33.8],
    zoom: 7.6,
  },
};

/**
 * Helper to generate GeoJSON grid cells for any bounding box
 */
function generateGridGeojson(
  bbox: [number, number, number, number],
  cols = 40,
  rows = 40
) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLon = (maxLon - minLon) / cols;
  const dLat = (maxLat - minLat) / rows;

  const features = [];
  let cellId = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cMinLon = minLon + c * dLon;
      const cMaxLon = cMinLon + dLon;
      const cMinLat = minLat + r * dLat;
      const cMaxLat = cMinLat + dLat;

      features.push({
        type: 'Feature' as const,
        properties: { id: cellId++ },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [parseFloat(cMinLon.toFixed(4)), parseFloat(cMinLat.toFixed(4))],
              [parseFloat(cMaxLon.toFixed(4)), parseFloat(cMinLat.toFixed(4))],
              [parseFloat(cMaxLon.toFixed(4)), parseFloat(cMaxLat.toFixed(4))],
              [parseFloat(cMinLon.toFixed(4)), parseFloat(cMaxLat.toFixed(4))],
              [parseFloat(cMinLon.toFixed(4)), parseFloat(cMinLat.toFixed(4))],
            ],
          ],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

/**
 * GET /api/grid-cells?region=...&bbox=...
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const region = searchParams.get('region') || 'northern_california_pilot';
  const customBBoxParam = searchParams.get('bbox');

  // 1. If custom bbox provided directly:
  if (customBBoxParam) {
    const parts = customBBoxParam.split(',').map(Number);
    if (parts.length === 4 && !parts.some(isNaN)) {
      const grid = generateGridGeojson([parts[0], parts[1], parts[2], parts[3]], 30, 30);
      return NextResponse.json(grid, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }
  }

  // 2. If predefined region other than default pilot:
  if (region !== 'northern_california_pilot' && REGION_CONFIGS[region]) {
    const cfg = REGION_CONFIGS[region];
    const grid = generateGridGeojson(cfg.bbox, cfg.cols, cfg.rows);
    return NextResponse.json(grid, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  }

  // 3. For northern_california_pilot: Query live Supabase RPC get_grid_geojson with fallback
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const allRows: { id: number; geojson: string }[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .rpc('get_grid_geojson', { p_region: 'northern_california_pilot' })
          .range(offset, offset + BATCH_SIZE - 1);

        if (error) {
          console.warn('get_grid_geojson RPC error, using fallback:', error.message);
          break;
        }

        const batch = data as { id: number; geojson: string }[];
        allRows.push(...batch);

        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      }

      if (allRows.length > 0) {
        const features = allRows.map((row) => ({
          type: 'Feature' as const,
          properties: { id: row.id },
          geometry: JSON.parse(row.geojson),
        }));

        return NextResponse.json(
          { type: 'FeatureCollection' as const, features },
          { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
        );
      }
    } catch (err) {
      console.warn('Supabase grid query error:', err);
    }
  }

  // High-performance deterministic fallback for pilot region
  const defaultPilot = generateGridGeojson([-124.0, 38.0, -120.0, 42.0], 40, 80);
  return NextResponse.json(defaultPilot, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
