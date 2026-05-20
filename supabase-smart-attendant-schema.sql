-- ============================================================
-- FlowDesk Pro — Smart Auto-Attendant
-- Supabase Schema
-- Run this in the Supabase SQL Editor for your project
-- ============================================================

-- ── Table: smart_attendant_logs ────────────────────────────
CREATE TABLE IF NOT EXISTS smart_attendant_logs (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid       text        UNIQUE NOT NULL,
  caller_number  text,
  option_selected text,
  routed_to      text,
  call_duration  integer,
  status         text,
  created_at     timestamptz DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sal_created_at
  ON smart_attendant_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sal_call_sid
  ON smart_attendant_logs (call_sid);

CREATE INDEX IF NOT EXISTS idx_sal_status
  ON smart_attendant_logs (status);

-- ── Row Level Security ─────────────────────────────────────
ALTER TABLE smart_attendant_logs ENABLE ROW LEVEL SECURITY;

-- Allow the service role (server-side functions) full access
-- This is handled automatically by the service key — no policy needed.

-- Allow anonymous/public read for the demo dashboard
-- (Uses SUPABASE_PUBLISHABLE_KEY on the frontend)
CREATE POLICY "public_read_smart_attendant_logs"
  ON smart_attendant_logs
  FOR SELECT
  USING (true);

-- ── Realtime ───────────────────────────────────────────────
-- Enable Realtime for this table so the demo page gets
-- live INSERT/UPDATE events via supabase-js .channel()
ALTER PUBLICATION supabase_realtime ADD TABLE smart_attendant_logs;

-- ── Verify ────────────────────────────────────────────────
-- Run these to confirm everything is set up correctly:
-- SELECT * FROM smart_attendant_logs ORDER BY created_at DESC LIMIT 10;
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'smart_attendant_logs';
