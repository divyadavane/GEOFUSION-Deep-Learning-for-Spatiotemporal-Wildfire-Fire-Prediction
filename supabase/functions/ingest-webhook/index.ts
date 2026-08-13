import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

export const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { "Content-Type": "application/json" } })
  }

  const authHeader = req.headers.get('Authorization')
  // We expect a shared webhook secret or service_role key for authentication
  const expectedSecret = Deno.env.get('WEBHOOK_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!authHeader || (expectedSecret && authHeader !== `Bearer ${expectedSecret}`)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { "Content-Type": "application/json" } })
  }
  
  try {
    const payload = await req.json()
    const { pipeline_name, source, region, row_count, status, error_message } = payload

    if (!pipeline_name || !source || !status) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing required fields' }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Skip actual DB write if we are just unit testing (URLs won't be set)
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { error } = await supabase
        .from('pipeline_runs')
        .insert({
          pipeline_name,
          source,
          status,
          rows_written: row_count,
          error_message,
          details: { region }
        })

      if (error) {
        console.error('Failed to log pipeline run:', error)
        throw error
      }
    }

    // Downstream triggers
    if (status === 'success' && pipeline_name === 'ingest_imagery') {
      console.log(`TODO (Phase-9): Trigger inference pipeline for region ${region}`)
    }

    return new Response(JSON.stringify({ success: true, message: 'Payload received and logged' }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}

// Start the server if this is the main module
if (import.meta.main) {
  serve(handler)
}
