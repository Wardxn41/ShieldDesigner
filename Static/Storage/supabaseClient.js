// Static/Storage/supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.__APP_CONFIG__ || {};

if (!cfg.SUPABASE_URL || !/^https?:\/\//.test(cfg.SUPABASE_URL)) {
  throw new Error(
    `Supabase config missing/invalid. Got SUPABASE_URL="${cfg.SUPABASE_URL}". ` +
    `Make sure /config.js loads and SUPABASE_URL starts with https://`
  );
}
if (!cfg.SUPABASE_ANON_KEY) {
  throw new Error("Supabase config missing SUPABASE_ANON_KEY. Check /config.js and your .env.");
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
export const BUCKET = cfg.SUPABASE_BUCKET || "ShieldBucket";
