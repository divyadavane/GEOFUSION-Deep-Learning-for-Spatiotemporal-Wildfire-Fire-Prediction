import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export interface BackendRegionOption {
  region_id: string;
  name: string;
  cell_count: number;
  extent_wkt?: string;
}

export async function GET() {
  try {
    const { data, error } = await supabase.rpc('get_available_regions');

    if (error) {
      console.warn('Could not call get_available_regions RPC:', error);
      // Fallback query directly on grid_cells table
      const { data: directData, error: directErr } = await supabase
        .from('grid_cells')
        .select('region')
        .limit(3500);

      if (directErr || !directData) {
        return NextResponse.json([
          {
            region_id: 'northern_california_pilot',
            name: 'Northern California Pilot',
            cell_count: 3200,
          },
        ]);
      }

      const counts: Record<string, number> = {};
      for (const row of directData) {
        const reg = row.region || 'northern_california_pilot';
        counts[reg] = (counts[reg] || 0) + 1;
      }

      const list: BackendRegionOption[] = Object.entries(counts).map(([id, count]) => ({
        region_id: id,
        name: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        cell_count: count,
      }));

      return NextResponse.json(list);
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch available regions' },
      { status: 500 }
    );
  }
}
