import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Worker environment is not configured." },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (authorization !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let processedBatches = 0;

  for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
    const { data, error } = await supabase.rpc(
      "process_championship_bracket_preview_queue",
      { _max_batches: 1 },
    );

    if (error) {
      console.error("preview-worker-failed", {
        code: error.code,
        message: error.message,
        processed_batches: processedBatches,
      });
      return Response.json({ error: error.message }, { status: 500 });
    }

    const currentProcessedBatches = Number(
      (data as { processed_batches?: number } | null)?.processed_batches ?? 0,
    );
    processedBatches += currentProcessedBatches;

    if (currentProcessedBatches == 0) {
      break;
    }
  }

  return Response.json({ processed_batches: processedBatches });
});
