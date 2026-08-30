import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export interface CellRiskData {
  risk_score: number;
  confidence_low: number;
  confidence_high: number;
}

export interface RiskHeatmapResponse {
  region: string;
  date: string;
  horizon_day: number;
  total_cells: number;
  source: 'database_rpc' | 'simulated_forecast';
  rpc_signature: string;
  metrics: {
    mean_risk: number;
    max_risk: number;
    min_risk: number;
    elevated_risk_count: number; // risk >= 0.40
    high_risk_count: number;     // risk >= 0.60
    extreme_risk_count: number;  // risk >= 0.80
    is_nominal_baseline: boolean; // true if elevated_risk_count === 0
  };
  predictions: Record<number, CellRiskData>;
}

const REGION_TOTALS: Record<string, number> = {
  northern_california_pilot: 3200,
  sierra_nevada: 1600,
  socal_coastal: 1200,
  pacific_northwest: 1600,
  colorado_rockies: 1600,
  arizona_southwest: 1200,
  mediterranean_basin: 1600,
};

// Generate valid 1–7 day forecast horizon dates relative to current anchor
function getValidForecastHorizon() {
  const base = new Date();
  const validDates: { dateStr: string; horizonDay: number }[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    validDates.push({
      dateStr: d.toISOString().split('T')[0],
      horizonDay: i,
    });
  }
  return validDates;
}

// Deterministic physical risk simulation
function generateSimulatedRisk(cellId: number, horizonDay: number, forceNominal = false): CellRiskData {
  if (forceNominal) {
    const baseNoise = ((Math.sin(cellId * 17.13 + horizonDay * 3.41) * 43758.5453) % 1) * 0.06;
    const score = Math.max(0.02, Math.min(0.18, 0.08 + baseNoise));
    return {
      risk_score: parseFloat(score.toFixed(4)),
      confidence_low: parseFloat(Math.max(0.01, score - 0.02).toFixed(4)),
      confidence_high: parseFloat(Math.min(0.25, score + 0.03).toFixed(4)),
    };
  }

  const idx = cellId - 1;
  const col = idx % 40;
  const row = Math.floor(idx / 40) % 80;

  const normX = col / 40;
  const normY = (row % 40) / 40;

  const valleyHeatHotspot = Math.exp(-Math.pow((normX - 0.65) * 3, 2) - Math.pow((normY - 0.45) * 3, 2));
  const foothillHotspot = Math.exp(-Math.pow((normX - 0.75) * 4, 2) - Math.pow((normY - 0.65) * 4, 2));
  const coastalCooling = Math.max(0, 0.4 - normX * 0.8);

  const weatherFront = Math.sin((normX * 3 + horizonDay * 0.7) + (normY * 2)) * 0.15;
  const horizonEscalation = (horizonDay - 1) * 0.04;

  let baseRisk = 0.15 + (valleyHeatHotspot * 0.65) + (foothillHotspot * 0.55) - coastalCooling + weatherFront + horizonEscalation;
  
  const hashNoise = ((Math.sin(cellId * 12.9898 + horizonDay * 78.233) * 43758.5453) % 1) * 0.08;
  baseRisk += hashNoise;

  const risk_score = Math.max(0.02, Math.min(0.98, parseFloat(baseRisk.toFixed(4))));
  const confidence_low = Math.max(0.01, parseFloat((risk_score - (0.05 + horizonDay * 0.015)).toFixed(4)));
  const confidence_high = Math.min(0.99, parseFloat((risk_score + (0.06 + horizonDay * 0.02)).toFixed(4)));

  return {
    risk_score,
    confidence_low,
    confidence_high,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') || 'northern_california_pilot';
  const scenario = searchParams.get('scenario');
  
  const validHorizon = getValidForecastHorizon();
  const defaultDate = validHorizon[0].dateStr;
  const date = searchParams.get('date') || defaultDate;

  // Enforce 1–7 day forecast horizon constraint
  const horizonMatch = validHorizon.find((h) => h.dateStr === date);
  if (!horizonMatch) {
    return NextResponse.json(
      {
        error: `Date '${date}' is outside the valid 1–7 day forecast horizon.`,
        allowed_horizon: validHorizon.map((h) => ({
          day: `+${h.horizonDay}d`,
          date: h.dateStr,
        })),
      },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const rpcSignature = `get_risk_heatmap(p_region: "${region}", p_date: "${date}")`;

  let source: 'database_rpc' | 'simulated_forecast' = 'simulated_forecast';
  const predictions: Record<number, CellRiskData> = {};

  if (supabaseUrl && supabaseAnonKey && scenario !== 'nominal' && region === 'northern_california_pilot') {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      // 1. Try RPC get_risk_heatmap
      const { data, error } = await supabase.rpc('get_risk_heatmap', {
        p_region: region,
        p_date: date,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        source = 'database_rpc';
        for (const row of data as { grid_cell_id: number; risk_score: number; confidence_low?: number; confidence_high?: number }[]) {
          predictions[row.grid_cell_id] = {
            risk_score: Number(row.risk_score),
            confidence_low: Number(row.confidence_low ?? Math.max(0, row.risk_score - 0.05)),
            confidence_high: Number(row.confidence_high ?? Math.min(1, row.risk_score + 0.05)),
          };
        }
      } else {
        // 2. Query predictions table directly
        const { data: predRows } = await supabase
          .from('predictions')
          .select('grid_cell_id, risk_score, confidence_low, confidence_high')
          .eq('prediction_date', date)
          .limit(3500);

        if (Array.isArray(predRows) && predRows.length > 0) {
          source = 'database_rpc';
          for (const row of predRows) {
            predictions[row.grid_cell_id] = {
              risk_score: Number(row.risk_score),
              confidence_low: Number(row.confidence_low ?? Math.max(0, Number(row.risk_score) - 0.05)),
              confidence_high: Number(row.confidence_high ?? Math.min(1, Number(row.risk_score) + 0.05)),
            };
          }
        }
      }
    } catch (err) {
      console.warn('Database query fallback to simulated forecast:', err);
    }
  }

  // Ensure full grid coverage for selected region
  const cellCount = REGION_TOTALS[region] || 3200;
  const forceNominal = scenario === 'nominal';

  if (Object.keys(predictions).length === 0) {
    source = 'simulated_forecast';
    for (let id = 1; id <= cellCount; id++) {
      predictions[id] = generateSimulatedRisk(id, horizonMatch.horizonDay, forceNominal);
    }
  } else if (Object.keys(predictions).length < cellCount) {
    // Fill remaining cells with baseline values to maintain complete spatial grid
    for (let id = 1; id <= cellCount; id++) {
      if (!predictions[id]) {
        predictions[id] = generateSimulatedRisk(id, horizonMatch.horizonDay, forceNominal);
      }
    }
  }

  const riskValues = Object.values(predictions).map((p) => p.risk_score);
  const total = riskValues.length;
  const mean_risk = parseFloat((riskValues.reduce((a, b) => a + b, 0) / total).toFixed(4));
  const max_risk = Math.max(...riskValues);
  const min_risk = Math.min(...riskValues);
  const elevated_risk_count = riskValues.filter((r) => r >= 0.4).length;
  const high_risk_count = riskValues.filter((r) => r >= 0.6).length;
  const extreme_risk_count = riskValues.filter((r) => r >= 0.8).length;
  const is_nominal_baseline = elevated_risk_count === 0;

  const response: RiskHeatmapResponse = {
    region,
    date,
    horizon_day: horizonMatch.horizonDay,
    total_cells: total,
    source,
    rpc_signature: rpcSignature,
    metrics: {
      mean_risk,
      max_risk,
      min_risk,
      elevated_risk_count,
      high_risk_count,
      extreme_risk_count,
      is_nominal_baseline,
    },
    predictions,
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
