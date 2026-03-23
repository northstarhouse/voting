import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://uvzwhhwzelaelfhfkvdb.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_EbFMfEbyEp3gASl-GZm3tQ_LnPEe5do";

export const SUPABASE_STORAGE_BUCKET = "topic-attachments";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Missing Supabase config. Set VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  return supabase;
}
