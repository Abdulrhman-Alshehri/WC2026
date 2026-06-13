-- ============================================================
-- Migration: add_leaderboard_blinded_view
-- Date: 2026-06-13
--
-- 1. Creates public.leaderboard_view — a secure VIEW that exposes
--    only the "blinded balance" (balance + in_play) so that the
--    frontend cannot reverse-engineer active stake amounts.
--
-- 2. Replaces resolve_match_predictions() to auto-populate
--    leaderboard_snapshots after each match settlement, enabling
--    accurate rank-delta calculations on the client.
-- ============================================================

-- ─── 1. Blinded Balance View ──────────────────────────────────

CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT
  w.participant_id,
  p.name,
  p.display_name,
  p.photo_url,
  (w.balance + w.in_play) AS blinded_balance,
  ROW_NUMBER() OVER (
    ORDER BY (w.balance + w.in_play) DESC, p.name ASC
  )::int AS rank
FROM public.wallets w
JOIN public.participants p ON p.id = w.participant_id
WHERE p.is_active = true
ORDER BY blinded_balance DESC, p.name ASC;

-- Grant broad SELECT to all Supabase roles
GRANT SELECT ON public.leaderboard_view TO anon, authenticated, service_role;


-- ─── 2. Replace resolve_match_predictions with snapshot step ──

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

  -- 3.5 AUTO-POPULATE LEADERBOARD SNAPSHOT
  -- Captures the post-settlement ranking state for rank-delta calculations.
  -- Uses the leaderboard_view which computes (balance + in_play) — at this
  -- point in_play has been cleared for this match's predictions so the view
  -- reflects the true post-resolution standings.
  INSERT INTO public.leaderboard_snapshots (match_id, snapshot)
  VALUES (
    p_match_id,
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
  );

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
