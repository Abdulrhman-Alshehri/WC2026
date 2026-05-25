-- ============================================================
-- Migration: add_prediction_resolved_trigger
-- Date: 2026-05-25
--
-- Creates notify_predictions_resolved() and the on_match_resolved
-- trigger on the matches table.
--
-- Fires whenever matches.resolved flips false → true.
-- For every WON/LOST prediction on that match where the participant
-- has a paired Telegram account, it calls the telegram-webhook
-- edge function via pg_net to deliver a real-time payout notification.
--
-- PREREQUISITE: Store the Supabase service role key in Vault:
--   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
-- ============================================================

CREATE OR REPLACE FUNCTION notify_predictions_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pred           RECORD;
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

    -- Send one notification per settled prediction that has a paired Telegram user
    FOR pred IN
      SELECT
        pr.id              AS prediction_id,
        pr.prediction,
        pr.stake,
        pr.status,
        pr.payout,
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
                       'match_id',   NEW.id,
                       'home_team',  NEW.home_team,
                       'away_team',  NEW.away_team,
                       'home_score', NEW.home_score,
                       'away_score', NEW.away_score,
                       'prediction', pred.prediction,
                       'status',     pred.status,
                       'stake',      pred.stake,
                       'payout',     COALESCE(pred.payout, 0),
                       'profit',     GREATEST(COALESCE(pred.payout, 0) - pred.stake, 0),
                       'balance',    pred.balance
                     )
                   )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger cleanly
DROP TRIGGER IF EXISTS on_match_resolved ON matches;

CREATE TRIGGER on_match_resolved
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_predictions_resolved();
