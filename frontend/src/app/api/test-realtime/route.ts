import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const cellId = body.grid_cell_id || 103;
    const date = body.prediction_date || new Date().toISOString().split('T')[0];
    const riskScore = body.risk_score !== undefined ? Number(body.risk_score) : 0.875;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Upsert prediction row to trigger Postgres changes Realtime event
    const { data, error } = await supabase.from('predictions').upsert(
      {
        grid_cell_id: cellId,
        prediction_date: date,
        risk_score: riskScore,
        confidence_low: Math.max(0, riskScore - 0.05),
        confidence_high: Math.min(1, riskScore + 0.05),
      },
      { onConflict: 'grid_cell_id,model_id,prediction_date' }
    ).select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Realtime prediction write executed for Cell #${cellId} on ${date}`,
      data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
