// ================================================================
// QUIROPODSCZ v3 — Cliente Supabase
// ================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://pfurkowcfpbtqqvzuzqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdXJrb3djZnBidHFxdnp1enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDg5NzEsImV4cCI6MjA5NDAyNDk3MX0.ng2QzSKsFQsd6UJT4DSunXcQey7IXs9F5LMn5ur1gj8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const WORKER_URL = 'https://quiropod-ai.johanquirozb.workers.dev';
