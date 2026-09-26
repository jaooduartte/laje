import { createClient } from "@supabase/supabase-js";
import { environment } from "@/config/environment";
import type { Database } from "./types";

export const supabase = createClient<Database>(
  environment.supabase.url,
  environment.supabase.publishableKey,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
