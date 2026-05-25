-- ============================================================
-- Migration: add_resolve_match_predictions
-- Date: 2026-05-26
--
-- Creates resolve_match_predictions(p_match_id uuid) — called
-- automatically by sync-scores when a match transitions to FT.
--
-- Payout model: POOL SPLIT
--   All stakes on the match form one pot.
--   Winners share the entire pot proportional to their stake.
--   Losers fund the winners.
--   Edge case: nobody correct → everyone refunded their stake.
--
-- After settling predictions, sets matches.resolved = true which
-- fires the on_match_resolved trigger → Telegram payout notifications.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_match_predictions(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match          public.matches;
  v_total_pot      numeric;
  v_winning_stakes numeric;
  v_pred           RECORD;
  v_payout         numeric;
  v_new_balance    numeric;
  v_resolved_count integer := 0;
BEGIN
  -- 1. Fetch match and validate
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match has no result yet');
  END IF;

  -- Idempotent: already resolved, skip safely
  IF v_match.resolved THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already resolved', 'resolved_count', 0);
  END IF;

  -- 2. Calculate pot totals
  SELECT COALESCE(SUM(stake), 0) INTO v_total_pot
  FROM public.predictions
  WHERE match_id = p_match_id AND status = 'PENDING';

  SELECT COALESCE(SUM(stake), 0) INTO v_winning_stakes
  FROM public.predictions
  WHERE match_id = p_match_id AND status = 'PENDING' AND prediction = v_match.result;

  -- 3. Settle every PENDING prediction
  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id AND status = 'PENDING'
    FOR UPDATE
  LOOP
    IF v_pred.prediction = v_match.result THEN
      -- Winner: proportional share of the full pot
      -- If no one won (edge case), refund the stake instead
      IF v_winning_stakes > 0 THEN
        v_payout := ROUND((v_pred.stake::numeric / v_winning_stakes) * v_total_pot);
      ELSE
        v_payout := v_pred.stake;
      END IF;

      UPDATE public.predictions
        SET status = 'WON', payout = v_payout, updated_at = now()
        WHERE id = v_pred.id;

      UPDATE public.wallets
        SET balance    = balance + v_payout,
            in_play    = GREATEST(in_play - v_pred.stake, 0),
            updated_at = now()
        WHERE participant_id = v_pred.participant_id
        RETURNING balance INTO v_new_balance;

      INSERT INTO public.transactions
        (participant_id, match_id, prediction_id, type, amount, balance_after, note)
      VALUES
        (v_pred.participant_id, p_match_id, v_pred.id,
         'PAYOUT', v_payout, v_new_balance,
         'Won: ' || v_match.home_team || ' vs ' || v_match.away_team ||
         ' (' || v_match.result || ')');

    ELSE
      -- Loser: stake already deducted from balance; clear in_play only
      UPDATE public.predictions
        SET status = 'LOST', payout = 0, updated_at = now()
        WHERE id = v_pred.id;

      UPDATE public.wallets
        SET in_play    = GREATEST(in_play - v_pred.stake, 0),
            updated_at = now()
        WHERE participant_id = v_pred.participant_id
        RETURNING balance INTO v_new_balance;

      INSERT INTO public.transactions
        (participant_id, match_id, prediction_id, type, amount, balance_after, note)
      VALUES
        (v_pred.participant_id, p_match_id, v_pred.id,
         'LOSS', -v_pred.stake, v_new_balance,
         'Lost: ' || v_match.home_team || ' vs ' || v_match.away_team ||
         ' (predicted ' || v_pred.prediction || ', result: ' || v_match.result || ')');
    END IF;

    v_resolved_count := v_resolved_count + 1;
  END LOOP;

  -- 4. Mark match resolved → fires on_match_resolved trigger → Telegram notifications
  UPDATE public.matches
    SET resolved = true, updated_at = now()
    WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success',        true,
    'resolved_count', v_resolved_count,
    'total_pot',      v_total_pot,
    'winning_stakes', v_winning_stakes,
    'result',         v_match.result
  );
END;
$$;
