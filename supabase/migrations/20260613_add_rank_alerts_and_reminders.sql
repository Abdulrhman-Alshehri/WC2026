-- ============================================================
-- Migration: add_rank_alerts_and_reminders
-- Date: 2026-06-13
--
-- Adds three new Telegram notification capabilities:
--   1. ⏰ Deadline reminders   (driven by the deadline-reminders edge fn + cron)
--   2. 📉/📈 Rank-change alerts (>= 2 ranks, diffed from leaderboard_snapshots)
--   3. 🏆 Leaderboard broadcast (full standings after each match resolves)
--
-- Changes:
--   A. notifications_log.participant_id column  → per-user dedup + ops filtering
--   B. leaderboard_snapshots.match_id nullable  → allows a non-match baseline
--   C. Seed one baseline snapshot               → so the first resolution can diff
--   D. Extend notify_predictions_resolved()     → emit rank_change + leaderboard
--   E. (manual) pg_cron job for deadline reminders — see bottom of file
-- ============================================================

-- ─── A. Dedup / ops column on notifications_log ───────────────
ALTER TABLE public.notifications_log
  ADD COLUMN IF NOT EXISTS participant_id uuid REFERENCES public.participants(id);

CREATE INDEX IF NOT EXISTS notifications_log_dedup_idx
  ON public.notifications_log (type, match_id, participant_id);


-- ─── B. Allow a baseline snapshot not tied to a match ─────────
ALTER TABLE public.leaderboard_snapshots
  ALTER COLUMN match_id DROP NOT NULL;


-- ─── C. Seed a baseline snapshot (only if none exist yet) ─────
-- Rank-delta alerts compare the two most recent snapshots. Without a baseline,
-- the very first match resolution would have nothing to diff against.
INSERT INTO public.leaderboard_snapshots (match_id, snapshot)
SELECT
  NULL,
  (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'participant_id', lv.participant_id,
          'name',           lv.name,
          'display_name',   lv.display_name,
          'blinded_balance', lv.blinded_balance,
          'rank',           lv.rank
        ) ORDER BY lv.rank
      ),
      '[]'::jsonb
    )
    FROM public.leaderboard_view lv
  )
WHERE NOT EXISTS (SELECT 1 FROM public.leaderboard_snapshots);


-- ─── D. Extend the resolution trigger function ────────────────
CREATE OR REPLACE FUNCTION notify_predictions_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pred           RECORD;
  rc             RECORD;
  lb             RECORD;
  results_json   jsonb;
  service_key    TEXT;
  supabase_url   TEXT := 'https://acozqpdwoxtwpswmffqz.supabase.co';
BEGIN
  -- Only act when resolved flips from false → true and result is set
  IF OLD.resolved IS DISTINCT FROM NEW.resolved
     AND NEW.resolved = true
     AND NEW.result IS NOT NULL
  THEN
    -- Retrieve service role key stored in Supabase Vault
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF service_key IS NULL THEN
      RAISE WARNING 'notify_predictions_resolved: service_role_key not found in vault.decrypted_secrets — skipping notifications for match %', NEW.id;
      RETURN NEW;
    END IF;

    -- ── 1. Per-prediction payout notifications ────────────────
    FOR pred IN
      SELECT
        pr.id              AS prediction_id,
        pr.prediction,
        pr.stake,
        pr.status,
        pr.payout,
        p.id               AS participant_id,
        p.telegram_chat_id,
        w.balance
      FROM   predictions  pr
      JOIN   participants p  ON p.id  = pr.participant_id
      JOIN   wallets      w  ON w.participant_id = pr.participant_id
      WHERE  pr.match_id  = NEW.id
        AND  pr.status    IN ('WON', 'LOST')
        AND  p.telegram_chat_id IS NOT NULL
    LOOP
      PERFORM net.http_post(
        url     := supabase_url || '/functions/v1/telegram-webhook',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || service_key
                   ),
        body    := jsonb_build_object(
                     'event',   'prediction_resolved',
                     'chat_id', pred.telegram_chat_id,
                     'data',    jsonb_build_object(
                       'match_id',        NEW.id,
                       'participant_id',  pred.participant_id,
                       'home_team',       NEW.home_team,
                       'away_team',       NEW.away_team,
                       'home_team_code',  NEW.home_team_code,
                       'away_team_code',  NEW.away_team_code,
                       'home_score',      NEW.home_score,
                       'away_score',      NEW.away_score,
                       'prediction',      pred.prediction,
                       'status',          pred.status,
                       'stake',           pred.stake,
                       'payout',          COALESCE(pred.payout, 0),
                       'profit',          GREATEST(COALESCE(pred.payout, 0) - pred.stake, 0),
                       'balance',         pred.balance
                     )
                   )
      );
    END LOOP;

    -- ── 2. Rank-change alerts (>= 2 ranks moved) ──────────────
    -- The current snapshot for THIS match was written by
    -- resolve_match_predictions() immediately before resolved flipped, so the
    -- two most recent snapshots are (this match) vs (previous resolution/baseline).
    FOR rc IN
      WITH snaps AS (
        SELECT snapshot, created_at,
               ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
        FROM public.leaderboard_snapshots
      ),
      cur AS (
        SELECT (e->>'participant_id')::uuid AS pid, (e->>'rank')::int AS rank
        FROM snaps, jsonb_array_elements(snaps.snapshot) e
        WHERE snaps.rn = 1
      ),
      prev AS (
        SELECT (e->>'participant_id')::uuid AS pid, (e->>'rank')::int AS rank
        FROM snaps, jsonb_array_elements(snaps.snapshot) e
        WHERE snaps.rn = 2
      )
      SELECT cur.pid          AS participant_id,
             prev.rank        AS old_rank,
             cur.rank         AS new_rank,
             p.telegram_chat_id,
             w.balance
      FROM cur
      JOIN prev          ON prev.pid = cur.pid
      JOIN participants p ON p.id = cur.pid
      JOIN wallets      w ON w.participant_id = cur.pid
      WHERE p.telegram_chat_id IS NOT NULL
        AND abs(cur.rank - prev.rank) >= 2
    LOOP
      -- The participant's settled result(s) on this match (may be empty if they
      -- moved purely because of other participants' results).
      results_json := COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'home_team', NEW.home_team,
                 'away_team', NEW.away_team,
                 'status',    pr.status,
                 'stake',     pr.stake,
                 'payout',    COALESCE(pr.payout, 0)
               ))
        FROM predictions pr
        WHERE pr.match_id = NEW.id
          AND pr.participant_id = rc.participant_id
          AND pr.status IN ('WON', 'LOST')
      ), '[]'::jsonb);

      PERFORM net.http_post(
        url     := supabase_url || '/functions/v1/telegram-webhook',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || service_key
                   ),
        body    := jsonb_build_object(
                     'event',   'rank_change',
                     'chat_id', rc.telegram_chat_id,
                     'data',    jsonb_build_object(
                       'participant_id', rc.participant_id,
                       'match_id',       NEW.id,
                       'direction',      CASE WHEN rc.new_rank < rc.old_rank THEN 'UP' ELSE 'DOWN' END,
                       'old_rank',       rc.old_rank,
                       'new_rank',       rc.new_rank,
                       'balance',        rc.balance,
                       'results',        results_json
                     )
                   )
      );
    END LOOP;

    -- ── 3. Full leaderboard broadcast to every paired participant ──
    FOR lb IN
      SELECT p.id AS participant_id, p.telegram_chat_id
      FROM participants p
      WHERE p.is_active = true
        AND p.telegram_chat_id IS NOT NULL
    LOOP
      PERFORM net.http_post(
        url     := supabase_url || '/functions/v1/telegram-webhook',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || service_key
                   ),
        body    := jsonb_build_object(
                     'event',   'leaderboard_broadcast',
                     'chat_id', lb.telegram_chat_id,
                     'data',    jsonb_build_object(
                       'participant_id', lb.participant_id,
                       'match_id',   NEW.id,
                       'home_team',  NEW.home_team,
                       'away_team',  NEW.away_team,
                       'home_score', NEW.home_score,
                       'away_score', NEW.away_score
                     )
                   )
      );
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged; recreate idempotently for safety.
DROP TRIGGER IF EXISTS on_match_resolved ON matches;
CREATE TRIGGER on_match_resolved
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_predictions_resolved();


-- ─── E. (MANUAL) Schedule the deadline-reminders edge function ─
-- Run this in the SQL editor AFTER deploying the deadline-reminders function,
-- so the cron target exists. Mirrors the existing sync-scores / retry jobs.
-- Replace <ANON_KEY> with the project anon key (same one used by jobid 1 & 3).
--
--   SELECT cron.schedule(
--     'deadline-reminders',
--     '*/5 * * * *',
--     $cron$
--       SELECT net.http_post(
--         url     := 'https://acozqpdwoxtwpswmffqz.supabase.co/functions/v1/deadline-reminders',
--         headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
--         body    := '{}'::jsonb
--       );
--     $cron$
--   );
